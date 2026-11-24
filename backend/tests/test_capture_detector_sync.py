"""Regression test: Pastikan detector.py murni sinkron dan tidak mengembalikan coroutine.

Sebelumnya terjadi bug:
TypeError: 'coroutine' object is not iterable
karena detect_interactive_elements dideklarasikan 'async def' dan memakai 'await page.evaluate'
di dalam Playwright Synchronous API.
"""

from __future__ import annotations

import inspect
import sys
from pathlib import Path

# Tambahkan capture-worker/src ke sys.path
WORKER_SRC = Path(__file__).resolve().parent.parent.parent / "capture-worker" / "src"
if str(WORKER_SRC) not in sys.path:
    sys.path.insert(0, str(WORKER_SRC))

import detector
from detector import DetectedElement, DetectorConfig, detect_interactive_elements


class MockPage:
    """Mock page object yang mensimulasikan page.evaluate Playwright secara sinkron."""

    def __init__(self, dom_items=None, hover_items=None):
        self.dom_items = dom_items if dom_items is not None else [
            {
                "id": "btn_1",
                "type": "button",
                "source": "dom",
                "x": 10.0,
                "y": 20.0,
                "width": 15.0,
                "height": 10.0,
                "confidence": 1.0,
                "viewport_width": 1440,
                "viewport_height": 900,
            }
        ]
        self.hover_items = hover_items if hover_items is not None else []
        self.evaluate_calls = []

    def evaluate(self, script, args=None):
        self.evaluate_calls.append(args)
        # Jika dipanggil untuk DOM_DETECTION_SCRIPT
        if args and "excludeSelectors" in args:
            return list(self.dom_items)
        # Jika dipanggil untuk HOVER_DETECTION_SCRIPT
        if args and "hoverWaitMs" in args:
            return list(self.hover_items)
        return []


def test_detect_interactive_elements_is_not_coroutine():
    """Fungsi detect_interactive_elements harus sinkron (def biasa, bukan async def)."""
    assert not inspect.iscoroutinefunction(detect_interactive_elements), (
        "detect_interactive_elements tidak boleh dideklarasikan async def!"
    )
    assert not inspect.isasyncgenfunction(detect_interactive_elements), (
        "detect_interactive_elements tidak boleh berupa async generator!"
    )


def test_detect_interactive_elements_returns_list_not_coroutine():
    """Pemanggilan detect_interactive_elements harus mengembalikan list dan langsung iterable."""
    mock_page = MockPage()
    config = DetectorConfig(include_hover=True)

    result = detect_interactive_elements(mock_page, config)

    # Pastikan bukan coroutine
    assert not inspect.iscoroutine(result), (
        "Hasil detect_interactive_elements mengembalikan coroutine! Harus list."
    )
    assert isinstance(result, list), f"Hasil harus berupa list, didapat: {type(result)}"

    # Pastikan langsung bisa diiterasi tanpa crash 'coroutine object is not iterable'
    elements_iterated = []
    for elem in result:
        assert isinstance(elem, DetectedElement)
        elements_iterated.append(elem)

    assert len(elements_iterated) == 1
    assert elements_iterated[0].type == "button"
    assert elements_iterated[0].x == 10.0
    assert elements_iterated[0].y == 20.0


def test_detector_with_hover_synchronous():
    """Uji deteksi hover juga berjalan murni sinkron."""
    hover_item = {
        "id": "menu_hover_1",
        "type": "menuitem",
        "source": "hover",
        "x": 30.0,
        "y": 40.0,
        "width": 20.0,
        "height": 12.0,
        "confidence": 0.95,
        "viewport_width": 1440,
        "viewport_height": 900,
    }
    mock_page = MockPage(hover_items=[hover_item])
    config = DetectorConfig(include_hover=True)

    result = detect_interactive_elements(mock_page, config)
    assert isinstance(result, list)
    types = [e.type for e in result]
    assert "button" in types
    assert "menuitem" in types


