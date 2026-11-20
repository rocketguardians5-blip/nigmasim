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
