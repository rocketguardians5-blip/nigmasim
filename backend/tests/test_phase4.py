"""Tes Fase 4 - Simulation Builder & data dummy."""

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
        json={"name": f"Sim App {suffix}", "source_url": "https://sim.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/SIM/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Simulasi"},
    ).json()
    return project["id"]


def _approved_reconstruction(project_id: int) -> int:
    """Buat screen + rekonstruksi yang sudah disetujui."""
    with SessionLocal() as db:
        from app.models.capture import Screen
        from app.models.reconstruction import Reconstruction, ReconstructionComponent

        screen = Screen(
            project_id=project_id,
            screen_key="daftar-proyek",
            title="Daftar Proyek",
            screenshot_path="captures/test/daftar.png",
            review_status="approved",
            tags=[],
            structure={
                "viewport": {"width": 1440, "height": 900},
                "tables": [
                    {
                        "type": "table",
                        "label": "Daftar Proyek",
                        "headers": ["ID Proyek", "Nama Proyek", "Nilai Risiko"],
                        "row_count": 4,
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
            project_id=project_id,
            status="approved",
            layout={"viewport": {"width": 1440, "height": 900}},
            code_text="export function DaftarProyek() { return null }",
            generated_by="rule-engine",
        )
        db.add(draft)
        db.flush()
        db.add(
            ReconstructionComponent(
                reconstruction_id=draft.id,
                region="main",
                component_type="table",
                label="Daftar Proyek",
                props={
                    "headers": ["ID Proyek", "Nama Proyek", "Nilai Risiko"],
                    "row_count": 4,
                    "column_count": 3,
                },
            )
        )
        db.commit()
        return screen.id


def test_create_simulation_requires_approved_reconstruction(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    response = client.post(
        f"/api/v1/simulation/project/{project_id}",
        headers=auth_headers,
        json={"name": "Demo"},
    )
    assert response.status_code == 409
    assert "disetujui" in response.json()["error"]["message"].lower()


def test_build_simulation_from_reconstruction(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    _approved_reconstruction(project_id)

    response = client.post(
        f"/api/v1/simulation/project/{project_id}",
        headers=auth_headers,
        json={"name": "Demo Proyek"},
    )
    assert response.status_code == 201, response.text
    definition = response.json()

    assert definition["name"] == "Demo Proyek"
    assert len(definition["screens"]) == 1
    screen = definition["screens"][0]
    assert screen["title"] == "Daftar Proyek"
    assert screen["route"] == "/daftar-proyek"
    assert screen["layout"]["table"]["columns"] == [
        "ID Proyek",
        "Nama Proyek",
        "Nilai Risiko",
    ]

    # Data dummy harus terbentuk otomatis dari kolom yang terdeteksi
    datasets = definition["datasets"]
    assert len(datasets) == 1
    dataset = next(iter(datasets.values()))
    assert len(dataset["schema"]) == 3
    assert len(dataset["rows"]) == 6
    # kolom ID harus terisi pola, kolom angka harus numerik
    rows = dataset["rows"]
    assert rows[0]["id_proyek"].startswith("IDP-")
    assert isinstance(rows[0]["nilai_risiko"], int)


def test_dataset_crud_and_reset(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    _approved_reconstruction(project_id)
    definition = client.post(
        f"/api/v1/simulation/project/{project_id}",
        headers=auth_headers,
        json={"name": "Demo"},
    ).json()
    sim_id = definition["id"]
    dataset_name = next(iter(definition["datasets"]))

    # Tambah baris
    added = client.post(
        f"/api/v1/simulation/{sim_id}/datasets/{dataset_name}/rows",
        headers=auth_headers,
        json={"id_proyek": "IDP-9999", "nama_proyek": "Proyek Uji", "nilai_risiko": 77},
    )
    assert added.status_code == 201, added.text
    row_id = added.json()["_id"]

    # Baris baru harus masuk ke dataset
    current = client.get(f"/api/v1/simulation/{sim_id}", headers=auth_headers).json()
    rows_now = next(iter(current["datasets"].values()))["rows"]
    assert any(row["_id"] == row_id for row in rows_now)

    # Ubah baris
    updated = client.patch(
        f"/api/v1/simulation/{sim_id}/datasets/{dataset_name}/rows/{row_id}",
        headers=auth_headers,
        json={"nama_proyek": "Proyek Diperbarui"},
    )
    assert updated.status_code == 200
    assert updated.json()["nama_proyek"] == "Proyek Diperbarui"

    # Hapus baris
    deleted = client.delete(
        f"/api/v1/simulation/{sim_id}/datasets/{dataset_name}/rows/{row_id}",
        headers=auth_headers,
    )
    assert deleted.status_code == 200

    # Reset mengembalikan ke data awal
    reset = client.post(f"/api/v1/simulation/{sim_id}/reset", headers=auth_headers)
    assert reset.status_code == 200
    after = client.get(f"/api/v1/simulation/{sim_id}", headers=auth_headers).json()
    rows_after = next(iter(after["datasets"].values()))["rows"]
    assert len(rows_after) == 6
    assert all(row["nama_proyek"] != "Proyek Diperbarui" for row in rows_after)


def test_bulk_import_rows(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    _approved_reconstruction(project_id)
    definition = client.post(
        f"/api/v1/simulation/project/{project_id}",
        headers=auth_headers,
        json={"name": "Demo"},
    ).json()
    sim_id = definition["id"]
    dataset_name = next(iter(definition["datasets"]))

    response = client.post(
        f"/api/v1/simulation/{sim_id}/datasets/{dataset_name}/rows/bulk",
        headers=auth_headers,
        json={
            "rows": [
                {"id_proyek": "IDP-0001", "nama_proyek": "Proyek A", "nilai_risiko": 20},
                {"id_proyek": "IDP-0002", "nama_proyek": "Proyek B", "nilai_risiko": 40},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["total"] == 8


def test_rebuild_replaces_previous_simulation(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    _approved_reconstruction(project_id)
    first = client.post(
        f"/api/v1/simulation/project/{project_id}",
        headers=auth_headers,
        json={"name": "Versi 1"},
    ).json()
    second = client.post(
        f"/api/v1/simulation/project/{project_id}",
        headers=auth_headers,
        json={"name": "Versi 2"},
    ).json()

    # Rebuild memperbarui simulasi yang sama (id stabil), bukan membuat duplikat
    assert first["id"] == second["id"]
    assert second["name"] == "Versi 2"
    listed = client.get(f"/api/v1/simulation/project/{project_id}", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["name"] == "Versi 2"
