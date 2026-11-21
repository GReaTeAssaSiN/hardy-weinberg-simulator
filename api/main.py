"""API симулятора: идеальная популяция, миграция и отбор."""

from dataclasses import asdict
from typing import Annotated

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.ideal import IdealParameters, simulate_ideal
from core.migration import MigrationParameters, simulate_migration
from core.selection import SelectionParameters, ZeroFitnessError, simulate_selection

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


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    n: Annotated[int, Field(strict=True, ge=2, le=100_000, description="Численность популяции")]
    p0: Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False, description="Начальная частота A")]
    generations: Annotated[int, Field(strict=True, ge=1, le=1_000, description="Число поколений")]
    migration: MigrationRequest | None = None
    selection: SelectionRequest | None = None


class GenerationRow(BaseModel):
    t: int
    p: float
    q: float
    f_AA: float
    f_Aa: float
    f_aa: float
    h: float


class SimulationResult(BaseModel):
    params: SimulationRequest
    rows: list[GenerationRow]
    target_generation: int | None = Field(default=None, description="Первое поколение, достигшее цели отбора")


app = FastAPI(
    title="Симулятор Харди — Вайнберга",
    version="0.1.0",
    description="Моделирование идеальной популяции, миграции и отбора.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/simulate", response_model=SimulationResult, response_model_exclude_none=True)
def simulate(params: SimulationRequest) -> SimulationResult:
    population = IdealParameters(params.n, params.p0, params.generations)
    migration = MigrationParameters(**params.migration.model_dump()) if params.migration else None
    target_generation = None
    if params.selection is not None:
        selection = SelectionParameters(**params.selection.model_dump())
        try:
            result, target_generation = simulate_selection(population, selection, migration)
        except ZeroFitnessError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    elif migration is not None:
        result = simulate_migration(population, migration)
    else:
        result = simulate_ideal(population)
    return SimulationResult(
        params=params,
        rows=[GenerationRow(**asdict(row)) for row in result],
        target_generation=target_generation,
    )
