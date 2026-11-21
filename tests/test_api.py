from itertools import product

import pytest
from fastapi.testclient import TestClient

from api.main import app


client = TestClient(app)


def test_ideal_run_via_http():
    response = client.post("/api/simulate", json={"n": 500, "p0": 0.3, "generations": 100})
    assert response.status_code == 200
    result = response.json()
    assert result["params"] == {"n": 500, "p0": 0.3, "generations": 100}
    assert len(result["rows"]) == 101
    row = result["rows"][-1]
    assert row["t"] == 100
    assert (row["p"], row["q"], row["f_AA"], row["f_Aa"], row["f_aa"]) == pytest.approx(
        (0.3, 0.7, 0.09, 0.42, 0.49)
    )
    assert all(row["chi_square"] == 0 for row in result["rows"])
    assert "first_exceedance_generation" not in result["chi_square_summary"]


@pytest.mark.parametrize(
    ("m", "expected_frequencies"),
    [(0, (0.3, 0.3, 0.3)), (0.1, (0.3, 0.35, 0.395)), (1, (0.3, 0.8, 0.8))],
)
def test_migration_uses_previous_generation_frequency(m, expected_frequencies):
    params = {"n": 500, "p0": 0.3, "generations": 2, "migration": {"m": m, "p_m": 0.8}}
    response = client.post("/api/simulate", json=params)
    assert response.status_code == 200
    result = response.json()
    assert result["params"] == params
    assert [row["t"] for row in result["rows"]] == [0, 1, 2]
    assert [row["p"] for row in result["rows"]] == pytest.approx(expected_frequencies)
    for row, p in zip(result["rows"], expected_frequencies):
        q = 1 - p
        assert (row["q"], row["f_AA"], row["f_Aa"], row["f_aa"], row["h"]) == pytest.approx(
            (q, p**2, 2 * p * q, q**2, 2 * p * q)
        )


@pytest.mark.parametrize("migration", [{"m": -0.1, "p_m": 0.8}, {"m": 0.1, "p_m": 1.1}, {"m": 0.1}])
def test_invalid_migration_returns_422(migration):
    response = client.post("/api/simulate", json={"n": 500, "p0": 0.3, "generations": 2, "migration": migration})
    assert response.status_code == 422


def test_selection_reaches_the_step3_reference_target_in_generation_53():
    params = {
        "n": 500, "p0": 0.3, "generations": 100,
        "selection": {"w11": 1, "w12": 1, "w22": 0.6, "target_p": 0.95},
    }
    response = client.post("/api/simulate", json=params)
    assert response.status_code == 200
    result = response.json()
    assert result["params"] == params
    assert len(result["rows"]) == 101
    assert result["rows"][1]["p"] == pytest.approx(0.373134328358)
    assert result["rows"][52]["p"] < 0.95 <= result["rows"][53]["p"]
    assert result["target_generation"] == 53


def test_selection_uses_the_frequency_after_migration():
    response = client.post("/api/simulate", json={
        "n": 500, "p0": 0.3, "generations": 2,
        "migration": {"m": 0.1, "p_m": 0.8},
        "selection": {"w11": 1, "w12": 1, "w22": 0.6, "target_p": 0.4},
    })
    assert response.status_code == 200
    result = response.json()
    assert [row["p"] for row in result["rows"]] == pytest.approx((0.3, 0.421179302046, 0.519915294044))
    assert result["target_generation"] == 1


@pytest.mark.parametrize(("target", "generation"), [(0.3, 0), (0.2, 2), (0.8, None)])
def test_selection_can_start_at_the_target_cross_a_lower_target_or_miss_it(target, generation):
    response = client.post("/api/simulate", json={
        "n": 500, "p0": 0.3, "generations": 2,
        "selection": {"w11": 0.5, "w12": 0.5, "w22": 1, "target_p": target},
    })
    assert response.status_code == 200
    result = response.json()
    if generation is None:
        assert "target_generation" not in result
    else:
        assert result["target_generation"] == generation


