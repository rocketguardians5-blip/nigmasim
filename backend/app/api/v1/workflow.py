"""Endpoint Fase 5 - Workflow (alur approval) & Tutorial (guided walkthrough)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db
from app.models.simulation import (
    Simulation,
    SimulationDataset,
    SimulationTutorial,
    SimulationWorkflowRecord,
)
from app.models.user import User
from app.services import audit, workflow as workflow_service

router = APIRouter(prefix="/simulation", tags=["workflow"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


class WorkflowUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    states: list[dict[str, Any]] | None = None
    transitions: list[dict[str, Any]] | None = None
    initial_state: str | None = None
    state_field: str | None = None


class TransitionRequest(BaseModel):
    dataset: str
    row_id: str
    action: str
    role: str = "staf"
    by: str | None = None
    note: str | None = None


class TutorialStep(BaseModel):
    no: int = 0
    screen: str | None = None
    target: str | None = None
    instruction: str = ""
    expected: str | None = None


class TutorialCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str | None = None
    steps: list[TutorialStep] = []


class TutorialUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(draft|published)$")
    steps: list[TutorialStep] | None = None


# ------------------------------------------------------------------ Workflow


@router.get("/{simulation_id}/workflow")
def get_workflow(
    simulation_id: int,
    _: User = Depends(require_permission("simulation:read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if db.get(Simulation, simulation_id) is None:
        raise NotFoundError("Simulasi tidak ditemukan")
    workflow = workflow_service.get_workflow(db, simulation_id, create=False)
    return workflow_service.workflow_definition(workflow)


@router.put("/{simulation_id}/workflow")
def update_workflow(
    simulation_id: int,
    payload: WorkflowUpdate,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    workflow = workflow_service.get_workflow(db, simulation_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(workflow, key, value)
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.workflow_update",
        entity_type="simulation",
        entity_id=simulation_id,
        meta={"states": len(workflow.states), "transitions": len(workflow.transitions)},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(workflow)
    return workflow_service.workflow_definition(workflow)


@router.post("/{simulation_id}/workflow/default")
def reset_workflow(
    simulation_id: int,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Kembalikan alur ke definisi standar (Draft -> Submitted -> Approved)."""
    workflow = workflow_service.get_workflow(db, simulation_id)
    payload = workflow_service.default_workflow()
    workflow.name = payload["name"]
    workflow.states = payload["states"]
    workflow.transitions = payload["transitions"]
    workflow.initial_state = payload["initial_state"]
    workflow.state_field = payload["state_field"]
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.workflow_reset",
        entity_type="simulation",
        entity_id=simulation_id,
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(workflow)
    return workflow_service.workflow_definition(workflow)


