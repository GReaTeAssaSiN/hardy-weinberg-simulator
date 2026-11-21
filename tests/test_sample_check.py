import pytest
from fastapi.testclient import TestClient

from api.main import app


client = TestClient(app)


@pytest.mark.parametrize(("observed", "p", "expected", "statistic", "verdict"), [
    ((298, 489, 213), 0.5425, (294.30625, 496.3875, 209.30625), 0.2214895876, "compatible"),
    ((360, 280, 360), 0.5, (250, 500, 250), 193.6, "deviation"),
    ((50, 500, 450), 0.3, (90, 420, 490), 36.2811791383, "deviation"),
    ((138, 324, 138), 0.5, (150, 300, 150), 3.84, "compatible"),
])
def test_sample_check_matches_reference_counts(observed, p, expected, statistic, verdict):
    response = client.post("/api/check-sample", json=dict(zip(("AA", "Aa", "aa"), observed, strict=True)))
    assert response.status_code == 200
    result = response.json()
    assert result["p"] == pytest.approx(p)
    assert result["q"] == pytest.approx(1 - p)
    assert result["n"] == sum(observed)
    assert result["verdict"] == verdict
    assert result["degrees_of_freedom"] == 1
    assert result["critical_value"] == 3.84
    assert result["chi_square"] == pytest.approx(statistic)
    assert [row["observed"] for row in result["rows"]] == list(observed)
    assert [row["expected"] for row in result["rows"]] == pytest.approx(expected)
    assert sum(row["contribution"] for row in result["rows"]) == pytest.approx(statistic)


def test_small_or_monomorphic_samples_do_not_produce_a_significance_verdict():
    small = client.post("/api/check-sample", json={"AA": 0, "Aa": 8, "aa": 0}).json()
    assert small["chi_square"] == 8
    assert small["verdict"] == "small_expected"

    monomorphic = client.post("/api/check-sample", json={"AA": 50, "Aa": 0, "aa": 0}).json()
    assert monomorphic["p"] == 1
    assert monomorphic["chi_square"] is None
    assert monomorphic["verdict"] == "one_allele"


@pytest.mark.parametrize("counts", [
    {"AA": 0, "Aa": 0, "aa": 0},
    {"AA": -1, "Aa": 20, "aa": 10},
    {"AA": 1.5, "Aa": 20, "aa": 10},
    {"AA": True, "Aa": 20, "aa": 10},
    {"AA": 100_000, "Aa": 1, "aa": 0},
])
def test_sample_check_rejects_invalid_counts(counts):
    assert client.post("/api/check-sample", json=counts).status_code == 422