@pytest.mark.parametrize(
    ("p0", "weights"),
    [
        (0.3, {"w11": 0, "w12": 0, "w22": 0}),
        (0, {"w11": 1, "w12": 1, "w22": 0}),
    ],
)
def test_selection_reports_the_generation_where_no_genotypes_survive(p0, weights):
    response = client.post("/api/simulate", json={
        "n": 500, "p0": p0, "generations": 2,
        "selection": {**weights, "target_p": 0.95},
    })
    assert response.status_code == 422
    assert "Поколение 1: средняя приспособленность равна нулю" in response.json()["detail"]


@pytest.mark.parametrize(
    ("f", "genotypes"),
    [(0, (0.25, 0.5, 0.25)), (0.25, (0.3125, 0.375, 0.3125)), (1, (0.5, 0.0, 0.5))],
)
def test_inbreeding_changes_genotypes_but_not_allele_frequencies(f, genotypes):
    params = {"n": 500, "p0": 0.5, "generations": 2, "inbreeding": {"f": f}}
    response = client.post("/api/simulate", json=params)
    assert response.status_code == 200
    result = response.json()
    assert result["params"] == params
    initial, first, second = result["rows"]
    assert (initial["f_AA"], initial["f_Aa"], initial["f_aa"]) == (0.25, 0.5, 0.25)
    for row in (first, second):
        assert (row["p"], row["q"], row["h"]) == (0.5, 0.5, 0.5)
        assert (row["f_AA"], row["f_Aa"], row["f_aa"]) == pytest.approx(genotypes)
        assert row["f_AA"] + row["f_Aa"] + row["f_aa"] == pytest.approx(1.0, abs=1e-12)


def test_inbreeding_uses_the_frequency_after_migration_and_selection():
    response = client.post("/api/simulate", json={
        "n": 500, "p0": 0.25, "generations": 1,
        "migration": {"m": 0.5, "p_m": 0.75},
        "selection": {"w11": 1, "w12": 0.5, "w22": 0, "target_p": 0.7},
        "inbreeding": {"f": 0.5},
    })
    assert response.status_code == 200
    result = response.json()
    assert result["target_generation"] == 1
    row = result["rows"][1]
    assert row["p"] == pytest.approx(0.75)
    assert (row["f_AA"], row["f_Aa"], row["f_aa"], row["h"]) == pytest.approx(
        (0.65625, 0.1875, 0.15625, 0.375)
    )


def test_model_chi_square_matches_the_step3_reference():
    response = client.post("/api/simulate", json={
        "n": 500, "p0": 0.5, "generations": 3, "inbreeding": {"f": 0.25},
    })
    assert response.status_code == 200
    result = response.json()
    assert result["chi_square_summary"] == {
        "critical_value": 3.84,
        "degrees_of_freedom": 1,
        "first_exceedance_generation": 1,
    }
    assert [row["chi_square"] for row in result["rows"]] == pytest.approx([0, 31.25, 31.25, 31.25])


def test_model_chi_square_requires_strict_threshold_exceedance():
    response = client.post("/api/simulate", json={
        "n": 384, "p0": 0.5, "generations": 1, "inbreeding": {"f": 0.1},
    })
    assert response.status_code == 200
    result = response.json()
    assert result["rows"][1]["chi_square"] == 3.84
    assert "first_exceedance_generation" not in result["chi_square_summary"]


@pytest.mark.parametrize(("seed", "p"), [(0, 0), (1, 1)])
def test_model_chi_square_is_undefined_at_loss_or_fixation(seed, p):
    response = client.post("/api/simulate", json={
        "n": 2, "p0": 0.5, "generations": 5, "inbreeding": {"f": 0.25}, "drift": {"seed": seed},
    })
    assert response.status_code == 200
    result = response.json()
    assert result["rows"][-1]["p"] == p
    for row in result["rows"]:
        if row["p"] in (0, 1):
            assert "chi_square" not in row
        else:
            assert row["chi_square"] == pytest.approx(0 if row["t"] == 0 else 0.125)


