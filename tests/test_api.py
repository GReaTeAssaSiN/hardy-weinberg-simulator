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
    "data",
    [
        {"n": 1, "p0": 0.5, "generations": 10},
        {"n": 100, "p0": 1.1, "generations": 10},
        {"n": 100, "p0": 0.5, "generations": 0},
        {"n": 10.5, "p0": 0.5, "generations": 10},
        {"n": 100, "p0": 0.5, "generations": 10, "drift": True},
        {"n": 100, "p0": 0.5, "generations": 10, "selection": {
            "w11": 1.01, "w12": 1, "w22": 0.6, "target_p": 0.95,
        }},
    ],
)
def test_invalid_request_returns_422_instead_of_silent_coercion(data):
    assert client.post("/api/simulate", json=data).status_code == 422


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
