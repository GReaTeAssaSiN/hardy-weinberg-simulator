import csv
from contextlib import ExitStack
from io import StringIO

import pytest
from fastapi.testclient import TestClient

from api import limits
from api.main import app

client = TestClient(app)
EXPORT = "/api/export"
POPULATION = {"n": 500, "p0": 0.3, "generations": 100}


def test_export_includes_every_generation_and_preserves_values():
    result = client.post("/api/simulate", json={**POPULATION, "inbreeding": {"f": 0.25}}).json()
    response = client.post(EXPORT, json=result)

    assert response.status_code == 200
    assert response.headers["Content-Type"] == "text/csv; charset=utf-8"
    assert response.headers["Content-Disposition"] == 'attachment; filename="hardy-weinberg-simulation.csv"'
    rows = list(csv.DictReader(StringIO(response.text)))
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
    assert response.headers["Content-Disposition"] == 'attachment; filename="hardy-weinberg-batch.csv"'
    rows = list(csv.DictReader(StringIO(response.text)))
    assert [int(row["t"]) for row in rows] == list(range(101))
    for exported, original in zip(rows, result["rows"], strict=True):
        assert {key: float(value) for key, value in exported.items() if value != ""} == original


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
