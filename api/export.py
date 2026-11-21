"""Формирование CSV и XLSX из сохраненных результатов моделирования."""

import csv
from io import BytesIO, StringIO
from typing import Literal
from uuid import uuid4

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

ExportFormat = Literal["csv", "xlsx"]
ExportRow = list[float | int | None]
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

SINGLE_COLUMNS = {
    "t": "Поколение",
    "p": "Частота аллеля A",
    "q": "Частота аллеля a",
    "f_AA": "Доля генотипа AA",
    "f_Aa": "Доля генотипа Aa",
    "f_aa": "Доля генотипа aa",
    "h": "Ожидаемая гетерозиготность 2pq",
    "h_theory": "Гетерозиготность по теории",
    "chi_square": "Критерий Пирсона χ²",
}

BATCH_COLUMNS = {
    "t": "Поколение",
    "p_mean": "Средняя частота аллеля A",
    "p05": "5-й процентиль частоты A",
    "p95": "95-й процентиль частоты A",
    "h_mean": "Средняя гетерозиготность 2pq",
    "h_theory": "Гетерозиготность по теории",
    "f_Aa_mean": "Средняя доля генотипа Aa",
}

PARAMETER_LABELS = {
    "n": "Численность популяции (N)",
    "p0": "Начальная частота аллеля A (p0)",
    "generations": "Число поколений (T)",
    "runs": "Число прогонов (runs)",
    "drift.seed": "Зерно генератора (seed)",
    "migration.m": "Доля мигрантов (m)",
    "migration.p_m": "Частота аллеля A у мигрантов (p_m)",
    "selection.w11": "Приспособленность AA (w11)",
    "selection.w12": "Приспособленность Aa (w12)",
    "selection.w22": "Приспособленность aa (w22)",
    "selection.target_p": "Целевая частота аллеля A (target_p)",
    "inbreeding.f": "Коэффициент инбридинга (F)",
}


def export_filename(params: dict, file_format: ExportFormat) -> str:
    mode = "batch" if "runs" in params else "simulation"
    parts = ["hardy-weinberg", mode, f"N{params['n']}", f"T{params['generations']}"]
    if "runs" in params:
        parts.append(f"runs{params['runs']}")
    seed = params.get("drift", {}).get("seed")
    if seed is not None:
        parts.append(f"seed{seed}")
    parts.append(uuid4().hex)
    return f"{'-'.join(parts)}.{file_format}"


def render_csv(headers: list[str], rows: list[ExportRow]) -> bytes:
    with StringIO(newline="") as buffer:
        writer = csv.writer(buffer)
        writer.writerow(headers)
        writer.writerows(rows)
        return buffer.getvalue().encode("utf-8-sig")


def _style_header(sheet: Worksheet, headers: list[str]) -> None:
    sheet.append(headers)
    sheet.row_dimensions[1].height = 34
    for index, cell in enumerate(sheet[1], start=1):
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0D6B66")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(index)].width = max(16, min(34, len(headers[index - 1]) + 4))
    sheet.freeze_panes = "A2"


def render_xlsx(headers: list[str], rows: list[ExportRow], params: dict) -> bytes:
    workbook = Workbook()
    results = workbook.active
    results.title = "Результаты"
    _style_header(results, headers)
    band = PatternFill("solid", fgColor="F0F7F6")
    for index, row in enumerate(rows, start=2):
        results.append(row)
        if index % 2 == 0:
            for cell in results[index]:
                cell.fill = band
    results.auto_filter.ref = results.dimensions

    settings = workbook.create_sheet("Параметры расчета")
    _style_header(settings, ["Параметр", "Значение"])
    settings.column_dimensions["A"].width = 45
    settings.column_dimensions["B"].width = 24
    settings.append(["Режим", "Серия прогонов" if "runs" in params else "Один прогон"])
    for path, label in PARAMETER_LABELS.items():
        group, separator, key = path.partition(".")
        value = params.get(group, {}).get(key) if separator else params.get(group)
        if value is not None:
            settings.append([label, value])

    with BytesIO() as buffer:
        workbook.save(buffer)
        return buffer.getvalue()
