"""Tes Fase 2: versi capture, kategori/modul, relasi layar, peta navigasi."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def project_id(client: TestClient, auth_headers: dict[str, str]) -> int:
    suffix = uuid.uuid4().hex[:8]
    app = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": f"Fase2 App {suffix}", "source_url": "https://fase2.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/F2/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Fase 2"},
    ).json()
    return project["id"]


def _fake_capture(url: str, title: str):
    def fake(label, full_page, relative_dir):
        return {
            "file_path": f"C:/temp/{label}.png",
            "url": url,
            "title": title,
            "full_page": full_page,
            "elements": [],
            "interactions": [],
        }

    return fake


def _capture(client, auth_headers, project_id, monkeypatch, url, title):
    monkeypatch.setattr(
        "app.api.v1.capture.capture_client.take_capture",
        _fake_capture(url, title),
    )
    session = client.post(
        f"/api/v1/projects/{project_id}/capture-sessions", headers=auth_headers, json={}
    ).json()
    return client.post(
        f"/api/v1/capture-sessions/{session['id']}/capture",
        headers=auth_headers,
        params={"title": title},
    ).json()


def test_recapture_same_page_creates_new_version(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch
) -> None:
    first = _capture(
        client, auth_headers, project_id, monkeypatch,
        "https://fase2.example.com/dashboard", "Dashboard",
    )
    second = _capture(
        client, auth_headers, project_id, monkeypatch,
        "https://fase2.example.com/dashboard", "Dashboard",
    )

    assert first["screen_key"] == second["screen_key"]
    assert first["capture_version"] == 1
    assert second["capture_version"] == 2
    assert first["id"] != second["id"]

    versions = client.get(
        f"/api/v1/screens/{first['id']}/versions", headers=auth_headers
    )
    assert versions.status_code == 200
    assert [v["capture_version"] for v in versions.json()] == [2, 1]


def test_same_title_different_url_is_different_screen(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch
) -> None:
    a = _capture(client, auth_headers, project_id, monkeypatch, "https://fase2.example.com/a", "Risiko")
    b = _capture(client, auth_headers, project_id, monkeypatch, "https://fase2.example.com/b", "Risiko")

    assert a["screen_key"] != b["screen_key"]
    assert b["screen_key"].endswith("-2")
    assert a["capture_version"] == 1
    assert b["capture_version"] == 1


def test_latest_only_filter(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch
) -> None:
    _capture(client, auth_headers, project_id, monkeypatch, "https://fase2.example.com/x", "Halaman X")
    _capture(client, auth_headers, project_id, monkeypatch, "https://fase2.example.com/x", "Halaman X")

    all_screens = client.get(
        f"/api/v1/projects/{project_id}/screens", headers=auth_headers
    ).json()
    assert all_screens["total"] == 2

    latest = client.get(
        f"/api/v1/projects/{project_id}/screens?latest_only=true", headers=auth_headers
    ).json()
    assert latest["total"] == 1
    assert latest["items"][0]["capture_version"] == 2


def test_category_grouping_and_filter(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch
) -> None:
    screen = _capture(
        client, auth_headers, project_id, monkeypatch,
        "https://fase2.example.com/list", "Daftar Proyek",
    )

    updated = client.patch(
        f"/api/v1/screens/{screen['id']}",
        headers=auth_headers,
        json={"category": "Project Risk"},
    )
    assert updated.status_code == 200
    assert updated.json()["category"] == "Project Risk"

    categories = client.get(
        f"/api/v1/projects/{project_id}/screen-categories", headers=auth_headers
    )
    assert categories.status_code == 200
    assert categories.json() == [{"name": "Project Risk", "count": 1}]

    filtered = client.get(
        f"/api/v1/projects/{project_id}/screens?category=Project Risk", headers=auth_headers
    )
    assert filtered.json()["total"] == 1

    empty = client.get(
        f"/api/v1/projects/{project_id}/screens?category=Reporting", headers=auth_headers
    )
    assert empty.json()["total"] == 0


def test_parent_relation_and_navigation_map(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch
) -> None:
    parent = _capture(
        client, auth_headers, project_id, monkeypatch,
        "https://fase2.example.com/list", "Daftar",
    )
    child = _capture(
        client, auth_headers, project_id, monkeypatch,
        "https://fase2.example.com/list/detail", "Detail Risiko",
    )

    linked = client.patch(
        f"/api/v1/screens/{child['id']}",
        headers=auth_headers,
        json={"parent_screen_id": parent["id"]},
    )
    assert linked.status_code == 200
    assert linked.json()["parent_id"] == parent["id"]

    tree = client.get(
        f"/api/v1/projects/{project_id}/navigation-map", headers=auth_headers
    )
    assert tree.status_code == 200
    roots = tree.json()
    assert len(roots) == 1
    assert roots[0]["title"] == "Daftar"
    assert roots[0]["children"][0]["title"] == "Detail Risiko"


def test_invalid_parent_rejected(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch
) -> None:
    screen = _capture(
        client, auth_headers, project_id, monkeypatch,
        "https://fase2.example.com/z", "Halaman Z",
    )

    missing = client.patch(
        f"/api/v1/screens/{screen['id']}",
        headers=auth_headers,
        json={"parent_screen_id": 999999},
    )
    assert missing.status_code == 404

    itself = client.patch(
        f"/api/v1/screens/{screen['id']}",
        headers=auth_headers,
        json={"parent_screen_id": screen["id"]},
    )
    assert itself.status_code == 409


def test_recapture_endpoint_creates_new_version(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch
) -> None:
    screen = _capture(
        client, auth_headers, project_id, monkeypatch,
        "https://fase2.example.com/recap", "Halaman Rekap",
    )

    # Sesi capture harus aktif agar recapture bisa jalan.
    client.post(f"/api/v1/projects/{project_id}/capture-sessions", headers=auth_headers, json={})
    monkeypatch.setattr(
        "app.api.v1.capture.capture_client.take_capture",
        _fake_capture("https://fase2.example.com/recap", "Halaman Rekap"),
    )

    response = client.post(f"/api/v1/screens/{screen['id']}/recapture", headers=auth_headers)
    assert response.status_code == 201, response.text
    new_screen = response.json()
    assert new_screen["capture_version"] == 2
    assert new_screen["screen_key"] == screen["screen_key"]
