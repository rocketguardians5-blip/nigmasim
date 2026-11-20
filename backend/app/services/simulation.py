"""Fase 4: mesin pembangun simulasi + data dummy.

Sumbernya adalah rekonstruksi Phase 3 yang sudah disetujui manusia.
Mesin ini hanya menyusun kerangka; isi data dummy dibuat dari kolom yang
terdeteksi, DAN SELURUHNYA BISA DIEDIT manusia.
"""

from __future__ import annotations

import os
import random
import re
import uuid
from typing import Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ConflictError, NotFoundError
from app.models.capture import Screen
from app.models.reconstruction import Reconstruction
from app.models.simulation import (
    Simulation,
    SimulationDataset,
    SimulationScreen,
    SimulationWorkflow,
)

# Pola generik untuk membuat nilai dummy yang masuk akal.
GENERATORS: list[tuple[str, str]] = [
    (r"(^|\s)(id|no\.?|kode|code|nomor)($|\s)", "text-id"),
    (r"(nilai|nilai_dampak|score|nilai_risiko|amount|harga|total)", "number"),
    (r"(tanggal|date|created|updated|dibuat)", "date"),
    (r"(level|tingkat|prioritas|status|state)", "status"),
    (r"email", "email"),
    (r"(harga|biaya|cost)", "currency"),
    (r"(persen|persentase|percent|ratio)", "percent"),
]


def _guess_type(column: str) -> str:
    key = column.lower().strip()
    for pattern, kind in GENERATORS:
        if re.search(pattern, key):
            return kind
    return "text"


# Nilai default per jenis kolom "status".
STATUS_VALUES: dict[str, list[str]] = {
    "tingkat": ["Tinggi", "Sedang", "Rendah"],
    "level": ["Tinggi", "Sedang", "Rendah"],
    "prioritas": ["Tinggi", "Sedang", "Rendah"],
}
DEFAULT_STATUS_VALUES = ["Diajukan", "Direview", "Disetujui", "Ditolak"]


def _generate_value(column: str, kind: str, index: int, rng: random.Random) -> Any:
    label = column.strip() or "Kolom"
    if kind == "text-id":
        prefix = re.sub(r"[^A-Za-z]", "", label)[:3].upper() or "ID"
        return f"{prefix}-{2026}-{index:04d}"
    if kind == "number":
        return rng.randint(5, 95)
    if kind == "currency":
        return rng.randint(25, 900) * 1_000_000
    if kind == "percent":
        return rng.choice([15, 25, 40, 55, 70, 85])
    if kind == "date":
        return f"2026-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    if kind == "email":
        return f"user{index}@contoh.local"
    if kind == "status":
        key = label.lower()
        for keyword, values in STATUS_VALUES.items():
            if keyword in key:
                return rng.choice(values)
        return rng.choice(DEFAULT_STATUS_VALUES)
    return f"{label} contoh {index}"


def build_dataset(
    name: str,
    columns: list[str],
    *,
    row_count: int = 6,
    seed: int | None = None,
) -> dict[str, Any]:
    """Buat dataset dummy dari daftar kolom."""
    rng = random.Random(seed)
    schema = []
    for column in columns:
        schema.append(
            {
                "key": re.sub(r"[^a-zA-Z0-9]+", "_", column.strip().lower()).strip("_")
                or f"kolom_{len(schema) + 1}",
                "label": column.strip() or f"Kolom {len(schema) + 1}",
                "type": _guess_type(column),
            }
        )

    rows = []
    for index in range(1, row_count + 1):
        row: dict[str, Any] = {"_id": uuid.uuid4().hex[:12]}
        for column in schema:
            row[column["key"]] = _generate_value(column["label"], column["type"], index, rng)
        rows.append(row)

    return {"schema": schema, "rows": rows}


