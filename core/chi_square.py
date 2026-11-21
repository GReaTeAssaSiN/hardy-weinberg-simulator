"""Критерий χ² для модельных и наблюдаемых численностей генотипов."""

from dataclasses import dataclass
from math import isclose, sqrt
from typing import Literal

from core.ideal import Generation

CHI_SQUARE_CRITICAL_VALUE = 3.84
MAX_SAMPLE_SIZE = 100_000
MIN_EXPECTED_COUNT = 5
SampleVerdict = Literal["compatible", "deviation", "small_expected", "one_allele"]


@dataclass(frozen=True, slots=True)
class ModelChiSquare:
    values: list[float | None]
    first_exceedance_generation: int | None


def model_chi_square(generation: Generation, population_size: int) -> float | None:
    """Критерий Пирсона для расчетных численностей N × f без округления."""
    p, q = generation.p, generation.q
    if p == 0 or q == 0:
        return None

    hwe_heterozygosity = 2 * p * q
    # Сравниваем доли, деля на корни ожидаемых долей. Это сохраняет
    # знаменатель даже при столь малом p, что p² округляется до нуля.
    aa = (generation.f_AA - p * p) / p
    hetero = (generation.f_Aa - hwe_heterozygosity) / sqrt(hwe_heterozygosity)
    recessive = (generation.f_aa - q * q) / q
    statistic = population_size * (aa**2 + hetero**2 + recessive**2)
    if isclose(statistic, CHI_SQUARE_CRITICAL_VALUE, rel_tol=0, abs_tol=1e-12):
        return CHI_SQUARE_CRITICAL_VALUE
    return statistic


def summarize_model_chi_square(rows: list[Generation], population_size: int) -> ModelChiSquare:
    values = [model_chi_square(row, population_size) for row in rows]
    first_exceedance = next(
        (row.t for row, value in zip(rows, values, strict=True) if value is not None and value > CHI_SQUARE_CRITICAL_VALUE),
        None,
    )
    return ModelChiSquare(values, first_exceedance)


@dataclass(frozen=True, slots=True)
class SampleRow:
    genotype: Literal["AA", "Aa", "aa"]
    observed: int
    expected: float
    contribution: float | None


@dataclass(frozen=True, slots=True)
class SampleCheck:
    n: int
    p: float
    q: float
    chi_square: float | None
    verdict: SampleVerdict
    rows: tuple[SampleRow, ...]
    critical_value: float = CHI_SQUARE_CRITICAL_VALUE
    degrees_of_freedom: int = 1


def check_sample(AA: int, Aa: int, aa: int) -> SampleCheck:
    observed = (AA, Aa, aa)
    if any(type(count) is not int or count < 0 for count in observed):
        raise ValueError("Численности генотипов должны быть целыми неотрицательными числами.")
    n = sum(observed)
    if not 1 <= n <= MAX_SAMPLE_SIZE:
        raise ValueError("В выборке должно быть от 1 до 100 000 особей.")

    p, q = (2 * AA + Aa) / (2 * n), (2 * aa + Aa) / (2 * n)
    expected = (n * p**2, n * 2 * p * q, n * q**2)
    statistic = None
    verdict: SampleVerdict
    if p == 0 or q == 0:
        contributions = (None, None, None)
        verdict = "one_allele"
    else:
        contributions = tuple((count - mean)**2 / mean for count, mean in zip(observed, expected, strict=True))
        statistic = sum(contributions)
        if isclose(statistic, CHI_SQUARE_CRITICAL_VALUE, rel_tol=0, abs_tol=1e-12):
            statistic = CHI_SQUARE_CRITICAL_VALUE
        if min(expected) < MIN_EXPECTED_COUNT:
            verdict = "small_expected"
        else:
            verdict = "deviation" if statistic > CHI_SQUARE_CRITICAL_VALUE else "compatible"

    rows = tuple(SampleRow(genotype, count, mean, contribution) for genotype, count, mean, contribution in
                 zip(("AA", "Aa", "aa"), observed, expected, contributions, strict=True))
    return SampleCheck(n, p, q, statistic, verdict, rows)
