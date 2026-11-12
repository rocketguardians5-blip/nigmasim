"""Fase 4: mesin pembangun simulasi + data dummy.

Sumbernya adalah rekonstruksi Phase 3 yang sudah disetujui manusia.
Mesin ini hanya menyusun kerangka; isi data dummy dibuat dari kolom yang
terdeteksi, DAN SELURUHNYA BISA DIEDIT manusia.
"""

from __future__ import annotations

import random
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

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


def _layout_from_reconstruction(
    draft: Reconstruction, screen: Screen, datasets: dict[str, Any]
) -> dict[str, Any]:
    """Susun kerangka tampilan dari komponen yang terdeteksi."""
    components = draft.components or []
    cards = [c for c in components if c.component_type == "card"]
    tables = [c for c in components if c.component_type == "table"]
    fields = [c for c in components if c.component_type == "field"]
    buttons = [c for c in components if c.component_type == "button"]
    headings = [c for c in components if c.component_type == "heading"]

    layout: dict[str, Any] = {
        "subtitle": screen.route_label or screen.source_url or "",
        "cards": [],
        "table": None,
        "form": None,
        "buttons": [],
        "title": headings[0].label if headings else screen.title,
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
