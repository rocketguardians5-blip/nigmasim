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

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.capture import Screen, ScreenElement
from app.models.reconstruction import (
    Reconstruction,
    ReconstructionAssumption,
    ReconstructionComponent,
)

SIDEBAR_BAND = 0.22  # elemen di kiri 22% lebar -> kandidat navigasi
HEADER_BAND = 0.14  # elemen di atas 14% tinggi -> kandidat header


@dataclass
class Analysis:
    layout: dict[str, Any] = field(default_factory=dict)
    components: list[dict[str, Any]] = field(default_factory=list)
    assumptions: list[dict[str, Any]] = field(default_factory=list)


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return slug[:60] or "screen"


def _pascal(text: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", (text or "").strip())
    return "".join(p[:1].upper() + p[1:] for p in parts if p) or "Screen"


def _box(element: ScreenElement) -> dict[str, int] | None:
    box = element.bounding_box
    if not isinstance(box, dict):
        return None
    try:
        return {
            "x": int(box.get("x", 0)),
            "y": int(box.get("y", 0)),
            "w": int(box.get("w", 0)),
            "h": int(box.get("h", 0)),
        }
    except (TypeError, ValueError):
        return None


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
    ordered = sorted(items, key=lambda item: item["box"]["y"])

    bands: list[dict[str, Any]] = []
    for item in ordered:
        box = item["box"]
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

    sections: list[dict[str, Any]] = []
    for index, band in enumerate(bands):
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


def analyze_screen(screen: Screen, elements: list[ScreenElement]) -> Analysis:
    """Analisis struktur halaman dari elemen & struktur semantik yang tertangkap."""
    result = Analysis()

    structure = screen.structure if isinstance(screen.structure, dict) else {}
    viewport = {
        "width": int(structure.get("viewport", {}).get("width") or 1440),
        "height": int(structure.get("viewport", {}).get("height") or 900),
    }
    width = max(viewport["width"], 1)
    height = max(viewport["height"], 1)

    boxes = [(element, _box(element)) for element in elements]
    boxes = [(element, box) for element, box in boxes if box]

    # ---------- Deteksi sidebar ----------
    nav_links = [
        (element, box)
        for element, box in boxes
        if element.element_type == "a" and box["x"] < width * SIDEBAR_BAND
    ]
    has_sidebar = len(nav_links) >= 3
    sidebar = None
    if has_sidebar:
        max_x = max(box["x"] + box["w"] for _, box in nav_links)
        sidebar = {
            "x": 0,
            "y": 0,
            "w": min(max_x + 24, width),
            "h": height,
            "item_count": len(nav_links),
        }

    # ---------- Deteksi header ----------
    header_candidates = [
        (element, box)
        for element, box in boxes
        if box["y"] < height * HEADER_BAND
        and not (sidebar and box["x"] < sidebar["w"])
    ]
    header = None
    if header_candidates:
        max_y = max(box["y"] + box["h"] for _, box in header_candidates)
        header = {"x": 0, "y": 0, "w": width, "h": min(max_y + 12, height)}

    main = {
        "x": sidebar["w"] if sidebar else 0,
        "y": header["h"] if header else 0,
        "w": width - (sidebar["w"] if sidebar else 0),
        "h": height - (header["h"] if header else 0),
    }
    result.layout = {
        "viewport": viewport,
        "regions": {"sidebar": sidebar, "header": header, "main": main},
        "has_sidebar": has_sidebar,
        "has_header": header is not None,
    }

    # ---------- Komponen ----------
    components: list[dict[str, Any]] = []

    if has_sidebar:
        for index, (element, box) in enumerate(sorted(nav_links, key=lambda item: item[1]["y"])):
            components.append(
                {
                    "region": "sidebar",
                    "component_type": "nav-item",
                    "label": element.label or "Menu",
                    "props": {"index": index, "box": box},
                    "source": "detected",
                }
            )

    for element, box in header_candidates:
        components.append(
            {
                "region": "header",
                "component_type": "header-item",
                "label": element.label,
                "props": {"box": box},
                "source": "detected",
            }
        )

    # Tombol, input, select, textarea di area konten
    for element, box in boxes:
        if sidebar and box["x"] < sidebar["w"]:
            continue
        if element.element_type in {"button", "a"} and box["y"] < height * 0.35:
            components.append(
                {
                    "region": "main",
                    "component_type": "button",
                    "label": element.label,
                    "props": {"box": box},
                    "source": "detected",
                }
            )
        elif element.element_type in {"input", "select", "textarea"}:
            components.append(
                {
                    "region": "main",
                    "component_type": "field",
                    "label": element.label,
                    "props": {"input_type": element.element_type, "box": box},
                    "source": "detected",
                }
            )

    # Struktur semantik: tabel, heading, form, card
    for table in structure.get("tables", []) or []:
        components.append(
            {
                "region": "main",
                "component_type": "table",
                "label": table.get("label") or "Tabel",
                "props": {
                    "headers": table.get("headers", [])[:12],
                    "row_count": table.get("row_count"),
                    "column_count": table.get("column_count"),
                    "box": table.get("box"),
                },
                "source": "detected",
            }
        )

    for heading in structure.get("headings", []) or []:
        components.append(
            {
                "region": "main",
                "component_type": "heading",
                "label": heading.get("label"),
                "props": {"level": heading.get("level"), "box": heading.get("box")},
                "source": "detected",
            }
        )

    for form in structure.get("forms", []) or []:
        components.append(
            {
                "region": "main",
                "component_type": "form",
                "label": form.get("label"),
                "props": {"field_count": form.get("field_count"), "box": form.get("box")},
                "source": "detected",
            }
        )

    for card in structure.get("cards", []) or []:
        components.append(
            {
                "region": "main",
                "component_type": "card",
                "label": card.get("label"),
                "props": {"box": card.get("box")},
                "source": "detected",
            }
        )

    for image in structure.get("images", []) or []:
        components.append(
            {
                "region": "main",
                "component_type": "image",
                "label": image.get("label"),
                "props": {"box": image.get("box")},
                "source": "detected",
            }
        )

    components.sort(key=lambda c: (c["region"], c["props"].get("box", {}).get("y", 0)))
    for index, component in enumerate(components):
        component["order_index"] = index
    result.components = components

    # Blueprint per section - lebih terbaca daripada menumpuk kotak per elemen.
    boxed = [
        {
            "type": component["component_type"],
            "label": component.get("label"),
            "box": (component.get("props") or {}).get("box"),
        }
        for component in components
        if (component.get("props") or {}).get("box")
    ]
    result.layout = {**result.layout, "sections": _build_sections(boxed, viewport)}

    # ---------- Asumsi yang WAJIB dicek manusia ----------
    assumptions: list[dict[str, Any]] = []

    if has_sidebar:
        assumptions.append(
            {
                "topic": "Layout",
                "description": (
                    f"Sidebar terdeteksi dari {len(nav_links)} elemen navigasi di area kiri "
                    f"(x < {int(SIDEBAR_BAND * 100)}% lebar layar). Periksa apakah area kiri "
                    "memang sidebar, atau sekadar daftar ikon."
                ),
                "confidence": "medium",
            }
        )
    else:
        assumptions.append(
            {
                "topic": "Layout",
                "description": (
                    "Tidak ada sidebar yang terdeteksi. Periksa manual - bisa jadi navigasi "
                    "menggunakan pola lain (tabs, dropdown, atau menu di dalam header)."
                ),
                "confidence": "low",
            }
        )

    table_count = sum(1 for c in components if c["component_type"] == "table")
    if table_count == 0:
        assumptions.append(
            {
                "topic": "Komponen",
                "description": (
                    "Tidak ada tabel terdeteksi. Grafik, tabel, dan kartu statistik TIDAK bisa "
                    "dibaca dari screenshot - tandai manual."
                ),
                "confidence": "low",
            }
        )

    field_count = sum(1 for c in components if c["component_type"] == "field")
    if field_count:
        assumptions.append(
            {
                "topic": "Form",
                "description": (
                    f"{field_count} field input terdeteksi. Validasi, obrigatório/tidak, dan "
                    "sumber data BELUM diketahui - isi manual."
                ),
                "confidence": "medium",
            }
        )

    assumptions.append(
        {
            "topic": "Warna & tipografi",
            "description": (
                "Warna primer diasumsikan #0077BA dari design system NigmaSim, bukan "
                "diukur dari screenshot. Sesuaikan bila aplikasi asli memakai palet lain."
            ),
            "confidence": "low",
        }
    )

    assumptions.append(
        {
            "topic": "Aturan bisnis",
            "description": (
                "Aturan bisnis TIDAK bisa dibaca dari tampilan. Semua aturan wajib "
                "diisi manual oleh pemilik proses."
            ),
            "confidence": "low",
        }
    )

    result.assumptions = assumptions
    return result


def generate_code(screen: Screen, analysis: Analysis) -> str:
    """Hasilkan draf React + TypeScript dari hasil analisis."""
    name = _pascal(screen.title or screen.screen_key)
    regions = analysis.layout.get("regions", {})
    sidebar = regions.get("sidebar")
    header = regions.get("header")

    nav_items = [c for c in analysis.components if c["component_type"] == "nav-item"]
    tables = [c for c in analysis.components if c["component_type"] == "table"]
    fields = [c for c in analysis.components if c["component_type"] == "field"]
    buttons = [c for c in analysis.components if c["component_type"] == "button"]
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

    Satu screen hanya punya SATU draf. Analisis ulang memperbarui draf yang
    ada (komponen & asumsi diganti), bukan membuat draf baru yang bertumpuk.
    """
    existing = db.scalar(
        select(Reconstruction).where(Reconstruction.screen_id == screen.id)
    )

    if existing is not None:
        if not replace:
            return existing
        reconstruction = existing
        reconstruction.status = "draft"
        reconstruction.layout = analysis.layout
        reconstruction.code_text = code
        reconstruction.generated_by = "rule-engine"
        reconstruction.reviewed_by = None
        reconstruction.reviewed_at = None
        # Komponen & asumsi lama diganti hasil analisis baru.
        reconstruction.components.clear()
        reconstruction.assumptions.clear()
        db.flush()
    else:
        reconstruction = Reconstruction(
            screen_id=screen.id,
            project_id=screen.project_id,
            status="draft",
            layout=analysis.layout,
            code_text=code,
            generated_by="rule-engine",
            created_by=actor_id,
        )
        db.add(reconstruction)
        db.flush()

    for component in analysis.components:
        db.add(
            ReconstructionComponent(
                reconstruction_id=reconstruction.id,
                region=component["region"],
                component_type=component["component_type"],
                label=component.get("label"),
                props=component.get("props"),
                order_index=component.get("order_index", 0),
                source=component.get("source", "detected"),
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
    return reconstruction
