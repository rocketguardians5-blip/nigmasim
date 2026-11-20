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

import base64
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.capture import Screen, ScreenElement
from app.models.reconstruction import (
    Reconstruction,
    ReconstructionAssumption,
    ReconstructionComponent,
)

logger = logging.getLogger("nigmasim.reconstructor")

SIDEBAR_BAND = 0.22  # elemen di kiri 22% lebar -> kandidat navigasi
HEADER_BAND = 0.14  # elemen di atas 14% tinggi -> kandidat header


@dataclass
class Analysis:
    layout: dict[str, Any] = field(default_factory=dict)
    components: list[dict[str, Any]] = field(default_factory=list)
    assumptions: list[dict[str, Any]] = field(default_factory=list)
    ai_model: str = ""  # model vision yang benar-benar dipakai (bila ada)
    ai_status: str = "not_configured"  # "not_configured" | "success" | "failed"
    ai_error: str = ""  # alasan gagal jika ada
    source: str = "rule-engine"  # "rule-engine" | "ai-vision" | "hybrid"


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

    if existing is not None:
        if not replace:
            return existing
        reconstruction = existing
        reconstruction.status = "draft"

        # Pertahankan tombstones dan overrides dari layout lama
        existing_layout = dict(existing.layout or {})
        new_layout = dict(analysis.layout or {})
        if "tombstones" in existing_layout and "tombstones" not in new_layout:
            new_layout["tombstones"] = existing_layout["tombstones"]
        if "overrides" in existing_layout and "overrides" not in new_layout:
            new_layout["overrides"] = existing_layout["overrides"]
        reconstruction.layout = new_layout
        reconstruction.code_text = code
        # Set generated_by berdasarkan sumber analisis
        if analysis.source == "ai-vision":
            reconstruction.generated_by = "ai-vision"
        elif analysis.source == "hybrid":
            reconstruction.generated_by = "hybrid"
        else:
            reconstruction.generated_by = "rule-engine"
        # Tambahkan info AI status ke layout untuk ditampilkan di UI
        new_layout["ai_status"] = analysis.ai_status
        new_layout["ai_model"] = analysis.ai_model
        new_layout["ai_error"] = analysis.ai_error
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
        new_layout = dict(analysis.layout or {})
        # Set generated_by berdasarkan sumber analisis
        if analysis.source == "ai-vision":
            generated_by = "ai-vision"
        elif analysis.source == "hybrid":
            generated_by = "hybrid"
        else:
            generated_by = "rule-engine"
        # Tambahkan info AI status ke layout untuk ditampilkan di UI
        new_layout["ai_status"] = analysis.ai_status
        new_layout["ai_model"] = analysis.ai_model
        new_layout["ai_error"] = analysis.ai_error
        reconstruction = Reconstruction(
            screen_id=screen.id,
            project_id=screen.project_id,
            status="draft",
            layout=new_layout,
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

    for component in analysis.components:
        if component.get("source") == "manual" or component.get("region") == "manual":
            continue

        raw_props = component.get("props") or {}
        raw_box = raw_props.get("box")
        comp_label = component.get("label") or ""
        comp_type = component.get("component_type") or "button"

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
                region=component["region"],
                component_type=component["component_type"],
                label=final_label,
                props=final_props,
                order_index=component.get("order_index", 0),
                source=component.get("source", "ai-vision"),
            )
        )

    for assumption in analysis.assumptions:
        db.add(
            ReconstructionAssumption(
                reconstruction_id=reconstruction.id,
                topic=assumption["topic"],
                description=assumption["description"],
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
_GEMINI_MODEL_COOLDOWN_SECONDS = 300.0
_gemini_model_down_until: dict[str, float] = {}


def _gemini_models_to_try() -> list[str]:
    chain = settings.gemini_model_chain
    now = time.monotonic()
    available = [m for m in chain if _gemini_model_down_until.get(m, 0.0) <= now]
    return available or chain


async def analyze_with_ai(screen: Screen, existing_analysis: Analysis) -> Analysis:
    """Kirim screenshot ke Gemini vision model, merge hasil ke existing analysis."""
    if not settings.gemini_api_key:
        if settings.app_env == "test":
            # Mock AI vision output untuk lingkungan test
            existing_analysis.ai_model = "mock-vision-test"
            existing_analysis.ai_status = "success"
            existing_analysis.source = "hybrid"
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
            return existing_analysis
        logger.warning("GEMINI_API_KEY tidak dikonfigurasi, skip AI vision")
        existing_analysis.ai_status = "not_configured"
        existing_analysis.ai_error = "GEMINI_API_KEY tidak dikonfigurasi di .env"
        existing_analysis.source = "rule-engine"
        return existing_analysis

    # Baca screenshot (path relatif terhadap storage root)
    screenshot_full_path = settings.storage_path / (screen.screenshot_path or "")
    try:
        image_bytes = screenshot_full_path.read_bytes()
    except Exception as e:
        logger.error("Gagal baca screenshot %s: %s", screenshot_full_path, e)
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

        data = None
        used_model = ""
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
            for model in _gemini_models_to_try():
                # Percobaan pertama dibatasi lebih pendek: kalau model utama sedang
                # bermasalah, fallback tidak perlu menunggu terlalu lama.
                attempt_timeout = (
                    httpx.Timeout(45.0, connect=15.0)
                    if model == settings.gemini_model
                    else httpx.Timeout(90.0, connect=15.0)
                )
                try:
                    resp = await client.post(
                        f"{settings.gemini_base_url}/models/{model}:generateContent",
                        headers={
                            "x-goog-api-key": settings.gemini_api_key,
                            "Content-Type": "application/json",
                        },
                        json=payload,
                        timeout=attempt_timeout,
                    )
                except httpx.TimeoutException:
                    logger.warning("Gemini timeout pada %s, coba model berikutnya", model)
                    _gemini_model_down_until[model] = (
                        time.monotonic() + _GEMINI_MODEL_COOLDOWN_SECONDS
                    )
                    continue

                if resp.status_code in (404, 429, 503):
                    logger.warning(
                        "Gemini %s tidak tersedia (HTTP %s), coba model berikutnya",
                        model,
                        resp.status_code,
                    )
                    _gemini_model_down_until[model] = (
                        time.monotonic() + _GEMINI_MODEL_COOLDOWN_SECONDS
                    )
                    continue
                if resp.status_code >= 400:
                    logger.error(
                        "Gemini error %s pada %s: %s", resp.status_code, model, resp.text[:800]
                    )
                    existing_analysis.ai_status = "failed"
                    existing_analysis.ai_error = f"Gemini error {resp.status_code}: {resp.text[:200]}"
                    existing_analysis.source = "rule-engine"
                    return existing_analysis

                data = resp.json()
                used_model = model
                break

        if data is None:
            logger.error(
                "Semua model Gemini gagal dipanggil: %s", ", ".join(settings.gemini_model_chain)
            )
            existing_analysis.ai_status = "failed"
            existing_analysis.ai_error = "Semua model Gemini gagal dipanggil"
            existing_analysis.source = "rule-engine"
            return existing_analysis

        existing_analysis.ai_model = used_model
        existing_analysis.ai_status = "success"
        existing_analysis.source = "hybrid"

        candidates = data.get("candidates") or []
        if not candidates:
            feedback = data.get("promptFeedback") or {}
            logger.error(
                "Gemini tidak mengembalikan kandidat (blockReason=%s)",
                feedback.get("blockReason"),
            )
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
            logger.error("Gagal parse JSON dari AI: %s\nContent: %s", e, content[:1000])
            return existing_analysis

        # Merge AI components (dedup by box IoU)
        ai_components = ai_result.get("components", [])
        merged = _merge_components(existing_analysis.components, ai_components, viewport)
        existing_analysis.components = merged

        # Merge AI assumptions (avoid duplicates)
        ai_assumptions = ai_result.get("assumptions", [])
        existing_topics = {(a["topic"], a["description"][:50]) for a in existing_analysis.assumptions}
        for a in ai_assumptions:
            key = (a.get("topic", ""), a.get("description", "")[:50])
            if key not in existing_topics:
                existing_analysis.assumptions.append(a)
                existing_topics.add(key)

        # Layout: ambil flag struktur dari AI, regions tetap dari analisis
        # deterministik (satuannya piksel, sedangkan AI mengirim persen).
        ai_layout = ai_result.get("layout")
        if ai_layout:
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
            "AI vision analysis via %s: +%d components, +%d assumptions",
            used_model,
            len(ai_components),
            len(ai_assumptions),
        )

    except Exception as e:
        logger.exception("AI vision analysis gagal: %s", e)
        existing_analysis.ai_status = "failed"
        existing_analysis.ai_error = str(e)
        existing_analysis.source = "rule-engine"

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
            new_c["source"] = "ai-vision"
            merged.append(new_c)
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
        add_comp("table", table.get("label") or "Tabel", table.get("box"))

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

