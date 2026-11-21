from contextlib import ExitStack

import pytest
from fastapi.testclient import TestClient

from api import limits
from api.main import app

client = TestClient(app)
BATCH = "/api/simulate/batch"
SMALL_SERIES = {"n": 2, "p0": 0.5, "generations": 5, "runs": 10, "drift": {"seed": 42}}


def test_batch_returns_aggregates_examples_and_boundary_statistics():
    response = client.post(BATCH, json=SMALL_SERIES)
    assert response.status_code == 200
    result = response.json()
    assert result["params"] == SMALL_SERIES
    assert [row["t"] for row in result["rows"]] == list(range(6))
    assert result["rows"][0] == {
        "t": 0, "p_mean": 0.5, "p05": 0.5, "p95": 0.5, "h_mean": 0.5, "h_theory": 0.5,
    }
    assert result["rows"][1] == pytest.approx({
        "t": 1, "p_mean": 0.4, "p05": 0, "p95": 0.75, "h_mean": 0.325, "h_theory": 0.375,
    })
    assert len(result["trajectories"]) == 8
    assert all(len(trajectory) == 6 and trajectory[0] == 0.5 for trajectory in result["trajectories"])
    assert len(set(map(tuple, result["trajectories"]))) > 1
    assert result["fixation"] == {"count": 2, "share": 0.2, "mean_generation": 4.0}
    assert result["loss"] == pytest.approx({"count": 6, "share": 0.6, "mean_generation": 13 / 6})


def test_batch_replays_automatic_seed_and_changes_with_a_different_seed():
    params = {k: v for k, v in SMALL_SERIES.items() if k != "drift"}
    first = client.post(BATCH, json=params)
    assert first.status_code == 200
    resolved = first.json()["params"]
    seed = resolved["drift"]["seed"]
    assert 0 <= seed <= 2**32 - 1
    assert client.post(BATCH, json=resolved).content == first.content

    original = client.post(BATCH, json=SMALL_SERIES)
    changed = client.post(BATCH, json={**SMALL_SERIES, "drift": {"seed": 43}})
    assert changed.status_code == 200
    assert changed.json()["trajectories"] != original.json()["trajectories"]


def test_batch_keeps_other_factors_without_comparing_to_neutral_theory():
    response = client.post(BATCH, json={
        **SMALL_SERIES, "n": 100, "p0": 0.25,
        "migration": {"m": 1, "p_m": 0.5},
        "selection": {"w11": 1, "w12": 0.5, "w22": 0, "target_p": 0.7},
        "inbreeding": {"f": 0.25},
    })
    assert response.status_code == 200
    result = response.json()
    assert "theoretical_half_life" not in result
    first = result["rows"][1]
    assert "h_theory" not in first
    assert first["p_mean"] == pytest.approx(0.75, abs=0.02)
    assert first["f_Aa_mean"] == pytest.approx(first["h_mean"] * 0.75)


@pytest.mark.parametrize("value", [9, 1_001, "100", True])
def test_batch_validates_number_of_runs(value):
    response = client.post(BATCH, json={**SMALL_SERIES, "runs": value})
    assert response.status_code == 422


def test_batch_reports_invalid_selection_in_the_first_affected_run():
    response = client.post(BATCH, json={
        **SMALL_SERIES, "selection": {"w11": 0, "w12": 0, "w22": 0, "target_p": 0.8},
    })
    assert response.status_code == 422
    assert "Прогон 1. Поколение 1" in response.json()["detail"]


def test_single_and_batch_share_calculation_slots():
    single = {k: v for k, v in SMALL_SERIES.items() if k != "runs"}
    with ExitStack() as stack:
        for _ in range(limits.MAX_CONCURRENT_CALCULATIONS):
            stack.enter_context(limits.calculation_budget(float("inf")))
        for path, params in [("/api/simulate", single), (BATCH, SMALL_SERIES)]:
            response = client.post(path, json=params)
            assert response.status_code == 429
            assert response.headers["Retry-After"] == "1"
    assert client.post(BATCH, json=SMALL_SERIES).status_code == 200


@pytest.mark.parametrize("path", ["/api/simulate", BATCH])
def test_timeout_returns_504_and_releases_the_slot(path, monkeypatch):
    params = SMALL_SERIES if path == BATCH else {k: v for k, v in SMALL_SERIES.items() if k != "runs"}
    time_values = iter([0, limits.BATCH_TIMEOUT_SECONDS + 1])
    with monkeypatch.context() as mocked:
        mocked.setattr(limits, "monotonic", lambda: next(time_values))
        response = client.post(path, json=params)
        assert response.status_code == 504
        assert "лимит времени" in response.json()["detail"]
    assert client.post(path, json=params).status_code == 200
