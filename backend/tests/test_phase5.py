"""Tes Fase 5 - workflow (alur approval) & tutorial."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal


@pytest.fixture()
def simulation_id(client: TestClient, auth_headers: dict[str, str]) -> int:
    suffix = uuid.uuid4().hex[:8]
    app = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": f"WF App {suffix}", "source_url": "https://wf.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/WF/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Workflow"},
    ).json()

    with SessionLocal() as db:
        from app.models.capture import Screen
        from app.models.reconstruction import Reconstruction, ReconstructionComponent

        screen = Screen(
            project_id=project["id"],
            screen_key="daftar",
            title="Daftar Pengajuan",
            screenshot_path="captures/test/daftar.png",
            review_status="approved",
            tags=[],
            structure={
                "viewport": {"width": 1440, "height": 900},
                "tables": [
                    {
                        "type": "table",
                        "label": "Pengajuan",
                        "headers": ["ID", "Judul", "Status"],
                        "row_count": 3,
                        "column_count": 3,
                        "box": {"x": 300, "y": 300, "w": 900, "h": 300},
                    }
                ],
                "headings": [],
                "forms": [],
                "cards": [],
                "images": [],
            },
        )
        db.add(screen)
        db.flush()
        draft = Reconstruction(
            screen_id=screen.id,
            project_id=project["id"],
            status="approved",
            layout={},
            code_text="export function X() { return null }",
            generated_by="rule-engine",
        )
        db.add(draft)
        db.flush()
        db.add(
            ReconstructionComponent(
                reconstruction_id=draft.id,
                region="main",
                component_type="table",
                label="Pengajuan",
                props={"headers": ["ID", "Judul", "Status"], "row_count": 3, "column_count": 3},
            )
        )
        db.commit()

    sim = client.post(
        f"/api/v1/simulation/project/{project['id']}?name=Sim%20Workflow",
        headers=auth_headers,
    ).json()
    return sim["id"]


def test_default_workflow_created(
    client: TestClient, auth_headers: dict[str, str], simulation_id: int
) -> None:
    response = client.get(f"/api/v1/simulation/{simulation_id}/workflow", headers=auth_headers)
    assert response.status_code == 200
    workflow = response.json()
    assert len(workflow["states"]) == 6
    assert workflow["initial_state"] == "draft"
    assert workflow["state_field"] == "status"
    assert any(t["action"] == "submit" for t in workflow["transitions"])


def test_full_approval_flow(
    client: TestClient, auth_headers: dict[str, str], simulation_id: int
) -> None:
    definition = client.get(f"/api/v1/simulation/{simulation_id}", headers=auth_headers).json()
    dataset_name = next(iter(definition["datasets"]))
    rows = definition["datasets"][dataset_name]["rows"]
    row_id = rows[0]["_id"]

    # Staf mengajukan
    submit = client.post(
        f"/api/v1/simulation/{simulation_id}/workflow/transition",
        headers=auth_headers,
        json={"dataset": dataset_name, "row_id": row_id, "action": "submit", "role": "staf"},
    )
    assert submit.status_code == 200, submit.text
    assert submit.json()["current_state"] == "submitted"

    # Staf tidak boleh menyetujui
    forbidden = client.post(
        f"/api/v1/simulation/{simulation_id}/workflow/transition",
        headers=auth_headers,
        json={"dataset": dataset_name, "row_id": row_id, "action": "approve", "role": "staf"},
    )
    assert forbidden.status_code == 409

    # Manager menyetujui (harus lewat review dulu)
    review = client.post(
        f"/api/v1/simulation/{simulation_id}/workflow/transition",
        headers=auth_headers,
        json={"dataset": dataset_name, "row_id": row_id, "action": "review", "role": "manager"},
    )
    assert review.json()["current_state"] == "in_review"

    approve = client.post(
        f"/api/v1/simulation/{simulation_id}/workflow/transition",
        headers=auth_headers,
        json={"dataset": dataset_name, "row_id": row_id, "action": "approve", "role": "manager"},
    )
    assert approve.status_code == 200
    assert approve.json()["current_state"] == "approved"
    assert len(approve.json()["history"]) == 4

    # Status terlihat di kolom status baris data
    sim = client.get(f"/api/v1/simulation/{simulation_id}", headers=auth_headers).json()
    updated = next(
        row
        for row in next(iter(sim["datasets"].values()))["rows"]
        if row["_id"] == row_id
    )
    assert updated["status"] == "Disetujui"


def test_reject_and_revise(
    client: TestClient, auth_headers: dict[str, str], simulation_id: int
) -> None:
    definition = client.get(
        f"/api/v1/simulation/{simulation_id}", headers=auth_headers
    ).json()
    dataset_name = next(iter(definition["datasets"]))
    row_id = next(iter(definition["datasets"].values()))["rows"][0]["_id"]

    for action, role in [("submit", "staf"), ("review", "manager"), ("reject", "manager")]:
        response = client.post(
            f"/api/v1/simulation/{simulation_id}/workflow/transition",
            headers=auth_headers,
            json={"dataset": dataset_name, "row_id": row_id, "action": action, "role": role},
        )
        assert response.status_code == 200, response.text

    assert response.json()["current_state"] == "rejected"

    revise = client.post(
        f"/api/v1/simulation/{simulation_id}/workflow/transition",
        headers=auth_headers,
        json={"dataset": dataset_name, "row_id": row_id, "action": "revise", "role": "staf"},
    )
    assert revise.json()["current_state"] == "revision"

    resubmit = client.post(
        f"/api/v1/simulation/{simulation_id}/workflow/transition",
        headers=auth_headers,
        json={"dataset": dataset_name, "row_id": row_id, "action": "resubmit", "role": "staf"},
    )
    assert resubmit.json()["current_state"] == "submitted"


def test_tutorial_crud(
    client: TestClient, auth_headers: dict[str, str], simulation_id: int
) -> None:
    created = client.post(
        f"/api/v1/simulation/{simulation_id}/tutorials",
        headers=auth_headers,
        json={
            "title": "Cara Membuat Pengajuan",
            "description": "Panduan singkat",
            "steps": [
                {"no": 1, "screen": "daftar", "target": "button:Tambah", "instruction": "Klik Tambah", "expected": "Form terbuka"},
                {"no": 2, "screen": "daftar", "target": "field:judul", "instruction": "Isi judul", "expected": "Judul terisi"},
            ],
        },
    )
    assert created.status_code == 201, created.text
    tutorial = created.json()
    assert len(tutorial["steps"]) == 2
    assert tutorial["steps"][0]["no"] == 1

    listed = client.get(f"/api/v1/simulation/{simulation_id}/tutorials", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    updated = client.put(
        f"/api/v1/simulation/{simulation_id}/tutorials/{tutorial['id']}",
        headers=auth_headers,
        json={"status": "published", "title": "Judul Baru"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "published"

    deleted = client.delete(
        f"/api/v1/simulation/{simulation_id}/tutorials/{tutorial['id']}",
        headers=auth_headers,
    )
    assert deleted.status_code == 200
    assert client.get(
        f"/api/v1/simulation/{simulation_id}/tutorials", headers=auth_headers
    ).json() == []