def is_interactive_component(comp_type: str | None, label: str | None, box: dict | None) -> bool:
    """Klasifikasi apakah suatu komponen bersifat interaktif.
    
    Yang dihitung interaktif: button, link, input, dropdown, card yang bisa diklik,
    DAN item menu/navigasi/header yang berupa link (HOME, PRODUCT, CONTACT, SUPPORT, LOGIN, CART, dsb).
    Yang dibuang: teks biasa (heading), gambar dekoratif, wadah besar (>80% layar), form/table container.
    """
    t = (comp_type or "").strip().lower()
    lbl = (label or "").strip()

    if box:
        try:
            w = float(box.get("w", 0))
            h = float(box.get("h", 0))
            # Wadah besar (>80% lebar dan tinggi, atau >64% luas layar)
            is_pct = w <= 100 and h <= 100
            if is_pct:
                if (w >= 80 and h >= 80) or (w * h >= 6400):
                    return False
            else:
                if (w >= 1152 and h >= 720) or (w * h >= 1440 * 900 * 0.64):
                    return False
        except (ValueError, TypeError):
            pass

    if t in {"button", "link", "input", "field", "dropdown", "select", "textarea"}:
        return True

    if t in {"header-item", "nav-item"}:
        if not lbl and box:
            try:
                if float(box.get("w", 0)) * float(box.get("h", 0)) > 2000:
                    return False
            except (ValueError, TypeError):
                pass
        return True

    if t == "card":
        return True

    if t == "logo":
        return True

    return False


def _calc_box_iou(b1: dict, b2: dict) -> float:
    if not b1 or not b2:
        return 0.0
    try:
        x1 = max(float(b1.get("x", 0)), float(b2.get("x", 0)))
        y1 = max(float(b1.get("y", 0)), float(b2.get("y", 0)))
        x2 = min(float(b1.get("x", 0)) + float(b1.get("w", 0)), float(b2.get("x", 0)) + float(b2.get("w", 0)))
        y2 = min(float(b1.get("y", 0)) + float(b1.get("h", 0)), float(b2.get("y", 0)) + float(b2.get("h", 0)))
        inter_w = max(0.0, x2 - x1)
        inter_h = max(0.0, y2 - y1)
        inter = inter_w * inter_h
        a1 = float(b1.get("w", 0)) * float(b1.get("h", 0))
        a2 = float(b2.get("w", 0)) * float(b2.get("h", 0))
        union = a1 + a2 - inter
        return inter / union if union > 0 else 0.0
    except (ValueError, TypeError):
        return 0.0


def get_screen_dimensions(screen: Screen) -> tuple[int, int]:
    """Dapatkan ukuran lebar dan tinggi asli screenshot dalam piksel."""
    structure = screen.structure if isinstance(screen.structure, dict) else {}
    capture_viewport = structure.get("viewport") or {}
    vw = int(capture_viewport.get("width") or 0)
    vh = int(capture_viewport.get("height") or 0)

    # Cek file screenshot fisik untuk akurasi dimensi sesungguhnya
    if screen.screenshot_path:
        for prefix in ("", "storage", "backend", os.path.join("backend", "storage"), os.path.join("..", "storage")):
            cand = os.path.join(prefix, screen.screenshot_path) if prefix else screen.screenshot_path
            if os.path.exists(cand) and os.path.isfile(cand):
                try:
                    with Image.open(cand) as im:
                        return im.size  # (width, height)
                except Exception:
                    pass

    return (vw or 1440, vh or 900)


def normalize_box_to_percent(
    box: dict[str, Any] | None, img_width: float, img_height: float
) -> dict[str, float]:
    """Standardisasi koordinat hotspot ke format persentase murni (0–100%).
    
    Jika nilai masih berupa piksel mentah (x > 100 or y > 100 or w > 100 or h > 100),
    otomatis konversi ke persen: (nilai_piksel / total_dimensi) * 100.
    Jika sudah persen (<= 100), di-clamp antara 0 dan 100 dan dibulatkan 2 desimal.
    """
    if not box:
        return {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}

    x = float(box.get("x", 0.0))
    y = float(box.get("y", 0.0))
    w = float(box.get("w", 0.0))
    h = float(box.get("h", 0.0))

    img_w = max(float(img_width), 1.0)
    img_h = max(float(img_height), 1.0)

    # Cek apakah koordinat masih berupa piksel mentah
    is_pixel = x > 100.0 or y > 100.0 or w > 100.0 or h > 100.0

    if is_pixel:
        x_pct = (x / img_w) * 100.0
        y_pct = (y / img_h) * 100.0
        w_pct = (w / img_w) * 100.0
        h_pct = (h / img_h) * 100.0
    else:
        x_pct = x
        y_pct = y
        w_pct = w
        h_pct = h

    return {
        "x": round(max(0.0, min(100.0, x_pct)), 2),
        "y": round(max(0.0, min(100.0, y_pct)), 2),
        "w": round(max(0.0, min(100.0, w_pct)), 2),
        "h": round(max(0.0, min(100.0, h_pct)), 2),
    }


