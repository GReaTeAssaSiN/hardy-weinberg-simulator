import csv
import re
from codecs import BOM_UTF8
from contextlib import ExitStack
from io import BytesIO, StringIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from api import limits
from api.export import XLSX_MEDIA_TYPE
from api.main import app

client = TestClient(app)
EXPORT = "/api/export"
POPULATION = {"n": 500, "p0": 0.3, "generations": 100}


def parse_csv(response):
    reader = csv.reader(StringIO(response.content.decode("utf-8-sig")))
    headers = next(reader)
    keys = [header.rsplit(" (", 1)[1].removesuffix(")") for header in headers]
    return headers, [dict(zip(keys, row, strict=True)) for row in reader]


def test_export_includes_every_generation_and_preserves_values():
    result = client.post("/api/simulate", json={**POPULATION, "inbreeding": {"f": 0.25}}).json()
    response = client.post(EXPORT, json=result)

    assert response.status_code == 200
    assert response.headers["Content-Type"] == "text/csv; charset=utf-8"
    assert re.fullmatch(
        r'attachment; filename="hardy-weinberg-simulation-N500-T100-[a-f0-9]{32}\.csv"',
        response.headers["Content-Disposition"],
    )
    assert response.content.startswith(BOM_UTF8)
    headers, rows = parse_csv(response)
    assert headers[:3] == ["Поколение (t)", "Частота аллеля A (p)", "Частота аллеля a (q)"]
    assert [int(row["t"]) for row in rows] == list(range(101))
    assert rows[0]["p"] == "0.3"
    assert rows[-1]["h_theory"] == ""
    assert float(rows[-1]["chi_square"]) == result["rows"][-1]["chi_square"]


@pytest.mark.parametrize("factors", [{}, {"inbreeding": {"f": 0.25}}])
def test_export_batch_handles_present_and_missing_optional_columns(factors):
    params = {**POPULATION, "n": 50, "runs": 10, "drift": {"seed": 7}, **factors}
    result = client.post("/api/simulate/batch", json=params).json()
    response = client.post(EXPORT, json={"params": result["params"], "rows": result["rows"]})

    assert response.status_code == 200
    assert re.fullmatch(
        r'attachment; filename="hardy-weinberg-batch-N50-T100-runs10-seed7-[a-f0-9]{32}\.csv"',
        response.headers["Content-Disposition"],
    )
    headers, rows = parse_csv(response)
    assert "Средняя частота аллеля A (p_mean)" in headers
    assert [int(row["t"]) for row in rows] == list(range(101))
    for exported, original in zip(rows, result["rows"], strict=True):
        assert {key: float(value) for key, value in exported.items() if value != ""} == original


@pytest.mark.parametrize("file_format", ["csv", "xlsx"])
def test_repeated_exports_use_different_filenames(file_format):
    result = client.post("/api/simulate", json={**POPULATION, "generations": 1}).json()
    first, second = (client.post(EXPORT, params={"format": file_format}, json=result) for _ in range(2))

    assert first.status_code == second.status_code == 200
    assert first.headers["Content-Disposition"] != second.headers["Content-Disposition"]


@pytest.mark.parametrize("batch", [False, True])
def test_workbook_has_numeric_results_filters_and_parameter_sheet(batch):
    params = {**POPULATION, "inbreeding": {"f": 0.25}, "drift": {"seed": 7}}
    if batch:
        params["runs"] = 10
    result = client.post("/api/simulate/batch" if batch else "/api/simulate", json=params).json()
    response = client.post(EXPORT, params={"format": "xlsx"}, json=result)

    assert response.status_code == 200
    assert response.headers["Content-Type"] == XLSX_MEDIA_TYPE
    mode = "batch-N500-T100-runs10" if batch else "simulation-N500-T100"
    assert re.fullmatch(
        rf'attachment; filename="hardy-weinberg-{mode}-seed7-[a-f0-9]{{32}}\.xlsx"',
        response.headers["Content-Disposition"],
    )
    workbook = load_workbook(BytesIO(response.content))
    assert workbook.sheetnames == ["Результаты", "Параметры расчета"]
    results = workbook["Результаты"]
    assert results.freeze_panes == "A2"
    assert results.auto_filter.ref == ("A1:G102" if batch else "A1:I102")
    assert results["A1"].value == "Поколение (t)"
    assert results["A1"].font.bold is True
    assert results["A2"].value == 0
    assert results["A102"].value == 100
    key = "p_mean" if batch else "p"
    assert results["B102"].value == pytest.approx(result["rows"][-1][key])
    assert results["B102"].data_type == "n"

    settings = dict(workbook["Параметры расчета"].values)
    assert settings["Численность популяции (N)"] == 500
    assert settings["Коэффициент инбридинга (F)"] == 0.25
    assert settings["Зерно генератора (seed)"] == 7
    assert settings.get("Число прогонов (runs)") == (10 if batch else None)
    workbook.close()


def test_export_rejects_missing_or_misordered_generations():
    result = client.post("/api/simulate", json={**POPULATION, "generations": 2}).json()
    assert client.post(EXPORT, json={**result, "rows": result["rows"][:2]}).status_code == 422
    result["rows"].reverse()
    assert client.post(EXPORT, json=result).status_code == 422


def test_export_uses_the_same_capacity_limit():
    result = client.post("/api/simulate", json={**POPULATION, "generations": 1}).json()
    with ExitStack() as stack:
        for _ in range(limits.MAX_CONCURRENT_CALCULATIONS):
            stack.enter_context(limits.calculation_budget(float("inf")))
        busy = client.post(EXPORT, json=result)
        assert busy.status_code == 429
        assert busy.headers["Retry-After"] == "1"
    assert client.post(EXPORT, json=result).status_code == 200
