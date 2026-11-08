"""Идеальная популяция без факторов, изменяющих частоты аллелей."""

from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True, slots=True)
class IdealParameters:
    population_size: int
    initial_frequency: float
    generations: int

    def __post_init__(self) -> None:
        if isinstance(self.population_size, bool) or not isinstance(self.population_size, int):
            raise ValueError("Численность должна быть целым числом")
        if not 2 <= self.population_size <= 100_000:
            raise ValueError("Численность должна быть от 2 до 100 000")
        if isinstance(self.generations, bool) or not isinstance(self.generations, int):
            raise ValueError("Число поколений должно быть целым числом")
        if not 1 <= self.generations <= 1_000:
            raise ValueError("Число поколений должно быть от 1 до 1 000")
        if isinstance(self.initial_frequency, bool) or not isinstance(self.initial_frequency, (int, float)):
            raise ValueError("Начальная частота должна быть числом")
        if not isfinite(self.initial_frequency) or not 0 <= self.initial_frequency <= 1:
            raise ValueError("Начальная частота должна быть от 0 до 1")


@dataclass(frozen=True, slots=True)
class Generation:
    t: int
    p: float
    q: float
    f_AA: float
    f_Aa: float
    f_aa: float
    h: float


def simulate_ideal(params: IdealParameters) -> list[Generation]:
    """Вернуть поколения 0..T для заданной начальной частоты аллеля A."""
    p = float(params.initial_frequency)
    q = 1.0 - p
    aa, hetero, recessive = p * p, 2.0 * p * q, q * q
    return [
        Generation(t, p, q, aa, hetero, recessive, hetero)
        for t in range(params.generations + 1)
    ]
