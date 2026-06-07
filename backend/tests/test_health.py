"""
Phase 1 smoke test (CLAUDE.md §16). Proves the backend stub boots and the health
endpoint responds — the unit the CI `backend-tests` job runs. Phase-specific tests
(RLS isolation P2/P3, agent nodes P4, ...) are added in their owning phases.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "backend"


def test_root_ok():
    res = client.get("/")
    assert res.status_code == 200
    assert "DataAutomated.io" in res.json()["name"]
