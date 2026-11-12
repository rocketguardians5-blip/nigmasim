"""Tes Fase 3 - mesin analisis & rekonstruksi UI."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal


@pytest.fixture()
def project_id(client: TestClient, auth_headers: dict[str, str]) -> int:
    suffix = uuid.uuid4().hex[:8]
    app = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": f"Rekon App {suffix}", "source_url": "https://rekon.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/R/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Rekonstruksi"},
    ).json()
    return project["id"]


def _make_screen(project_id: int, *, with_structure: bool = True) -> int:
    with SessionLocal() as db:
        from app.models.capture import Screen, ScreenElement

        screen = Screen(
            project_id=project_id,
            screen_key="dashboard",
            title="Dashboard Risiko",
            screenshot_path="captures/test/dashboard.png",
            review_status="pending",
            tags=[],
            structure={
                "viewport": {"width": 1440, "height": 900},
                "tables": [
                    {
                        "type": "table",
                        "label": "Risiko Terakhir",
                        "headers": ["ID Risiko", "Judul", "Tingkat"],
                        "row_count": 5,
                        "column_count": 3,
                        "box": {"x": 300, "y": 400, "w": 900, "h": 300},
                    }
                ],
                "headings": [
                    {"type": "heading", "label": "Dashboard Risiko Proyek", "level": 1, "box": {"x": 300, "y": 40, "w": 400, "h": 32}}
                ],
                "forms": [],
                "navs": [],
                "cards": [
                    {"type": "card", "label": "Risiko Tinggi", "box": {"x": 300, "y": 120, "w": 200, "h": 90}},
                    {"type": "card", "label": "Risiko Sedang", "box": {"x": 520, "y": 120, "w": 200, "h": 90}},
                ],
                "images": [],
            }
            if with_structure
            else None,
        )
        db.add(screen)
        db.flush()

        # 4 link navigasi di area kiri (kandidat sidebar)
        for index in range(4):
            db.add(
                ScreenElement(
                    screen_id=screen.id,
                    element_type="a",
                    label=f"Menu {index}",
                    bounding_box={"x": 20, "y": 120 + index * 36, "w": 160, "h": 28},
                )
            )
        # 1 input di area konten
        db.add(
            ScreenElement(
                screen_id=screen.id,
                element_type="input",
                label="Cari risiko",
                bounding_box={"x": 320, "y": 340, "w": 240, "h": 32},
            )
        )
        db.commit()
        return screen.id


def test_analyze_creates_draft(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    screen_id = _make_screen(project_id)

    response = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 201, response.text
    draft = response.json()

    assert draft["status"] == "draft"
    assert draft["generated_by"] == "rule-engine"
    assert draft["layout"]["has_sidebar"] is True
    assert draft["layout"]["regions"]["sidebar"]["item_count"] == 4

    types = [c["component_type"] for c in draft["components"]]
    assert "nav-item" in types
    assert "table" in types
    assert "field" in types
    assert "card" in types

    # Draft React harus mengandung komponen yang terdeteksi
    code = draft["code_text"]
    assert "export function DashboardRisiko" in code
    assert "<aside" in code
    assert "<table" in code
    assert "Menu 0" in code

    # Asumsi WAJIB ada dan tercatat untuk diperiksa manusia
    assert len(draft["assumptions"]) >= 3
    topics = {a["topic"] for a in draft["assumptions"]}
    assert "Aturan bisnis" in topics
    assert all(a["resolved"] is False for a in draft["assumptions"])


def test_approve_blocked_while_assumptions_unresolved(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    blocked = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}/review",
        headers=auth_headers,
        json={"status": "approved"},
    )
    assert blocked.status_code == 409
    assert "asumsi" in blocked.json()["error"]["message"].lower()


def test_resolve_then_approve(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    screen_id = _make_screen(project_id)
    draft = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    ).json()

    for assumption in draft["assumptions"]:
        resolved = client.post(
            f"/api/v1/reconstructions/assumption/{assumption['id']}/resolve",
            headers=auth_headers,
        )
        assert resolved.status_code == 200

    approved = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}/review",
        headers=auth_headers,
        json={"status": "approved"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["reviewed_by"] is not None


def test_code_is_editable_and_resets_review(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    screen_id = _make_screen(project_id)
    draft = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    ).json()

    for assumption in draft["assumptions"]:
        client.post(
            f"/api/v1/reconstructions/assumption/{assumption['id']}/resolve",
            headers=auth_headers,
        )
    client.post(
        f"/api/v1/reconstructions/screen/{screen_id}/review",
        headers=auth_headers,
        json={"status": "approved"},
    )

    edited = client.patch(
        f"/api/v1/reconstructions/screen/{screen_id}/code",
        headers=auth_headers,
        json={"code_text": "export function Manual() { return null }"},
    )
    assert edited.status_code == 200
    assert edited.json()["code_text"] == "export function Manual() { return null }"
    # Edit kode mengembalikan status ke draft supaya wajib direview ulang
    assert edited.json()["status"] == "draft"


def test_component_can_be_corrected(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    screen_id = _make_screen(project_id)
    draft = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    ).json()

    target = next(c for c in draft["components"] if c["component_type"] == "card")
    updated = client.patch(
        f"/api/v1/reconstructions/component/{target['id']}",
        headers=auth_headers,
        json={"label": "Total Risiko", "notes": "Dicek manual"},
    )
    assert updated.status_code == 200
    assert updated.json()["label"] == "Total Risiko"
    assert updated.json()["notes"] == "Dicek manual"


def test_reanalyze_updates_single_draft(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Analisis ulang memperbarui draf yang sama - tidak menumpuk draf baru."""
    screen_id = _make_screen(project_id)
    first = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    ).json()

    second = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    ).json()

    assert second["id"] == first["id"]
    listed = client.get(
        f"/api/v1/reconstructions/project/{project_id}", headers=auth_headers
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_screen_without_data_is_rejected(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    screen_id = _make_screen(project_id, with_structure=False)
    with SessionLocal() as db:
        from app.models.capture import ScreenElement

        db.query(ScreenElement).filter(ScreenElement.screen_id == screen_id).delete()
        db.commit()

    response = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 409
