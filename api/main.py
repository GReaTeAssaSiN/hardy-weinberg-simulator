"""API симулятора: идеальная популяция и миграция."""

from dataclasses import asdict
from typing import Annotated

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from core.ideal import IdealParameters, simulate_ideal
from core.migration import MigrationParameters, simulate_migration


class MigrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    m: Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False, description="Доля мигрантов")]
    p_m: Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False, description="Частота A у мигрантов")]


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    n: Annotated[int, Field(strict=True, ge=2, le=100_000, description="Численность популяции")]
    p0: Annotated[float, Field(strict=True, ge=0, le=1, allow_inf_nan=False, description="Начальная частота A")]
    generations: Annotated[int, Field(strict=True, ge=1, le=1_000, description="Число поколений")]
    migration: MigrationRequest | None = None


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


app = FastAPI(
    title="Симулятор Харди — Вайнберга",
    version="0.1.0",
    description="Моделирование идеальной популяции и влияния миграции.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/simulate", response_model=SimulationResult, response_model_exclude_none=True)
def simulate(params: SimulationRequest) -> SimulationResult:
    population = IdealParameters(params.n, params.p0, params.generations)
    if params.migration is None:
        result = simulate_ideal(population)
    else:
        migration = MigrationParameters(params.migration.m, params.migration.p_m)
        result = simulate_migration(population, migration)
    return SimulationResult(params=params, rows=[GenerationRow(**asdict(row)) for row in result])
