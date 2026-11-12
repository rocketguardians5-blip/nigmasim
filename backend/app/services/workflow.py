"""Fase 5: mesin workflow (alur approval) & tutorial (guided walkthrough).

Semua workflow hanya mengubah DATA SIMULASI. Tidak ada notifikasi ke sistem
luar dan tidak ada perubahan ke aplikasi sumber.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models.simulation import (
    Simulation,
    SimulationDataset,
    SimulationTutorial,
    SimulationWorkflow,
    SimulationWorkflowRecord,
)

# Alur standar untuk pengajuan yang perlu persetujuan.
DEFAULT_STATES: list[dict[str, str]] = [
    {"key": "draft", "label": "Draft", "role": "staf"},
    {"key": "submitted", "label": "Diajukan", "role": "staf"},
    {"key": "in_review", "label": "Direview", "role": "manager"},
    {"key": "approved", "label": "Disetujui", "role": "manager"},
    {"key": "rejected", "label": "Ditolak", "role": "manager"},
    {"key": "revision", "label": "Perlu Revisi", "role": "staf"},
]

DEFAULT_TRANSITIONS: list[dict[str, str]] = [
    {"from": "draft", "to": "submitted", "action": "submit", "label": "Ajukan", "role": "staf"},
    {
        "from": "submitted",
        "to": "in_review",
        "action": "review",
        "label": "Mulai Review",
        "role": "manager",
    },
    {
        "from": "in_review",
        "to": "approved",
        "action": "approve",
        "label": "Setujui",
        "role": "manager",
    },
    {
        "from": "in_review",
        "to": "rejected",
        "action": "reject",
        "label": "Tolak",
        "role": "manager",
    },
    {
        "from": "rejected",
        "to": "revision",
        "action": "revise",
        "label": "Ajukan Revisi",
        "role": "staf",
    },
    {
        "from": "revision",
        "to": "submitted",
        "action": "resubmit",
        "label": "Ajukan Ulang",
        "role": "staf",
    },
]


def default_workflow() -> dict[str, Any]:
    return {
        "name": "Alur Persetujuan",
        "states": [dict(state) for state in DEFAULT_STATES],
        "transitions": [dict(transition) for transition in DEFAULT_TRANSITIONS],
        "initial_state": "draft",
        "state_field": "status",
    }


def get_workflow(db: Session, simulation_id: int, *, create: bool = True) -> SimulationWorkflow:
    workflow = db.scalar(
        select(SimulationWorkflow).where(SimulationWorkflow.simulation_id == simulation_id)
    )
    if workflow is not None:
        return workflow
    if not create:
        raise NotFoundError("Alur workflow belum dibuat untuk simulasi ini")

    payload = default_workflow()
    workflow = SimulationWorkflow(simulation_id=simulation_id, **payload)
    db.add(workflow)
    db.flush()
    return workflow


def workflow_definition(workflow: SimulationWorkflow) -> dict[str, Any]:
    return {
        "id": workflow.id,
        "simulation_id": workflow.simulation_id,
        "name": workflow.name,
        "states": workflow.states,
        "transitions": workflow.transitions,
        "initial_state": workflow.initial_state,
        "state_field": workflow.state_field,
    }


def available_transitions(
    workflow: SimulationWorkflow, state: str, role: str
) -> list[dict[str, str]]:
    """Transisi yang boleh dijalankan dari `state` oleh peran `role`."""
    return [
        transition
        for transition in workflow.transitions
        if transition.get("from") == state
        and (not transition.get("role") or transition.get("role") == role)
    ]


def get_record(
    db: Session, workflow_id: int, dataset_name: str, row_id: str
) -> SimulationWorkflowRecord:
    record = db.scalar(
        select(SimulationWorkflowRecord).where(
            SimulationWorkflowRecord.workflow_id == workflow_id,
            SimulationWorkflowRecord.dataset_name == dataset_name,
            SimulationWorkflowRecord.row_id == row_id,
        )
    )
    if record is None:
        raise NotFoundError("Riwayat workflow untuk baris ini belum ada")
    return record


def ensure_record(
    db: Session, workflow: SimulationWorkflow, dataset_name: str, row_id: str
) -> SimulationWorkflowRecord:
    record = db.scalar(
        select(SimulationWorkflowRecord).where(
            SimulationWorkflowRecord.workflow_id == workflow.id,
            SimulationWorkflowRecord.dataset_name == dataset_name,
            SimulationWorkflowRecord.row_id == row_id,
        )
    )
    if record is not None:
        return record
    record = SimulationWorkflowRecord(
        workflow_id=workflow.id,
        dataset_name=dataset_name,
        row_id=row_id,
        current_state=workflow.initial_state,
        history=[
            {
                "state": workflow.initial_state,
                "action": "create",
                "by": "sistem",
                "by_role": "sistem",
                "at": datetime.now(timezone.utc).isoformat(),
                "note": "Baris dibuat dengan status awal",
            }
        ],
    )
    db.add(record)
    db.flush()
    return record


def apply_transition(
    db: Session,
    workflow: SimulationWorkflow,
    record: SimulationWorkflowRecord,
    action: str,
    *,
    role: str,
    by: str = "operator",
    note: str | None = None,
) -> SimulationWorkflowRecord:
    """Jalankan transisi status - hanya kalau aturan mengizinkan."""
    options = available_transitions(workflow, record.current_state, role)
    chosen = next((item for item in options if item.get("action") == action), None)
    if chosen is None:
        raise ConflictError(
            f"Aksi '{action}' tidak tersedia dari status '{record.current_state}' "
            f"untuk peran '{role}'."
        )

    record.current_state = chosen["to"]
    history = list(record.history)
    history.append(
        {
            "state": chosen["to"],
            "action": action,
            "by": by,
            "by_role": role,
            "at": datetime.now(timezone.utc).isoformat(),
            "note": note,
        }
    )
    record.history = history
    db.flush()
    return record


def sync_state_field(
    db: Session,
    workflow: SimulationWorkflow,
    dataset: SimulationDataset,
    record: SimulationWorkflowRecord,
) -> None:
    """Tulis status workflow ke kolom status pada baris data (biar terlihat di tabel)."""
    if not dataset.schema:
        return
    has_status = any(column.get("key") == "status" for column in dataset.schema)
    if not has_status:
        return

    label = record.current_state
    for state in workflow.states:
        if state.get("key") == record.current_state:
            label = state.get("label") or record.current_state
            break

    rows = []
    for row in dataset.rows:
        if row.get("_id") == record.row_id:
            updated = dict(row)
            updated["status"] = label
            rows.append(updated)
        else:
            rows.append(row)
    dataset.rows = rows


# ------------------------------------------------------------------ Tutorial


def tutorial_definition(tutorial: SimulationTutorial) -> dict[str, Any]:
    return {
        "id": tutorial.id,
        "simulation_id": tutorial.simulation_id,
        "title": tutorial.title,
        "description": tutorial.description,
        "status": tutorial.status,
        "steps": tutorial.steps,
    }
