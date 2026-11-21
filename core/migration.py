"""Динамика частоты аллеля при постоянном притоке мигрантов."""

from dataclasses import dataclass

from core.ideal import Generation, IdealParameters, generation_at_frequency


@dataclass(frozen=True, slots=True)
class MigrationParameters:
    m: float
    p_m: float

    def __post_init__(self) -> None:
        for label, value in (("Доля мигрантов", self.m), ("Частота аллеля у мигрантов", self.p_m)):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
                raise ValueError(f"{label}: требуется число от 0 до 1")


def simulate_migration(params: IdealParameters, migration: MigrationParameters) -> list[Generation]:
    p = float(params.initial_frequency)
    rows = [generation_at_frequency(0, p)]
    for t in range(1, params.generations + 1):
        p = (1 - migration.m) * p + migration.m * migration.p_m
        rows.append(generation_at_frequency(t, p))
    return rows