def test_model_chi_square_handles_very_small_nonzero_frequencies():
    response = client.post("/api/simulate", json={
        "n": 500, "p0": 1e-200, "generations": 1, "inbreeding": {"f": 0.25},
    })
    assert response.status_code == 200
    assert response.json()["rows"][1]["chi_square"] == pytest.approx(31.25)


def test_drift_replays_the_complete_result_with_the_same_seed():
    params = {"n": 100, "p0": 0.5, "generations": 200, "drift": {"seed": 42}}
    first = client.post("/api/simulate", json=params)
    assert first.status_code == 200
    assert first.content == client.post("/api/simulate", json=params).content
    result = first.json()
    assert "boundary" not in result["drift_summary"]
    assert result["drift_summary"]["theoretical_half_life"] == pytest.approx(138.28257)
    assert [row["p"] for row in result["rows"][:2]] == pytest.approx([0.5, 0.515])
    assert result["rows"][138]["h"] == pytest.approx(0.4032)
    assert result["rows"][138]["h_theory"] == pytest.approx(0.2503543531)


def test_api_returns_auto_generated_seed_that_can_replay_the_run():
    params = {"n": 10, "p0": 0.5, "generations": 20, "drift": {}}
    first = client.post("/api/simulate", json=params)
    assert first.status_code == 200
    result = first.json()
    seed = result["params"]["drift"]["seed"]
    assert 0 <= seed < 2**32
    assert first.content == client.post("/api/simulate", json=result["params"]).content


@pytest.mark.parametrize(("migration", "selection", "inbreeding", "drift"), tuple(product((False, True), repeat=4)))
def test_all_factor_combinations_return_consistent_generation_rows(migration, selection, inbreeding, drift):
    params = {"n": 100, "p0": 0.3, "generations": 10}
    if migration:
        params["migration"] = {"m": 0.1, "p_m": 0.8}
    if selection:
        params["selection"] = {"w11": 1, "w12": 1, "w22": 0.6, "target_p": 0.5}
    if inbreeding:
        params["inbreeding"] = {"f": 0.25}
    if drift:
        params["drift"] = {"seed": 42}
    response = client.post("/api/simulate", json=params)
    assert response.status_code == 200
    result = response.json()
    assert len(result["rows"]) == 11
    assert result["rows"][0]["p"] == 0.3
    for row in result["rows"][1:]:
        assert row["f_AA"] + row["f_Aa"] + row["f_aa"] == pytest.approx(1.0, abs=1e-12)
        assert row["p"] == pytest.approx(row["f_AA"] + row["f_Aa"] / 2, abs=1e-12)
        assert row["f_Aa"] == pytest.approx(row["h"] * (0.75 if inbreeding else 1))
        if drift:
            assert 0 <= row["p"] <= 1
            assert row["p"] * 200 == pytest.approx(round(row["p"] * 200), abs=1e-12)
    assert ("h_theory" in result["rows"][1]) == (drift and not any((migration, selection, inbreeding)))


@pytest.mark.parametrize(
    "data",
    [
        {"n": 1, "p0": 0.5, "generations": 10},
        {"n": 100, "p0": 1.1, "generations": 10},
        {"n": 100, "p0": 0.5, "generations": 0},
        {"n": 10.5, "p0": 0.5, "generations": 10},
        {"n": 100, "p0": 0.5, "generations": 10, "drift": True},
        {"n": 100, "p0": 0.5, "generations": 10, "drift": {"seed": -1}},
        {"n": 100, "p0": 0.5, "generations": 10, "drift": {"seed": 2**32}},
        {"n": 100, "p0": 0.5, "generations": 10, "drift": {"seed": True}},
        {"n": 100, "p0": 0.5, "generations": 10, "selection": {
            "w11": 1.01, "w12": 1, "w22": 0.6, "target_p": 0.95,
        }},
        {"n": 100, "p0": 0.5, "generations": 10, "inbreeding": {"f": 1.01}},
        {"n": 100, "p0": 0.5, "generations": 10, "inbreeding": {"f": "0.25"}},
    ],
)
def test_invalid_request_returns_422_instead_of_silent_coercion(data):
    assert client.post("/api/simulate", json=data).status_code == 422


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
