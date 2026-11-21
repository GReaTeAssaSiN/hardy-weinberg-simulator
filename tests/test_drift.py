from math import sqrt
from statistics import mean, stdev

import pytest

from core.drift import DriftBoundary, DriftParameters
from core.ideal import IdealParameters
from core.migration import MigrationParameters
from core.selection import SelectionParameters
from core.simulation import simulate


def test_mean_heterozygosity_matches_neutral_theory():
    population = IdealParameters(100, 0.5, 50)
    values = [simulate(population, drift=DriftParameters(seed)).rows[-1].h for seed in range(2_000)]
    expected = 0.5 * (199 / 200) ** 50
    standard_error = stdev(values) / sqrt(len(values))
    assert abs(mean(values) - expected) < 2 * standard_error


@pytest.mark.parametrize(("seed", "kind", "t", "p"), [(0, "loss", 3, 0), (1, "fixation", 2, 1)])
def test_drift_reports_first_boundary_and_keeps_it_without_migration(seed, kind, t, p):
    outcome = simulate(IdealParameters(2, 0.5, 12), drift=DriftParameters(seed))
    assert outcome.drift_summary.boundary == DriftBoundary(kind, t)
    assert len(outcome.rows) == 13
    assert all(row.p == p and row.h == 0 for row in outcome.rows[t:])


def test_migration_can_restore_an_allele_after_drift_loss():
    outcome = simulate(
        IdealParameters(2, 0.5, 12), migration=MigrationParameters(0.1, 0.5), drift=DriftParameters(0),
    )
    assert outcome.drift_summary.boundary == DriftBoundary("loss", 3)
    assert outcome.rows[6].p == 0.25
    assert outcome.drift_summary.theoretical_half_life is None


def test_drift_boundary_does_not_restart_an_undefined_selection_step():
    outcome = simulate(
        IdealParameters(2, 0.5, 12),
        selection=SelectionParameters(0, 1, 0, 0.7),
        drift=DriftParameters(0),
    )
    assert outcome.drift_summary.boundary == DriftBoundary("loss", 3)
    assert len(outcome.rows) == 13
    assert all(row.p == 0 for row in outcome.rows[3:])
