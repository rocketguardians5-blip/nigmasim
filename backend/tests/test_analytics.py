"""Tes Fase 8 QA - Analitik pengunjung (visitor stats).

Cakupan:
- Functional: catat kunjungan publik, ambil ringkasan statistik.
- Security: endpoint statistik wajib autentikasi + izin analytics:read.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_record_visit_public(client: TestClient) -> None:
    """POST /analytics/visit boleh diakses tanpa login."""
    response = client.post(
        "/api/v1/analytics/visit",
        json={"path": "/public/demo/abc", "user_agent": "Mozilla/5.0 Test"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "recorded"
    assert isinstance(body["id"], int)


def test_record_visit_path_required(client: TestClient) -> None:
    """field path wajib diisi."""
    response = client.post("/api/v1/analytics/visit", json={})
    assert response.status_code == 422, response.text


def test_stats_requires_auth(client: TestClient) -> None:
    """GET /analytics/stats ditolak tanpa token."""
    response = client.get("/api/v1/analytics/stats")
    assert response.status_code == 401, response.text


def test_stats_returns_summary(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /analytics/stats mengembalikan ringkasan yang benar setelah kunjungan."""
    path_x = f"/qa/demo/x-{uuid.uuid4().hex[:8]}"
    path_y = f"/qa/demo/y-{uuid.uuid4().hex[:8]}"
    client.post("/api/v1/analytics/visit", json={"path": path_x, "user_agent": "UA-1"})
    client.post("/api/v1/analytics/visit", json={"path": path_x, "user_agent": "UA-2"})
    client.post("/api/v1/analytics/visit", json={"path": path_y, "user_agent": "UA-3"})

    response = client.get("/api/v1/analytics/stats", headers=auth_headers)
    assert response.status_code == 200, response.text
    stats = response.json()
    paths = {item["path"]: item["count"] for item in stats["visits_by_path"]}
    assert paths.get(path_x) == 2
    assert paths.get(path_y) == 1
    assert stats["total_visits"] >= 3


def test_stats_limit(client: TestClient, auth_headers: dict[str, str]) -> None:
    """parameter limit membatasi jumlah kunjungan terbaru."""
    base = f"/qa/limit-{uuid.uuid4().hex[:8]}"
    for i in range(4):
        client.post("/api/v1/analytics/visit", json={"path": f"{base}/{i}"})

    response = client.get(
        "/api/v1/analytics/stats?limit=2", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    stats = response.json()
    assert stats["total_visits"] >= 4
    assert len(stats["recent_visits"]) == 2


def test_stats_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    """tanpa kunjungan, statistik nol tanpa error (hanya valid ketika DB kosong)."""
    response = client.get("/api/v1/analytics/stats", headers=auth_headers)
    assert response.status_code == 200, response.text
    stats = response.json()
    assert isinstance(stats["total_visits"], int)
    assert isinstance(stats["visits_by_path"], list)
    assert isinstance(stats["recent_visits"], list)
