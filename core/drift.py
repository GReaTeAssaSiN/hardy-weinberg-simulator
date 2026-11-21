"""Биномиальная выборка аллелей и теоретическая кривая нейтрального дрейфа."""

from dataclasses import dataclass, field
from math import log, log1p
from secrets import randbits
from typing import Literal

from numpy.random import Generator, default_rng

from core.ideal import Generation

MAX_SEED = 2**32 - 1


@dataclass(frozen=True, slots=True)
class DriftParameters:
    seed: int = field(default_factory=lambda: randbits(32))

    def __post_init__(self) -> None:
        if type(self.seed) is not int or not 0 <= self.seed <= MAX_SEED:
            raise ValueError(f"Зерно: требуется целое число от 0 до {MAX_SEED}")

    def generator(self) -> Generator:
        return default_rng(self.seed)


def sample_frequency(p: float, gene_copies: int, rng: Generator) -> float:
    if p in (0, 1):
        return p
    return rng.binomial(gene_copies, p) / gene_copies


@dataclass(frozen=True, slots=True)
class DriftBoundary:
    kind: Literal["fixation", "loss"]
    generation: int


@dataclass(frozen=True, slots=True)
class DriftSummary:
    boundary: DriftBoundary | None
    theoretical_half_life: float | None


def first_drift_boundary(rows: list[Generation]) -> DriftBoundary | None:
    return next(
        (DriftBoundary("fixation" if row.p == 1 else "loss", row.t) for row in rows if row.p in (0, 1)),
        None,
    )


def neutral_half_life(gene_copies: int) -> float:
    return log(0.5) / log1p(-1 / gene_copies)
