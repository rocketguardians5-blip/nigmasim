"""Unit test untuk simulation_generator.py (H4.2).

Memverifikasi pemetaan:
1. layout["theme"] -> page.theme
2. props.dom.style -> field.style / section.style (allowlist CSS aman)
3. DOM placeholder -> field.placeholder
4. DOM icon -> field.iconSvg (SVG aman)
5. Login page: judul/subjudul DOM, password toggleVisibility: true, linkRight "Lupa Password?", tanpa "Aksi lain"
6. Backward compatibility untuk layar lama tanpa theme/dom.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock

from app.models.capture import Screen
from app.models.reconstruction import Reconstruction, ReconstructionComponent
from app.services.simulation_generator import (
    _build_definition,
    _build_field,
    _build_page,
    _extract_safe_icon_svg,
    _extract_safe_style,
    _ts_data_file,
)


def _make_mock_screen(
    screen_id: int = 1,
    title: str = "Masuk ke Portal - API Nigma",
    visual: dict[str, Any] | None = None,
) -> Screen:
    screen = Screen(
        id=screen_id,
        project_id=1,
        screen_key="login-screen",
        title=title,
        route_label="/login",
        source_url="http://127.0.0.1:8099/login",
        structure={"visual": visual} if visual else {},
    )
    return screen


def _make_mock_reconstruction(
    components: list[dict[str, Any]],
    theme: dict[str, Any] | None = None,
    assumptions: list[str] | None = None,
) -> Reconstruction:
    recon = Reconstruction(
        id=101,
        screen_id=1,
        status="approved",
        layout={"theme": theme} if theme else {},
        components=[],
        assumptions=[],
    )
    comp_models = []
    for idx, c in enumerate(components):
        comp = ReconstructionComponent(
            id=1000 + idx,
            reconstruction_id=recon.id,
            component_type=c.get("type", "input"),
            label=c.get("label", ""),
            region=c.get("region", "main"),
            source=c.get("source", "ai-vision"),
            order_index=idx,
            props=c.get("props", {}),
        )
        comp_models.append(comp)
    recon.components = comp_models
    return recon


def test_safe_style_allowlist_and_sanitization():
    # Style aman diterima
    good = {
        "backgroundColor": "rgb(17, 24, 39)",
        "color": "#ffffff",
        "borderRadius": "12px",
        "fontSize": "14px",
        "borderColor": "rgb(231, 229, 228)",
        "borderWidth": "1px",
    }
    extracted = _extract_safe_style(good)
    assert extracted == good

    # Style berbahaya atau tidak dikenal dibuang
    bad = {
        "backgroundColor": "javascript:alert(1)",
        "color": "expression(doHarm())",
        "position": "absolute",
        "zIndex": 99999,
        "cursor": "pointer",
    }
    extracted_bad = _extract_safe_style(bad)
    assert extracted_bad is None

    # Input bukan dict
    assert _extract_safe_style(None) is None
    assert _extract_safe_style("invalid") is None


def test_safe_icon_svg_sanitization():
    valid_svg = (
        '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">'
        '<path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>'
        '</svg>'
    )
    assert _extract_safe_icon_svg(valid_svg) == valid_svg
    assert _extract_safe_icon_svg({"svg": valid_svg}) == valid_svg

    # Script tag berbahaya ditolak
    xss_svg = '<svg onload="alert(1)"><script>bad()</script></svg>'
    assert _extract_safe_icon_svg(xss_svg) is None

    # Format bukan SVG
    assert _extract_safe_icon_svg("<div>Not svg</div>") is None
    assert _extract_safe_icon_svg(None) is None


def test_login_page_generates_theme_placeholder_togglevisibility_and_linkright():
    # Visual DOM sintetis representatif halaman login nyata
    visual_tree = {
        "nodes": [
            {
                "id": "n1",
                "tag": "h1",
                "text": "API Nigma Portal Asli",
                "style": {"fontSize": "24px", "fontWeight": "900", "color": "rgb(17, 24, 39)"},
                "box": {"x": 553, "y": 200, "w": 334, "h": 32},
            },
            {
                "id": "n2",
                "tag": "p",
                "text": "Subjudul login asli dari DOM.",
                "style": {"fontSize": "12px", "color": "rgb(120, 113, 108)"},
                "box": {"x": 553, "y": 240, "w": 334, "h": 20},
            },
            {
                "id": "n3",
                "tag": "input",
                "inputType": "email",
                "placeholder": "nama@domain.com",
                "style": {"borderColor": "rgb(79, 70, 229)", "borderRadius": "12px"},
                "icon": {
                    "svg": '<svg class="w-4 h-4" viewBox="0 0 24 24"><path d="M16 12a4 4 0 10-8 0"/></svg>'
                },
                "box": {"x": 553, "y": 300, "w": 334, "h": 44},
            },
            {
                "id": "n4",
                "tag": "input",
                "inputType": "password",
                "placeholder": "••••••••",
                "style": {"borderColor": "rgb(231, 229, 228)", "borderRadius": "12px"},
                "box": {"x": 553, "y": 370, "w": 334, "h": 44},
            },
            {
                "id": "n5",
                "tag": "button",
                "text": "",
                "box": {"x": 857, "y": 370, "w": 30, "h": 44},  # eye toggle di dalam input password
            },
            {
                "id": "n6",
                "tag": "svg",
                "icon": {
                    "svg": '<svg class="w-4 h-4" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5"/></svg>'
                },
                "box": {"x": 857, "y": 384, "w": 16, "h": 16},
            },
            {
                "id": "n7",
                "tag": "input",
                "inputType": "checkbox",
                "box": {"x": 553, "y": 440, "w": 16, "h": 16},
            },
            {
                "id": "n8",
                "tag": "span",
                "text": "Ingat Saya",
                "box": {"x": 575, "y": 440, "w": 60, "h": 16},
            },
            {
                "id": "n9",
                "tag": "a",
                "text": "Lupa Password?",
                "box": {"x": 790, "y": 440, "w": 90, "h": 16},
            },
            {
                "id": "n10",
                "tag": "button",
                "text": "Masuk ke Portal",
                "box": {"x": 553, "y": 490, "w": 334, "h": 48},
            },
        ]
    }

    screen = _make_mock_screen(visual=visual_tree)

    components = [
        {
            "type": "input",
            "label": "Email Pengguna",
            "props": {
                "dom": {
                    "placeholder": "nama@domain.com",
                    "style": {"borderColor": "rgb(79, 70, 229)", "borderRadius": "12px"},
                    "icon": {
                        "svg": '<svg class="w-4 h-4" viewBox="0 0 24 24"><path d="M16 12a4 4 0 10-8 0"/></svg>'
                    },
                }
            },
        },
        {
            "type": "input",
            "label": "Password",
            "props": {
                "dom": {
                    "placeholder": "••••••••",
                    "style": {"borderColor": "rgb(231, 229, 228)", "borderRadius": "12px"},
                }
            },
        },
        {
            "type": "checkbox",
            "label": "Ingat Saya",
            "props": {},
        },
        {
            "type": "button",
            "label": "Masuk ke Portal",
            "props": {},
        },
        {
            "type": "link",
            "label": "Lupa Password?",
            "props": {},
        },
    ]

    theme = {
        "page": {
            "backgroundColor": "rgb(250, 250, 249)",
            "fontFamily": "Inter, sans-serif",
        },
        "primary": {
            "backgroundColor": "rgb(17, 24, 39)",
            "color": "rgb(255, 255, 255)",
            "borderRadius": "9999px",
            "fontWeight": "700",
        },
        "text": {
            "heading": {"color": "rgb(17, 24, 39)", "fontSize": "24px", "fontWeight": "900"},
            "body": {"color": "rgb(120, 113, 108)", "fontSize": "12px"},
        },
    }

    draft = _make_mock_reconstruction(components=components, theme=theme)

    page, datasets, err = _build_page(draft, screen, "login", "/login")
    assert err is None
    assert page is not None

    # 1. Judul & subjudul dari teks DOM
    assert page["title"] == "API Nigma Portal Asli"
    assert page["subtitle"] == "Subjudul login asli dari DOM."

    # 2. Theme dipetakan ke page.theme
    assert page["theme"] == theme

    # 3. Form fields
    form_section = page["sections"][0]
    assert form_section["type"] == "form"
    fields = form_section["fields"]

    email_field = next(f for f in fields if f["key"] == "email_pengguna")
    assert email_field["placeholder"] == "nama@domain.com"
    assert email_field["style"]["borderColor"] == "rgb(79, 70, 229)"
    assert "<svg" in email_field["iconSvg"]

    pwd_field = next(f for f in fields if f["key"] == "password")
    assert pwd_field["placeholder"] == "••••••••"
    assert pwd_field["style"]["borderColor"] == "rgb(231, 229, 228)"
    assert pwd_field["toggleVisibility"] is True

    # 4. linkRight
    assert form_section.get("linkRight") is not None
    assert form_section["linkRight"]["label"] == "Lupa Password?"

    # 5. Tidak ada section generik "Aksi lain"
    assert len(page["sections"]) == 1
    assert not any(s.get("title") == "Aksi lain" for s in page["sections"])

    # 6. Serialisasi definition.ts
    defn = _build_definition(
        slug="test-app",
        name="Test App",
        description="Deskripsi",
        pages=[page],
        datasets=datasets,
    )
    ts_code = _ts_data_file("Header", "SimAppDefinition", "definition", defn)
    assert "theme" in ts_code
    assert "toggleVisibility" in ts_code
    assert "linkRight" in ts_code
    assert "••••••••" in ts_code


def test_legacy_screen_without_theme_or_dom_generates_cleanly():
    # Layar lama tanpa visual DOM dan tanpa layout theme
    screen = _make_mock_screen(screen_id=2, visual=None)

    components = [
        {
            "type": "input",
            "label": "Email",
            "props": {},
        },
        {
            "type": "input",
            "label": "Password",
            "props": {},
        },
        {
            "type": "button",
            "label": "Login",
            "props": {},
        },
    ]

    draft = _make_mock_reconstruction(components=components, theme=None)

    page, datasets, err = _build_page(draft, screen, "login", "/login")
    assert err is None
    assert page is not None

    # Layar lama tidak punya theme (None atau tidak ada key theme)
    assert page.get("theme") is None

    form_section = page["sections"][0]
    pwd_field = next(f for f in form_section["fields"] if f["key"] == "password")
    # Field tidak error, tidak crash, placeholder & style tidak dipaksa jika tidak ada
    assert pwd_field["key"] == "password"
    assert pwd_field["type"] == "password"
    assert "style" not in pwd_field
    assert "iconSvg" not in pwd_field
