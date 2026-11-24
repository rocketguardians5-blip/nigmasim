"""Fase 3: mesin analisis & rekonstruksi UI.

Prinsip (master prompt §12):
- Screenshot TIDAK bisa mengungkap aturan bisnis. Semua asumsi dicatat dan WAJIB
  dicek manusia sebelum draft dipakai.
- Hasil analisis memakai aturan deterministik, bukan tebakan. Kalau tidak yakin,
  ditandai sebagai asumsi, bukan diam-diam dianggap benar.
- Draft dihasilkan sebagai React + TypeScript yang bisa diedit.

Nanti model AI (vision) bisa plugged-in lewat `analyze_with_ai()`; struktur
data keluarannya sengaja dibuat sama supaya tidak perlu mengubah schema.
"""

from __future__ import annotations

import asyncio
import base64
import copy
import json
import logging
import math
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings, ALLOWED_GEMINI_MODELS
from app.models.capture import Screen, ScreenElement
from app.models.reconstruction import (
    Reconstruction,
    ReconstructionAssumption,
    ReconstructionComponent,
)

logger = logging.getLogger("nigmasim.reconstructor")

SIDEBAR_BAND = 0.22  # elemen di kiri 22% lebar -> kandidat navigasi
HEADER_BAND = 0.14  # elemen di atas 14% tinggi -> kandidat header
AI_RESULT_MAX_BYTES = 200 * 1024
AI_RESULT_ALLOWED_TOP_LEVEL_KEYS = frozenset({"components", "assumptions", "layout"})
_AI_RESULT_SENSITIVE_KEYS = frozenset(
    {
        "apikey",
        "xapikey",
        "xgoogapikey",
        "geminikey",
        "geminiapikey",
        "authorization",
        "proxyauthorization",
        "accesstoken",
        "refreshtoken",
        "idtoken",
        "bearer",
        "cookie",
        "setcookie",
        "credential",
        "credentials",
        "secret",
        "clientsecret",
        "privatekey",
        "password",
        "passwd",
        "sessionid",
        "sessiontoken",
    }
)
_AI_RESULT_BINARY_OR_REQUEST_KEYS = frozenset(
    {
        "request",
        "requestpayload",
        "payload",
        "requestheaders",
        "header",
        "headers",
        "httpheader",
        "httpheaders",
        "httpsheader",
        "httpsheaders",
        "requestheader",
        "responseheader",
        "responseheaders",
        "contents",
        "parts",
        "systeminstruction",
        "inlinedata",
        "screenshot",
        "screenshotdata",
        "image",
        "thumbnail",
        "thumbnaildata",
        "base64",
        "imagebytes",
        "binarydata",
    }
)


@dataclass
class Analysis:
    layout: dict[str, Any] = field(default_factory=dict)
    components: list[dict[str, Any]] = field(default_factory=list)
    assumptions: list[dict[str, Any]] = field(default_factory=list)
    ai_model: str = ""  # model vision yang benar-benar dipakai (bila ada)
    ai_status: str = "not_configured"  # "not_configured" | "success" | "failed"
    ai_error: str = ""  # alasan gagal jika ada
    ai_result: dict[str, Any] | None = None
    ai_result_truncated: bool = False
    ai_result_size_bytes: int = 0
    ai_analyzed_at: str = ""
    source: str = "rule-engine"  # "rule-engine" | "ai-vision" | "hybrid" | "fallback"


def _mark_ai_failure(analysis: Analysis, message: str) -> None:
    """Catat kegagalan AI tanpa menyimpan hasil parsial/lama."""
    analysis.ai_status = "failed"
    analysis.ai_error = _redact_sensitive_text(message)
    analysis.ai_result = None
    analysis.ai_result_truncated = False
    analysis.ai_result_size_bytes = 0
    analysis.ai_analyzed_at = datetime.now(timezone.utc).isoformat()
    analysis.source = "rule-engine"


def _generated_by_for_source(source: str) -> str:
    return {
        "ai-vision": "ai-vision",
        "hybrid": "hybrid",
        "fallback": "fallback",
    }.get(source, "rule-engine")


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return slug[:60] or "screen"


def _pascal(text: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", (text or "").strip())
    return "".join(p[:1].upper() + p[1:] for p in parts if p) or "Screen"



def _pct_box_to_px(box: dict[str, Any], width: int, height: int) -> dict[str, float]:
    """Konversi box persen (0-100) dari AI ke piksel agar sebanding dengan hasil DOM."""
    return {
        "x": float(box.get("x", 0)) / 100 * width,
        "y": float(box.get("y", 0)) / 100 * height,
        "w": float(box.get("w", 0)) / 100 * width,
        "h": float(box.get("h", 0)) / 100 * height,
    }


def _build_sections(
    items: list[dict[str, Any]], viewport: dict[str, int]
) -> list[dict[str, Any]]:
    """Kelompokkan elemen menjadi section (baris horizontal).

    Aturan: elemen masuk ke section yang sama kalau jaraknya vertikal dekat.
    Elemen yang jauh lebih tinggi dari section dianggap section baru.
    Hasilnya: blueprint per section (header, hero, baris fitur, dst) - jauh
    lebih terbaca daripada menumpuk kotak per elemen.
    """
    if not items:
        return []

    width = max(viewport.get("width", 1440), 1)
    height = max(viewport.get("height", 900), 1)
    ordered = sorted(items, key=lambda item: (item["box"]["y"], item["box"]["x"]))

    # Box besar (mis. kartu/hero dari AI) tidak boleh membentuk band sendiri:
    # tingginya akan "menelan" semua elemen di bawahnya sehingga seluruh layar
    # jadi satu section. Box seperti itu ditempelkan ke band terdekat setelah
    # band normal selesai dibentuk.
    max_seed_height = height * 0.22

    bands: list[dict[str, Any]] = []
    for item in ordered:
        box = item["box"]
        if box["h"] > max_seed_height:
            continue
        placed = False
        for band in bands:
            gap_top = box["y"] - band["bottom"]
            too_tall = box["h"] > band["height"] * 1.8 and gap_top > 24
            if gap_top <= 48 and not too_tall:
                band["items"].append(item)
                band["bottom"] = max(band["bottom"], box["y"] + box["h"])
                band["height"] = band["bottom"] - band["top"]
                placed = True
                break
        if not placed:
            bands.append(
                {
                    "top": box["y"],
                    "bottom": box["y"] + box["h"],
                    "height": box["h"],
                    "items": [item],
                }
            )

    # Tempelkan box besar ke band yang paling beririsan (berdasarkan titik tengah).
    for item in ordered:
        box = item["box"]
        if box["h"] <= max_seed_height:
            continue
        center = box["y"] + box["h"] / 2
        best: dict[str, Any] | None = None
        best_distance: float | None = None
        for band in bands:
            if band["top"] - 24 <= center <= band["bottom"] + 24:
                distance = abs(center - (band["top"] + band["bottom"]) / 2)
                if best is None or (best_distance is not None and distance < best_distance):
                    best = band
                    best_distance = distance
        if best is not None:
            best["items"].append(item)
        else:
            bands.append(
                {
                    "top": box["y"],
                    "bottom": box["y"] + box["h"],
                    "height": box["h"],
                    "items": [item],
                }
            )

    sections: list[dict[str, Any]] = []
    for index, band in enumerate(sorted(bands, key=lambda b: b["top"])):
        types: list[str] = []
        for item in band["items"]:
            if item["type"] not in types:
                types.append(item["type"])
        left = min(item["box"]["x"] for item in band["items"])
        right = max(item["box"]["x"] + item["box"]["w"] for item in band["items"])
        sections.append(
            {
                "index": index + 1,
                "label": _section_label(types, index),
                "types": types,
                "top": band["top"],
                "bottom": band["bottom"],
                "height": band["height"],
                "x": left,
                "width": right - left,
                "width_ratio": round((right - left) / width, 3),
                "item_count": len(band["items"]),
                "items": [
                    {"type": item["type"], "label": item["label"]} for item in band["items"][:12]
                ],
            }
        )
    return sections


def _section_label(types: list[str], index: int) -> str:
    """Berikan nama yang bisa dibaca manusia untuk sebuah section."""
    if "nav-item" in types:
        return "Navigasi / Header"
    if "heading" in types and index == 1:
        return "Hero / Judul utama"
    if "table" in types:
        return "Tabel data"
    if "form" in types or "field" in types:
        return "Form input"
    if "card" in types:
        return "Kartu / statistik"
    if "button" in types:
        return "Tombol aksi"
    if "image" in types:
        return "Gambar"
    return "Bagian " + str(index + 1)



def generate_code(screen: Screen, analysis: Analysis) -> str:
    """Hasilkan draf React + TypeScript dari hasil analisis."""
    name = _pascal(screen.title or screen.screen_key)
    regions = analysis.layout.get("regions", {})
    sidebar = regions.get("sidebar")
    header = regions.get("header")

    nav_items = [c for c in analysis.components if c["component_type"] == "nav-item"]
    tables = [c for c in analysis.components if c["component_type"] == "table"]
    fields = [c for c in analysis.components if c["component_type"] == "field"]
    buttons = [c for c in analysis.components if c["component_type"] == "button" and c.get("element_type") != "dropdown"]
    dropdowns = [c for c in analysis.components if c.get("element_type") == "dropdown" or c["component_type"] == "dropdown"]
    headings = [c for c in analysis.components if c["component_type"] == "heading"]
    cards = [c for c in analysis.components if c["component_type"] == "card"]

    lines: list[str] = []
    lines.append("/*")
    lines.append(f" * Draf otomatis NigmaSim - {screen.title}")
    lines.append(f" * Sumber: screenshot {screen.source_url or ''}")
    lines.append(" *")
    lines.append(" * PERINGATAN: draf ini WAJIB direview manusia sebelum dipakai.")
    lines.append(" * Lihat daftar asumsi - aturan bisnis tidak bisa dibaca dari tampilan.")
    lines.append(" */")
    lines.append("")
    lines.append("export interface ScreenProps {")
    lines.append("  data?: unknown[]")
    lines.append("}")
    lines.append("")
    lines.append(f"export function {name}({{ data = [] }}: ScreenProps) {{")
    lines.append("  return (")
    lines.append('    <div className="min-h-screen bg-slate-50 text-slate-800">')

    if sidebar and nav_items:
        lines.append("      <aside className=\"w-60 shrink-0 bg-ink-900 text-slate-300\">")
        for item in nav_items:
            label = (item.get("label") or "Menu").replace("'", "\\'")
            lines.append(f"        <a href=\"#\" className=\"block px-5 py-2 text-[13px] hover:bg-white/5\">{label}</a>")
        lines.append("      </aside>")

    lines.append("      <div className=\"flex min-w-0 flex-1 flex-col\">")

    if header:
        lines.append("        <header className=\"border-b border-slate-200 bg-white px-6 py-3\">")
        lines.append("          {/* isi header - perlu dilengkapi manual */}")
        lines.append("        </header>")

    lines.append("        <main className=\"flex-1 overflow-y-auto p-6\">")

    for heading in headings[:3]:
        label = (heading.get("label") or "Judul").replace("'", "\\'")
        level = min(3, max(1, int(heading.get("props", {}).get("level") or 1)))
        size = {1: "text-xl", 2: "text-lg", 3: "text-base"}[level]
        lines.append(f"          <h{level} className=\"{size} font-semibold text-slate-900\">{label}</h{level}>")

    if cards:
        lines.append("          <div className=\"mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4\">")
        for card in cards[:8]:
            label = (card.get("label") or "Kartu").replace("'", "\\'")
            lines.append("            <div className=\"rounded-lg border border-slate-200 bg-white p-4\">")
            lines.append(f"              <p className=\"text-[13px] text-slate-500\">{label}</p>")
            lines.append("              <p className=\"mt-1 text-2xl font-semibold\">—</p>")
            lines.append("            </div>")
        lines.append("          </div>")

    for table in tables:
        headers = table.get("props", {}).get("headers") or []
        lines.append("          <div className=\"mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white\">")
        if headers:
            lines.append("            <table className=\"w-full text-left text-[13px]\">")
            lines.append("              <thead className=\"border-b border-slate-200 text-xs text-slate-500\">")
            lines.append("                <tr>")
            for header in headers[:10]:
                safe = str(header).replace("'", "\\'")
                lines.append(f"                  <th className=\"px-4 py-2.5\">{safe}</th>")
            lines.append("                </tr>")
            lines.append("              </thead>")
            lines.append("              <tbody>")
            lines.append("                {data.map((row, i) => (")
            lines.append("                  <tr key={i} className=\"border-b border-slate-100\">")
            for _ in headers[:10]:
                lines.append("                    <td className=\"px-4 py-2.5\">—</td>")
            lines.append("                  </tr>")
            lines.append("                ))}")
            lines.append("              </tbody>")
            lines.append("            </table>")
        else:
            lines.append("            {/* tabel terdeteksi tanpa header - lengkapi manual */}")
        lines.append("          </div>")

    if fields:
        lines.append("          <div className=\"mt-4 max-w-xl rounded-lg border border-slate-200 bg-white p-5\">")
        for field in fields[:12]:
            label = (field.get("label") or "Field").replace("'", "\\'")
            lines.append("            <label className=\"mb-1.5 block text-[13px] font-medium text-slate-700\">")
            lines.append(f"              {label}")
            lines.append("            </label>")
            lines.append("            <input className=\"input\" />")
        lines.append("          </div>")

    if dropdowns:
        lines.append("          <div className=\"mt-4 flex flex-wrap gap-3\">")
        for dd in dropdowns[:6]:
            label = (dd.get("label") or "Pilih Opsi").replace("'", "\\'")
            config_str = dd.get("config_json") or "[]"
            import json
            try:
                raw_opts = json.loads(config_str)
                if not isinstance(raw_opts, list):
                    raw_opts = []
            except Exception:
                raw_opts = []
            lines.append("            <div className=\"min-w-[160px]\">")
            lines.append(f"              <label className=\"mb-1 block text-xs font-medium text-slate-700\">{label}</label>")
            lines.append("              <select className=\"input w-full\">")
            for opt in raw_opts:
                if isinstance(opt, dict):
                    opt_lbl = str(opt.get("label", opt.get("value", ""))).replace("'", "\\'")
                    opt_val = str(opt.get("value", opt.get("label", ""))).replace("'", "\\'")
                else:
                    opt_lbl = str(opt).replace("'", "\\'")
                    opt_val = str(opt).replace("'", "\\'")
                lines.append(f"                <option value=\"{opt_val}\">{opt_lbl}</option>")
            lines.append("              </select>")
            lines.append("            </div>")
        lines.append("          </div>")

    if buttons:
        lines.append("          <div className=\"mt-4 flex gap-2\">")
        for button in buttons[:6]:
            label = (button.get("label") or "Tombol").replace("'", "\\'")
            lines.append(
                f"            <button className=\"rounded bg-brand-600 px-3 py-2 text-[13px] text-white\">{label}</button>"
            )
        lines.append("          </div>")

    lines.append("        </main>")
    lines.append("      </div>")
    lines.append("    </div>")
    lines.append("  )")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def _component_box_iou(b1: dict | None, b2: dict | None) -> float:
    if not b1 or not b2:
        return 0.0
    try:
        x1 = max(float(b1.get("x", 0)), float(b2.get("x", 0)))
        y1 = max(float(b1.get("y", 0)), float(b2.get("y", 0)))
        x2 = min(float(b1.get("x", 0)) + float(b1.get("w", 0)), float(b2.get("x", 0)) + float(b2.get("w", 0)))
        y2 = min(float(b1.get("y", 0)) + float(b1.get("h", 0)), float(b2.get("y", 0)) + float(b2.get("h", 0)))
        inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        a1 = float(b1.get("w", 0)) * float(b1.get("h", 0))
        a2 = float(b2.get("w", 0)) * float(b2.get("h", 0))
        union = a1 + a2 - inter
        return inter / union if union > 0 else 0.0
    except (ValueError, TypeError):
        return 0.0


def _json_size_bytes(value: Any) -> int:
    """Hitung ukuran JSON sesuai serializer JSON bawaan SQLAlchemy/SQLite.

    ``json.dumps`` bawaan memakai ``ensure_ascii=True`` dan separator dengan
    spasi. SQLite menyimpan JSON dengan serializer yang sama, sehingga unicode
    seperti ``é`` dihitung sebagai enam byte (``\\u00e9``), bukan dua byte UTF-8.
    Mengukur dengan format yang sama mencegah payload Unicode lolos dari
    batas 200 KB hanya karena hasil hitungan backend terlalu kecil.
    """
    serialized = json.dumps(
        value,
        ensure_ascii=True,
        separators=(", ", ": "),
        allow_nan=False,
    )
    return len(serialized.encode("utf-8"))


def _redact_sensitive_text(value: Any) -> str:
    """Hapus credential yang mungkin muncul pada teks hasil Gemini atau error."""
    text = str(value or "")
    api_key = (settings.gemini_api_key or "").strip()
    if api_key and api_key in text:
        text = text.replace(api_key, "[DISEMASKAN]")
    if "AIza" in text:
        text = re.sub(r"\bAIza[0-9A-Za-z_-]{16,}\b", "[DISEMASKAN]", text)
    if "x-goog-api-key" in text.lower():
        text = re.sub(
            r"(?i)(x-goog-api-key\s*[=:]\s*)[^&\s,;]+",
            r"\1[DISEMASKAN]",
            text,
        )
    if "key=" in text.lower() or "api_key=" in text.lower():
        text = re.sub(
            r"(?i)([?&](?:key|api_key)=)[^&\s]+",
            r"\1[DISEMASKAN]",
            text,
        )
    if "bearer" in text.lower():
        text = re.sub(
            r"(?i)\bBearer\s+[0-9A-Za-z._~+/=-]{8,}",
            "Bearer [DISEMASKAN]",
            text,
        )
    if "sk-" in text:
        text = re.sub(r"\bsk-[0-9A-Za-z_-]{16,}\b", "[DISEMASKAN]", text)
    if "@" in text:
        text = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "[EMAIL DISEMASKAN]", text)
    if any(c.isdigit() for c in text):
        text = re.sub(r"\b(?:\+?62|08)[0-9]{8,13}\b", "[NOMOR DISEMASKAN]", text)
    if "data:" in text.lower() and "base64" in text.lower():
        text = re.sub(
            r"(?i)data:[^;\s]+;base64,[0-9A-Za-z+/=]+",
            "[DATA BINARY DITARMAKAN]",
            text,
        )
    return text


