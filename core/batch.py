"""Статистика серии независимых прогонов генетического дрейфа."""

from collections.abc import Callable
from dataclasses import dataclass
from statistics import mean

import numpy as np
from numpy.random import SeedSequence, default_rng

from core.drift import DriftParameters, first_drift_boundary, neutral_half_life
from core.ideal import IdealParameters
from core.inbreeding import InbreedingParameters
from core.migration import MigrationParameters
from core.selection import SelectionParameters, ZeroFitnessError
from core.simulation import simulate_rows

MIN_RUNS = 10
MAX_RUNS = 1_000
EXAMPLE_RUNS = 8


@dataclass(frozen=True, slots=True)
class BatchGeneration:
    t: int
    p_mean: float
    p05: float
    p95: float
    h_mean: float
    h_theory: float | None
    f_Aa_mean: float | None


@dataclass(frozen=True, slots=True)
class BoundaryStatistics:
    count: int
    share: float
    mean_generation: float | None


@dataclass(frozen=True, slots=True)
class BatchOutcome:
    rows: list[BatchGeneration]
    trajectories: list[list[float]]
    fixation: BoundaryStatistics
    loss: BoundaryStatistics
    theoretical_half_life: float | None


def simulate_batch(
    population: IdealParameters,
    drift: DriftParameters,
    runs: int,
    *,
    migration: MigrationParameters | None = None,
    selection: SelectionParameters | None = None,
    inbreeding: InbreedingParameters | None = None,
    check_deadline: Callable[[], None] | None = None,
) -> BatchOutcome:
    if type(runs) is not int or not MIN_RUNS <= runs <= MAX_RUNS:
        raise ValueError(f"Число прогонов должно быть от {MIN_RUNS} до {MAX_RUNS}")

    row_count = population.generations + 1
    frequencies = np.empty((runs, row_count))
    h_total = np.zeros(row_count)
    heterozygotes_total = np.zeros(row_count) if inbreeding is not None else None
    theory: list[float | None] = []
    boundary_generations: dict[str, list[int]] = {"fixation": [], "loss": []}

    for index, seed in enumerate(SeedSequence(drift.seed).spawn(runs)):
        try:
            rows = simulate_rows(
                population, migration=migration, selection=selection, inbreeding=inbreeding,
                rng=default_rng(seed), check_deadline=check_deadline,
            )
        except ZeroFitnessError as error:
            raise ZeroFitnessError(f"Прогон {index + 1}. {error}") from error
        frequencies[index] = [row.p for row in rows]
        h_total += [row.h for row in rows]
        if heterozygotes_total is not None:
            heterozygotes_total += [row.f_Aa for row in rows]
        if index == 0:
            theory = [row.h_theory for row in rows]
        boundary = first_drift_boundary(rows)
        if boundary is not None:
            boundary_generations[boundary.kind].append(boundary.generation)

    if check_deadline is not None:
        check_deadline()
    p05, p95 = np.percentile(frequencies, [5, 95], axis=0, method="linear")
    p_mean = frequencies.mean(axis=0)
    h_mean = h_total / runs
    f_Aa_mean = heterozygotes_total / runs if heterozygotes_total is not None else None
    summaries = [
        BatchGeneration(
            t=t, p_mean=float(p_mean[t]), p05=float(p05[t]), p95=float(p95[t]),
            h_mean=float(h_mean[t]), h_theory=theory[t],
            f_Aa_mean=float(f_Aa_mean[t]) if f_Aa_mean is not None else None,
        )
        for t in range(row_count)
    ]

    def boundary_statistics(kind: str) -> BoundaryStatistics:
        generations = boundary_generations[kind]
        return BoundaryStatistics(len(generations), len(generations) / runs, mean(generations) if generations else None)

    half_life = neutral_half_life(2 * population.population_size) if theory[0] is not None else None
    if check_deadline is not None:
        check_deadline()
    return BatchOutcome(
        rows=summaries, trajectories=frequencies[:EXAMPLE_RUNS].tolist(),
        fixation=boundary_statistics("fixation"), loss=boundary_statistics("loss"),
        theoretical_half_life=half_life,
    )
