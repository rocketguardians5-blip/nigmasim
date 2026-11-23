"""Tes Fase 3 - mesin analisis & rekonstruksi UI."""

from __future__ import annotations

import uuid

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.services.reconstructor import Analysis
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

