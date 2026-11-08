import pytest

from core.ideal import IdealParameters, simulate_ideal


@pytest.mark.parametrize("p", [0.0, 0.3, 0.5, 1.0])
def test_ideal_population_obeys_hardy_weinberg_in_every_generation(p):
    rows = simulate_ideal(IdealParameters(500, p, 100))
    assert len(rows) == 101
    assert rows[0].t == 0 and rows[-1].t == 100
    for row in rows:
        assert row.p == p
        assert row.p + row.q == pytest.approx(1.0, abs=1e-12)
        assert (row.f_AA, row.f_Aa, row.f_aa) == pytest.approx(
            (p**2, 2 * p * (1 - p), (1 - p) ** 2), abs=1e-12
        )
        assert row.f_AA + row.f_Aa + row.f_aa == pytest.approx(1.0, abs=1e-12)
        assert row.h == row.f_Aa


@pytest.mark.parametrize(
    "params",
    [(1, 0.5, 100), (2, -0.01, 1), (2, 1.01, 1), (2, float('nan'), 1),
     (2, 0.5, 0), (True, 0.5, 1), (2, 0.5, 1.5), (100_001, 0.5, 1),
     (2, 0.5, 1_001)],
)
def test_invalid_parameters_are_rejected_even_without_api(params):
    with pytest.raises(ValueError):
        IdealParameters(*params)
