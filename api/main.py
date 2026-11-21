"""API симулятора популяции."""

from dataclasses import asdict
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

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


app = FastAPI(
    title="Симулятор Харди — Вайнберга",
    version="0.1.0",
    description="Моделирование идеальной популяции, миграции, отбора, неслучайного скрещивания и генетического дрейфа.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/simulate", response_model=SimulationResult, response_model_exclude_none=True)
def simulate(params: SimulationRequest) -> SimulationResult:
    population = IdealParameters(params.n, params.p0, params.generations)
    migration = MigrationParameters(**params.migration.model_dump()) if params.migration else None
    selection = SelectionParameters(**params.selection.model_dump()) if params.selection else None
    inbreeding = InbreedingParameters(params.inbreeding.f) if params.inbreeding else None
    drift = None
    if params.drift is not None:
        if params.drift.seed is None:
            drift = DriftParameters()
            params = params.model_copy(update={"drift": DriftRequest(seed=drift.seed)})
        else:
            drift = DriftParameters(params.drift.seed)
    try:
        result = simulate_population(
            population, migration=migration, selection=selection, inbreeding=inbreeding, drift=drift,
        )
    except ZeroFitnessError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
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
