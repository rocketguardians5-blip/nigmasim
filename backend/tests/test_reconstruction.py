"""Tes Fase 3 - mesin analisis & rekonstruksi UI."""

from __future__ import annotations

import json
import uuid

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.services.reconstructor import (
    AI_RESULT_MAX_BYTES,
    Analysis,
    store_analysis,
)
from app.models.capture import Screen


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


def _make_screen(
    project_id: int, *, with_structure: bool = True, screen_key: str = "dashboard"
) -> int:
    with SessionLocal() as db:
        from app.models.capture import Screen, ScreenElement

        screen = Screen(
            project_id=project_id,
            screen_key=screen_key,
            title="Dashboard Risiko",
            screenshot_path=f"captures/test/{screen_key}.png",
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
    # generated_by can be "rule-engine" (no AI) or "hybrid" (AI configured and working)
    assert draft["generated_by"] in ("rule-engine", "hybrid", "ai-vision")
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


def test_reanalysis_preserves_manual_hotspots(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Hotspot manual tidak boleh hilang saat analisis ulang (layer terpisah)."""
    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    manual = client.post(
        "/api/v1/reconstructions/component",
        headers=auth_headers,
        params={"screen_id": screen_id},
        json={
            "region": "manual",
            "component_type": "button",
            "label": "Hotspot Manual Uji",
            "props": {"box": {"x": 10, "y": 20, "w": 5, "h": 4}},
            "notes": "Digambar operator",
        },
    )
    assert manual.status_code == 201, manual.text
    assert manual.json()["source"] == "manual"

    again = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert again.status_code == 201
    manuals = [c for c in again.json()["components"] if c["region"] == "manual"]
    assert len(manuals) == 1
    assert manuals[0]["label"] == "Hotspot Manual Uji"
    assert manuals[0]["notes"] == "Digambar operator"
    # Komponen otomatis tetap ada terpisah dari manual
    assert any(c["region"] != "manual" for c in again.json()["components"])


def test_merge_components_dedupes_percent_against_pixel() -> None:
    """Box AI (persen) harus dibandingkan dalam piksel agar duplikat terdeteksi."""
    from app.services.reconstructor import _merge_components

    existing = [
        {
            "region": "main",
            "component_type": "button",
            "label": "Tombol dari AI (lama)",
            "props": {
                "box": {
                    "x": 100 / 1440 * 100,
                    "y": 100 / 900 * 100,
                    "w": 200 / 1440 * 100,
                    "h": 50 / 900 * 100,
                }
            },
            "source": "ai-vision",
        }
    ]
    # Kotak yang sama persis, tapi dikirim AI dalam persen (viewport 1440x900)
    ai_same = {
        "region": "main",
        "component_type": "button",
        "label": "Tombol dari AI",
        "props": {
            "box": {
                "x": 100 / 1440 * 100,
                "y": 100 / 900 * 100,
                "w": 200 / 1440 * 100,
                "h": 50 / 900 * 100,
            }
        },
    }
    ai_new = {
        "region": "main",
        "component_type": "card",
        "label": "Kartu baru",
        "props": {"box": {"x": 50, "y": 50, "w": 10, "h": 10}},
    }

    merged = _merge_components(
        existing, [ai_same, ai_new], {"width": 1440, "height": 900}
    )

    assert len(merged) == 2
    assert merged[0]["source"] == "ai-vision"
    assert merged[1]["label"] == "Kartu baru"
    assert merged[1]["source"] == "ai-vision"


def test_build_sections_ignores_bridging_large_box() -> None:
    """Kartu besar tidak boleh menggabungkan seluruh layar jadi satu section."""
    from app.services.reconstructor import _build_sections

    items = [
        {"type": "heading", "label": "Hero", "box": {"x": 0, "y": 40, "w": 400, "h": 40}},
        {"type": "card", "label": "Kartu besar", "box": {"x": 0, "y": 100, "w": 1440, "h": 500}},
        {"type": "button", "label": "Aksi", "box": {"x": 0, "y": 620, "w": 120, "h": 40}},
    ]

    sections = _build_sections(items, {"width": 1440, "height": 900})

    assert len(sections) >= 2
    assert sum(section["item_count"] for section in sections) == 3


def test_ai_analyze_requires_gemini_key(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    from app.core.config import settings

    monkeypatch.setattr(settings, "gemini_api_key", "")
    response = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}/ai-analyze",
        headers=auth_headers,
        json={"force_refresh": True},
    )
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.text


# ==================== Tes Fallback & Retry Gemini ====================

import httpx
import io
import respx
from PIL import Image
from app.services.reconstructor import analyze_with_ai, Analysis
from app.models.capture import Screen


def _make_test_screenshot(screen_id: int) -> None:
    """Buat dummy screenshot PNG untuk test."""
    from app.core.config import settings
    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        if screen and screen.screenshot_path:
            target = settings.storage_path / screen.screenshot_path
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                buffer = io.BytesIO()
                Image.new("RGB", (400, 200), (255, 255, 255)).save(buffer, format="PNG")
                target.write_bytes(buffer.getvalue())


@respx.mock
@pytest.mark.asyncio
async def test_ai_analyze_success_primary_model(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sukses di model utama tanpa retry."""
    from app.core.config import settings
    from app.db.session import SessionLocal

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_fallback_models", "gemini-3.8-flash")
    monkeypatch.setattr(settings, "gemini_allow_fallback", True)
    monkeypatch.setattr(settings, "gemini_max_retries", 3)
    monkeypatch.setattr(settings, "gemini_retry_base_delay", 0.01)

    # Mock successful response
    mock_response = {
        "candidates": [{
            "content": {
                "parts": [{"text": '{"components": [], "assumptions": []}'}]
            }
        }]
    }
    route = respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent").mock(
        return_value=httpx.Response(200, json=mock_response)
    )

    # Create dummy screenshot file
    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert route.called
    assert analysis.ai_status == "success"
    assert analysis.ai_model == "gemini-3.6-flash"
    assert analysis.source == "hybrid"


@respx.mock
@pytest.mark.asyncio
async def test_ai_analyze_429_then_success_after_retry(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """429 lalu sukses setelah retry."""
    from app.core.config import settings
    from app.db.session import SessionLocal

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_fallback_models", "gemini-3.8-flash")
    monkeypatch.setattr(settings, "gemini_allow_fallback", True)
    monkeypatch.setattr(settings, "gemini_max_retries", 3)
    monkeypatch.setattr(settings, "gemini_retry_base_delay", 0.01)

    # Mock: first call 429, second call success
    mock_success = {
        "candidates": [{
            "content": {
                "parts": [{"text": '{"components": [], "assumptions": []}'}]
            }
        }]
    }
    route = respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent").mock(
        side_effect=[
            httpx.Response(429, json={"error": {"message": "Rate limit exceeded"}}),
            httpx.Response(200, json=mock_success)
        ]
    )

    # Create dummy screenshot file
    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert route.call_count == 2
    assert analysis.ai_status == "success"
    assert analysis.ai_model == "gemini-3.6-flash"
    assert analysis.source == "hybrid"


@respx.mock
@pytest.mark.asyncio
async def test_ai_analyze_503_persistent_error_no_fallback(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """503 terus-menerus -> error eksplisit tanpa fallback (fallback default OFF)."""
    from app.core.config import settings
    from app.db.session import SessionLocal

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_fallback_models", "gemini-2.5-flash")
    monkeypatch.setattr(settings, "gemini_allow_fallback", False)  # Default: OFF
    monkeypatch.setattr(settings, "gemini_max_retries", 2)
    monkeypatch.setattr(settings, "gemini_retry_base_delay", 0.01)

    # Mock: all calls return 503
    route = respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent").mock(
        return_value=httpx.Response(503, json={"error": {"message": "Service unavailable"}})
    )

    # Create dummy screenshot file
    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert route.call_count == 3  # initial + 2 retries
    assert analysis.ai_status == "failed"
    assert "503" in analysis.ai_error
    assert "rate limit" in analysis.ai_error.lower() or "service unavailable" in analysis.ai_error.lower()
    assert "GEMINI_ALLOW_FALLBACK" in analysis.ai_error
    assert analysis.ai_model == "gemini-3.6-flash"
    assert analysis.source == "rule-engine"


@respx.mock
@pytest.mark.asyncio
async def test_ai_analyze_404_no_retry(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """404 -> error tanpa retry. Gunakan model yang diizinkan tapi mock 404 dari API."""
    from app.core.config import settings
    from app.db.session import SessionLocal

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.8-flash")  # Model valid tapi mock 404
    monkeypatch.setattr(settings, "gemini_fallback_models", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_allow_fallback", True)
    monkeypatch.setattr(settings, "gemini_max_retries", 3)
    monkeypatch.setattr(settings, "gemini_retry_base_delay", 0.01)

    # Mock: 404 on first call
    route = respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent").mock(
        return_value=httpx.Response(404, json={"error": {"message": "Model not found"}})
    )

    # Create dummy screenshot file
    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert route.call_count == 1  # No retry on 404
    assert analysis.ai_status == "failed"
    assert "tidak ditemukan" in analysis.ai_error.lower() or "not found" in analysis.ai_error.lower()
    assert "gemini-3.8-flash" in analysis.ai_error
    assert analysis.ai_model == "gemini-3.8-flash"
    assert analysis.source == "rule-engine"


@respx.mock
@pytest.mark.asyncio
async def test_ai_analyze_fallback_works_when_enabled(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fallback aktif hanya bila GEMINI_ALLOW_FALLBACK=true dan GEMINI_FALLBACK_MODELS diisi."""
    from app.core.config import settings
    from app.db.session import SessionLocal

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_fallback_models", "gemini-3.8-flash")  # Hanya model yang diizinkan
    monkeypatch.setattr(settings, "gemini_allow_fallback", True)  # Fallback ENABLED
    monkeypatch.setattr(settings, "gemini_max_retries", 1)
    monkeypatch.setattr(settings, "gemini_retry_base_delay", 0.01)

    # Mock: primary fails with 503, fallback succeeds
    mock_success = {
        "candidates": [{
            "content": {
                "parts": [{"text": '{"components": [], "assumptions": []}'}]
            }
        }]
    }
    respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent").mock(
        return_value=httpx.Response(503, json={"error": {"message": "Service unavailable"}})
    )
    fallback_route = respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent").mock(
        return_value=httpx.Response(200, json=mock_success)
    )

    # Create dummy screenshot file
    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert analysis.ai_status == "success"
    assert analysis.ai_model == "gemini-3.8-flash"
    assert analysis.source == "fallback"  # Ditandai sebagai fallback
    assert fallback_route.called


@respx.mock
@pytest.mark.asyncio
async def test_ai_analyze_fallback_not_used_when_disabled(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fallback TIDAK dipakai jika GEMINI_ALLOW_FALLBACK=false (default)."""
    from app.core.config import settings
    from app.db.session import SessionLocal

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_fallback_models", "gemini-2.5-flash")
    monkeypatch.setattr(settings, "gemini_allow_fallback", False)  # Default: OFF
    monkeypatch.setattr(settings, "gemini_max_retries", 1)
    monkeypatch.setattr(settings, "gemini_retry_base_delay", 0.01)

    # Mock: primary fails, fallback would succeed if called
    mock_success = {
        "candidates": [{
            "content": {
                "parts": [{"text": '{"components": [], "assumptions": []}'}]
            }
        }]
    }
    respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent").mock(
        return_value=httpx.Response(503, json={"error": {"message": "Service unavailable"}})
    )
    fallback_route = respx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent").mock(
        return_value=httpx.Response(200, json=mock_success)
    )

    # Create dummy screenshot file
    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert analysis.ai_status == "failed"
    assert "GEMINI_ALLOW_FALLBACK" in analysis.ai_error
    assert not fallback_route.called  # Fallback tidak boleh dipanggil


# =============================================================================
# TEST: Validasi allowlist model Gemini (hanya gemini-3.8-flash, gemini-3.6-flash)
# =============================================================================

def test_config_rejects_invalid_primary_model_startup() -> None:
    """Startup gagal jika GEMINI_MODEL di luar daftar izin."""
    from app.core.config import Settings

    # Test dengan constructor args langsung (bypass .env)
    with pytest.raises(ValueError, match=r"Model tidak diizinkan: gemini-2\.5-flash\. Pilihan: gemini-3\.8-flash, gemini-3\.6-flash\."):
        Settings(
            gemini_api_key="test-key",
            gemini_model="gemini-2.5-flash",
            gemini_fallback_models="",
            gemini_allow_fallback=False,
        )


def test_config_rejects_invalid_fallback_model_startup() -> None:
    """Startup gagal jika GEMINI_FALLBACK_MODELS mengandung model di luar daftar izin."""
    from app.core.config import Settings

    with pytest.raises(ValueError, match=r"Model cadangan tidak diizinkan: gemini-2\.0-flash\. Pilihan: gemini-3\.8-flash, gemini-3\.6-flash\."):
        Settings(
            gemini_api_key="test-key",
            gemini_model="gemini-3.6-flash",
            gemini_fallback_models="gemini-2.0-flash",
            gemini_allow_fallback=True,
        )


def test_config_rejects_fallback_same_as_primary() -> None:
    """Startup gagal jika model cadangan sama dengan model utama."""
    from app.core.config import Settings

    with pytest.raises(ValueError, match=r"Model cadangan \(gemini-3\.6-flash\) tidak boleh sama dengan model utama"):
        Settings(
            gemini_api_key="test-key",
            gemini_model="gemini-3.6-flash",
            gemini_fallback_models="gemini-3.6-flash",
            gemini_allow_fallback=True,
        )


def test_config_accepts_valid_primary_models() -> None:
    """Kedua model yang diizinkan diterima sebagai model utama."""
    from app.core.config import Settings

    for model in ("gemini-3.8-flash", "gemini-3.6-flash"):
        s = Settings(
            gemini_api_key="test-key",
            gemini_model=model,
            gemini_fallback_models="",
            gemini_allow_fallback=False,
        )
        assert s.gemini_model == model


def test_config_accepts_valid_fallback_model() -> None:
    """Model cadangan valid dan berbeda dari utama diterima."""
    from app.core.config import Settings

    s = Settings(
        gemini_api_key="test-key",
        gemini_model="gemini-3.6-flash",
        gemini_fallback_models="gemini-3.8-flash",
        gemini_allow_fallback=True,
    )
    assert s.gemini_fallback_models == "gemini-3.8-flash"
    assert s.gemini_model_chain == ["gemini-3.6-flash", "gemini-3.8-flash"]


@respx.mock
@pytest.mark.asyncio
async def test_analyze_with_ai_rejects_invalid_primary_model_runtime(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Runtime validation: model utama di luar daftar ditolak sebelum call API."""
    from app.db.session import SessionLocal
    from app.services import reconstructor
    from app.services.reconstructor import analyze_with_ai, Analysis

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    # Patch settings di module reconstructor (bukan config) untuk bypass startup validation
    monkeypatch.setattr(reconstructor.settings, "gemini_model", "gemini-2.5-flash")
    monkeypatch.setattr(reconstructor.settings, "gemini_fallback_models", "")
    monkeypatch.setattr(reconstructor.settings, "gemini_allow_fallback", False)
    monkeypatch.setattr(reconstructor.settings, "gemini_max_retries", 0)

    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert analysis.ai_status == "failed"
    assert "Model tidak diizinkan (runtime): gemini-2.5-flash" in analysis.ai_error
    assert analysis.ai_model == "gemini-2.5-flash"
    assert analysis.source == "rule-engine"


@respx.mock
@pytest.mark.asyncio
async def test_analyze_with_ai_rejects_invalid_fallback_model_runtime(
    client: TestClient, auth_headers: dict[str, str], project_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Runtime validation: model cadangan di luar daftar ditolak sebelum call API."""
    from app.db.session import SessionLocal
    from app.services import reconstructor
    from app.services.reconstructor import analyze_with_ai, Analysis

    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    # Primary valid, fallback invalid
    monkeypatch.setattr(reconstructor.settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(reconstructor.settings, "gemini_fallback_models", "gemini-2.5-flash")
    monkeypatch.setattr(reconstructor.settings, "gemini_allow_fallback", True)
    monkeypatch.setattr(reconstructor.settings, "gemini_max_retries", 0)

    _make_test_screenshot(screen_id)

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        analysis = await analyze_with_ai(screen, Analysis())

    assert analysis.ai_status == "failed"
    assert "Model cadangan tidak diizinkan (runtime): gemini-2.5-flash" in analysis.ai_error
    assert analysis.ai_model == "gemini-3.6-flash"
    assert analysis.source == "rule-engine"


def test_sidebar_detection_ignores_form_fields(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Elemen input di x=320 (< 25% vw) tidak boleh dihitung sebagai item sidebar."""
    screen_id = _make_screen(project_id)

    response = client.post(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 201
    draft = response.json()

    assert draft["layout"]["has_sidebar"] is True
    # 4 link di x=20 terhitung, 1 input di x=320 diabaikan
    assert draft["layout"]["regions"]["sidebar"]["item_count"] == 4


# ==================== Tes Usability Check ====================

from app.models.reconstruction import Reconstruction, ReconstructionComponent
from app.services.simulation_generator import (
    USABILITY_WARNING,
    check_reconstruction_usability,
)


def _usability_draft(
    components: list[tuple[str, str, str]],
    *,
    sections: list[dict] | None = None,
    tombstones: list[str] | None = None,
) -> Reconstruction:
    """Bangun draf in-memory: (source, component_type, label)."""
    draft = Reconstruction(
        screen_id=1,
        project_id=1,
        status="draft",
        generated_by="rule-engine",
        layout={
            "sections": sections or [],
            "tombstones": tombstones or [],
            "overrides": {},
        },
    )
    draft.components = [
        ReconstructionComponent(
            id=index,
            reconstruction_id=1,
            region="main",
            component_type=component_type,
            label=label,
            props={},
            source=source,
        )
        for index, (source, component_type, label) in enumerate(components, start=1)
    ]
    return draft


def test_usability_check_rule_engine_only_draft_returns_zero() -> None:
    """Draf rule-engine saja (source='detected') tidak bisa dipakai generator."""
    draft = _usability_draft(
        [
            ("detected", "heading", "Dashboard Risiko"),
            ("detected", "table", "Risiko Terakhir"),
            ("detected", "card", "Risiko Tinggi"),
        ]
    )

    result = check_reconstruction_usability(draft)

    assert result["usable_count"] == 0
    assert result["valid_components"] == 0
    assert result["warning"] == USABILITY_WARNING
    assert "belum ada komponen hasil AI Vision" in result["warning"]


def test_usability_check_with_ai_vision_components_returns_positive() -> None:
    """Komponen AI Vision yang lolos filter dihitung sebagai elemen usable."""
    draft = _usability_draft(
        [
            ("detected", "heading", "Dashboard Risiko"),
            ("ai-vision", "button", "Tombol Simpan"),
            ("ai-vision", "table", "Risiko Terakhir"),
        ]
    )

    result = check_reconstruction_usability(draft)

    assert result["usable_count"] == 2
    assert result["valid_components"] == 2
    assert result["warning"] is None


def test_usability_check_manual_components_counted() -> None:
    """Komponen hasil koreksi manual (source='manual') juga dihitung usable."""
    draft = _usability_draft(
        [
            ("detected", "heading", "Dashboard Risiko"),
            ("manual", "button", "Tombol Manual"),
        ]
    )

    result = check_reconstruction_usability(draft)

    assert result["usable_count"] == 1
    assert result["valid_components"] == 1
    assert result["warning"] is None


def test_usability_check_tombstoned_components_excluded() -> None:
    """Komponen ai-vision/manual yang di-tombstone tidak dihitung."""
    draft = _usability_draft(
        [("ai-vision", "button", "Tombol Dihapus")],
        tombstones=["1"],
    )

    result = check_reconstruction_usability(draft)

    assert result["valid_components"] == 0
    assert result["usable_count"] == 0
    assert result["warning"] == USABILITY_WARNING


def test_usability_check_ignores_components_generator_cannot_use() -> None:
    """Label kosong/generik dan duplikat dibuang sama seperti _collect_elements()."""
    draft = _usability_draft(
        [
            ("ai-vision", "button", ""),
            ("ai-vision", "container", "container"),
            ("ai-vision", "button", "Tombol Simpan"),
            ("ai-vision", "button", "Tombol Simpan"),
        ]
    )

    result = check_reconstruction_usability(draft)

    assert result["usable_count"] == 1
    assert result["warning"] is None


def test_usability_check_endpoint_exposes_result(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Endpoint GET /usability mengembalikan hasil pemeriksaan yang sama."""
    screen_id = _make_screen(project_id)
    with SessionLocal() as db:
        draft = Reconstruction(
            screen_id=screen_id,
            project_id=project_id,
            status="draft",
            generated_by="rule-engine",
            layout={"sections": [], "tombstones": [], "overrides": {}},
        )
        db.add(draft)
        db.flush()
        db.add(
            ReconstructionComponent(
                reconstruction_id=draft.id,
                region="main",
                component_type="button",
                label="Tombol Deteksi",
                props={},
                source="detected",
            )
        )
        db.commit()

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}/usability", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["usable_count"] == 0
    assert result["warning"] == USABILITY_WARNING


# ==================== Penyimpanan Hasil AI Vision ====================


def _store_analysis_result(
    screen_id: int,
    result: dict | None,
    *,
    status: str = "success",
    source: str = "hybrid",
    ai_error: str | None = None,
    component_props: dict | None = None,
    layout_extra: dict | None = None,
    analysis_components: list[dict] | None = None,
) -> None:
    """Simpan analisis melalui jalur service yang sama dengan endpoint."""
    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        assert screen is not None
        analysis = Analysis(
            layout={
                "viewport": {"width": 1440, "height": 900},
                "regions": {
                    "sidebar": None,
                    "header": None,
                    "main": {"x": 0, "y": 0, "w": 1440, "h": 900},
                },
                "sections": [],
                **(layout_extra or {}),
            },
            components=(
                analysis_components
                if analysis_components is not None
                else [
                    {
                        "region": "main",
                        "component_type": "button",
                        "label": "Tombol Simpan",
                        "props": component_props
                        or {"box": {"x": 10, "y": 20, "w": 5, "h": 4}},
                        "source": "ai-vision",
                    }
                ]
            ),
            assumptions=[],
            ai_model="gemini-3.6-flash",
            ai_status=status,
            ai_error=(
                ai_error
                if ai_error is not None
                else ("" if status == "success" else "Analisis AI gagal")
            ),
            ai_result=result,
            ai_analyzed_at="2026-11-23T10:00:00+00:00",
            source=source,
        )
        store_analysis(
            db,
            screen,
            analysis,
            "// draf rekonstruksi",
            actor_id=None,
        )
        db.commit()


def test_ai_result_is_persisted_and_returned_by_get(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """GET mengembalikan objek ai_result persis beserta metadata analisisnya."""
    screen_id = _make_screen(project_id)
    ai_result = {
        "components": [
            {
                "region": "main",
                "component_type": "button",
                "label": "Tombol Simpan",
                "confidence": 0.92,
                "props": {"box": {"x": 10, "y": 20, "w": 5, "h": 4}},
                "source": "ai-vision",
            }
        ],
        "assumptions": [
            {
                "topic": "Komponen",
                "description": "Tombol utama terlihat jelas",
                "confidence": "high",
            }
        ],
        "layout": {
            "regions": {
                "sidebar": None,
                "header": None,
                "main": {"x": 0, "y": 0, "w": 100, "h": 100},
            },
            "has_sidebar": False,
            "has_header": False,
        },
    }
    _store_analysis_result(screen_id, ai_result)

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    draft = response.json()
    layout = draft["layout"]

    assert layout["ai_result"] == ai_result
    assert layout["ai_status"] == "success"
    assert layout["ai_model"] == "gemini-3.6-flash"
    assert layout["ai_analyzed_at"] == "2026-11-23T10:00:00+00:00"
    assert layout["ai_source"] == "hybrid"
    assert layout["ai_result_truncated"] is False
    assert layout["ai_result_size_bytes"] == len(
        json.dumps(ai_result, ensure_ascii=True).encode("utf-8")
    )
    assert draft["generated_by"] == "hybrid"


def test_ai_result_over_limit_is_truncated_without_mutating_source(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Payload >200 KB dipangkas menjadi JSON valid dan ditandai truncated."""
    screen_id = _make_screen(project_id)
    ai_result = {
        "components": [
            {
                "region": "main",
                "component_type": "button",
                "label": f"Komponen besar {index}-{'x' * 50_000}",
                "props": {"box": {"x": index, "y": index, "w": 5, "h": 4}},
                "source": "ai-vision",
            }
            for index in range(5)
        ],
        "assumptions": [],
        "layout": {"has_sidebar": False, "has_header": False},
    }
    original_labels = [
        component["label"] for component in ai_result["components"]
    ]

    _store_analysis_result(screen_id, ai_result)

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()["layout"]
    stored = layout["ai_result"]

    assert isinstance(stored, dict)
    assert layout["ai_result_truncated"] is True
    assert len(stored["components"]) < len(ai_result["components"])
    assert len(stored["components"]) > 0
    stored_size = len(json.dumps(stored, ensure_ascii=True).encode("utf-8"))
    assert stored_size <= AI_RESULT_MAX_BYTES
    assert layout["ai_result_size_bytes"] == stored_size

    # Objek sumber tidak boleh ikut terpangkas saat storage.
    assert [component["label"] for component in ai_result["components"]] == original_labels


def test_ai_result_truncation_keeps_components_when_other_sections_are_oversized(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Asumsi/section besar tidak boleh membuat komponen review hilang."""
    screen_id = _make_screen(project_id)
    ai_result = {
        "components": [
            {
                "region": "main",
                "component_type": "button",
                "label": "Tombol Simpan",
                "props": {"box": {"x": 10, "y": 20, "w": 5, "h": 4}},
                "source": "ai-vision",
            }
        ],
        "assumptions": [
            {
                "topic": "Layout",
                "description": "x" * (AI_RESULT_MAX_BYTES + 10_000),
                "confidence": "low",
            }
        ],
        "layout": {
            "has_sidebar": False,
            "has_header": False,
            "sections": [
                {
                    "label": "Section besar",
                    "items": [
                        {"type": "text", "label": "y" * (AI_RESULT_MAX_BYTES + 10_000)}
                    ],
                }
            ],
        },
    }

    _store_analysis_result(screen_id, ai_result)

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()["layout"]
    stored = layout["ai_result"]

    assert layout["ai_result_truncated"] is True
    assert len(stored["components"]) == 1
    assert stored["components"][0]["label"] == "Tombol Simpan"
    assert len(json.dumps(stored, ensure_ascii=True).encode("utf-8")) <= AI_RESULT_MAX_BYTES
    assert layout["ai_result_size_bytes"] == len(
        json.dumps(stored, ensure_ascii=True).encode("utf-8")
    )


def test_ai_result_size_accounts_for_sqlite_ascii_json_serialization(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Unicode yang di-escape SQLite tidak boleh membuat payload melewati batas."""
    screen_id = _make_screen(project_id)
    ai_result = {
        "components": [],
        "assumptions": [],
        "layout": {"description": "é" * 100_000},
    }
    assert len(json.dumps(ai_result, ensure_ascii=True).encode("utf-8")) > AI_RESULT_MAX_BYTES

    _store_analysis_result(screen_id, ai_result)

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()["layout"]
    stored = layout["ai_result"]
    stored_size = len(json.dumps(stored, ensure_ascii=True).encode("utf-8"))

    assert layout["ai_result_truncated"] is True
    assert stored_size <= AI_RESULT_MAX_BYTES
    assert layout["ai_result_size_bytes"] == stored_size


def test_failed_ai_result_clears_previous_stored_result(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Kegagalan baru tidak boleh menyisakan hasil AI lama yang menyesatkan."""
    screen_id = _make_screen(project_id)
    _store_analysis_result(
        screen_id,
        {"components": [], "assumptions": [], "layout": {}},
    )
    _store_analysis_result(
        screen_id,
        None,
        status="failed",
        source="rule-engine",
    )

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    draft = response.json()
    layout = draft["layout"]

    assert layout["ai_status"] == "failed"
    assert "ai_result" not in layout
    assert "ai_result_truncated" not in layout
    assert "ai_result_size_bytes" not in layout
    assert layout["ai_source"] == "rule-engine"
    assert draft["generated_by"] == "rule-engine"


@respx.mock
@pytest.mark.asyncio
async def test_ai_result_storage_excludes_request_credentials_and_screenshot(
    client: TestClient,
    auth_headers: dict[str, str],
    project_id: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Header API, payload request, dan base64 screenshot tidak ikut disimpan."""
    from app.core.config import settings

    screen_id = _make_screen(project_id)
    secret = "secret-storage-key-must-not-persist"
    monkeypatch.setattr(settings, "gemini_api_key", secret)
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_fallback_models", "")
    monkeypatch.setattr(settings, "gemini_allow_fallback", False)
    monkeypatch.setattr(settings, "gemini_max_retries", 0)
    _make_test_screenshot(screen_id)

    mock_response = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "components": [],
                                    "assumptions": [],
                                    "layout": {"has_sidebar": False},
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    route = respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
    ).mock(return_value=httpx.Response(200, json=mock_response))

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        assert screen is not None
        analysis = await analyze_with_ai(screen, Analysis())
        store_analysis(
            db,
            screen,
            analysis,
            "// draf rekonstruksi",
            actor_id=None,
        )
        db.commit()

    assert route.called
    assert route.calls[0].request.headers.get("x-goog-api-key") == secret

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()["layout"]
    serialized = json.dumps(layout, ensure_ascii=False)

    assert secret not in serialized
    assert "x-goog-api-key" not in serialized
    assert "inlineData" not in serialized
    assert "base64" not in serialized.lower()
    assert layout["ai_result"] == {
        "components": [],
        "assumptions": [],
        "layout": {"has_sidebar": False},
    }


@respx.mock
@pytest.mark.asyncio
async def test_ai_result_truncated_flag_survives_analyze_then_store(
    client: TestClient,
    auth_headers: dict[str, str],
    project_id: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Flag truncation dari analyze_with_ai tidak hilang saat storage."""
    from app.core.config import settings

    screen_id = _make_screen(project_id)
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.6-flash")
    monkeypatch.setattr(settings, "gemini_fallback_models", "")
    monkeypatch.setattr(settings, "gemini_allow_fallback", False)
    monkeypatch.setattr(settings, "gemini_max_retries", 0)
    _make_test_screenshot(screen_id)

    mock_response = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "components": [
                                        {
                                            "region": "main",
                                            "component_type": "button",
                                            "label": "Tombol Simpan",
                                            "padding": "x" * (AI_RESULT_MAX_BYTES + 10_000),
                                            "props": {
                                                "box": {"x": 10, "y": 20, "w": 5, "h": 4}
                                            },
                                            "source": "ai-vision",
                                        }
                                    ],
                                    "assumptions": [],
                                    "layout": {"has_sidebar": False},
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
    ).mock(return_value=httpx.Response(200, json=mock_response))

    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        assert screen is not None
        analysis = await analyze_with_ai(screen, Analysis())
        assert analysis.ai_result_truncated is True
        store_analysis(
            db,
            screen,
            analysis,
            "// draf rekonstruksi",
            actor_id=None,
        )
        db.commit()

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()["layout"]

    assert layout["ai_result_truncated"] is True
    assert layout["ai_result_size_bytes"] <= AI_RESULT_MAX_BYTES
    assert len(json.dumps(layout["ai_result"], ensure_ascii=True).encode("utf-8")) <= AI_RESULT_MAX_BYTES


def test_ai_result_allowlist_and_dlp_excludes_sensitive_output_fields(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Field request/credential/binary pada output Gemini tidak ikut tersimpan."""
    screen_id = _make_screen(project_id)
    secret = "secret-output-key-must-not-persist"
    binary = "data:image/png;base64,QUJDREVGRw=="
    ai_result = {
        "components": [
            {
                "region": "main",
                "component_type": "button",
                "label": "Tombol Simpan",
                "confidence": 0.91,
                "props": {
                    "box": {"x": 10, "y": 20, "w": 5, "h": 4},
                    "authorization": f"Bearer {secret}",
                    "nested": {"api_key": secret, "x_api_key": secret},
                    "headers": [{"name": "X-Custom", "value": secret}],
                    "http_headers": {"X-Custom": secret},
                    "response_headers": {"X-Custom": secret},
                    "inlineData": {"mimeType": "image/png", "data": binary},
                },
                "source": "ai-vision",
            },
            {
                "region": "main",
                "component_type": "table",
                "label": "Tabel Risiko",
                "props": {
                    "box": {"x": 20, "y": 30, "w": 50, "h": 20},
                    "headers": ["ID Risiko", "Judul"],
                },
                "source": "ai-vision",
            }
        ],
        "assumptions": [
            {
                "topic": "Komponen",
                "description": "Tombol utama terlihat jelas",
                "confidence": "high",
            }
        ],
        "layout": {
            "has_sidebar": False,
            "has_header": False,
            "http_headers": {"X-Custom": secret},
        },
        "request_payload": {
            "headers": {"x-goog-api-key": secret},
            "inlineData": {"data": binary},
        },
        "headers": {"x-goog-api-key": secret},
        "screenshot": binary,
    }

    _store_analysis_result(
        screen_id,
        ai_result,
        component_props={
            "box": {"x": 10, "y": 20, "w": 5, "h": 4},
            "authorization": f"Bearer {secret}",
        },
        layout_extra={
            "debug": f"Bearer {secret}",
        },
    )

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    draft = response.json()
    layout = draft["layout"]
    stored = layout["ai_result"]
    serialized = json.dumps(draft, ensure_ascii=False)

    assert set(stored) == {"components", "assumptions", "layout"}
    assert "request_payload" not in stored
    assert "headers" not in stored
    assert "screenshot" not in stored
    assert secret not in serialized
    assert binary not in serialized
    assert "base64" not in serialized.lower()

    props = stored["components"][0]["props"]
    assert props["authorization"] == "[DISEMASKAN]"
    assert props["nested"]["api_key"] == "[DISEMASKAN]"
    assert props["nested"]["x_api_key"] == "[DISEMASKAN]"
    assert "headers" not in props
    assert "http_headers" not in props
    assert "response_headers" not in props
    assert "inlineData" not in props
    assert stored["components"][1]["props"]["headers"] == ["ID Risiko", "Judul"]
    assert "http_headers" not in stored["layout"]
    assert layout["debug"] == "Bearer [DISEMASKAN]"

    # Komponen draf memakai jalur penyimpanan yang sama dan tidak boleh
    # menyimpan credential yang diteruskan melalui props.
    assert draft["components"][0]["props"]["authorization"] == "[DISEMASKAN]"


def test_ai_result_malformed_collections_are_normalized(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Bentuk list/dict yang salah dinormalisasi agar panel tetap aman dirender."""
    screen_id = _make_screen(project_id)
    _store_analysis_result(
        screen_id,
        {
            "components": {"bukan-list": True},
            "assumptions": "bukan-list",
            "layout": ["bukan-dict"],
        },
    )

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    stored = response.json()["layout"]["ai_result"]

    assert stored["components"] == []
    assert stored["assumptions"] == []
    assert stored["layout"] == {}


def test_malformed_component_types_are_not_promoted_to_buttons(
    client: TestClient, auth_headers: dict[str, str], project_id: int
) -> None:
    """Tipe kosong/tidak ada tidak boleh berubah menjadi komponen generator action."""
    screen_id = _make_screen(project_id)
    _store_analysis_result(
        screen_id,
        {
            "components": [
                {"component_type": "", "label": "Tipe kosong"},
                {"label": "Tipe hilang"},
                {"component_type": "unsupported", "label": "Tipe tidak didukung"},
            ],
            "assumptions": [],
            "layout": {},
        },
        analysis_components=[
            {
                "region": "main",
                "component_type": "",
                "label": "Tipe kosong",
                "props": {"box": {"x": 1, "y": 1, "w": 1, "h": 1}},
                "source": "ai-vision",
            },
            {
                "region": "main",
                "label": "Tipe hilang",
                "props": {"box": {"x": 2, "y": 2, "w": 1, "h": 1}},
                "source": "ai-vision",
            },
            {
                "region": "main",
                "component_type": "unsupported",
                "label": "Tipe tidak didukung",
                "props": {"box": {"x": 3, "y": 3, "w": 1, "h": 1}},
                "source": "ai-vision",
            },
        ],
    )

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    components = response.json()["components"]

    assert [component["component_type"] for component in components] == ["unsupported"]
    assert all(component["component_type"] != "button" for component in components)


def test_ai_error_redacts_configured_api_key(
    client: TestClient,
    auth_headers: dict[str, str],
    project_id: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API key yang ikut muncul pada pesan error tidak disimpan ke metadata."""
    from app.core.config import settings

    screen_id = _make_screen(project_id)
    secret = "secret-error-key-must-not-persist"
    monkeypatch.setattr(settings, "gemini_api_key", secret)

    _store_analysis_result(
        screen_id,
        None,
        status="failed",
        source="rule-engine",
        ai_error=f"Gemini gagal memakai credential {secret}",
    )

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()["layout"]
    serialized = json.dumps(layout, ensure_ascii=False)

    assert secret not in serialized
    assert "[DISEMASKAN]" in layout["ai_error"]


def test_store_analysis_preserves_header_region(
    client: TestClient,
    auth_headers: dict[str, str],
    project_id: int,
) -> None:
    """Region header (baik berupa box maupun None) pada layout draf tidak boleh hilang."""
    screen_id = _make_screen(project_id)

    # 1. Kasus region header berupa box (sidebar, header, main)
    header_box = {"x": 200, "y": 0, "w": 1240, "h": 60}
    sidebar_box = {"x": 0, "y": 0, "w": 200, "h": 900}
    main_box = {"x": 200, "y": 60, "w": 1240, "h": 840}
    _store_analysis_result(
        screen_id,
        None,
        layout_extra={
            "regions": {
                "sidebar": sidebar_box,
                "header": header_box,
                "main": main_box,
            }
        },
    )

    response = client.get(
        f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()["layout"]
    assert "regions" in layout
    assert "header" in layout["regions"], "Region 'header' hilang setelah disimpan!"
    assert layout["regions"]["header"] == header_box
    assert layout["regions"]["sidebar"] == sidebar_box
    assert layout["regions"]["main"] == main_box

    # 2. Kasus region header bernilai None tetap tersimpan sebagai None
    screen_id_none = _make_screen(project_id, screen_key="dashboard-none")
    _store_analysis_result(
        screen_id_none,
        None,
        layout_extra={
            "regions": {
                "sidebar": sidebar_box,
                "header": None,
                "main": main_box,
            }
        },
    )

    response_none = client.get(
        f"/api/v1/reconstructions/screen/{screen_id_none}", headers=auth_headers
    )
    assert response_none.status_code == 200, response_none.text
    layout_none = response_none.json()["layout"]
    assert "regions" in layout_none
    assert "header" in layout_none["regions"], "Region 'header' (None) hilang setelah disimpan!"
    assert layout_none["regions"]["header"] is None