def _layout_from_reconstruction(
    draft: Reconstruction, screen: Screen, datasets: dict[str, Any]
) -> dict[str, Any]:
    """Susun kerangka tampilan dari komponen yang terdeteksi dengan tombstones & overrides."""
    components = draft.components or []
    # Hanya gunakan komponen AI dan Manual — buang sumber DOM lama
    components = [c for c in components if getattr(c, 'source', 'ai-vision') != 'detected']
    cards = [c for c in components if c.component_type == "card"]
    tables = [c for c in components if c.component_type == "table"]
    fields = [c for c in components if c.component_type == "field"]
    buttons = [c for c in components if c.component_type == "button"]
    headings = [c for c in components if c.component_type == "heading"]

    # Dimensi asli gambar screenshot
    img_w, img_h = get_screen_dimensions(screen)

    # Tombstones dan overrides dari draft.layout (Single Source of Truth di backend)
    draft_layout = draft.layout or {}
    tombstones = set(str(tid) for tid in draft_layout.get("tombstones", []))
    overrides = draft_layout.get("overrides", {})

    hotspots: list[dict[str, Any]] = []
    for c in components:
        cid_str = str(c.id)
        # Cek apakah ditombstone / dihapus oleh user
        if (
            cid_str in tombstones
            or f"auto_{cid_str}" in tombstones
            or f"manual_{cid_str}" in tombstones
        ):
            continue

        raw_box = (c.props or {}).get("box") if c.props else None
        if not raw_box:
            continue

        override = (
            overrides.get(cid_str)
            or overrides.get(f"auto_{cid_str}")
            or overrides.get(f"manual_{cid_str}")
        )
        if override:
            box_data = {
                "x": float(override.get("x", raw_box.get("x", 0))),
                "y": float(override.get("y", raw_box.get("y", 0))),
                "w": float(override.get("w", raw_box.get("w", 0))),
                "h": float(override.get("h", raw_box.get("h", 0))),
            }
            label = override.get("label", c.label or c.component_type)
        else:
            box_data = {
                "x": float(raw_box.get("x", 0)),
                "y": float(raw_box.get("y", 0)),
                "w": float(raw_box.get("w", 0)),
                "h": float(raw_box.get("h", 0)),
            }
            label = c.label or c.component_type

        # Standardisasi koordinat ke persentase murni (0-100%)
        norm_box = normalize_box_to_percent(box_data, img_w, img_h)

        # Filter hanya elemen interaktif
        if not is_interactive_component(c.component_type, label, norm_box):
            continue

        # Ambil element_type dan config_json dari override atau komponen asli
        element_type = override.get("element_type") if (override and isinstance(override, dict)) else c.element_type
        config_json = override.get("config_json") if (override and isinstance(override, dict)) else c.config_json

        # Cegah duplikat dengan IoU > 0.7
        duplicate = False
        for ex in hotspots:
            if _calc_box_iou(norm_box, ex["box"]) > 0.7 and (ex["label"] == label or not label):
                duplicate = True
                break
        if not duplicate:
            hotspot: dict[str, Any] = {
                "id": c.id,
                "label": label,
                "type": c.component_type,
                "box": norm_box,
                "target_screen_key": None,
            }
            if element_type:
                hotspot["element_type"] = element_type
            if config_json:
                hotspot["config_json"] = config_json
            hotspots.append(hotspot)

    viewport = {
        "width": img_w,
        "height": img_h,
    }

    layout: dict[str, Any] = {
        "subtitle": screen.route_label or screen.source_url or "",
        "title": headings[0].label if headings else screen.title,
        # Visual clone mode: render screenshot sebagai background + hotspot klik
        "visual_mode": True,
        "screenshot_path": screen.screenshot_path,
        "viewport": viewport,
        "hotspots": hotspots,
        # Legacy generik layout (tetap tersedia untuk mode non-visual)
        "cards": [],
        "table": None,
        "form": None,
        "buttons": [],
    }

    for card in cards:
        layout["cards"].append(
            {
                "label": card.label or "Statistik",
                "dataset": None,
                "field": None,
            }
        )

    for table in tables:
        headers = (table.props or {}).get("headers") or []
        dataset_name = f"{screen.screen_key.replace('-', '_')}_rows"
        if headers and dataset_name not in datasets:
            datasets[dataset_name] = build_dataset(dataset_name, headers)
        layout["table"] = {
            "dataset": dataset_name if headers else None,
            "columns": headers,
            "page_size": 6,
        }

    if fields:
        field_specs = []
        for field in fields:
            label = field.label or "Kolom"
            key = re.sub(r"[^a-zA-Z0-9]+", "_", label.lower()).strip("_") or "kolom"
            field_specs.append(
                {
                    "key": key,
                    "label": label,
                    "type": "number" if _guess_type(label) == "number" else "text",
                    "required": True,
                }
            )
        layout["form"] = {
            "dataset": layout["table"]["dataset"] if layout["table"] else None,
            "fields": field_specs,
            "submit_label": "Simpan",
        }

    for button in buttons:
        layout["buttons"].append(
            {"label": button.label or "Tombol", "action": "noop", "variant": "primary"}
        )

    return layout