def test_no_async_functions_in_detector_module():
    """Pastikan tidak ada fungsi async tersisa di modul detector."""
    async_funcs = []
    for name, obj in inspect.getmembers(detector):
        if inspect.isfunction(obj) and inspect.iscoroutinefunction(obj):
            async_funcs.append(name)
    assert len(async_funcs) == 0, f"Ditemukan fungsi async di detector.py: {async_funcs}"


def test_record_capture_redacts_visual_structure():
    """record_capture harus meredaksi email, token, dan data sensitif pada structure['visual']."""
    from app.db.session import SessionLocal
    from app.models.capture import CaptureSession, Screen
    from app.models.registry import Application, Project
    from app.services.capture import record_capture

    with SessionLocal() as db:
        app = Application(
            name="App Test Visual",
            source_url="http://example.com",
            authorization_status="approved",
        )
        db.add(app)
        db.flush()

        project = Project(
            application_id=app.id,
            name="Project Test Visual",
        )
        db.add(project)
        db.flush()
        session = CaptureSession(
            project_id=project.id,
            operator_id=1,
            status="active",
            viewport_width=1440,
            viewport_height=900,
        )
        db.add(session)
        db.flush()

        meta = {
            "file_path": "captures/test_screen.png",
            "url": "http://example.com/login",
            "title": "Halaman Login",
            "full_page": False,
            "elements": [],
            "mask_boxes": [{"x": 100, "y": 100, "w": 200, "h": 50}],
            "structure": {
                "tables": [],
                "visual": {
                    "viewport": {"w": 1440, "h": 900},
                    "page": {"backgroundColor": "rgb(240, 240, 240)"},
                    "nodes": [
                        {
                            "id": "n1",
                            "tag": "p",
                            "box": {"x": 10, "y": 10, "w": 100, "h": 20},
                            "text": "Hubungi admin@perusahaan.com atau 081234567890",
                            "placeholder": "Contoh: user@secret.com",
                            "icon": {"img": {"src": "/logo.png?token=secret123&session=abc", "alt": "Logo"}},
                        },
                        {
                            "id": "n2",
                            "tag": "div",
                            "box": {"x": 10, "y": 40, "w": 200, "h": 20},
                            "text": "Bearer eyJhbGciOiJIUzI1NiJ9.secret.token AIzaSyD1234567890abcdefghijklmnopqrstuvwxyz",
                            "placeholder": None,
                        },
                        {
                            "id": "n3",
                            "tag": "span",
                            "box": {"x": 120, "y": 110, "w": 50, "h": 20},
                            "text": "Data KTP Rahasia 12345678",
                            "placeholder": "KTP",
                            "icon": {"svg": "<svg>rahasia</svg>"},
                        },
                    ],
                },
            },
        }

        screen = record_capture(db, session, project, meta)
        db.commit()

        stored_screen = db.get(Screen, screen.id)
        assert stored_screen is not None
        assert stored_screen.structure is not None
        visual = stored_screen.structure.get("visual")
        assert visual is not None

        nodes = visual["nodes"]
        n1 = next(n for n in nodes if n["id"] == "n1")
        assert "admin@perusahaan.com" not in n1["text"]
        assert "[EMAIL DISEMASKAN]" in n1["text"]
        assert "081234567890" not in n1["text"]
        assert "[TELEPON DISEMASKAN]" in n1["text"]
        assert "user@secret.com" not in n1["placeholder"]
        assert "[EMAIL DISEMASKAN]" in n1["placeholder"]
        assert n1["icon"]["img"]["src"] == "/logo.png"

        n2 = next(n for n in nodes if n["id"] == "n2")
        assert "Bearer [DISEMASKAN]" in n2["text"]
        assert "[API KEY DISEMASKAN]" in n2["text"]

        n3 = next(n for n in nodes if n["id"] == "n3")
        assert n3["text"] is None
        assert n3["placeholder"] is None
        assert n3["icon"] is None

