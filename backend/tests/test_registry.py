"""Tes Application Registry dan Project (termasuk aturan otorisasi)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _create_application(client: TestClient, headers: dict[str, str], name: str = "NigmaRisk"):
    return client.post(
        "/api/v1/applications",
        headers=headers,
        json={
            "name": name,
            "description": "Aplikasi manajemen risiko",
            "owner": "PT Nigmagrid Indo Nesia",
            "category": "Risk Management",
            "source_url": "https://nignarisk.example.com",
            "environment_label": "staging",
        },
    )


def test_create_application_is_pending(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = _create_application(client, auth_headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["authorization_status"] == "pending"
    assert body["name"] == "NigmaRisk"


def test_duplicate_application_name(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _create_application(client, auth_headers, name="Aplikasi Kembar")
    duplicate = _create_application(client, auth_headers, name="aplikasi kembar")
    assert duplicate.status_code == 409


def test_project_blocked_when_not_authorized(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    app_id = _create_application(client, auth_headers, name="App Belum Izin").json()["id"]
    response = client.post(
        f"/api/v1/applications/{app_id}/projects",
        headers=auth_headers,
        json={"name": "Project Demo"},
    )
    assert response.status_code == 409
    assert "otorisasi" in response.json()["error"]["message"].lower()


def test_authorization_requires_reference(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    app_id = _create_application(client, auth_headers, name="App Tanpa Ref").json()["id"]
    response = client.patch(
        f"/api/v1/applications/{app_id}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved"},
    )
    assert response.status_code == 409


def test_full_registry_flow(client: TestClient, auth_headers: dict[str, str]) -> None:
    app_id = _create_application(client, auth_headers, name="App Siap Capture").json()["id"]

    authorized = client.patch(
        f"/api/v1/applications/{app_id}/authorization",
        headers=auth_headers,
        json={
            "authorization_status": "approved",
            "authorization_ref": "IZIN/2026/001",
            "authorization_note": "Surat izin dari pemilik aplikasi",
        },
    )
    assert authorized.status_code == 200
    assert authorized.json()["authorization_status"] == "approved"

    project = client.post(
        f"/api/v1/applications/{app_id}/projects",
        headers=auth_headers,
        json={"name": "Pilot Demo", "description": "Demo untuk klien"},
    )
    assert project.status_code == 201, project.text
    assert project.json()["status"] == "draft"

    listed = client.get(f"/api/v1/applications/{app_id}/projects", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    project_id = project.json()["id"]
    updated = client.patch(
        f"/api/v1/projects/{project_id}",
        headers=auth_headers,
        json={"status": "capturing"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "capturing"

    # Aplikasi tidak boleh dihapus selama masih punya project
    blocked = client.delete(f"/api/v1/applications/{app_id}", headers=auth_headers)
    assert blocked.status_code == 409

    deleted = client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert deleted.status_code == 200

    deleted_app = client.delete(f"/api/v1/applications/{app_id}", headers=auth_headers)
    assert deleted_app.status_code == 200


def test_private_ip_url_rejected(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": "App Internal", "source_url": "http://192.168.1.10/dashboard"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_non_http_scheme_rejected(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": "App Aneh", "source_url": "javascript:alert(1)"},
    )
    assert response.status_code == 422


def test_application_not_found(client: TestClient, auth_headers: dict[str, str]) -> None:
    assert client.get("/api/v1/applications/999999", headers=auth_headers).status_code == 404


def test_list_pagination_and_search(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    for i in range(3):
        _create_application(client, auth_headers, name=f"Aplikasi Cari {i}")

    response = client.get(
        "/api/v1/applications?search=cari&page=1&page_size=2", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["page_size"] == 2
    assert len(body["items"]) == 2
    assert body["total"] >= 3
