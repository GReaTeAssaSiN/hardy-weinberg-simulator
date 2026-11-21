"""Динамика частоты аллеля при постоянном притоке мигрантов."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class MigrationParameters:
    m: float
    p_m: float

    def __post_init__(self) -> None:
        for label, value in (("Доля мигрантов", self.m), ("Частота аллеля у мигрантов", self.p_m)):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
                raise ValueError(f"{label}: требуется число от 0 до 1")

    def apply(self, p: float) -> float:
        return (1 - self.m) * p + self.m * self.p_m