def _normalized_result_key(key: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def _redact_layout_value(value: Any) -> Any:
    """Redaksi teks sensitif pada nilai string layout draf tanpa membuang key apa pun."""
    if isinstance(value, dict):
        return {str(k): _redact_layout_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_layout_value(item) for item in value]
    if isinstance(value, str):
        return _redact_sensitive_text(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _sanitize_result_value(value: Any) -> Any:
    """Bersihkan nilai JSON output tanpa mengubah struktur normal Gemini."""
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for raw_key, item in value.items():
            key = str(raw_key)
            normalized = _normalized_result_key(key)
            if normalized in _AI_RESULT_BINARY_OR_REQUEST_KEYS:
                continue
            if normalized in _AI_RESULT_SENSITIVE_KEYS:
                cleaned[key] = "[DISEMASKAN]"
                continue
            cleaned[key] = _sanitize_result_value(item)
        return cleaned
    if isinstance(value, list):
        return [_sanitize_result_value(item) for item in value]
    if isinstance(value, str):
        return _redact_sensitive_text(value)
    if isinstance(value, float) and not math.isfinite(value):
        # NaN/Infinity bukan JSON standar dan serializer Starlette/SQLite dapat
        # menolaknya. Normalisasi menjadi null agar hasil tetap dapat disimpan.
        return None
    return value


def _sanitize_result_box(value: Any) -> dict[str, Any] | None:
    """Ambil box angka yang valid; bentuk lain diabaikan."""
    if not isinstance(value, dict):
        return None
    box: dict[str, Any] = {}
    for key in ("x", "y", "w", "h"):
        item = value.get(key)
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            continue
        if not math.isfinite(float(item)):
            continue
        box[key] = item
    item_count = value.get("item_count")
    if isinstance(item_count, int) and not isinstance(item_count, bool) and item_count >= 0:
        box["item_count"] = item_count
    return box or None


def _safe_table_headers(value: Any) -> list[str] | None:
    """Ambil header tabel hanya bila berbentuk daftar nama kolom biasa.

    Daftar object ``{"name": ..., "value": ...}`` dan string ``"Name: value"``
    dapat dipakai untuk menyamarkan header HTTP, sehingga keduanya tidak
    dianggap aman.
    """
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return None
    if any(re.match(r"^[0-9A-Za-z_-]+\s*:", item) for item in value):
        return None
    return [_redact_sensitive_text(item) for item in value]


def _sanitize_result_component(value: dict[str, Any]) -> dict[str, Any]:
    cleaned = _sanitize_result_value(value)

    for key in ("region", "component_type", "source"):
        if key in value and not isinstance(value.get(key), str):
            cleaned.pop(key, None)

    if "label" in value and value.get("label") is not None and not isinstance(value.get("label"), str):
        cleaned.pop("label", None)

    confidence = value.get("confidence")
    if "confidence" in value:
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float, str)):
            cleaned.pop("confidence", None)
        elif isinstance(confidence, float) and not math.isfinite(confidence):
            cleaned.pop("confidence", None)

    raw_props = value.get("props")
    if raw_props is None:
        if "props" in value:
            cleaned["props"] = None
    elif isinstance(raw_props, dict):
        props = _sanitize_result_value(raw_props)
        if value.get("component_type") == "table" and "headers" in raw_props:
            table_headers = _safe_table_headers(raw_props.get("headers"))
            if table_headers is not None:
                props["headers"] = table_headers
        if "dom" in raw_props and isinstance(raw_props["dom"], dict):
            props["dom"] = _redact_layout_value(raw_props["dom"])
        if "label_source" in raw_props:
            props["label_source"] = str(raw_props["label_source"])
        if "label_guess" in raw_props:
            props["label_guess"] = _redact_sensitive_text(raw_props["label_guess"])
        if "box" in props:
            box = _sanitize_result_box(raw_props.get("box"))
            if box is None:
                props.pop("box", None)
            else:
                props["box"] = box
        cleaned["props"] = props
    else:
        cleaned.pop("props", None)

    if "box" in value:
        box = _sanitize_result_box(value.get("box"))
        if box is None:
            cleaned.pop("box", None)
        else:
            cleaned["box"] = box

    return cleaned


def _sanitize_result_assumption(value: dict[str, Any]) -> dict[str, Any]:
    cleaned = _sanitize_result_value(value)
    for key in ("topic", "description", "confidence"):
        if key in value and not isinstance(value.get(key), str):
            cleaned.pop(key, None)
    return cleaned


