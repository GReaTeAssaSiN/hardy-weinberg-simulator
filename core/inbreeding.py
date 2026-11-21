"""Формирование генотипов с коэффициентом инбридинга F."""

from dataclasses import dataclass, replace

from core.ideal import Generation


@dataclass(frozen=True, slots=True)
class InbreedingParameters:
    f: float

    def __post_init__(self) -> None:
        if isinstance(self.f, bool) or not isinstance(self.f, (int, float)) or not 0 <= self.f <= 1:
            raise ValueError("Коэффициент инбридинга: требуется число от 0 до 1")

    def apply(self, generation: Generation) -> Generation:
        shift = self.f * generation.p * generation.q
        return replace(
            generation,
            f_AA=generation.f_AA + shift,
            f_Aa=generation.h * (1 - self.f),
            f_aa=generation.f_aa + shift,
        )
