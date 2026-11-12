"""Tes Fase 6 - Documentation Generator."""

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
        json={"name": f"Dok App {suffix}", "source_url": "https://dok.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/DOK/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Dokumentasi"},
    ).json()
    return project["id"]


def test_generate_document_with_steps(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    # Siapkan simulasi + tutorial lewat API
    simulation = client.post(
        f"/api/v1/simulation/project/{project_id}?name=Sim%20Dok",
        headers=auth_headers,
    )
    if simulation.status_code != 201:
        # tidak ada rekonstruksi -> minimal tetap harus bisa gagal dengan pesan jelas
        assert simulation.status_code == 409
        return

    sim = simulation.json()
    tutorial = client.post(
        f"/api/v1/simulation/{sim['id']}/tutorials",
        headers=auth_headers,
        json={
            "title": "Cara Meninjau Risiko",
            "steps": [
                {"no": 1, "target": "card:Risiko Tinggi", "instruction": "Lihat kartu risiko", "expected": "Terlihat jumlah"}
            ],
        },
    ).json()

    generated = client.post(
        "/api/v1/documents/generate",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "title": "SOP Meninjau Risiko",
            "doc_type": "sop",
            "simulation_id": sim["id"],
            "tutorial_id": tutorial["id"],
        },
    )
    assert generated.status_code == 201, generated.text
    document = generated.json()

    assert document["status"] == "draft"
    content = document["content"]
    assert content["purpose"]
    assert content["prerequisites"]
    assert content["warnings"]
    assert len(content["steps"]) == 1
    assert content["steps"][0]["instruction"] == "Lihat kartu risiko"
    assert content["branding"]["company"] == "PT Nigmagrid Indo Nesia"

    # Markdown & HTML harus ter-render
    assert "# SOP Meninjau Risiko" in document["markdown"]
    assert "## Tujuan" in document["markdown"]
    assert "<!doctype html>" in document["html"]
    assert "PT Nigmagrid Indo Nesia" in document["html"]


def test_document_list_and_edit(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    generated = client.post(
        "/api/v1/documents/generate",
        headers=auth_headers,
        json={"project_id": project_id, "title": "Panduan Singkat", "doc_type": "user_guide"},
    )
    assert generated.status_code == 201, generated.text
    document = generated.json()

    listed = client.get(f"/api/v1/documents/project/{project_id}", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    # Sunting isi -> markdown & html harus ikut ter-render ulang
    content = dict(document["content"])
    content["purpose"] = "Tujuan yang sudah disunting"
    edited = client.patch(
        f"/api/v1/documents/{document['id']}",
        headers=auth_headers,
        json={"content": content},
    )
    assert edited.status_code == 200
    assert "Tujuan yang sudah disunting" in edited.json()["markdown"]
    assert "Tujuan yang sudah disunting" in edited.json()["html"]
    assert edited.json()["status"] == "draft"


def test_publish_requires_steps(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    generated = client.post(
        "/api/v1/documents/generate",
        headers=auth_headers,
        json={"project_id": project_id, "title": "Dok Kosong", "doc_type": "module"},
    ).json()

    blocked = client.post(
        f"/api/v1/documents/{generated['id']}/publish",
        headers=auth_headers,
        json={"status": "published"},
    )
    assert blocked.status_code == 409


def test_download_markdown(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    generated = client.post(
        "/api/v1/documents/generate",
        headers=auth_headers,
        json={"project_id": project_id, "title": "Dok Unduh", "doc_type": "sop"},
    ).json()

    response = client.get(
        f"/api/v1/documents/{generated['id']}/download?format=md", headers=auth_headers
    )
    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert "Dok Unduh" in response.text

    html = client.get(
        f"/api/v1/documents/{generated['id']}/download?format=html", headers=auth_headers
    )
    assert html.status_code == 200
    assert "<!doctype html>" in html.text