def _sanitize_result_layout(value: dict[str, Any]) -> dict[str, Any]:
    cleaned = _sanitize_result_value(value)

    for key in ("has_sidebar", "has_header"):
        if key in value and not isinstance(value.get(key), bool):
            cleaned.pop(key, None)

    regions = value.get("regions")
    if isinstance(regions, dict):
        safe_regions: dict[str, Any] = {}
        for name in ("sidebar", "header", "main"):
            if name not in regions:
                continue
            region = regions.get(name)
            if region is None:
                safe_regions[name] = None
                continue
            box = _sanitize_result_box(region)
            if box is not None:
                safe_regions[name] = box
        cleaned["regions"] = safe_regions
    elif "regions" in value:
        cleaned["regions"] = {}

    sections = value.get("sections")
    if isinstance(sections, list):
        safe_sections: list[dict[str, Any]] = []
        for section in sections:
            if not isinstance(section, dict):
                continue
            safe_section = _sanitize_result_value(section)
            types = section.get("types")
            if isinstance(types, list):
                safe_section["types"] = [item for item in types if isinstance(item, str)]
            items = section.get("items")
            if isinstance(items, list):
                safe_items: list[dict[str, Any]] = []
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    safe_item = _sanitize_result_value(item)
                    if "type" in item and not isinstance(item.get("type"), str):
                        safe_item.pop("type", None)
                    if "label" in item and item.get("label") is not None and not isinstance(item.get("label"), str):
                        safe_item.pop("label", None)
                    safe_items.append(safe_item)
                safe_section["items"] = safe_items
            safe_sections.append(safe_section)
        cleaned["sections"] = safe_sections
    elif "sections" in value:
        cleaned["sections"] = []

    return cleaned


def _sanitize_ai_result(result: dict[str, Any]) -> dict[str, Any]:
    """Bentuk allowlist respons Gemini yang aman untuk disimpan dan ditampilkan.

    Hanya keys tingkat atas `components`, `assumptions`, dan `layout` yang dipertahankan.
    Field credential/binary dibuang atau disamarkan, dan bentuk list/dict yang
    tidak valid dinormalisasi supaya panel frontend tidak bisa gagal render.
    """
    cleaned: dict[str, Any] = {}
    raw_components = result.get("components")
    if isinstance(raw_components, list):
        cleaned["components"] = [
            _sanitize_result_component(component)
            for component in raw_components
            if isinstance(component, dict)
        ]
    elif "components" in result:
        cleaned["components"] = []

    raw_assumptions = result.get("assumptions")
    if isinstance(raw_assumptions, list):
        cleaned["assumptions"] = [
            _sanitize_result_assumption(assumption)
            for assumption in raw_assumptions
            if isinstance(assumption, dict)
        ]
    elif "assumptions" in result:
        cleaned["assumptions"] = []

    raw_layout = result.get("layout")
    if isinstance(raw_layout, dict):
        cleaned["layout"] = _sanitize_result_layout(raw_layout)
    elif "layout" in result:
        cleaned["layout"] = {}

    # Guard terakhir bila ada pemanggil yang menambah key baru di masa depan.
    return {
        key: value
        for key, value in cleaned.items()
        if key in AI_RESULT_ALLOWED_TOP_LEVEL_KEYS
    }


