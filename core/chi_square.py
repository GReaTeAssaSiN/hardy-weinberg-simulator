"""Отклонение модельных частот генотипов от равновесных пропорций."""

from dataclasses import dataclass
from math import isclose, sqrt

from core.ideal import Generation

CHI_SQUARE_CRITICAL_VALUE = 3.84


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