@router.get("/{simulation_id}/workflow/records")
def list_records(
    simulation_id: int,
    dataset: str | None = None,
    _: User = Depends(require_permission("simulation:read")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    workflow = workflow_service.get_workflow(db, simulation_id, create=False)
    stmt = select(SimulationWorkflowRecord).where(
        SimulationWorkflowRecord.workflow_id == workflow.id
    )
    if dataset:
        stmt = stmt.where(
            SimulationWorkflowRecord.dataset_name == dataset
        )
    records = db.scalars(stmt).all()
    return [
        {
            "row_id": record.row_id,
            "dataset": record.dataset_name,
            "current_state": record.current_state,
            "history": record.history,
        }
        for record in records
    ]


@router.post("/{simulation_id}/workflow/transition")
def transition(
    simulation_id: int,
    payload: TransitionRequest,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Jalankan aksi alur pada satu baris data."""
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise NotFoundError("Simulasi tidak ditemukan")

    dataset = db.scalar(
        select(SimulationDataset).where(
            SimulationDataset.simulation_id == simulation_id,
            SimulationDataset.name == payload.dataset,
        )
    )
    if dataset is None:
        raise NotFoundError(f"Dataset '{payload.dataset}' tidak ditemukan")
    if not any(row.get("_id") == payload.row_id for row in dataset.rows):
        raise NotFoundError("Baris tidak ditemukan")

    workflow = workflow_service.get_workflow(db, simulation_id)
    record = workflow_service.ensure_record(db, workflow, payload.dataset, payload.row_id)
    workflow_service.apply_transition(
        db,
        workflow,
        record,
        payload.action,
        role=payload.role,
        by=payload.by or actor.name,
        note=payload.note,
    )
    workflow_service.sync_state_field(db, workflow, dataset, record)

    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.workflow_transition",
        entity_type="simulation",
        entity_id=simulation_id,
        meta={
            "dataset": payload.dataset,
            "row_id": payload.row_id,
            "action": payload.action,
            "role": payload.role,
            "state": record.current_state,
        },
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(record)
    return {
        "row_id": record.row_id,
        "current_state": record.current_state,
        "history": record.history,
        "available": workflow_service.available_transitions(
            workflow, record.current_state, payload.role
        ),
    }


@router.post("/{simulation_id}/workflow/records/reset")
def reset_records(
    simulation_id: int,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Hapus riwayat workflow (semua baris kembali ke status awal)."""
    workflow = workflow_service.get_workflow(db, simulation_id, create=False)
    deleted = 0
    for record in db.scalars(
        select(SimulationWorkflowRecord).where(
            SimulationWorkflowRecord.workflow_id == workflow.id
        )
    ):
        db.delete(record)
        deleted += 1
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.workflow_records_reset",
        entity_type="simulation",
        entity_id=simulation_id,
        meta={"deleted": deleted},
        ip_address=_ip(request),
    )
    db.commit()
    return {"message": f"{deleted} riwayat workflow dihapus"}


# ------------------------------------------------------------------ Tutorial


@router.get("/{simulation_id}/tutorials")
def list_tutorials(
    simulation_id: int,
    _: User = Depends(require_permission("simulation:read")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    tutorials = db.scalars(
        select(SimulationTutorial)
        .where(SimulationTutorial.simulation_id == simulation_id)
        .order_by(SimulationTutorial.id)
    ).all()
    return [workflow_service.tutorial_definition(item) for item in tutorials]


@router.post("/{simulation_id}/tutorials", status_code=201)
def create_tutorial(
    simulation_id: int,
    payload: TutorialCreate,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if db.get(Simulation, simulation_id) is None:
        raise NotFoundError("Simulasi tidak ditemukan")

    steps = [
        {
            "no": index + 1,
            "screen": step.screen,
            "target": step.target,
            "instruction": step.instruction,
            "expected": step.expected,
        }
        for index, step in enumerate(payload.steps)
    ]
    tutorial = SimulationTutorial(
        simulation_id=simulation_id,
        title=payload.title,
        description=payload.description,
        status="draft",
        steps=steps,
    )
    db.add(tutorial)
    db.flush()
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.tutorial_create",
        entity_type="tutorial",
        entity_id=tutorial.id,
        meta={"steps": len(steps)},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(tutorial)
    return workflow_service.tutorial_definition(tutorial)


@router.put("/{simulation_id}/tutorials/{tutorial_id}")
def update_tutorial(
    simulation_id: int,
    tutorial_id: int,
    payload: TutorialUpdate,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    tutorial = db.get(SimulationTutorial, tutorial_id)
    if tutorial is None or tutorial.simulation_id != simulation_id:
        raise NotFoundError("Tutorial tidak ditemukan")

    data = payload.model_dump(exclude_unset=True)
    if "steps" in data and data["steps"] is not None:
        data["steps"] = [
            {
                "no": index + 1,
                "screen": step.screen,
                "target": step.target,
                "instruction": step.instruction,
                "expected": step.expected,
            }
            for index, step in enumerate(data["steps"])
        ]
    for key, value in data.items():
        setattr(tutorial, key, value)

    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.tutorial_update",
        entity_type="tutorial",
        entity_id=tutorial.id,
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(tutorial)
    return workflow_service.tutorial_definition(tutorial)


@router.delete("/{simulation_id}/tutorials/{tutorial_id}")
def delete_tutorial(
    simulation_id: int,
    tutorial_id: int,
    request: Request,
    actor: User = Depends(require_permission("simulation:write")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    tutorial = db.get(SimulationTutorial, tutorial_id)
    if tutorial is None or tutorial.simulation_id != simulation_id:
        raise NotFoundError("Tutorial tidak ditemukan")
    db.delete(tutorial)
    audit.record(
        db,
        actor_id=actor.id,
        action="simulation.tutorial_delete",
        entity_type="tutorial",
        entity_id=tutorial_id,
        ip_address=_ip(request),
    )
    db.commit()
    return {"message": "Tutorial dihapus"}