def _trim_ai_result_to_limit(result: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Pastikan hasil AI yang disimpan tidak melewati batas 200 KB.

    Hasil Gemini biasanya jauh di bawah batas ini. Untuk payload yang terlalu
    besar, bagian non-komponen dipangkas terlebih dahulu agar daftar komponen
    tetap dapat direview. Asumsi dipangkas dari bagian paling akhir, section
    layout dipangkas secara prefix, dan field layout yang tidak dikenal dibuang
    bila diperlukan. Komponen baru dipangkas bila daftar komponen itu sendiri
    melebihi batas.

    Objek asli tidak dimutasi: hasil yang dikembalikan selalu salinan, sehingga
    respons yang sama masih bisa dipakai untuk merge komponen ke draf.
    """
    if _json_size_bytes(result) <= AI_RESULT_MAX_BYTES:
        return copy.deepcopy(result), False

    trimmed = copy.deepcopy(result)

    def keep_largest_prefix(key: str, container: dict[str, Any] | None = None) -> None:
        target = trimmed if container is None else container
        items = target.get(key)
        if not isinstance(items, list) or not items:
            return

        low = 0
        high = len(items)
        while low < high:
            middle = (low + high + 1) // 2
            target[key] = items[:middle]
            if _json_size_bytes(trimmed) <= AI_RESULT_MAX_BYTES:
                low = middle
            else:
                high = middle - 1
        target[key] = items[:low]

    def trim_assumptions() -> None:
        keep_largest_prefix("assumptions")

    # Komponen adalah bagian review yang paling penting. Coba muat asumsi dan
    # layout terlebih dahulu tanpa memangkas komponen.
    trim_assumptions()

    layout = trimmed.get("layout")
    if isinstance(layout, dict):
        if isinstance(layout.get("sections"), list):
            keep_largest_prefix("sections", layout)

        # Layout yang diharapkan hanya memuat metadata region/flag/section.
        # Field tambahan yang aman boleh ikut disimpan selama ukurannya kecil,
        # tetapi harus dilepas bila payload-nya besar.
        if _json_size_bytes(trimmed) > AI_RESULT_MAX_BYTES:
            known_layout_keys = {"regions", "has_sidebar", "has_header", "sections"}
            for key in list(layout.keys()):
                if key not in known_layout_keys:
                    layout.pop(key, None)

        if _json_size_bytes(trimmed) > AI_RESULT_MAX_BYTES:
            layout.pop("sections", None)

        # Layout yang kini lebih kecil dapat memberi ruang untuk asumsi lagi.
        trim_assumptions()

    # Daftar komponen sendiri dapat melampaui batas. Prefix terbesar yang masih
    # muat dipertahankan; bila satu komponen pun tidak muat, list dikosongkan.
    if _json_size_bytes(trimmed) > AI_RESULT_MAX_BYTES:
        keep_largest_prefix("components")

    if _json_size_bytes(trimmed) > AI_RESULT_MAX_BYTES:
        return {}, True

    return trimmed, True


def _is_compatible_type(comp_type: str, node: dict[str, Any]) -> bool:
    """Periksa apakah tipe komponen draf cocok dengan tag/tipe node visual DOM."""
    c_type = (comp_type or "").lower().strip()
    tag = (node.get("tag") or "").lower().strip()
    itype = (node.get("inputType") or "").lower().strip()
    has_icon = bool(node.get("icon"))

    if c_type in ("input", "field"):
        return tag in ("input", "textarea", "select")
    if c_type in ("button", "action"):
        return tag in ("button", "a") or (tag == "input" and itype in ("submit", "button", "reset"))
    if c_type in ("heading",):
        return tag in ("h1", "h2", "h3", "h4", "h5", "h6") or (tag in ("p", "span", "div") and bool(node.get("text")))
    if c_type in ("image", "icon", "logo"):
        return tag in ("img", "svg") or has_icon
    if c_type in ("link", "nav-item"):
        return tag in ("a", "button", "span", "li")
    if c_type in ("card", "container", "form"):
        return tag in ("div", "section", "article", "form", "main", "aside")
    if c_type in ("text",):
        return bool(node.get("text"))
    return True


def _comp_box_to_pixels(b: dict[str, Any], vw: int, vh: int) -> dict[str, float]:
    """Konversi box komponen ke piksel jika masih dalam persentase."""
    try:
        x = float(b.get("x", 0))
        y = float(b.get("y", 0))
        w = float(b.get("w", 0))
        h = float(b.get("h", 0))
    except (ValueError, TypeError):
        return {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}

    # Jika salah satu dimensi > 100, berarti sudah dalam koordinat piksel
    if x > 100.0 or y > 100.0 or w > 100.0 or h > 100.0:
        return {"x": x, "y": y, "w": w, "h": h}
    return {
        "x": x * vw / 100.0,
        "y": y * vh / 100.0,
        "w": w * vw / 100.0,
        "h": h * vh / 100.0,
    }


def _apply_dom_node_to_component(comp: dict[str, Any], node: dict[str, Any]) -> None:
    """Terapkan metadata DOM node ke komponen draf (props.dom, label asli)."""
    props = comp.setdefault("props", {})
    dom_props: dict[str, Any] = {}

    if node.get("id") is not None:
        dom_props["node_id"] = str(node["id"])
    if node.get("text") is not None and str(node["text"]).strip():
        dom_props["text"] = _redact_sensitive_text(node["text"])
    if node.get("placeholder") is not None:
        dom_props["placeholder"] = _redact_sensitive_text(node["placeholder"])
    if node.get("inputType") is not None:
        dom_props["inputType"] = str(node["inputType"])
    if node.get("style"):
        dom_props["style"] = _redact_layout_value(node["style"])
    if node.get("icon"):
        dom_props["icon"] = _redact_layout_value(node["icon"])

    props["dom"] = dom_props

    # Teks dari DOM menang atas label tebakan
    dom_text = dom_props.get("text")
    if dom_text and dom_text.strip():
        comp_label = comp.get("label") or ""
        if comp_label != dom_text:
            props["label_source"] = "dom"
            if comp_label:
                props["label_guess"] = comp_label
            comp["label"] = dom_text


def _match_visual_nodes(
    components: list[dict[str, Any]],
    visual: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Cocokkan komponen draf dengan node pohon visual DOM terbaik.

    Murni tanpa jaringan. Memakai node_id eksplisit (bila ada) atau IoU kotak >= 0.3
    dengan syarat tipe kompatibel. Setiap node maksimal dipakai satu komponen.
    """
    if not visual or not isinstance(visual, dict) or not visual.get("nodes"):
        return components

    vw = int((visual.get("viewport") or {}).get("w") or 1440)
    vh = int((visual.get("viewport") or {}).get("h") or 900)
    nodes: list[dict[str, Any]] = [n for n in visual.get("nodes", []) if isinstance(n, dict)]

    node_by_id: dict[str, dict[str, Any]] = {
        str(n["id"]): n for n in nodes if n.get("id") is not None
    }

    matched_components = [copy.deepcopy(c) for c in components]
    used_node_ids: set[str] = set()

    # Fase 1: Pencocokan eksplisit via node_id (misal dari respon AI vision atau props dom lama)
    for c in matched_components:
        props = c.setdefault("props", {})
        explicit_node_id = props.get("node_id") or c.get("node_id")
        if not explicit_node_id and isinstance(props.get("dom"), dict):
            explicit_node_id = props["dom"].get("node_id")

        if explicit_node_id and str(explicit_node_id) in node_by_id:
            nid = str(explicit_node_id)
            if nid not in used_node_ids:
                node = node_by_id[nid]
                used_node_ids.add(nid)
                _apply_dom_node_to_component(c, node)

    # Fase 2: Pencocokan geometris IoU >= 0.3 untuk komponen yang belum punya props["dom"]
    candidate_pairs: list[tuple[float, int, dict[str, Any]]] = []
    for c_idx, c in enumerate(matched_components):
        props = c.get("props") or {}
        if props.get("dom"):
            continue
        c_box = props.get("box") or c.get("box")
        if not c_box:
            continue
        c_px = _comp_box_to_pixels(c_box, vw, vh)
        c_type = c.get("component_type") or "unknown"

        for node in nodes:
            nid = str(node.get("id", ""))
            if not nid or nid in used_node_ids:
                continue
            if not _is_compatible_type(c_type, node):
                continue
            n_box = node.get("box")
            if not n_box:
                continue
            iou = _component_box_iou(c_px, n_box)
            if iou >= 0.3:
                candidate_pairs.append((iou, c_idx, node))

    # Urutkan berdasarkan IoU tertinggi
    candidate_pairs.sort(key=lambda x: x[0], reverse=True)

    matched_c_indices: set[int] = set()
    for iou, c_idx, node in candidate_pairs:
        nid = str(node.get("id", ""))
        if c_idx in matched_c_indices or nid in used_node_ids:
            continue
        matched_c_indices.add(c_idx)
        used_node_ids.add(nid)
        _apply_dom_node_to_component(matched_components[c_idx], node)

    # Fase 3: Tambahkan komponen teks statis dari node DOM non-interaktif
    # yang belum cocok dan bukan turunan komponen yang sudah cocok (maksimal 30).
    parent_map: dict[str, str | None] = {
        str(n["id"]): str(n["parent"]) if n.get("parent") is not None else None
        for n in nodes if n.get("id") is not None
    }

    def _is_descendant_of_used(nid: str) -> bool:
        curr = parent_map.get(nid)
        while curr:
            if curr in used_node_ids:
                return True
            curr = parent_map.get(curr)
        return False

    interactive_tags = {"input", "textarea", "select", "button", "script", "style", "svg"}

    added_text_count = 0
    start_order = len(matched_components)
    for node in nodes:
        if added_text_count >= 30:
            break
        nid = str(node.get("id", ""))
        if not nid or nid in used_node_ids:
            continue
        if _is_descendant_of_used(nid):
            continue

        tag = (node.get("tag") or "").lower().strip()
        if tag in interactive_tags:
            continue

        raw_text = node.get("text")
        if not raw_text or not str(raw_text).strip():
            continue

        clean_text = _redact_sensitive_text(str(raw_text).strip())
        if not clean_text:
            continue

        n_box = node.get("box") or {}
        px_w = float(n_box.get("w", 0))
        px_h = float(n_box.get("h", 0))
        if px_w <= 0 or px_h <= 0:
            continue

        pct_box = {
            "x": round(float(n_box.get("x", 0)) / vw * 100, 1),
            "y": round(float(n_box.get("y", 0)) / vh * 100, 1),
            "w": round(px_w / vw * 100, 1),
            "h": round(px_h / vh * 100, 1),
        }

        region = "main"
        if pct_box["x"] < 20 and pct_box["w"] < 25:
            region = "sidebar"
        elif pct_box["y"] < 12:
            region = "header"

        dom_props: dict[str, Any] = {"node_id": nid, "text": clean_text}
        if node.get("style"):
            dom_props["style"] = _redact_layout_value(node["style"])
        if node.get("icon"):
            dom_props["icon"] = _redact_layout_value(node["icon"])

        text_comp = {
            "region": region,
            "component_type": "text",
            "label": clean_text,
            "source": "dom",
            "order_index": start_order + added_text_count,
            "props": {
                "box": pct_box,
                "dom": dom_props,
                "label_source": "dom",
            },
        }

        matched_components.append(text_comp)
        used_node_ids.add(nid)
        added_text_count += 1

    return matched_components


def _extract_visual_theme(visual: dict[str, Any]) -> dict[str, Any]:
    """Ekstraksi tema visual sederhana dari struktur DOM (maksimal 2 KB).
    
    Menghasilkan:
    - page: {backgroundColor, fontFamily}
    - card: {box, backgroundColor, borderColor, borderWidth, borderRadius, boxShadow, padding}
      (kartu terbesar yang memuat input/tombol)
    - primary: {backgroundColor, color, borderRadius, fontWeight}
      (dari tombol submit / CTA utama)
    - text: {color, fontSize, fontWeight} untuk heading dan body
    """
    if not isinstance(visual, dict):
        return {}

    theme: dict[str, Any] = {}

    # 1. Page level styling
    page_style = visual.get("page")
    if isinstance(page_style, dict):
        page_theme: dict[str, Any] = {}
        if page_style.get("backgroundColor"):
            page_theme["backgroundColor"] = str(page_style["backgroundColor"])
        if page_style.get("fontFamily"):
            page_theme["fontFamily"] = str(page_style["fontFamily"])
        if page_theme:
            theme["page"] = page_theme

    nodes = visual.get("nodes")
    if not isinstance(nodes, list):
        return theme

    # Cari primary button (submit atau button CTA)
    primary_btn_node: dict[str, Any] | None = None
    for n in nodes:
        if not isinstance(n, dict):
            continue
        tag = (n.get("tag") or "").lower().strip()
        itype = (n.get("inputType") or "").lower().strip()
        is_btn = tag == "button" or (tag == "input" and itype in ("submit", "button"))
        if is_btn:
            style = n.get("style") or {}
            bg = style.get("backgroundColor", "")
            # Prefer button yang memiliki background warna (bukan transparan) atau submit
            if itype == "submit" or "rgb(0, 0, 0)" in bg or (bg and bg != "rgba(0, 0, 0, 0)" and bg != "transparent"):
                primary_btn_node = n
                if itype == "submit":
                    break

    if primary_btn_node is not None:
        style = primary_btn_node.get("style") or {}
        btn_theme: dict[str, Any] = {}
        for key in ("backgroundColor", "color", "borderRadius", "fontWeight"):
            if style.get(key):
                btn_theme[key] = str(style[key])
        if btn_theme:
            theme["primary"] = btn_theme

    # Cari heading dan body text node
    heading_node: dict[str, Any] | None = None
    body_node: dict[str, Any] | None = None
    for n in nodes:
        if not isinstance(n, dict):
            continue
        tag = (n.get("tag") or "").lower().strip()
        if heading_node is None and tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            heading_node = n
        if body_node is None and tag in ("p", "span") and n.get("text"):
            body_node = n
        if heading_node and body_node:
            break

    text_theme: dict[str, Any] = {}
    if heading_node is not None:
        h_style = heading_node.get("style") or {}
        h_theme = {
            k: str(h_style[k])
            for k in ("color", "fontSize", "fontWeight")
            if h_style.get(k)
        }
        if h_theme:
            text_theme["heading"] = h_theme

    if body_node is not None:
        b_style = body_node.get("style") or {}
        b_theme = {
            k: str(b_style[k])
            for k in ("color", "fontSize", "fontWeight")
            if b_style.get(k)
        }
        if b_theme:
            text_theme["body"] = b_theme

    if text_theme:
        theme["text"] = text_theme

    # Cari card: elemen container (div/section/form/main) terbesar yang memuat input/button
    input_or_btn_node_ids = set()
    for n in nodes:
        if isinstance(n, dict):
            tag = (n.get("tag") or "").lower().strip()
            if tag in ("input", "button", "textarea", "select"):
                input_or_btn_node_ids.add(n.get("id"))

    # Map parent hierarchy
    node_by_id = {n.get("id"): n for n in nodes if isinstance(n, dict) and n.get("id")}
    card_candidates: dict[str, int] = {}
    for iid in input_or_btn_node_ids:
        cur = node_by_id.get(iid)
        while cur and cur.get("parent"):
            pid = cur.get("parent")
            parent_node = node_by_id.get(pid)
            if not parent_node:
                break
            ptag = (parent_node.get("tag") or "").lower().strip()
            if ptag in ("div", "section", "form", "main", "article"):
                card_candidates[pid] = card_candidates.get(pid, 0) + 1
            cur = parent_node

    best_card: dict[str, Any] | None = None
    best_card_area: float = 0.0
    for cid, count in card_candidates.items():
        if count >= 1:
            c_node = node_by_id.get(cid)
            if c_node:
                c_box = c_node.get("box") or {}
                area = float(c_box.get("w", 0)) * float(c_box.get("h", 0))
                c_style = c_node.get("style") or {}
                has_styling = bool(
                    c_style.get("borderRadius")
                    or c_style.get("boxShadow")
                    or (c_style.get("borderWidth") and c_style.get("borderWidth") != "0px")
                )
                if has_styling and area > best_card_area:
                    best_card_area = area
                    best_card = c_node

    if best_card is not None:
        c_style = best_card.get("style") or {}
        card_theme: dict[str, Any] = {}
        if best_card.get("box"):
            card_theme["box"] = best_card["box"]
        for key in (
            "backgroundColor",
            "borderColor",
            "borderWidth",
            "borderRadius",
            "boxShadow",
            "padding",
        ):
            if c_style.get(key):
                card_theme[key] = str(c_style[key])
        if card_theme:
            theme["card"] = card_theme

    redacted_theme = _redact_layout_value(theme)
    if not isinstance(redacted_theme, dict):
        return {}
    if _json_size_bytes(redacted_theme) > 2048:
        redacted_theme.pop("card", None)
    return redacted_theme


def store_analysis(
    db: Session,
    screen: Screen,
    analysis: Analysis,
    code: str,
    *,
    actor_id: int | None,
    replace: bool = True,
) -> Reconstruction:
    """Simpan hasil analisis sebagai draf rekonstruksi.

    Satu screen hanya punya SATU draf.
    Analisis ulang HANYA mengganti baris source='ai-vision'.
    Baris manual dibiarkan apa adanya (tanpa dihapus dan dibuat ulang),
    lalu di-merge dengan overrides dan tombstones.
    """
    existing = db.scalar(
        select(Reconstruction).where(Reconstruction.screen_id == screen.id)
    )
    if existing is not None and not replace:
        return existing

    existing_layout_raw = (existing.layout or {}) if existing is not None else {}
    existing_layout_value = _sanitize_result_value(existing_layout_raw)
    existing_layout = (
        dict(existing_layout_value) if isinstance(existing_layout_value, dict) else {}
    )
    if isinstance(existing_layout_raw, dict) and isinstance(existing_layout_raw.get("regions"), dict):
        existing_layout["regions"] = _redact_layout_value(existing_layout_raw["regions"])

    new_layout_raw = analysis.layout or {}
    new_layout_value = _sanitize_result_value(new_layout_raw)
    new_layout = dict(new_layout_value) if isinstance(new_layout_value, dict) else {}
    if isinstance(new_layout_raw, dict) and isinstance(new_layout_raw.get("regions"), dict):
        new_layout["regions"] = _redact_layout_value(new_layout_raw["regions"])
    if "tombstones" in existing_layout and "tombstones" not in new_layout:
        new_layout["tombstones"] = existing_layout["tombstones"]
    if "overrides" in existing_layout and "overrides" not in new_layout:
        new_layout["overrides"] = existing_layout["overrides"]

    # Berlakukan batas 200 KB sebagai kontrak penyimpanan, bukan hanya kontrak
    # di jalur analyze_with_ai. Analysis yang dibuat di service lain ikut aman.
    # Allowlist/DLP di sini juga melindungi caller yang tidak melalui analyze_with_ai.
    if analysis.ai_result is not None:
        if isinstance(analysis.ai_result, dict):
            safe_result = _sanitize_ai_result(analysis.ai_result)
            stored_result, was_truncated = _trim_ai_result_to_limit(safe_result)
            analysis.ai_result = stored_result
            # analyze_with_ai() mungkin sudah memangkas payload. Saat storage
            # dipanggil lagi, hasil yang sudah muat tidak boleh menghapus flag
            # truncation yang benar.
            analysis.ai_result_truncated = analysis.ai_result_truncated or was_truncated
            analysis.ai_result_size_bytes = _json_size_bytes(stored_result)
        else:
            analysis.ai_result = None
            analysis.ai_result_truncated = False
            analysis.ai_result_size_bytes = 0

    analysis.ai_error = _redact_sensitive_text(analysis.ai_error)
    new_layout["ai_status"] = analysis.ai_status
    new_layout["ai_model"] = analysis.ai_model
    new_layout["ai_error"] = analysis.ai_error
    new_layout["ai_source"] = analysis.source
    new_layout["ai_analyzed_at"] = analysis.ai_analyzed_at
    if analysis.ai_result is not None:
        new_layout["ai_result"] = analysis.ai_result
        new_layout["ai_result_truncated"] = analysis.ai_result_truncated
        new_layout["ai_result_size_bytes"] = analysis.ai_result_size_bytes
    else:
        new_layout.pop("ai_result", None)
        new_layout.pop("ai_result_truncated", None)
        new_layout.pop("ai_result_size_bytes", None)

    screen_structure = screen.structure if isinstance(screen.structure, dict) else {}
    if "visual" in screen_structure and isinstance(screen_structure["visual"], dict):
        analysis.components = _match_visual_nodes(analysis.components, screen_structure["visual"])
        extracted_theme = _extract_visual_theme(screen_structure["visual"])
        if extracted_theme:
            new_layout["theme"] = extracted_theme

    generated_by = _generated_by_for_source(analysis.source)
    if existing is not None:
        reconstruction = existing
        reconstruction.status = "draft"
        reconstruction.layout = dict(new_layout)
        reconstruction.code_text = code
        reconstruction.generated_by = generated_by
        reconstruction.reviewed_by = None
        reconstruction.reviewed_at = None

        # HAPUS HANYA komponen AI/non-manual; komponen manual dipertahankan utuh
        ai_components_to_remove = [
            c
            for c in reconstruction.components
            if c.source != "manual" and c.region != "manual"
        ]
        for c in ai_components_to_remove:
            reconstruction.components.remove(c)
        reconstruction.assumptions.clear()
        db.flush()
    else:
        reconstruction = Reconstruction(
            screen_id=screen.id,
            project_id=screen.project_id,
            status="draft",
            layout=dict(new_layout),
            code_text=code,
            generated_by=generated_by,
            created_by=actor_id,
        )
        db.add(reconstruction)
        db.flush()

    tombstones = set(str(t) for t in new_layout.get("tombstones", []))
    overrides = new_layout.get("overrides", {})

    existing_manual = [
        c
        for c in reconstruction.components
        if c.region == "manual" or c.source == "manual"
    ]

    safe_analysis_components = [
        _sanitize_result_component(component)
        for component in analysis.components
        if isinstance(component, dict)
    ]
    for component in safe_analysis_components:
        if component.get("source") == "manual" or component.get("region") == "manual":
            continue

        raw_props = component.get("props") or {}
        raw_box = raw_props.get("box")
        comp_label = component.get("label") or ""
        comp_type = component.get("component_type")
        # Komponen tanpa tipe yang valid harus tetap ditolak oleh filter
        # generator. Jangan mengubahnya menjadi "button" karena itu akan
        # mengubah admission generator secara diam-diam.
        if not isinstance(comp_type, str) or not comp_type.strip():
            continue

        # Check tombstone
        bx = round(float(raw_box.get("x", 0))) if raw_box else 0
        by = round(float(raw_box.get("y", 0))) if raw_box else 0
        stable_id = f"ai_{comp_type}_{comp_label}_{bx}_{by}"
        if comp_label in tombstones or stable_id in tombstones:
            continue

        # Check collide with existing manual component
        if raw_box:
            collides_manual = False
            for m in existing_manual:
                m_box = (m.props or {}).get("box") if m.props else None
                if m_box and _component_box_iou(raw_box, m_box) > 0.7:
                    collides_manual = True
                    break
            if collides_manual:
                continue

            # Check collide with newly added AI components
            collides_ai = False
            for ex_c in reconstruction.components:
                ex_box = (ex_c.props or {}).get("box") if ex_c.props else None
                if (
                    ex_box
                    and _component_box_iou(raw_box, ex_box) > 0.7
                    and (ex_c.label == comp_label or not comp_label)
                ):
                    collides_ai = True
                    break
            if collides_ai:
                continue

        # Check override
        override = overrides.get(stable_id) or overrides.get(comp_label)
        final_props = dict(raw_props)
        final_label = comp_label
        if override:
            if "x" in override and raw_box:
                final_props["box"] = {
                    "x": override["x"],
                    "y": override["y"],
                    "w": override["w"],
                    "h": override["h"],
                }
            if "label" in override:
                final_label = override["label"]

        db.add(
            ReconstructionComponent(
                reconstruction_id=reconstruction.id,
                region=component.get("region") or "main",
                component_type=comp_type,
                label=final_label,
                props=final_props,
                order_index=component.get("order_index", 0),
                source=component.get("source", "ai-vision"),
            )
        )

    safe_analysis_assumptions = [
        _sanitize_result_assumption(assumption)
        for assumption in analysis.assumptions
        if isinstance(assumption, dict)
    ]
    for assumption in safe_analysis_assumptions:
        db.add(
            ReconstructionAssumption(
                reconstruction_id=reconstruction.id,
                topic=assumption.get("topic") or "Umum",
                description=assumption.get("description") or "",
                confidence=assumption.get("confidence", "medium"),
            )
        )

    db.flush()

    try:
        from app.services.simulation import sync_simulation_hotspots_for_screen

        sync_simulation_hotspots_for_screen(db, screen.id)
    except Exception:
        pass

    return reconstruction


# ============================================================
# AI VISION ANALYSIS (Google Gemini)
# ============================================================

VISION_SYSTEM_PROMPT = """Anda adalah AI vision untuk NigmaSim - platform simulasi aplikasi.
Tugas: Analisis screenshot aplikasi web SECARA MENYELURUH. Deteksi SEMUA elemen interaktif yang terlihat.

OUTPUT FORMAT (JSON only, no markdown):
{
  "components": [
    {
      "region": "header|sidebar|main|footer",
      "component_type": "button|link|input|select|textarea|heading|table|card|image|nav-item|header-item|field|form|icon|logo|dropdown",
      "label": "string (deskriptif, bahasa Indonesia, mis: 'Tombol Buy Now', 'Menu HOME', 'Field Email', 'Kartu Fitur HDMI')",
      "confidence": 0.0,
      "props": {
        "box": {"x": number, "y": number, "w": number, "h": number},
        "input_type": "text|email|password|number|select",
        "level": 1,
        "headers": ["col1"],
        "row_count": 0,
        "column_count": 0
      },
      "source": "ai-vision"
    }
  ],
  "assumptions": [
    {
      "topic": "Layout|Komponen|Form|Warna & tipografi|Aturan bisnis",
      "description": "string (bahasa Indonesia)",
      "confidence": "high|medium|low"
    }
  ],
  "layout": {
    "regions": {
      "sidebar": {"x": 0, "y": 0, "w": number, "h": number} | null,
      "header": {"x": 0, "y": 0, "w": number, "h": number} | null,
      "main": {"x": number, "y": number, "w": number, "h": number}
    },
    "has_sidebar": false,
    "has_header": false
  }
}

WAJIB DETEKSI (jangan lewatkan):
- Semua tombol (button, CTA, submit, icon-button)
- Semua link navigasi (menu, breadcrumb, tab, sidebar link)
- Semua input field (text, email, password, number, search bar)
- Semua dropdown / select / combobox
- Logo dan ikon yang bisa diklik
- Kartu (card) yang bisa diklik
- Gambar yang bisa diklik (banner, thumbnail)
- Tabel dan area datanya
- Heading/judul utama dan sub-judul

ATURAN KOORDINAT:
- Box dalam PERSEN (0-100) terhadap DIMENSI SCREENSHOT ASLI
- x, y = pojok kiri atas elemen (%)
- w, h = lebar dan tinggi elemen (%)
- WAJIB: semua nilai di-clamp antara 0 dan 100
- Buang elemen yang w < 0.5% atau h < 0.3% (terlalu kecil)
- Buang kotak yang membungkus seluruh halaman (w > 95% DAN h > 90%) kecuali memang container penting

LABEL (wajib deskriptif):
- Gunakan teks yang terlihat di elemen jika ada
- Tambahkan konteks: "Tombol Simpan", "Menu Dashboard", "Field Password", "Kartu Total Penjualan"
- Jangan pakai label generik seperti "Button", "Div", "Element"

CONFIDENCE (wajib):
- Beri confidence per komponen berupa angka desimal 0.0 sampai 1.0
- Gunakan nilai closer ke 1.0 bila teks dan posisi elemen terlihat jelas

HINDARI DUPLIKAT:
- Jangan buat dua kotak untuk elemen yang sama persis
- Jika dua elemen hampir identik posisinya (IoU > 0.6), pilih yang lebih akurat

REGION:
- header: elemen di area atas halaman (navigation bar, logo, search global)
- sidebar: elemen di panel kiri/kanan (navigation menu, filter panel)
- footer: elemen di area bawah halaman
- main: semua elemen di area konten utama

Output HANYA JSON valid tanpa markdown code block.
"""


def _image_mime_type(suffix: str) -> str:
    """Tebak MIME type gambar dari ekstensi file screenshot."""
    suffix = (suffix or "").lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".gif":
        return "image/gif"
    return "image/png"


# Model yang baru saja gagal (timeout/503/429) dilewati sementara supaya
# analisis berikutnya tidak menunggu model yang sedang down.
# NOTE: Cooldown dihapus, diganti dengan backoff per-request di bawah.


def _parse_retry_after(header: str | None) -> float | None:
    """Parse Retry-After header (seconds or HTTP-date). Return seconds to wait."""
    if not header:
        return None
    header = header.strip()
    # Try integer seconds
    try:
        return float(header)
    except ValueError:
        pass
    # Try HTTP-date
    try:
        import email.utils
        retry_date = email.utils.parsedate_to_datetime(header)
        if retry_date:
            import datetime
            delta = retry_date - datetime.datetime.now(datetime.timezone.utc)
            return max(0.0, delta.total_seconds())
    except Exception:
        pass
    return None


async def analyze_with_ai(screen: Screen, existing_analysis: Analysis) -> Analysis:
    """Kirim screenshot ke Gemini vision model, merge hasil ke existing analysis."""
    # Jalankan baru selalu dimulai tanpa hasil/error lama. Hasil parsial hanya
    # boleh dipertahankan bila seluruh respons AI berhasil di-parse.
    existing_analysis.ai_result = None
    existing_analysis.ai_result_truncated = False
    existing_analysis.ai_result_size_bytes = 0
    existing_analysis.ai_error = ""

    if not settings.gemini_api_key:
        if settings.app_env == "test":
            # Runtime validation (pengaman): tolak model di luar daftar izin
            allowed = set(ALLOWED_GEMINI_MODELS)
            primary_model = settings.gemini_model
            if primary_model not in allowed:
                error_msg = f"Model tidak diizinkan (runtime): {primary_model}. Pilihan: {', '.join(allowed)}."
                logger.error(error_msg)
                existing_analysis.ai_model = primary_model
                _mark_ai_failure(existing_analysis, error_msg)
                return existing_analysis
            # Validasi model cadangan mentah (termasuk yang difilter oleh gemini_model_chain)
            raw_fallback_models: list[str] = []
            if settings.gemini_allow_fallback and settings.gemini_fallback_models.strip():
                for item in settings.gemini_fallback_models.split(","):
                    name = item.strip()
                    if name:
                        raw_fallback_models.append(name)
            for model in raw_fallback_models:
                if model not in allowed:
                    error_msg = f"Model cadangan tidak diizinkan (runtime): {model}. Pilihan: {', '.join(allowed)}."
                    logger.error(error_msg)
                    existing_analysis.ai_model = primary_model
                    _mark_ai_failure(existing_analysis, error_msg)
                    return existing_analysis
                if model == primary_model:
                    error_msg = f"Model cadangan ({model}) tidak boleh sama dengan model utama ({primary_model})."
                    logger.error(error_msg)
                    existing_analysis.ai_model = primary_model
                    _mark_ai_failure(existing_analysis, error_msg)
                    return existing_analysis
            # Mock AI vision output untuk lingkungan test
            existing_analysis.ai_model = "mock-vision-test"
            existing_analysis.ai_status = "success"
            existing_analysis.source = "hybrid"
            existing_analysis.ai_analyzed_at = datetime.now(timezone.utc).isoformat()
            existing_analysis.layout["has_sidebar"] = True
            existing_analysis.layout["regions"] = {
                "sidebar": {"x": 0, "y": 0, "w": 200, "h": 900, "item_count": 4},
                "header": None,
                "main": {"x": 200, "y": 0, "w": 1240, "h": 900},
            }
            mock_components = [
                {
                    "region": "sidebar",
                    "component_type": "nav-item",
                    "label": "Menu 0",
                    "props": {"box": {"x": 1.4, "y": 13.3, "w": 11.1, "h": 3.1}},
                    "source": "ai-vision",
                },
                {
                    "region": "main",
                    "component_type": "table",
                    "label": "Risiko Terakhir",
                    "props": {
                        "box": {"x": 20.8, "y": 44.4, "w": 62.5, "h": 33.3},
                        "headers": ["ID Risiko", "Judul", "Tingkat"],
                    },
                    "source": "ai-vision",
                },
                {
                    "region": "main",
                    "component_type": "field",
                    "label": "Cari risiko",
                    "props": {"box": {"x": 22.2, "y": 37.8, "w": 16.7, "h": 3.6}},
                    "source": "ai-vision",
                },
                {
                    "region": "main",
                    "component_type": "card",
                    "label": "Risiko Tinggi",
                    "props": {"box": {"x": 20.8, "y": 13.3, "w": 13.9, "h": 10.0}},
                    "source": "ai-vision",
                },
            ]
            existing_analysis.components.extend(mock_components)
            existing_analysis.assumptions = [
                {"topic": "Layout", "description": "Sidebar terdeteksi dari navigasi visual", "confidence": "medium"},
                {"topic": "Komponen", "description": "Tabel dan kartu terdeteksi", "confidence": "medium"},
                {"topic": "Aturan bisnis", "description": "Aturan bisnis tidak bisa dibaca dari visual", "confidence": "low"},
            ]
            mock_ai_result = {
                "components": mock_components,
                "assumptions": existing_analysis.assumptions,
                "layout": {
                    "regions": existing_analysis.layout.get("regions", {}),
                    "has_sidebar": True,
                    "has_header": False,
                },
            }
            existing_analysis.ai_result = mock_ai_result
            existing_analysis.ai_result_size_bytes = _json_size_bytes(mock_ai_result)
            return existing_analysis
        logger.warning("GEMINI_API_KEY tidak dikonfigurasi, skip AI vision")
        existing_analysis.ai_status = "not_configured"
        existing_analysis.ai_error = "GEMINI_API_KEY tidak dikonfigurasi di .env"
        existing_analysis.ai_analyzed_at = datetime.now(timezone.utc).isoformat()
        existing_analysis.source = "rule-engine"
        return existing_analysis

    # Baca screenshot (path relatif terhadap storage root)
    screenshot_full_path = settings.storage_path / (screen.screenshot_path or "")
    try:
        image_bytes = screenshot_full_path.read_bytes()
    except Exception as e:
        logger.error("Gagal baca screenshot %s: %s", screenshot_full_path, e)
        existing_analysis.ai_model = settings.gemini_model
        _mark_ai_failure(existing_analysis, f"Gagal membaca screenshot: {e}")
        return existing_analysis
    img_b64 = base64.b64encode(image_bytes).decode()
    mime_type = _image_mime_type(screenshot_full_path.suffix)

    # Build prompt with context
    structure = screen.structure if isinstance(screen.structure, dict) else {}
    viewport = structure.get("viewport", {"width": 1440, "height": 900})
    existing_count = len(existing_analysis.components)

    prompt = f"""Analisis screenshot aplikasi web ini secara MENYELURUH.

KONTEKS:
- URL: {screen.source_url or 'unknown'}
- Viewport: {viewport.get('width')}x{viewport.get('height')}
- Komponen existing dari analisis sebelumnya: {existing_count}

TUGAS: Deteksi SEMUA elemen interaktif yang terlihat di screenshot ini.
Prioritas: tombol, link navigasi, input, dropdown, logo yang bisa diklik, kartu, gambar interaktif, tabel.
Hindari duplikat dengan {existing_count} komponen yang sudah ada.

Output HANYA JSON valid sesuai format di system prompt."""

    try:
        payload = {
            "systemInstruction": {"parts": [{"text": VISION_SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": mime_type, "data": img_b64}},
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 16384,
                "responseMimeType": "application/json",
            },
        }

        primary_model = settings.gemini_primary_model
        # Validasi model cadangan MENTAH (sebelum difilter oleh gemini_model_chain)
        # untuk memastikan model tidak valid ditolak eksplisit, bukan diam-diam diabaikan.
        raw_fallback_models: list[str] = []
        if settings.gemini_allow_fallback and settings.gemini_fallback_models.strip():
            for item in settings.gemini_fallback_models.split(","):
                name = item.strip()
                if name:
                    raw_fallback_models.append(name)
        fallback_models = [m for m in settings.gemini_model_chain if m != primary_model]
        max_retries = max(0, settings.gemini_max_retries)
        base_delay = settings.gemini_retry_base_delay
        max_delay = settings.gemini_retry_max_delay

        # Runtime validation (pengaman kedua): tolak model di luar daftar izin
        allowed = set(ALLOWED_GEMINI_MODELS)
        if primary_model not in allowed:
            error_msg = f"Model tidak diizinkan (runtime): {primary_model}. Pilihan: {', '.join(allowed)}."
            logger.error(error_msg)
            existing_analysis.ai_model = primary_model
            _mark_ai_failure(existing_analysis, error_msg)
            return existing_analysis
        # Validasi model cadangan mentah (termasuk yang difilter oleh gemini_model_chain)
        for model in raw_fallback_models:
            if model not in allowed:
                error_msg = f"Model cadangan tidak diizinkan (runtime): {model}. Pilihan: {', '.join(allowed)}."
                logger.error(error_msg)
                existing_analysis.ai_model = primary_model
                _mark_ai_failure(existing_analysis, error_msg)
                return existing_analysis
            if model == primary_model:
                error_msg = f"Model cadangan ({model}) tidak boleh sama dengan model utama ({primary_model})."
                logger.error(error_msg)
                existing_analysis.ai_model = primary_model
                _mark_ai_failure(existing_analysis, error_msg)
                return existing_analysis

        data = None
        used_model = ""
        last_error: tuple[int, str] | None = None

        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
            # Coba model utama dengan retry
            for attempt in range(max_retries + 1):
                try:
                    resp = await client.post(
                        f"{settings.gemini_base_url}/models/{primary_model}:generateContent",
                        headers={
                            "x-goog-api-key": settings.gemini_api_key,
                            "Content-Type": "application/json",
                        },
                        json=payload,
                        timeout=httpx.Timeout(90.0, connect=15.0),
                    )
                except httpx.TimeoutException as e:
                    last_error = (408, _redact_sensitive_text(f"Timeout: {e}"))
                    if attempt < max_retries:
                        delay = min(base_delay * (3 ** attempt), max_delay)
                        logger.warning(
                            "Gemini %s timeout (percobaan %d/%d), retry dalam %.0fs",
                            primary_model, attempt + 1, max_retries + 1, delay
                        )
                        await asyncio.sleep(delay)
                        continue
                    break

                if resp.status_code == 404:
                    # Model tidak ditemukan - jangan retry, error langsung
                    error_detail = _redact_sensitive_text(resp.text[:500])
                    logger.error("Gemini model '%s' tidak ditemukan (404): %s", primary_model, error_detail)
                    error_msg = (
                        f"Model tidak ditemukan: {primary_model}. "
                        f"Cek GEMINI_MODEL di .env. Detail: {error_detail}"
                    )
                    existing_analysis.ai_model = primary_model
                    _mark_ai_failure(existing_analysis, error_msg)
                    return existing_analysis

                if resp.status_code in (429, 503):
                    # Rate limit / service unavailable - retry dengan backoff
                    retry_after = _parse_retry_after(resp.headers.get("Retry-After"))
                    last_error = (
                        resp.status_code,
                        _redact_sensitive_text(resp.text[:500]),
                    )
                    if attempt < max_retries:
                        delay = retry_after if retry_after is not None else min(base_delay * (3 ** attempt), max_delay)
                        logger.warning(
                            "Gemini %s error %s (percobaan %d/%d), retry dalam %.0fs",
                            primary_model, resp.status_code, attempt + 1, max_retries + 1, delay
                        )
                        await asyncio.sleep(delay)
                        continue
                    # Sudah habis retry
                    break

                if resp.status_code >= 400:
                    # Error lain - tidak retry, error langsung
                    safe_error = _redact_sensitive_text(resp.text[:800])
                    logger.error(
                        "Gemini error %s pada %s: %s", resp.status_code, primary_model, safe_error
                    )
                    error_msg = f"Gemini error {resp.status_code}: {safe_error[:200]}"
                    existing_analysis.ai_model = primary_model
                    _mark_ai_failure(existing_analysis, error_msg)
                    return existing_analysis

                # Sukses
                data = resp.json()
                used_model = primary_model
                break

            # Fallback models (hanya jika diaktifkan)
            if data is None and settings.gemini_allow_fallback and fallback_models:
                for model in fallback_models:
                    try:
                        resp = await client.post(
                            f"{settings.gemini_base_url}/models/{model}:generateContent",
                            headers={
                                "x-goog-api-key": settings.gemini_api_key,
                                "Content-Type": "application/json",
                            },
                            json=payload,
                            timeout=httpx.Timeout(90.0, connect=15.0),
                        )
                    except httpx.TimeoutException:
                        logger.warning("Gemini fallback %s timeout, coba model berikutnya", model)
                        continue

                    if resp.status_code in (404, 429, 503):
                        logger.warning(
                            "Gemini fallback %s tidak tersedia (HTTP %s), coba model berikutnya",
                            model, resp.status_code
                        )
                        continue
                    if resp.status_code >= 400:
                        logger.error(
                            "Gemini fallback error %s pada %s: %s",
                            resp.status_code,
                            model,
                            _redact_sensitive_text(resp.text[:800]),
                        )
                        continue

                    data = resp.json()
                    used_model = model
                    break

        if data is None:
            # Semua percobaan gagal
            if last_error:
                status_code, error_text = last_error
                if status_code == 408:
                    error_msg = f"Timeout setelah {max_retries + 1} percobaan pada model {primary_model}"
                elif status_code in (429, 503):
                    error_msg = f"Model {primary_model} error {status_code} (rate limit/service unavailable) setelah {max_retries + 1} percobaan. Saran: tunggu sebentar, cek kuota/API key, atau aktifkan fallback dengan GEMINI_ALLOW_FALLBACK=true."
                else:
                    error_msg = f"Model {primary_model} error {status_code}: {error_text}"
            else:
                error_msg = f"Semua model gagal (primary: {primary_model}, fallback: {fallback_models})"

            logger.error("Gemini analisis gagal: %s", error_msg)
            existing_analysis.ai_model = primary_model
            _mark_ai_failure(existing_analysis, error_msg)
            return existing_analysis

        existing_analysis.ai_model = used_model
        existing_analysis.ai_status = "success"
        # Set source: hybrid jika model utama, "fallback" jika model cadangan
        if used_model != primary_model:
            existing_analysis.source = "fallback"
        else:
            existing_analysis.source = "hybrid"

        candidates = data.get("candidates") or []
        if not candidates:
            feedback = data.get("promptFeedback") or {}
            logger.error(
                "Gemini tidak mengembalikan kandidat (blockReason=%s)",
                feedback.get("blockReason"),
            )
            _mark_ai_failure(existing_analysis, "Gemini tidak mengembalikan kandidat")
            return existing_analysis

        candidate = candidates[0]
        parts = (candidate.get("content") or {}).get("parts") or []
        # Abaikan part "thinking" bila model mengembalikannya.
        content = "".join(p.get("text", "") for p in parts if not p.get("thought"))

        if candidate.get("finishReason") == "MAX_TOKENS":
            logger.warning("Gemini berhenti karena MAX_TOKENS, JSON mungkin terpotong")
        if not content.strip():
            logger.error(
                "Gemini mengembalikan konten kosong (finishReason=%s)",
                candidate.get("finishReason"),
            )
            _mark_ai_failure(existing_analysis, "Gemini mengembalikan konten kosong")
            return existing_analysis

        # Parse JSON dari response (responseMimeType=application/json seharusnya valid)
        def parse_json_robust(text: str):
            """Parse JSON dengan handling untuk JSON yang terpotong/tertulis."""
            # Try direct parse first
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
            
            # Try extracting from markdown code block
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
            
            # Try to fix truncated JSON
            # Count open/close braces and brackets
            text = text.strip()
            if text.startswith('{') or text.startswith('['):
                # Count braces
                open_braces = text.count('{')
                close_braces = text.count('}')
                open_brackets = text.count('[')
                close_brackets = text.count(']')
                
                # Try to close open strings first
                # Find unclosed strings
                in_string = False
                escape = False
                for i, ch in enumerate(text):
                    if escape:
                        escape = False
                        continue
                    if ch == '\\':
                        escape = True
                    elif ch == '"' and not escape:
                        in_string = not in_string
                
                # If we're in an unclosed string, try to close it at the last valid position
                if in_string:
                    # Try adding closing quote and then braces
                    text = text + '"'
                
                # Add missing closing braces/brackets
                while close_braces < open_braces:
                    text += '}'
                    close_braces += 1
                while close_brackets < open_brackets:
                    text += ']'
                    close_brackets += 1
                
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    pass
            
            # Last resort: find the largest valid JSON substring
            import re as re_module
            # Try to find complete JSON objects
            for match in re_module.finditer(r'\{.*\}', text, re_module.DOTALL):
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    continue
            
            raise json.JSONDecodeError("Unable to parse JSON", text, 0)
        
        try:
            ai_result = parse_json_robust(content)
        except json.JSONDecodeError as e:
            logger.error(
                "Gagal parse JSON dari AI: %s (panjang respons: %d karakter)",
                e,
                len(content),
            )
            _mark_ai_failure(existing_analysis, "Format JSON hasil AI Vision tidak valid")
            return existing_analysis

        if not isinstance(ai_result, dict):
            logger.error("Hasil AI bukan objek JSON: %s", type(ai_result).__name__)
            _mark_ai_failure(existing_analysis, "Format hasil AI Vision tidak valid")
            return existing_analysis

        # Simpan hanya objek hasil parse Gemini yang lolos allowlist/DLP.
        # Payload request (termasuk header API dan gambar base64) tidak pernah
        # masuk ke storage; field sensitif pada output pun disamarkan.
        safe_ai_result = _sanitize_ai_result(ai_result)
        stored_ai_result, was_truncated = _trim_ai_result_to_limit(safe_ai_result)
        existing_analysis.ai_result = stored_ai_result
        existing_analysis.ai_result_truncated = was_truncated
        existing_analysis.ai_result_size_bytes = _json_size_bytes(stored_ai_result)
        existing_analysis.ai_analyzed_at = datetime.now(timezone.utc).isoformat()

        # Merge AI components (dedup by box IoU)
        raw_components = safe_ai_result.get("components", [])
        ai_components = (
            [component for component in raw_components if isinstance(component, dict)]
            if isinstance(raw_components, list)
            else []
        )
        merged = _merge_components(existing_analysis.components, ai_components, viewport)
        existing_analysis.components = merged
        structure = screen.structure if isinstance(screen.structure, dict) else {}
        if "visual" in structure:
            existing_analysis.components = _match_visual_nodes(existing_analysis.components, structure["visual"])
            theme = _extract_visual_theme(structure["visual"])
            if theme and isinstance(existing_analysis.layout, dict):
                existing_analysis.layout["theme"] = theme

        # Merge AI assumptions (avoid duplicates)
        raw_assumptions = safe_ai_result.get("assumptions", [])
        ai_assumptions = (
            [assumption for assumption in raw_assumptions if isinstance(assumption, dict)]
            if isinstance(raw_assumptions, list)
            else []
        )
        existing_topics = {(a["topic"], a["description"][:50]) for a in existing_analysis.assumptions}
        for a in ai_assumptions:
            key = (a.get("topic", ""), a.get("description", "")[:50])
            if key not in existing_topics:
                existing_analysis.assumptions.append(a)
                existing_topics.add(key)

        # Layout: ambil flag struktur dari AI, regions tetap dari analisis
        # deterministik (satuannya piksel, sedangkan AI mengirim persen).
        ai_layout = safe_ai_result.get("layout")
        if isinstance(ai_layout, dict):
            for key in ("has_sidebar", "has_header"):
                if key in ai_layout:
                    existing_analysis.layout[key] = ai_layout[key]

        # Blueprint "Draf struktur" digambar dari komponen final (detected + AI),
        # supaya panel menampilkan hasil analisis AI yang sebenarnya.
        vw = int(viewport.get("width") or 1440)
        vh = int(viewport.get("height") or 900)
        boxed: list[dict[str, Any]] = []
        for component in existing_analysis.components:
            box = (component.get("props") or {}).get("box")
            if not box:
                continue
            if component.get("source") == "ai-vision":
                box = _pct_box_to_px(box, vw, vh)
            boxed.append(
                {
                    "type": component.get("component_type"),
                    "label": component.get("label"),
                    "box": box,
                }
            )
        existing_analysis.layout = {
            **existing_analysis.layout,
            "sections": _build_sections(boxed, {"width": vw, "height": vh}),
        }

        logger.info(
            "AI vision analysis via %s: +%d components, +%d assumptions; stored=%d bytes%s",
            used_model,
            len(ai_components),
            len(ai_assumptions),
            existing_analysis.ai_result_size_bytes,
            " (truncated)" if existing_analysis.ai_result_truncated else "",
        )

    except Exception as e:
        logger.exception("AI vision analysis gagal: %s", _redact_sensitive_text(e))
        _mark_ai_failure(existing_analysis, str(e))

    return existing_analysis


def _merge_components(
    existing: list[dict],
    ai_new: list[dict],
    viewport: dict[str, Any] | None = None,
) -> list[dict]:
    """Merge AI components, avoid duplicates by box IoU > 0.7.

    Box hasil AI dalam persen, sedangkan komponen deterministik dalam piksel.
    Keduanya dinormalisasi ke piksel dulu sebelum dibandingkan.
    """
    vw = int((viewport or {}).get("width") or 1440)
    vh = int((viewport or {}).get("height") or 900)

    def iou(box1: dict, box2: dict) -> float:
        if not box1 or not box2:
            return 0.0
        x1 = max(box1["x"], box2["x"])
        y1 = max(box1["y"], box2["y"])
        x2 = min(box1["x"] + box1["w"], box2["x"] + box2["w"])
        y2 = min(box1["y"] + box1["h"], box2["y"] + box2["h"])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = box1["w"] * box1["h"]
        area2 = box2["w"] * box2["h"]
        union = area1 + area2 - inter
        return inter / union if union > 0 else 0.0

    merged = list(existing)
    for new_c in ai_new:
        new_box = (new_c.get("props") or {}).get("box")
        if not new_box:
            continue
        new_box_px = _pct_box_to_px(new_box, vw, vh)
        duplicate = False
        for ex_c in merged:
            ex_box = (ex_c.get("props") or {}).get("box")
            if not ex_box:
                continue
            ex_box_px = (
                _pct_box_to_px(ex_box, vw, vh)
                if ex_c.get("source") == "ai-vision"
                else ex_box
            )
            if iou(new_box_px, ex_box_px) > 0.7:
                duplicate = True
                break
        if not duplicate:
            # Jangan mutasi respons AI mentah; ia tetap disimpan apa adanya di
            # layout["ai_result"] dan harus bisa ditampilkan sebagai JSON mentah.
            merged_new = copy.deepcopy(new_c)
            merged_new["source"] = "ai-vision"
            merged.append(merged_new)
    return merged


def _structure_to_components(structure: dict, viewport: dict, elements: list[ScreenElement] | None = None) -> list[dict[str, Any]]:
    """Konversi struktur semantik (dari capture worker) + elemen ke komponen deterministik.

    Ini memastikan analisis menghasilkan komponen walau AI vision tidak tersedia.
    """
    components = []
    order = 0
    vw = viewport.get("width", 1440)
    vh = viewport.get("height", 900)

    def add_comp(comp_type: str, label: str, box: dict, region: str = "main", source: str = "detected"):
        nonlocal order
        if not box:
            return
        # Konversi box ke persen (0-100) untuk konsistensi
        components.append({
            "region": region,
            "component_type": comp_type,
            "label": label,
            "props": {
                "box": {
                    "x": round(box.get("x", 0) / vw * 100, 1),
                    "y": round(box.get("y", 0) / vh * 100, 1),
                    "w": round(box.get("w", 0) / vw * 100, 1),
                    "h": round(box.get("h", 0) / vh * 100, 1),
                }
            },
            "order_index": order,
            "source": source,
        })
        order += 1

    # 1. Struktur semantik (dari capture worker)
    # Navigasi -> nav-item
    for nav in structure.get("navs", []):
        add_comp("nav-item", nav.get("label") or "Navigasi", nav.get("box"), region="sidebar" if nav.get("box", {}).get("x", 0) < vw * 0.25 else "header")

    # Tabel -> table
    for table in structure.get("tables", []):
        box = table.get("box")
        if box and box.get("w", 0) > 0 and box.get("h", 0) > 0:
            comp_type = "table"
            label = table.get("label") or "Tabel"
            props = {
                "box": {
                    "x": round(box.get("x", 0) / vw * 100, 1),
                    "y": round(box.get("y", 0) / vh * 100, 1),
                    "w": round(box.get("w", 0) / vw * 100, 1),
                    "h": round(box.get("h", 0) / vh * 100, 1),
                }
            }
            # Pass through table metadata (headers, row_count, column_count)
            if "headers" in table:
                props["headers"] = table["headers"]
            if "row_count" in table:
                props["row_count"] = table["row_count"]
            if "column_count" in table:
                props["column_count"] = table["column_count"]
            components.append({
                "region": "main",
                "component_type": comp_type,
                "label": label,
                "props": props,
                "order_index": order,
                "source": "detected",
            })
            order += 1

    # Heading -> heading
    for heading in structure.get("headings", []):
        box = heading.get("box")
        if box and box.get("w", 0) > 0 and box.get("h", 0) > 0:
            add_comp("heading", heading.get("label") or f"Heading {heading.get('level', 1)}", box)

    # Form/Input -> field
    for form in structure.get("forms", []):
        for field in form.get("fields", []):
            add_comp("field", field.get("label") or "Input", field.get("box"))
        # Jika tidak ada field detail, gunakan box form
        if not form.get("fields") and form.get("box"):
            box = form.get("box")
            if box.get("w", 0) > 0 and box.get("h", 0) > 0:
                add_comp("form", form.get("label") or "Form", box)

    # Kartu -> card
    for card in structure.get("cards", []):
        add_comp("card", card.get("label") or "Kartu", card.get("box"))

    # Gambar -> image
    for img in structure.get("images", []):
        add_comp("image", img.get("label") or "Gambar", img.get("box"))

    # 2. Elemen ScreenElement (fallback ketika struktur kosong)
    if elements:
        # Kelompokkan elemen by type/role untuk menghindari duplikat
        seen_boxes = set()
        
        for el in elements:
            box = el.bounding_box or el.percent_box
            if not box:
                continue
            # Skip zero-sized boxes
            if box.get("w", 0) <= 0 or box.get("h", 0) <= 0:
                continue
            
            # Gunakan percent_box jika sudah persen, konversi kalau pixel
            if el.percent_box:
                pct_box = el.percent_box
            else:
                pct_box = {
                    "x": round(box.get("x", 0) / vw * 100, 1),
                    "y": round(box.get("y", 0) / vh * 100, 1),
                    "w": round(box.get("w", 0) / vw * 100, 1),
                    "h": round(box.get("h", 0) / vh * 100, 1),
                }
            
            # Dedup: skip jika box hampir sama dengan yang sudah ada
            box_key = (round(pct_box["x"], 0), round(pct_box["y"], 0), round(pct_box["w"], 0), round(pct_box["h"], 0))
            if box_key in seen_boxes:
                continue
            seen_boxes.add(box_key)
            
            # Tentukan component_type berdasarkan element_type, tag, role
            comp_type = _map_element_to_component(el)
            label = el.label or comp_type
            
            # Tentukan region berdasarkan posisi
            region = "main"
            if pct_box["x"] < 20 and pct_box["w"] < 25:
                region = "sidebar"
            elif pct_box["y"] < 12:
                region = "header"
            
            # Jika elemen di sidebar dan bertipe link, anggap sebagai nav-item
            if region == "sidebar" and comp_type == "link":
                comp_type = "nav-item"
            
            add_comp(comp_type, label, pct_box, region=region, source=el.source or "detected")

    return components


def _map_element_to_component(el: ScreenElement) -> str:
    """Map ScreenElement ke tipe komponen UI."""
    etype = (el.element_type or "").lower()
    tag = (el.tag or "").lower()
    role = (el.role or "").lower()
    input_type = (el.input_type or "").lower()
    
    # Navigasi / sidebar
    if etype in ("nav-item", "nav-link", "menu-item", "sidebar-item") or role in ("navigation", "menu", "menuitem"):
        return "nav-item"
    # Button
    if etype in ("button", "btn") or tag == "button" or role == "button":
        return "button"
    # Input / form field
    if etype in ("input", "field", "form-field") or tag in ("input", "select", "textarea") or input_type:
        return "field"
    # Heading
    if etype in ("heading", "title") or tag in ("h1", "h2", "h3", "h4", "h5", "h6") or role == "heading":
        return "heading"
    # Table
    if etype in ("table", "datatable") or tag == "table" or role == "table":
        return "table"
    # Card
    if etype in ("card", "panel") or role in ("region", "complementary"):
        return "card"
    # Image
    if etype in ("image", "img") or tag == "img" or role == "img":
        return "image"
    # Link
    if etype in ("link", "a") or tag == "a" or role == "link":
        return "link"
    # Dropdown / select
    if etype in ("dropdown", "select") or tag == "select" or role == "combobox":
        return "dropdown"
    # Default
    return "container"


_FORM_FIELD_TYPES = {"input", "select", "textarea"}


def _detect_layout_regions(structure: dict, viewport: dict, elements: list[ScreenElement] | None = None) -> dict:
    """Deteksi region layout (sidebar, header) dari struktur dan elemen."""
    vw = viewport.get("width", 1440)
    vh = viewport.get("height", 900)

    # Cek sidebar: elemen di kiri < 25% lebar
    sidebar_items = []
    for nav in structure.get("navs", []):
        box = nav.get("box", {})
        if box.get("x", 0) < vw * 0.25 and box.get("w", 0) < vw * 0.3:
            sidebar_items.append(nav)
    
    # Helper to get box in pixels
    def _box_px(el):
        if el.percent_box:
            return {
                "x": el.percent_box.get("x", 0) / 100 * vw,
                "y": el.percent_box.get("y", 0) / 100 * vh,
                "w": el.percent_box.get("w", 0) / 100 * vw,
                "h": el.percent_box.get("h", 0) / 100 * vh,
            }
        return el.bounding_box or {"x": 0, "y": 0, "w": 0, "h": 0}

    # Tambahkan dari elements
    if elements:
        for el in elements:
            if (el.element_type or "").lower() in _FORM_FIELD_TYPES:
                continue
            box_px = _box_px(el)
            if box_px.get("w", 0) <= 0 or box_px.get("h", 0) <= 0:
                continue
            x = box_px.get("x", 0)
            w = box_px.get("w", 0)
            if x < vw * 0.25 and w < vw * 0.3:
                sidebar_items.append({"box": box_px})

    # Sidebar dianggap ada jika: 2+ item navigasi kecil ATAU 1 elemen besar yang mirip sidebar (tinggi > 50% viewport)
    has_sidebar = len(sidebar_items) >= 2
    if not has_sidebar and elements:
        for el in elements:
            box_px = _box_px(el)
            if box_px.get("w", 0) <= 0 or box_px.get("h", 0) <= 0:
                continue
            x = box_px.get("x", 0)
            w = box_px.get("w", 0)
            h = box_px.get("h", 0)
            # Elemen sidebar besar: di kiri, lebar < 30%, tinggi > 50% viewport
            if x < vw * 0.25 and w < vw * 0.3 and h > vh * 0.5:
                has_sidebar = True
                break

    # Cek header: elemen di atas < 15% tinggi
    header_items = []
    for nav in structure.get("navs", []):
        box = nav.get("box", {})
        if box.get("y", 0) < vh * 0.15:
            header_items.append(nav)
    for heading in structure.get("headings", []):
        box = heading.get("box", {})
        if box.get("y", 0) < vh * 0.15:
            header_items.append(heading)
    
    # Tambahkan dari elements
    if elements:
        for el in elements:
            box_px = _box_px(el)
            if box_px.get("w", 0) <= 0 or box_px.get("h", 0) <= 0:
                continue
            y = box_px.get("y", 0)
            if y < vh * 0.15:
                header_items.append({"box": box_px})

    has_header = len(header_items) >= 1

    sidebar_region = None
    if has_sidebar:
        # Estimasi sidebar dari item navigasi kiri (hanya elemen yang BENERAN di sidebar: x < 25% DAN w < 30%)
        left_items = [n for n in structure.get("navs", []) if n.get("box", {}).get("x", 0) < vw * 0.25 and n.get("box", {}).get("w", 0) < vw * 0.3]
        if elements:
            for el in elements:
                if (el.element_type or "").lower() in _FORM_FIELD_TYPES:
                    continue
                box_px = _box_px(el)
                if box_px.get("w", 0) <= 0 or box_px.get("h", 0) <= 0:
                    continue
                x = box_px.get("x", 0)
                w = box_px.get("w", 0)
                if x < vw * 0.25 and w < vw * 0.3:
                    left_items.append({"box": box_px})
        if left_items:
            min_y = min(n.get("box", {}).get("y", 0) for n in left_items)
            max_y = max(n.get("box", {}).get("y", 0) + n.get("box", {}).get("h", 0) for n in left_items)
            max_x = max(n.get("box", {}).get("x", 0) + n.get("box", {}).get("w", 0) for n in left_items)
            sidebar_region = {"x": 0, "y": min_y, "w": max_x, "h": max_y - min_y, "item_count": len(left_items)}

    header_region = None
    if has_header:
        # Header: elemen di atas 15% tinggi DAN yang tidak terlalu tinggi (bukan full-page containers)
        top_items = [n for n in structure.get("navs", []) if n.get("box", {}).get("y", 0) < vh * 0.15 and n.get("box", {}).get("h", 0) < vh * 0.3]
        top_items.extend([h for h in structure.get("headings", []) if h.get("box", {}).get("y", 0) < vh * 0.15 and h.get("box", {}).get("h", 0) < vh * 0.3])
        if elements:
            for el in elements:
                box_px = _box_px(el)
                if box_px.get("w", 0) <= 0 or box_px.get("h", 0) <= 0:
                    continue
                y = box_px.get("y", 0)
                h = box_px.get("h", 0)
                if y < vh * 0.15 and h < vh * 0.3:
                    top_items.append({"box": box_px})
        if top_items:
            min_x = min(n.get("box", {}).get("x", 0) for n in top_items)
            max_x = max(n.get("box", {}).get("x", 0) + n.get("box", {}).get("w", 0) for n in top_items)
            max_y = max(n.get("box", {}).get("y", 0) + n.get("box", {}).get("h", 0) for n in top_items)
            header_region = {"x": min_x, "y": 0, "w": max_x - min_x, "h": max_y, "item_count": len(top_items)}

    return {
        "has_sidebar": has_sidebar,
        "has_header": has_header,
        "sidebar": sidebar_region,
        "header": header_region,
    }


# Entry point: AI-only analysis (no DOM detection)
def analyze_screen_with_ai(screen: Screen, elements: list[ScreenElement]) -> Analysis:
    """Entry point: Jalankan analisis AI vision (dengan fallback deterministik).

    Pertama jalankan analisis deterministik dari struktur semantik + elemen, lalu
    tambahkan hasil AI vision bila tersedia.
    """
    # Buat Analysis dengan hasil deterministik dari struktur halaman
    result = Analysis()
    structure = screen.structure if isinstance(screen.structure, dict) else {}
    viewport = {
        "width": int(structure.get("viewport", {}).get("width") or 1440),
        "height": int(structure.get("viewport", {}).get("height") or 900),
    }

    # Deteksi region layout (pakai structure + elements)
    regions = _detect_layout_regions(structure, viewport, elements)

    result.layout = {
        "viewport": viewport,
        "regions": {
            "sidebar": regions["sidebar"],
            "header": regions["header"],
            "main": {"x": 0, "y": 0, "w": viewport["width"], "h": viewport["height"]},
        },
        "has_sidebar": regions["has_sidebar"],
        "has_header": regions["has_header"],
        "sections": [],
    }

    # Komponen deterministik dari struktur semantik + elements
    result.components = _structure_to_components(structure, viewport, elements)
    if isinstance(structure, dict) and "visual" in structure:
        result.components = _match_visual_nodes(result.components, structure["visual"])
        theme = _extract_visual_theme(structure["visual"])
        if theme and isinstance(result.layout, dict):
            result.layout["theme"] = theme

    # Asumsi dasar
    result.assumptions = [
        {
            "topic": "Aturan bisnis",
            "description": (
                "Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib "
                "diisi manual oleh pemilik proses."
            ),
            "confidence": "low",
        }
    ]

    # Jalankan AI vision (opsional) untuk menambah komponen yang terlewat
    import asyncio
    try:
        result = asyncio.run(analyze_with_ai(screen, result))
    except RuntimeError:
        logger.warning("Already in event loop, skipping AI vision in analyze_screen_with_ai")
    return result


# Alias untuk kompatibilitas pemanggil yang masih menggunakan analyze_screen
analyze_screen = analyze_screen_with_ai

