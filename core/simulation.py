"""Расчет поколений с доступными факторами в порядке из ТЗ."""

from dataclasses import dataclass, replace

from core.drift import DriftBoundary, DriftParameters, DriftSummary, neutral_half_life, sample_frequency
from core.ideal import Generation, IdealParameters, generation_at_frequency, simulate_ideal
from core.inbreeding import InbreedingParameters
from core.migration import MigrationParameters
from core.selection import SelectionParameters, ZeroFitnessError


@dataclass(frozen=True, slots=True)
class SimulationOutcome:
    rows: list[Generation]
    target_generation: int | None = None
    drift_summary: DriftSummary | None = None


def simulate(
    population: IdealParameters,
    *,
    migration: MigrationParameters | None = None,
    selection: SelectionParameters | None = None,
    inbreeding: InbreedingParameters | None = None,
    drift: DriftParameters | None = None,
) -> SimulationOutcome:
    if migration is None and selection is None and inbreeding is None and drift is None:
        return SimulationOutcome(simulate_ideal(population))

    p0 = p = float(population.initial_frequency)
    initial = generation_at_frequency(0, p0)
    rng = drift.generator() if drift is not None else None
    gene_copies = 2 * population.population_size
    neutral_drift = rng is not None and migration is None and selection is None and inbreeding is None and initial.h > 0
    neutral_decay = 1 - 1 / gene_copies
    rows = [replace(initial, h_theory=initial.h) if neutral_drift else initial]
    for t in range(1, population.generations + 1):
        previous_p = p
        if migration is not None:
            p = migration.apply(p)
        if selection is not None:
            try:
                p = selection.apply(p)
            except ZeroFitnessError as error:
                # На границе дрейфа сохраняем p, пока миграция не изменила частоту.
                if rng is None or t == 1 or p not in (0, 1) or p != previous_p:
                    raise ZeroFitnessError(
                        f"Поколение {t}: средняя приспособленность равна нулю. "
                        "Ни один из присутствующих генотипов не выживает."
                    ) from error
        if rng is not None:
            p = sample_frequency(p, gene_copies, rng)
        # F не меняет p. Генотипы в строке должны соответствовать p после выборки аллелей.
        row = generation_at_frequency(t, p)
        if inbreeding is not None:
            row = inbreeding.apply(row)
        if neutral_drift:
            row = replace(row, h_theory=initial.h * neutral_decay**t)
        rows.append(row)

    target_generation = None
    if selection is not None:
        target = selection.target_p
        if target >= p0:
            target_generation = next((row.t for row in rows if row.p >= target), None)
        else:
            target_generation = next((row.t for row in rows if row.p <= target), None)
    drift_summary = None
    if rng is not None:
        boundary = next(
            (DriftBoundary("fixation" if row.p == 1 else "loss", row.t) for row in rows if row.p in (0, 1)),
            None,
        )
        half_life = neutral_half_life(gene_copies) if neutral_drift else None
        drift_summary = DriftSummary(boundary, half_life)
    return SimulationOutcome(rows, target_generation, drift_summary)
