"""Definisi & implementasi tools untuk AI Agent.

Pisahkan definisi (schema) dari implementasi supaya mudah ditambah/diubah.
Semua tool read-only untuk keamanan; tool write butuh validasi permission di sini.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.registry import Application, Project
from app.models.capture import Screen, ScreenElement
from app.models.reconstruction import Reconstruction, ReconstructionComponent, ReconstructionAssumption
from app.models.simulation import Simulation
from app.schemas.agent import (
    ToolDefinition,
    ListApplicationsParams,
    GetApplicationParams,
    ListScreensParams,
    GetScreenElementsParams,
    GetReconstructionParams,
    GetSimulationParams,
    ApplicationSummary,
    ScreenSummary,
    ScreenElementSummary,
    ReconstructionSummary,
    SimulationSummary,
)


# ============================================================
# TOOL DEFINITIONS (OpenAI function calling format)
# ============================================================

TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        type="function",
        function={
            "name": "list_applications",
            "description": "Daftar aplikasi terdaftar di NigmaSim. Bisa filter by search term dan status autorisasi.",
            "parameters": ListApplicationsParams.model_json_schema(),
        },
    ),
    ToolDefinition(
        type="function",
        function={
            "name": "get_application",
            "description": "Detail lengkap satu aplikasi berdasarkan ID.",
            "parameters": GetApplicationParams.model_json_schema(),
        },
    ),
    ToolDefinition(
        type="function",
        function={
            "name": "list_screens",
            "description": "Daftar screen (layar) dalam satu project. Butuh project_id.",
            "parameters": ListScreensParams.model_json_schema(),
        },
    ),
    ToolDefinition(
        type="function",
        function={
            "name": "get_screen_elements",
            "description": "Elemen-elemen UI yang terdeteksi pada sebuah screen (hasil capture + deteksi otomatis).",
            "parameters": GetScreenElementsParams.model_json_schema(),
        },
    ),
    ToolDefinition(
        type="function",
        function={
            "name": "get_reconstruction",
            "description": "Status draft rekonstruksi UI untuk sebuah screen: komponen, asumsi, layout.",
            "parameters": GetReconstructionParams.model_json_schema(),
        },
    ),
    ToolDefinition(
        type="function",
        function={
            "name": "get_simulation",
            "description": "Informasi simulasi yang sudah dibangun untuk sebuah project.",
            "parameters": GetSimulationParams.model_json_schema(),
        },
    ),
]


# ============================================================
# TOOL IMPLEMENTATIONS
# ============================================================

def _serialize_application(app: Application) -> ApplicationSummary:
    return ApplicationSummary(
        id=app.id,
        name=app.name,
        description=app.description,
        source_url=app.source_url,
        authorization_status=app.authorization_status,
    )


def _serialize_screen(screen: Screen) -> ScreenSummary:
    return ScreenSummary(
        id=screen.id,
        name=screen.name,
        description=screen.description,
        status=screen.status,
    )


def _serialize_element(el: ScreenElement) -> ScreenElementSummary:
    return ScreenElementSummary(
        id=el.id,
        element_type=el.element_type,
        label=el.label,
        selector=el.selector,
        percent_box=el.percent_box,
    )


def _serialize_reconstruction(rec: Reconstruction) -> ReconstructionSummary:
    unresolved = sum(1 for a in rec.assumptions if not a.resolved)
    return ReconstructionSummary(
        id=rec.id,
        status=rec.status,
        layout=rec.layout,
        components_count=len(rec.components),
        assumptions_count=len(rec.assumptions),
        unresolved_count=unresolved,
    )


def _serialize_simulation(sim: Simulation) -> SimulationSummary:
    return SimulationSummary(
        id=sim.id,
        name=sim.name,
        status=sim.status,
        version=sim.version,
    )


# --- Tool functions ---

def tool_list_applications(db: Session, params: ListApplicationsParams) -> list[ApplicationSummary]:
    stmt = select(Application)
    if params.search:
        stmt = stmt.where(Application.name.ilike(f"%{params.search}%"))
    if params.status:
        stmt = stmt.where(Application.authorization_status == params.status)
    stmt = stmt.order_by(Application.created_at.desc()).offset((params.page - 1) * 50).limit(50)
    apps = db.execute(stmt).scalars().all()
    return [_serialize_application(a) for a in apps]


def tool_get_application(db: Session, params: GetApplicationParams) -> ApplicationSummary | dict:
    app = db.get(Application, params.id)
    if not app:
        return {"error": f"Aplikasi dengan ID {params.id} tidak ditemukan"}
    return _serialize_application(app)


def tool_list_screens(db: Session, params: ListScreensParams) -> list[ScreenSummary]:
    # Verify project exists
    project = db.get(Project, params.project_id)
    if not project:
        return [{"error": f"Project dengan ID {params.project_id} tidak ditemukan"}]
    stmt = select(Screen).where(Screen.project_id == params.project_id)
    if params.search:
        stmt = stmt.where(Screen.name.ilike(f"%{params.search}%"))
    stmt = stmt.order_by(Screen.created_at.desc()).offset((params.page - 1) * 50).limit(50)
    screens = db.execute(stmt).scalars().all()
    return [_serialize_screen(s) for s in screens]


def tool_get_screen_elements(db: Session, params: GetScreenElementsParams) -> list[ScreenElementSummary]:
    screen = db.get(Screen, params.screen_id)
    if not screen:
        return [{"error": f"Screen dengan ID {params.screen_id} tidak ditemukan"}]
    stmt = select(ScreenElement).where(ScreenElement.screen_id == params.screen_id).order_by(ScreenElement.id)
    elements = db.execute(stmt).scalars().all()
    return [_serialize_element(el) for el in elements]


def tool_get_reconstruction(db: Session, params: GetReconstructionParams) -> ReconstructionSummary | dict:
    stmt = (
        select(Reconstruction)
        .where(Reconstruction.screen_id == params.screen_id)
        .options(
            selectinload(Reconstruction.components),
            selectinload(Reconstruction.assumptions),
        )
    )
    rec = db.execute(stmt).scalars().first()
    if not rec:
        return {"error": f"Reconstruction untuk screen {params.screen_id} tidak ditemukan"}
    return _serialize_reconstruction(rec)


def tool_get_simulation(db: Session, params: GetSimulationParams) -> SimulationSummary | dict:
    stmt = select(Simulation).where(Simulation.project_id == params.project_id).order_by(Simulation.created_at.desc())
    sim = db.execute(stmt).scalars().first()
    if not sim:
        return {"error": f"Simulasi untuk project {params.project_id} tidak ditemukan"}
    return _serialize_simulation(sim)


# ============================================================
# TOOL REGISTRY (name -> function)
# ============================================================

TOOL_FUNCTIONS = {
    "list_applications": tool_list_applications,
    "get_application": tool_get_application,
    "list_screens": tool_list_screens,
    "get_screen_elements": tool_get_screen_elements,
    "get_reconstruction": tool_get_reconstruction,
    "get_simulation": tool_get_simulation,
}


def get_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions in OpenAI format."""
    return [t.model_dump() for t in TOOL_DEFINITIONS]


def execute_tool(name: str, db: Session, arguments: dict[str, Any]) -> Any:
    """Execute a tool by name with given arguments."""
    if name not in TOOL_FUNCTIONS:
        return {"error": f"Tool '{name}' tidak dikenal"}
    func = TOOL_FUNCTIONS[name]
    try:
        # Validate arguments using the param model
        # We need to map tool name to param model
        param_models = {
            "list_applications": ListApplicationsParams,
            "get_application": GetApplicationParams,
            "list_screens": ListScreensParams,
            "get_screen_elements": GetScreenElementsParams,
            "get_reconstruction": GetReconstructionParams,
            "get_simulation": GetSimulationParams,
        }
        param_model = param_models.get(name)
        if param_model:
            validated = param_model(**arguments)
            return func(db, validated)
        return func(db, arguments)
    except Exception as e:
        return {"error": f"Gagal eksekusi tool {name}: {str(e)}"}