def build_simulation(
    db: Session,
    project_id: int,
    *,
    name: str,
    description: str | None = None,
    actor_id: int | None = None,
    visual_mode: bool = True,
    hotspot_targets: dict[str, Any] | None = None,
) -> Simulation:
    """Buat simulasi dari rekonstruksi yang sudah disetujui."""
    drafts = list(
        db.scalars(
            select(Reconstruction)
            .where(
                Reconstruction.project_id == project_id,
                Reconstruction.status == "approved",
            )
            .order_by(Reconstruction.updated_at)
        )
    )
    if not drafts:
        raise ConflictError(
            "Belum ada rekonstruksi yang disetujui. Draf dulu di UI Reconstruction "
            "lalu setujui, baru simulasi bisa dibuat."
        )

    screens = list(
        db.scalars(
            select(Screen)
            .where(Screen.project_id == project_id)
            .order_by(Screen.id)
        )
    )

    existing = db.scalar(select(Simulation).where(Simulation.project_id == project_id))
    if existing is not None:
        # Rebuild memperbarui simulasi yang ada (id tetap stabil) supaya
        # tautan/riwayat tidak putus. Layar & dataset lama dibuang.
        simulation = existing
        simulation.name = name
        simulation.description = description
        simulation.status = "draft"
        simulation.screens.clear()
        simulation.datasets.clear()
        db.flush()
    else:
        simulation = Simulation(
            project_id=project_id,
            name=name,
            description=description,
            status="draft",
            created_by=actor_id,
        )
        db.add(simulation)
        db.flush()

    datasets: dict[str, Any] = {}
    prepared: list[tuple[Reconstruction, Screen, dict[str, Any]]] = []

    for draft in drafts:
        screen = next((s for s in screens if s.id == draft.screen_id), None)
        if screen is None:
            continue
        layout = _layout_from_reconstruction(draft, screen, datasets)
        # Terapkan visual mode dan hotspot targets
        if not visual_mode:
            layout["visual_mode"] = False
        if hotspot_targets:
            screen_targets = hotspot_targets.get(screen.screen_key, {}) or {}
            for hotspot in layout.get("hotspots", []):
                hid = str(hotspot.get("id"))
                if hid in screen_targets:
                    hotspot["target_screen_key"] = screen_targets[hid]
                elif str(hotspot.get("id")) in screen_targets:
                    hotspot["target_screen_key"] = screen_targets[str(hotspot.get("id"))]
        prepared.append((draft, screen, layout))

    for index, (draft, screen, layout) in enumerate(prepared):
        db.add(
            SimulationScreen(
                simulation_id=simulation.id,
                screen_key=screen.screen_key,
                title=screen.title,
                route=f"/{screen.screen_key}",
                layout=layout,
                actions=[],
                order_index=index,
                source_screen_id=screen.id,
            )
        )

    for dataset_name, payload in datasets.items():
        db.add(
            SimulationDataset(
                simulation_id=simulation.id,
                name=dataset_name,
                description=f"Data dummy untuk layar terkait '{dataset_name}'",
                schema=payload["schema"],
                rows=payload["rows"],
                seed=payload["rows"],
            )
        )

    # Alur workflow standar dibuat otomatis supaya player langsung punya
    # alur approval (Draft -> Submitted -> Approved) sejak awal.
    from app.services import workflow as workflow_service

    workflow_payload = workflow_service.default_workflow()
    existing_workflow = db.scalar(
        select(SimulationWorkflow).where(
            SimulationWorkflow.simulation_id == simulation.id
        )
    )
    if existing_workflow is not None:
        # Rebuild: alur dikembalikan ke definisi standar.
        for key, value in workflow_payload.items():
            setattr(existing_workflow, key, value)
    else:
        db.add(SimulationWorkflow(simulation_id=simulation.id, **workflow_payload))

    db.flush()
    db.refresh(simulation)
    return simulation


