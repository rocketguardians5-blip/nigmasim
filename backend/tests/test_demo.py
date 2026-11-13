"""Tes Fase 8 QA - Demo publik, proteksi sandi, dan skenario demo.

Cakupan:
- Functional: CRUD demo link & skenario, ambil layar demo, verifikasi sandi.
- Security: endpoint admin butuh autentikasi + izin demo:read/demo:write;
  publik tidak butuh login; sandi melindungi layar; token X-Demo-Token
  wajib saat link dilindungi sandi; link tidak aktif / kedaluwarsa ditolak.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models.capture import Screen


@pytest.fixture()
def project_with_screens(client: TestClient, auth_headers: dict[str, str]) -> int:
    suffix = uuid.uuid4().hex[:8]
    app = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": f"Demo App {suffix}", "source_url": "https://demo.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/DEMO/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Demo"},
    ).json()

    with SessionLocal() as db:
        for i in range(1, 4):
            screen = Screen(
                project_id=project["id"],
                screen_key=f"halaman-{i}",
                title=f"Halaman {i}",
                source_url="https://demo.example.com/halaman-" + str(i),
                screenshot_path=f"captures/test/halaman-{i}.png",
                capture_version=1,
                category="dashboard",
                tags=[],
                review_status="approved",
                structure={},
            )
            db.add(screen)
        db.commit()

    return project["id"]


# ---------------------------------------------------------------- Demo Link CRUD


def test_create_demo_link_with_password(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    response = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={
            "name": "Demo NigmaStream",
            "description": "Demo untuk calon klien",
            "project_id": project_with_screens,
            "screen_ids": [1, 2, 3],
            "password": "rahasia123",
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Demo NigmaStream"
    assert body["screen_ids"] == [1, 2, 3]
    assert body["is_active"] is True
    assert isinstance(body["token"], str) and len(body["token"]) > 0


def test_create_demo_link_without_password(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    response = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={
            "name": "Demo Bebas",
            "project_id": project_with_screens,
            "screen_ids": [1],
            "password": None,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Demo Bebas"


def test_create_demo_link_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/api/v1/demo-links",
        json={"name": "Tanpa Auth", "screen_ids": [1]},
    )
    assert response.status_code == 401, response.text


def test_list_demo_links(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    tag = uuid.uuid4().hex[:6]
    client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": f"Link A {tag}", "project_id": project_with_screens, "screen_ids": [1]},
    )
    client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": f"Link B {tag}", "project_id": project_with_screens, "screen_ids": [2]},
    )

    response = client.get("/api/v1/demo-links", headers=auth_headers)
    assert response.status_code == 200, response.text
    links = response.json()
    names = {link["name"] for link in links}
    assert f"Link A {tag}" in names
    assert f"Link B {tag}" in names


def test_list_demo_links_filter_by_project(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": "Link A", "project_id": project_with_screens, "screen_ids": [1]},
    )
    response = client.get(
        f"/api/v1/demo-links?project_id={project_with_screens}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1


def test_get_demo_link_not_found(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/v1/demo-links/999999", headers=auth_headers)
    assert response.status_code == 404, response.text


def test_update_demo_link(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    created = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": "Awal", "project_id": project_with_screens, "screen_ids": [1]},
    ).json()

    response = client.patch(
        f"/api/v1/demo-links/{created['id']}",
        headers=auth_headers,
        json={"name": "Diubah", "password": "baru456"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Diubah"


def test_delete_demo_link(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    created = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": "Hapus Saya", "project_id": project_with_screens, "screen_ids": [1]},
    ).json()

    response = client.delete(f"/api/v1/demo-links/{created['id']}", headers=auth_headers)
    assert response.status_code == 200, response.text

    gone = client.get(f"/api/v1/demo-links/{created['id']}", headers=auth_headers)
    assert gone.status_code == 404


# ---------------------------------------------------------------- Public demo (no auth)


def test_public_demo_info_without_password(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    token = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": "Publik", "project_id": project_with_screens, "screen_ids": [1]},
    ).json()["token"]

    response = client.get(f"/api/v1/public/demo/{token}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Publik"
    assert body["password_required"] is False
    assert body["screen_ids"] == [1]


def test_public_demo_info_with_password(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    token = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={
            "name": "Terproteksi",
            "project_id": project_with_screens,
            "screen_ids": [1],
            "password": "kunci",
        },
    ).json()["token"]

    response = client.get(f"/api/v1/public/demo/{token}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["password_required"] is True


def test_public_demo_info_not_found(client: TestClient) -> None:
    response = client.get("/api/v1/public/demo/token-yang-tidak-ada")
    assert response.status_code == 404, response.text


def test_public_demo_verify_wrong_password(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    token = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={
            "name": "Terproteksi",
            "project_id": project_with_screens,
            "screen_ids": [1],
            "password": "benar",
        },
    ).json()["token"]

    response = client.post(
        f"/api/v1/public/demo/{token}/verify",
        json={"password": "salah"},
    )
    assert response.status_code == 403, response.text


def test_public_demo_verify_correct_password(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    token = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={
            "name": "Terproteksi",
            "project_id": project_with_screens,
            "screen_ids": [1],
            "password": "benar",
        },
    ).json()["token"]

    response = client.post(
        f"/api/v1/public/demo/{token}/verify",
        json={"password": "benar"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_granted"] is True
    assert body["token"] == token
    assert body["screen_ids"] == [1]


def test_public_demo_screens_without_protection(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    """Demo tanpa sandi: layar bisa diambil tanpa X-Demo-Token."""
    token = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": "Publik", "project_id": project_with_screens, "screen_ids": [1, 2]},
    ).json()["token"]

    response = client.get(f"/api/v1/public/demo/{token}/screens")
    assert response.status_code == 200, response.text
    screens = response.json()
    assert len(screens) == 2


def test_public_demo_screens_requires_token_when_protected(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    """Demo dengan sandi: butuh X-Demo-Token valid setelah verifikasi."""
    token = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={
            "name": "Terproteksi",
            "project_id": project_with_screens,
            "screen_ids": [1],
            "password": "kunci",
        },
    ).json()["token"]

    # Tanpa token -> 403
    response = client.get(f"/api/v1/public/demo/{token}/screens")
    assert response.status_code == 403, response.text

    # Token salah -> 403
    response = client.get(
        f"/api/v1/public/demo/{token}/screens",
        headers={"X-Demo-Token": "demo:salah"},
    )
    assert response.status_code == 403, response.text

    # Token benar -> 200
    response = client.get(
        f"/api/v1/public/demo/{token}/screens",
        headers={"X-Demo-Token": f"demo:{token}"},
    )
    assert response.status_code == 200, response.text
    screens = response.json()
    assert len(screens) == 1


def test_public_demo_inactive_link(
    client: TestClient, auth_headers: dict[str, str], project_with_screens: int
) -> None:
    created = client.post(
        "/api/v1/demo-links",
        headers=auth_headers,
        json={"name": "Nonaktif", "project_id": project_with_screens, "screen_ids": [1], "is_active": False},
    ).json()
    token = created["token"]

    response = client.get(f"/api/v1/public/demo/{token}")
    assert response.status_code == 404, response.text


# ---------------------------------------------------------------- Demo Scenario


def test_create_demo_scenario(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/demo-scenarios",
        headers=auth_headers,
        json={
            "name": "Skenario Awal",
            "description": "Panduan presentasi",
            "steps": [
                {
                    "screen_id": 1,
                    "title": "Halaman Awal",
                    "instructor_notes": "Tunjukkan dashboard",
                },
                {"screen_id": 2, "title": "Halaman Kedua"},
            ],
            "is_template": False,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Skenario Awal"
    assert len(body["steps"]) == 2
    assert body["steps"][0]["screen_id"] == 1


def test_list_demo_scenarios(client: TestClient, auth_headers: dict[str, str]) -> None:
    tag = uuid.uuid4().hex[:6]
    client.post(
        "/api/v1/demo-scenarios",
        headers=auth_headers,
        json={"name": f"Satu {tag}", "steps": [{"screen_id": 1, "title": "A"}]},
    )
    client.post(
        "/api/v1/demo-scenarios",
        headers=auth_headers,
        json={"name": f"Dua {tag}", "steps": [{"screen_id": 2, "title": "B"}]},
    )

    response = client.get("/api/v1/demo-scenarios", headers=auth_headers)
    assert response.status_code == 200, response.text
    names = {s["name"] for s in response.json()}
    assert f"Satu {tag}" in names
    assert f"Dua {tag}" in names


def test_get_demo_scenario_not_found(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/v1/demo-scenarios/999999", headers=auth_headers)
    assert response.status_code == 404, response.text


def test_delete_demo_scenario(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/v1/demo-scenarios",
        headers=auth_headers,
        json={"name": "Hapus Saya", "steps": [{"screen_id": 1, "title": "A"}]},
    ).json()

    response = client.delete(f"/api/v1/demo-scenarios/{created['id']}", headers=auth_headers)
    assert response.status_code == 200, response.text

    gone = client.get(f"/api/v1/demo-scenarios/{created['id']}", headers=auth_headers)
    assert gone.status_code == 404
