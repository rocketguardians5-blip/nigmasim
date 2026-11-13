"""Tes Capture Studio & Screen Repository.

Worker Playwright dimock — test ini tidak pernah membuka browser sungguhan.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.db.session import SessionLocal, settings


def _png(color=(255, 255, 255), size=(400, 200)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture()
def authorized_app(client: TestClient, auth_headers: dict[str, str]) -> dict:
    import uuid

    suffix = uuid.uuid4().hex[:8]
    app_resp = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={
            "name": f"App Capture {suffix}",
            "source_url": "https://contoh.example.com",
            "login_url": "https://contoh.example.com/login",
            "environment_label": "staging",
        },
    )
    app_id = app_resp.json()["id"]
    client.patch(
        f"/api/v1/applications/{app_id}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/TEST/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app_id}/projects",
        headers=auth_headers,
        json={"name": "Project Capture"},
    )
    return {"application_id": app_id, "project_id": project.json()["id"]}


def test_session_requires_authorized_app(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    app_resp = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": "App Tanpa Izin", "source_url": "https://belum-izin.example.com"},
    )
    app_id = app_resp.json()["id"]

    # Project tidak bisa dibuat tanpa otorisasi
    blocked_project = client.post(
        f"/api/v1/applications/{app_id}/projects",
        headers=auth_headers,
        json={"name": "Project X"},
    )
    assert blocked_project.status_code == 409


def test_capture_device_profile(
    client: TestClient, auth_headers: dict[str, str], authorized_app: dict, monkeypatch
) -> None:
    """Preset perangkat diteruskan ke worker (untuk capture tampilan mobile)."""
    calls: dict = {}

    def fake_start(url, width, height, hosts, device="desktop"):
        calls["device"] = device
        return {"status": "active"}

    monkeypatch.setattr("app.api.v1.capture.capture_client.start_session", fake_start)

    session = client.post(
        f"/api/v1/projects/{authorized_app['project_id']}/capture-sessions",
        headers=auth_headers,
        json={"device": "phone"},
    )
    assert session.status_code == 201, session.text
    assert session.json()["device"] == "phone"

    client.post(f"/api/v1/capture-sessions/{session.json()['id']}/start", headers=auth_headers)
    assert calls["device"] == "phone"


def test_create_session_and_start(
    client: TestClient, auth_headers: dict[str, str], authorized_app: dict, monkeypatch
) -> None:
    calls: dict = {}

    def fake_start(url, width, height, hosts, device="desktop"):
        calls["url"] = url
        calls["hosts"] = hosts
        calls["device"] = device
        return {"status": "active", "session_id": "cap_1"}

    monkeypatch.setattr("app.api.v1.capture.capture_client.start_session", fake_start)

    created = client.post(
        f"/api/v1/projects/{authorized_app['project_id']}/capture-sessions",
        headers=auth_headers,
        json={"notes": "Sesi uji"},
    )
    assert created.status_code == 201, created.text
    session = created.json()
    assert session["status"] == "active"
    assert session["browser_mode"] == "headed"

    started = client.post(
        f"/api/v1/capture-sessions/{session['id']}/start", headers=auth_headers
    )
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "running"

    # Worker hanya boleh membuka host yang diotorisasi
    assert calls["url"] == "https://contoh.example.com/login"
    assert calls["hosts"] == ["contoh.example.com"]


def test_start_fails_gracefully_when_worker_down(
    client: TestClient, auth_headers: dict[str, str], authorized_app: dict, monkeypatch
) -> None:
    from app.workers.capture_client import WorkerUnavailableError

    def fake_start(*args, **kwargs):
        raise WorkerUnavailableError("worker mati")

    monkeypatch.setattr("app.api.v1.capture.capture_client.start_session", fake_start)

    session = client.post(
        f"/api/v1/projects/{authorized_app['project_id']}/capture-sessions",
        headers=auth_headers,
        json={},
    ).json()

    response = client.post(
        f"/api/v1/capture-sessions/{session['id']}/start", headers=auth_headers
    )
    assert response.status_code == 409
    assert "worker" in response.json()["error"]["message"].lower()


def test_capture_creates_screen_with_elements_and_interactions(
    client: TestClient, auth_headers: dict[str, str], authorized_app: dict, monkeypatch
) -> None:
    def fake_capture(label, full_page, relative_dir):
        return {
            "file_path": str(settings.storage_path / relative_dir / "dashboard.png"),
            "file_name": "dashboard.png",
            "url": "https://contoh.example.com/dashboard",
            "title": "Dashboard Risiko",
            "full_page": full_page,
            "elements": [
                {"type": "button", "label": "Tambah Risiko", "hint": "text:Tambah Risiko", "box": {"x": 10, "y": 20, "w": 120, "h": 32}},
                {"type": "input", "label": "Cari", "hint": "[aria-label=\"Cari\"]", "box": {"x": 200, "y": 20, "w": 180, "h": 32}},
            ],
            "interactions": [
                {"action": "click", "label": "Menu Risiko", "tag": "a"},
                {"action": "input", "label": "Cari", "tag": "input"},
            ],
        }

    monkeypatch.setattr("app.api.v1.capture.capture_client.take_capture", fake_capture)

    session = client.post(
        f"/api/v1/projects/{authorized_app['project_id']}/capture-sessions",
        headers=auth_headers,
        json={},
    ).json()

    captured = client.post(
        f"/api/v1/capture-sessions/{session['id']}/capture",
        headers=auth_headers,
        params={"title": "Dashboard Risiko"},
    )
    assert captured.status_code == 201, captured.text
    screen = captured.json()
    assert screen["title"] == "Dashboard Risiko"
    assert screen["review_status"] == "pending"
    assert screen["source_url"] == "https://contoh.example.com/dashboard"

    elements = client.get(f"/api/v1/screens/{screen['id']}/elements", headers=auth_headers)
    assert elements.status_code == 200
    assert len(elements.json()) == 2
    assert {e["element_type"] for e in elements.json()} == {"button", "input"}

    interactions = client.get(
        f"/api/v1/screens/{screen['id']}/interactions", headers=auth_headers
    )
    assert interactions.status_code == 200
    assert [i["action"] for i in interactions.json()] == ["click", "input"]
    # Nilai input tidak boleh ikut terekam
    assert all("value" not in i for i in interactions.json())


def test_screen_review_and_filters(
    client: TestClient, auth_headers: dict[str, str], authorized_app: dict, monkeypatch
) -> None:
    def fake_capture(label, full_page, relative_dir):
        return {
            "file_path": str(settings.storage_path / relative_dir / "s.png"),
            "url": "https://contoh.example.com/list",
            "title": "Daftar Proyek",
            "full_page": False,
            "elements": [],
            "interactions": [],
        }

    monkeypatch.setattr("app.api.v1.capture.capture_client.take_capture", fake_capture)

    session = client.post(
        f"/api/v1/projects/{authorized_app['project_id']}/capture-sessions",
        headers=auth_headers,
        json={},
    ).json()
    screen = client.post(
        f"/api/v1/capture-sessions/{session['id']}/capture", headers=auth_headers
    ).json()

    listed = client.get(
        f"/api/v1/projects/{authorized_app['project_id']}/screens", headers=auth_headers
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    pending = client.get(
        f"/api/v1/projects/{authorized_app['project_id']}/screens?review_status=pending",
        headers=auth_headers,
    )
    assert pending.json()["total"] == 1

    reviewed = client.post(
        f"/api/v1/screens/{screen['id']}/review",
        headers=auth_headers,
        json={"review_status": "approved", "notes": "Sudah dicek, data sensitif dimasking."},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["review_status"] == "approved"
    assert reviewed.json()["reviewed_by"] is not None

    approved = client.get(
        f"/api/v1/projects/{authorized_app['project_id']}/screens?review_status=approved",
        headers=auth_headers,
    )
    assert approved.json()["total"] == 1

    updated = client.patch(
        f"/api/v1/screens/{screen['id']}",
        headers=auth_headers,
        json={"tags": ["Risiko", "Demo"], "route_label": "/list"},
    )
    assert updated.status_code == 200
    assert updated.json()["tags"] == ["risiko", "demo"]

    by_tag = client.get(
        f"/api/v1/projects/{authorized_app['project_id']}/screens?tag=risiko",
        headers=auth_headers,
    )
    assert by_tag.json()["total"] == 1


def test_masked_screenshot_blacks_out_region(
    client: TestClient, auth_headers: dict[str, str], authorized_app: dict
) -> None:
    """Region ditandai harus tertutup di screenshot yang disajikan."""
    relative = "captures/test-mask/screen.png"
    target = settings.storage_path / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(_png(color=(255, 255, 255), size=(400, 200)))

    session = client.post(
        f"/api/v1/projects/{authorized_app['project_id']}/capture-sessions",
        headers=auth_headers,
        json={},
    ).json()

    with SessionLocal() as db:
        from app.models.capture import Screen, ScreenElement

        screen = Screen(
            project_id=authorized_app["project_id"],
            capture_session_id=session["id"],
            screen_key="uji-mask",
            title="Layar Uji Masking",
            screenshot_path=relative,
            review_status="pending",
            tags=[],
        )
        db.add(screen)
        db.flush()
        db.add(
            ScreenElement(
                screen_id=screen.id,
                element_type="input",
                label="Nama pelanggan",
                bounding_box={"x": 50, "y": 40, "w": 200, "h": 24},
                mask=True,
            )
        )
        db.commit()
        screen_id = screen.id

    masked = client.get(f"/api/v1/screens/{screen_id}/screenshot", headers=auth_headers)
    assert masked.status_code == 200
    assert masked.headers["content-type"] == "image/png"

    image = Image.open(io.BytesIO(masked.content)).convert("RGB")
    assert image.size == (400, 200)
    # Area yang ditandai harus gelap
    assert image.getpixel((100, 50)) == (17, 24, 39)
    # Area lain tetap putih
    assert image.getpixel((380, 180)) == (255, 255, 255)

    raw = client.get(
        f"/api/v1/screens/{screen_id}/screenshot?masked=false", headers=auth_headers
    )
    assert raw.status_code == 200
    raw_image = Image.open(io.BytesIO(raw.content)).convert("RGB")
    assert raw_image.getpixel((100, 50)) == (255, 255, 255)
