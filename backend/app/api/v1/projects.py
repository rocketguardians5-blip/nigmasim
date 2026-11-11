"""Endpoint Project (di bawah Application)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db
from app.models.registry import Application, Project
from app.models.user import User
from app.schemas.common import MessageResponse, Page
from app.schemas.registry import ProjectCreate, ProjectOut, ProjectUpdate
from app.services import audit

router = APIRouter(tags=["projects"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/applications/{application_id}/projects", response_model=Page[ProjectOut])
def list_projects(
    application_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    _: User = Depends(require_permission("projects:read")),
    db: Session = Depends(get_db),
) -> Page[ProjectOut]:
    if db.get(Application, application_id) is None:
        raise NotFoundError("Aplikasi tidak ditemukan")

    base = select(Project).where(Project.application_id == application_id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(Project.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page[ProjectOut](
        items=[ProjectOut.model_validate(r) for r in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/applications/{application_id}/projects", response_model=ProjectOut, status_code=201)
def create_project(
    application_id: int,
    payload: ProjectCreate,
    request: Request,
    actor: User = Depends(require_permission("projects:write")),
    db: Session = Depends(get_db),
) -> Project:
    app_obj = db.get(Application, application_id)
    if app_obj is None:
        raise NotFoundError("Aplikasi tidak ditemukan")
    if not app_obj.is_authorized:
        raise ConflictError(
            "Aplikasi belum memiliki otorisasi capture. Project hanya dapat dibuat "
            "setelah status otorisasi 'approved'."
        )

    duplicate = db.scalar(
        select(Project).where(
            Project.application_id == application_id,
            func.lower(Project.name) == payload.name.lower().strip(),
        )
    )
    if duplicate:
        raise ConflictError("Nama project sudah ada pada aplikasi ini")

    project = Project(
        application_id=application_id,
        name=payload.name.strip(),
        description=payload.description,
        version=payload.version,
        status="draft",
        created_by=actor.id,
    )
    db.add(project)
    db.flush()
    audit.record(
        db,
        actor_id=actor.id,
        action="project.create",
        entity_type="project",
        entity_id=project.id,
        meta={"application_id": application_id, "name": project.name},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    _: User = Depends(require_permission("projects:read")),
    db: Session = Depends(get_db),
) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")
    return project


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    request: Request,
    actor: User = Depends(require_permission("projects:write")),
    db: Session = Depends(get_db),
) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        data["name"] = data["name"].strip()

    for key, value in data.items():
        setattr(project, key, value)

    audit.record(
        db,
        actor_id=actor.id,
        action="project.update",
        entity_type="project",
        entity_id=project.id,
        meta={"changes": list(data.keys())},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", response_model=MessageResponse)
def delete_project(
    project_id: int,
    request: Request,
    actor: User = Depends(require_permission("projects:write")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")

    audit.record(
        db,
        actor_id=actor.id,
        action="project.delete",
        entity_type="project",
        entity_id=project.id,
        meta={"name": project.name},
        ip_address=_ip(request),
    )
    db.delete(project)
    db.commit()
    return MessageResponse(message="Project berhasil dihapus")
