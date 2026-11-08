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
    "data",
    [
        {"n": 1, "p0": 0.5, "generations": 10},
        {"n": 100, "p0": 1.1, "generations": 10},
        {"n": 100, "p0": 0.5, "generations": 0},
        {"n": 10.5, "p0": 0.5, "generations": 10},
        {"n": 100, "p0": 0.5, "generations": 10, "drift": True},
    ],
)
def test_invalid_request_returns_422_instead_of_silent_coercion(data):
    assert client.post("/api/simulate", json=data).status_code == 422


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
