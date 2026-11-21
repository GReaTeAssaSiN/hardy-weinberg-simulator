"""API симулятора популяции."""

import csv
from dataclasses import asdict
from io import StringIO
from math import isfinite
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from api.limits import BATCH_TIMEOUT_SECONDS, SINGLE_TIMEOUT_SECONDS, calculation_budget
from core.batch import MAX_RUNS, MIN_RUNS, BatchGeneration, BoundaryStatistics, simulate_batch as simulate_replicates
from core.chi_square import CHI_SQUARE_CRITICAL_VALUE
from core.drift import MAX_SEED, DriftParameters
from core.ideal import IdealParameters
from core.inbreeding import InbreedingParameters
from core.migration import MigrationParameters
from core.selection import SelectionParameters, ZeroFitnessError
from core.simulation import simulate as simulate_population

UnitInterval = Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False)]


class MigrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    m: Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False, description="Доля мигрантов")]
    p_m: Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False, description="Частота A у мигрантов")]


class SelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    w11: UnitInterval = Field(description="Приспособленность AA")
    w12: UnitInterval = Field(description="Приспособленность Aa")
    w22: UnitInterval = Field(description="Приспособленность aa")
    target_p: UnitInterval = Field(description="Целевая частота A")


class InbreedingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    f: UnitInterval = Field(description="Коэффициент инбридинга")


class DriftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seed: Annotated[int, Field(strict=True, ge=0, le=MAX_SEED)] | None = None


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    n: Annotated[int, Field(strict=True, ge=2, le=100_000, description="Численность популяции")]
    p0: Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False, description="Начальная частота A")]
    generations: Annotated[int, Field(strict=True, ge=1, le=1_000, description="Число поколений")]
    migration: MigrationRequest | None = None
    selection: SelectionRequest | None = None
    inbreeding: InbreedingRequest | None = None
    drift: DriftRequest | None = None


class BatchSimulationRequest(SimulationRequest):
    drift: DriftRequest = Field(default_factory=DriftRequest, description="Дрейф включен во всех прогонах")
    runs: Annotated[int, Field(strict=True, ge=MIN_RUNS, le=MAX_RUNS, description="Число прогонов")]


class GenerationRow(BaseModel):
    t: int
    p: float
    q: float
    f_AA: float
    f_Aa: float
    f_aa: float
    h: float = Field(description="Ожидаемая гетерозиготность 2pq")
    h_theory: float | None = Field(default=None, description="Средняя H по теории нейтрального дрейфа")
    chi_square: float | None = Field(default=None, description="χ² для модельных частот генотипов")


class DriftBoundaryResult(BaseModel):
    kind: Literal["fixation", "loss"]
    generation: int


class DriftResult(BaseModel):
    boundary: DriftBoundaryResult | None = None
    theoretical_half_life: float | None = None


class ChiSquareSummary(BaseModel):
    critical_value: float = CHI_SQUARE_CRITICAL_VALUE
    degrees_of_freedom: int = 1
    first_exceedance_generation: int | None = None


class SimulationResult(BaseModel):
    params: SimulationRequest
    rows: list[GenerationRow]
    target_generation: int | None = Field(default=None, description="Первое поколение, достигшее цели отбора")
    drift_summary: DriftResult | None = None
    chi_square_summary: ChiSquareSummary


class BatchSimulationResult(BaseModel):
    params: BatchSimulationRequest
    rows: list[BatchGeneration] = Field(description="Средние и процентили по поколениям")
    trajectories: list[list[float]] = Field(description="Первые восемь траекторий p, включая поколение 0")
    fixation: BoundaryStatistics
    loss: BoundaryStatistics
    theoretical_half_life: float | None = None


class SingleCsvData(BaseModel):
    params: SimulationRequest
    rows: Annotated[list[GenerationRow], Field(min_length=2, max_length=1_001)]


class BatchCsvData(BaseModel):
    params: BatchSimulationRequest
    rows: Annotated[list[BatchGeneration], Field(min_length=2, max_length=1_001)]


SINGLE_CSV_COLUMNS = ("t", "p", "q", "f_AA", "f_Aa", "f_aa", "h", "h_theory", "chi_square")
BATCH_CSV_COLUMNS = ("t", "p_mean", "p05", "p95", "h_mean", "h_theory", "f_Aa_mean")


LIMIT_RESPONSES = {
    429: {"description": "Слишком много одновременных расчетов"},
    504: {"description": "Расчет не уложился в лимит времени"},
}


