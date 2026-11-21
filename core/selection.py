"""Отбор по приспособленности генотипов в одном локусе."""

from dataclasses import dataclass
from math import exp, log
from sys import float_info

from core.ideal import Generation, IdealParameters, generation_at_frequency
from core.migration import MigrationParameters


class ZeroFitnessError(ValueError):
    """Ни один из представленных генотипов не выживает."""


@dataclass(frozen=True, slots=True)
class SelectionParameters:
    w11: float
    w12: float
    w22: float
    target_p: float

    def __post_init__(self) -> None:
        for field in ("w11", "w12", "w22", "target_p"):
            value = getattr(self, field)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
                raise ValueError(f"{field}: требуется число от 0 до 1")

    def apply(self, p: float) -> float:
        if p in (0, 1):
            if (self.w22 if p == 0 else self.w11) > 0:
                return p
            raise ZeroFitnessError
        if 0 < self.w11 == self.w12 == self.w22:
            return p

        q = 1 - p
        aa = p * p * self.w11
        hetero = 2 * p * q * self.w12
        recessive = q * q * self.w22
        if aa + hetero + recessive < float_info.min:
            # Сохраняем отношение вкладов, когда произведения слишком малы для float.
            frequencies = (2 * log(p), log(2) + log(p) + log(q), 2 * log(q))
            weights = (self.w11, self.w12, self.w22)
            contributions = [base + log(w) if w else float("-inf") for base, w in zip(frequencies, weights)]
            scale = max(contributions)
            if scale == float("-inf"):
                raise ZeroFitnessError
            aa, hetero, recessive = (exp(value - scale) for value in contributions)
        return (aa + hetero / 2) / (aa + hetero + recessive)


def simulate_selection(
    population: IdealParameters,
    selection: SelectionParameters,
    migration: MigrationParameters | None = None,
) -> tuple[list[Generation], int | None]:
    p = float(population.initial_frequency)
    rows = [generation_at_frequency(0, p)]
    target = selection.target_p
    increasing_target = target > p
    target_generation = 0 if p == target else None
    for t in range(1, population.generations + 1):
        if migration is not None:
            p = migration.apply(p)
        try:
            p = selection.apply(p)
        except ZeroFitnessError as error:
            raise ZeroFitnessError(
                f"Поколение {t}: средняя приспособленность равна нулю. "
                "Ни один из присутствующих генотипов не выживает."
            ) from error
        rows.append(generation_at_frequency(t, p))
        if target_generation is None and (p >= target if increasing_target else p <= target):
            target_generation = t
    return rows, target_generation
