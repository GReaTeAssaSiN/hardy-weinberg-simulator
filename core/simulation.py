"""Расчет поколений с доступными факторами в порядке из ТЗ."""

from core.ideal import Generation, IdealParameters, generation_at_frequency, simulate_ideal
from core.inbreeding import InbreedingParameters
from core.migration import MigrationParameters
from core.selection import SelectionParameters, ZeroFitnessError


def simulate(
    population: IdealParameters,
    *,
    migration: MigrationParameters | None = None,
    selection: SelectionParameters | None = None,
    inbreeding: InbreedingParameters | None = None,
) -> tuple[list[Generation], int | None]:
    if migration is None and selection is None and inbreeding is None:
        return simulate_ideal(population), None

    p0 = p = float(population.initial_frequency)
    rows = [generation_at_frequency(0, p0)]
    for t in range(1, population.generations + 1):
        if migration is not None:
            p = migration.apply(p)
        if selection is not None:
            try:
                p = selection.apply(p)
            except ZeroFitnessError as error:
                raise ZeroFitnessError(
                    f"Поколение {t}: средняя приспособленность равна нулю. "
                    "Ни один из присутствующих генотипов не выживает."
                ) from error
        row = generation_at_frequency(t, p)
        rows.append(inbreeding.apply(row) if inbreeding is not None else row)

    if selection is None:
        return rows, None
    target = selection.target_p
    if target >= p0:
        return rows, next((row.t for row in rows if row.p >= target), None)
    return rows, next((row.t for row in rows if row.p <= target), None)