app = FastAPI(
    title="Симулятор Харди — Вайнберга",
    version="0.1.0",
    description="Моделирование идеальной популяции, миграции, отбора, неслучайного скрещивания и генетического дрейфа.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def model_inputs(params: SimulationRequest) -> tuple[
    IdealParameters, MigrationParameters | None, SelectionParameters | None, InbreedingParameters | None,
]:
    population = IdealParameters(params.n, params.p0, params.generations)
    migration = MigrationParameters(**params.migration.model_dump()) if params.migration else None
    selection = SelectionParameters(**params.selection.model_dump()) if params.selection else None
    inbreeding = InbreedingParameters(params.inbreeding.f) if params.inbreeding else None
    return population, migration, selection, inbreeding


def resolve_drift(request: DriftRequest) -> DriftParameters:
    return DriftParameters() if request.seed is None else DriftParameters(request.seed)


@app.post("/api/simulate", response_model=SimulationResult, response_model_exclude_none=True, responses=LIMIT_RESPONSES)
def simulate(params: SimulationRequest) -> SimulationResult:
    population, migration, selection, inbreeding = model_inputs(params)
    drift = resolve_drift(params.drift) if params.drift is not None else None
    if drift is not None:
        params = params.model_copy(update={"drift": DriftRequest(seed=drift.seed)})
    try:
        with calculation_budget(SINGLE_TIMEOUT_SECONDS) as check_deadline:
            result = simulate_population(
                population, migration=migration, selection=selection, inbreeding=inbreeding,
                drift=drift, check_deadline=check_deadline,
            )
            return SimulationResult(
                params=params,
                rows=[
                    GenerationRow(**asdict(row), chi_square=value)
                    for row, value in zip(result.rows, result.chi_square.values, strict=True)
                ],
                target_generation=result.target_generation,
                drift_summary=DriftResult(**asdict(result.drift_summary)) if result.drift_summary is not None else None,
                chi_square_summary=ChiSquareSummary(first_exceedance_generation=result.chi_square.first_exceedance_generation),
            )
    except ZeroFitnessError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/simulate/batch", response_model=BatchSimulationResult,
          response_model_exclude_none=True, responses=LIMIT_RESPONSES)
def simulate_batch(params: BatchSimulationRequest) -> BatchSimulationResult:
    population, migration, selection, inbreeding = model_inputs(params)
    drift = resolve_drift(params.drift)
    params = params.model_copy(update={"drift": DriftRequest(seed=drift.seed)})
    try:
        with calculation_budget(BATCH_TIMEOUT_SECONDS) as check_deadline:
            result = simulate_replicates(
                population, drift, params.runs, migration=migration, selection=selection,
                inbreeding=inbreeding, check_deadline=check_deadline,
            )
            return BatchSimulationResult(
                params=params, rows=result.rows, trajectories=result.trajectories,
                fixation=result.fixation, loss=result.loss, theoretical_half_life=result.theoretical_half_life,
            )
    except ZeroFitnessError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/export", response_class=Response, responses={
    200: {"description": "Таблица результатов в CSV", "content": {"text/csv": {}}},
    **LIMIT_RESPONSES,
})
def export_csv(result: SingleCsvData | BatchCsvData) -> Response:
    """Записывает полученные ранее результаты без повторного расчета."""
    if isinstance(result, BatchCsvData):
        filename, columns = "hardy-weinberg-batch.csv", BATCH_CSV_COLUMNS
    else:
        filename, columns = "hardy-weinberg-simulation.csv", SINGLE_CSV_COLUMNS

    with calculation_budget(SINGLE_TIMEOUT_SECONDS):
        if len(result.rows) != result.params.generations + 1:
            raise HTTPException(status_code=422, detail="Для экспорта нужны все поколения от 0 до T.")
        with StringIO(newline="") as buffer:
            writer = csv.writer(buffer)
            writer.writerow(columns)
            for generation, row in enumerate(result.rows):
                if row.t != generation:
                    raise HTTPException(status_code=422, detail="Поколения в таблице должны идти по порядку от 0 до T.")
                values = [getattr(row, column) for column in columns]
                if any(isinstance(value, float) and not isfinite(value) for value in values):
                    raise HTTPException(status_code=422, detail="Таблица результатов должна содержать конечные числовые значения.")
                writer.writerow(values)
            return Response(
                content=buffer.getvalue(),
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