def get_simulation(db: Session, project_id: int) -> Simulation:
    simulation = db.scalar(select(Simulation).where(Simulation.project_id == project_id))
    if simulation is None:
        raise NotFoundError("Simulasi belum dibuat untuk project ini")
    return simulation


def get_dataset(db: Session, simulation_id: int, name: str) -> SimulationDataset:
    dataset = db.scalar(
        select(SimulationDataset).where(
            SimulationDataset.simulation_id == simulation_id,
            SimulationDataset.name == name,
        )
    )
    if dataset is None:
        raise NotFoundError(f"Dataset '{name}' tidak ditemukan")
    return dataset


def sync_simulation_hotspots_for_screen(db: Session, screen_id: int) -> None:
    """Sinkronkan layout hotspots pada simulation_screens saat draf rekonstruksi berubah.
    
    Menjaga seluruh mapping target_screen_key, action, element_type, dan config_json
    yang sudah diatur pengguna di Simulation Builder agar tidak hilang / putus.
    """
    draft = db.scalar(
        select(Reconstruction)
        .where(Reconstruction.screen_id == screen_id)
        .options(selectinload(Reconstruction.components))
    )
    screen = db.get(Screen, screen_id)
    if not draft or not screen:
        return

    sim_screens = list(
        db.scalars(
            select(SimulationScreen).where(
                SimulationScreen.source_screen_id == screen_id
            )
        )
    )
    if not sim_screens:
        return

    for sim_s in sim_screens:
        existing_layout = dict(sim_s.layout or {})
        existing_hotspots = existing_layout.get("hotspots", [])
        # Preserve all editable hotspot properties
        hotspot_props_map: dict[str, dict[str, Any]] = {}
        for h in existing_hotspots:
            hid = str(h.get("id"))
            hotspot_props_map[hid] = {
                "target_screen_key": h.get("target_screen_key"),
                "action": h.get("action"),
                "element_type": h.get("element_type"),
                "config_json": h.get("config_json"),
            }

        new_layout = _layout_from_reconstruction(draft, screen, datasets={})
        new_hotspots = new_layout.get("hotspots", [])
        for h in new_hotspots:
            hid = str(h.get("id"))
            preserved = hotspot_props_map.get(hid, {})
            if preserved.get("target_screen_key"):
                h["target_screen_key"] = preserved["target_screen_key"]
            if preserved.get("action"):
                h["action"] = preserved["action"]
            if preserved.get("element_type"):
                h["element_type"] = preserved["element_type"]
            if preserved.get("config_json"):
                h["config_json"] = preserved["config_json"]

        existing_layout["hotspots"] = new_hotspots
        sim_s.layout = existing_layout
        db.add(sim_s)

    db.flush()


def definition(simulation: Simulation) -> dict[str, Any]:
    """Bentuk definisi simulasi yang dipakai runtime."""
    return {
        "id": simulation.id,
        "project_id": simulation.project_id,
        "name": simulation.name,
        "description": simulation.description,
        "status": simulation.status,
        "screens": [
            {
                "key": screen.screen_key,
                "title": screen.title,
                "route": screen.route,
                "layout": screen.layout,
                "actions": screen.actions,
                "source_screen_id": screen.source_screen_id,
            }
            for screen in sorted(simulation.screens, key=lambda s: s.order_index)
        ],
        "datasets": {
            dataset.name: {
                "schema": dataset.schema,
                "rows": dataset.rows,
            }
            for dataset in simulation.datasets
        },
    }
