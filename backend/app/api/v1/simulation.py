"""Endpoint Fase 4 - Simulation Builder & data dummy.

Semua perubahan data HANYA menyentuh baris dummy di dalam simulasi.
Reset mengembalikan data ke kondisi awal (seed).
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db
from app.models.simulation import Simulation, SimulationDataset
from app.models.user import User
from app.services import audit, simulation as simulation_service

router = APIRouter(prefix="/simulation", tags=["simulation"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/project/{project_id}", status_code=201)
def create_simulation(
    project_id: int,
    request: Request,
    name: str = "Simulasi Demo",
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    sim = simulation_service.build_simulation(
        db, project_id, name=name, actor_id=actor.id
    )
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.create",
        entity_type="simulation",
        entity_id=sim.id,
        meta={"project_id": project_id},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(sim)
    return simulation_service.definition(sim)


@router.get("/project/{project_id}")
def get_project_simulation(
    project_id: int,
    _: User = Depends(require_permission("simulation:read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    sim = simulation_service.get_simulation(db, project_id)
    return simulation_service.definition(sim)


@router.get("/{simulation_id}")
def get_simulation(
    simulation_id: int,
    _: User = Depends(require_permission("simulation:read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    sim = db.get(Simulation, simulation_id)
    if sim is None:
        raise NotFoundError("Simulasi tidak ditemukan")
    return simulation_service.definition(sim)


@router.delete("/project/{project_id}")
def delete_simulation(
    project_id: int,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    sim = simulation_service.get_simulation(db, project_id)
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.delete",
        entity_type="simulation",
        entity_id=sim.id,
        ip_address=_ip(request),
    )
    db.delete(sim)
    db.commit()
    return {"message": "Simulasi dihapus"}


# ---------------------------------------------------------------- Data dummy


@router.get("/{simulation_id}/datasets")
def list_datasets(
    simulation_id: int,
    _: User = Depends(require_permission("simulation:read")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    sim = db.get(Simulation, simulation_id)
    if sim is None:
        raise NotFoundError("Simulasi tidak ditemukan")
    return [
        {
            "name": dataset.name,
            "description": dataset.description,
            "schema": dataset.schema,
            "row_count": len(dataset.rows),
        }
        for dataset in sim.datasets
    ]


def _dataset_or_404(db: Session, simulation_id: int, name: str) -> SimulationDataset:
    return simulation_service.get_dataset(db, simulation_id, name)


@router.post("/{simulation_id}/datasets/{name}/rows", status_code=201)
def add_row(
    simulation_id: int,
    name: str,
    payload: dict[str, Any],
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    dataset = _dataset_or_404(db, simulation_id, name)
    row: dict[str, Any] = {"_id": uuid.uuid4().hex[:12]}
    for column in dataset.schema:
        row[column["key"]] = payload.get(column["key"])

    dataset.rows = [*dataset.rows, row]
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.row_create",
        entity_type="simulation",
        entity_id=simulation_id,
        meta={"dataset": name},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(dataset)
    return row


@router.patch("/{simulation_id}/datasets/{name}/rows/{row_id}")
def update_row(
    simulation_id: int,
    name: str,
    row_id: str,
    payload: dict[str, Any],
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    dataset = _dataset_or_404(db, simulation_id, name)
    rows = list(dataset.rows)
    for index, row in enumerate(rows):
        if row.get("_id") == row_id:
            updated = dict(row)
            for column in dataset.schema:
                if column["key"] in payload:
                    updated[column["key"]] = payload[column["key"]]
            rows[index] = updated
            dataset.rows = rows
            audit.record(
                db,
                actor_id=actor.id,
                action="simulation.row_update",
                entity_type="simulation",
                entity_id=simulation_id,
                meta={"dataset": name, "row_id": row_id},
                ip_address=_ip(request),
            )
            db.commit()
            db.refresh(dataset)
            return updated
    raise NotFoundError("Baris tidak ditemukan")


@router.delete("/{simulation_id}/datasets/{name}/rows/{row_id}")
def delete_row(
    simulation_id: int,
    name: str,
    row_id: str,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    dataset = _dataset_or_404(db, simulation_id, name)
    rows = [row for row in dataset.rows if row.get("_id") != row_id]
    if len(rows) == len(dataset.rows):
        raise NotFoundError("Baris tidak ditemukan")
    dataset.rows = rows
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.row_delete",
        entity_type="simulation",
        entity_id=simulation_id,
        meta={"dataset": name, "row_id": row_id},
        ip_address=_ip(request),
    )
    db.commit()
    return {"message": "Baris dihapus"}


@router.post("/{simulation_id}/datasets/{name}/rows/bulk")
def bulk_add_rows(
    simulation_id: int,
    name: str,
    payload: dict[str, Any],
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Impor banyak baris sekaligus (tempel dari Excel/CSV)."""
    dataset = _dataset_or_404(db, simulation_id, name)
    incoming = payload.get("rows") or []
    if not isinstance(incoming, list):
        raise ConflictError("Payload harus berisi daftar baris")

    new_rows: list[dict[str, Any]] = []
    for item in incoming:
        if not isinstance(item, dict):
            continue
        row: dict[str, Any] = {"_id": uuid.uuid4().hex[:12]}
        for column in dataset.schema:
            row[column["key"]] = item.get(column["key"])
        new_rows.append(row)

    dataset.rows = [*dataset.rows, *new_rows]
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.rows_bulk_create",
        entity_type="simulation",
        entity_id=simulation_id,
        meta={"dataset": name, "count": len(new_rows)},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(dataset)
    return {"message": f"{len(new_rows)} baris ditambahkan", "total": len(dataset.rows)}


@router.post("/{simulation_id}/reset")
def reset_simulation(
    simulation_id: int,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Kembalikan semua dataset ke data awal."""
    sim = db.get(Simulation, simulation_id)
    if sim is None:
        raise NotFoundError("Simulasi tidak ditemukan")

    restored = 0
    for dataset in sim.datasets:
        dataset.rows = [dict(row) for row in dataset.seed]
        restored += len(dataset.rows)

    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.reset",
        entity_type="simulation",
        entity_id=simulation_id,
        meta={"rows": restored},
        ip_address=_ip(request),
    )
    db.commit()
    return {"message": f"{restored} baris dikembalikan ke data awal"}
