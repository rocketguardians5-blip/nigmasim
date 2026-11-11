"""Endpoint Application Registry."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db
from app.models.registry import Application
from app.models.user import User
from app.schemas.common import MessageResponse, Page
from app.schemas.registry import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationUpdate,
    AuthorizationUpdate,
)
from app.services import audit

router = APIRouter(prefix="/applications", tags=["applications"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=Page[ApplicationOut])
def list_applications(
    search: str | None = Query(default=None, max_length=150),
    authorization_status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_permission("applications:read")),
    db: Session = Depends(get_db),
) -> Page[ApplicationOut]:
    stmt = select(Application)
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Application.name).like(needle),
                func.lower(Application.description).like(needle),
                func.lower(Application.owner).like(needle),
            )
        )
    if authorization_status:
        stmt = stmt.where(Application.authorization_status == authorization_status)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Application.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page[ApplicationOut](
        items=[ApplicationOut.model_validate(r) for r in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=ApplicationOut, status_code=201)
def create_application(
    payload: ApplicationCreate,
    request: Request,
    actor: User = Depends(require_permission("applications:write")),
    db: Session = Depends(get_db),
) -> Application:
    duplicate = db.scalar(
        select(Application).where(func.lower(Application.name) == payload.name.lower().strip())
    )
    if duplicate:
        raise ConflictError("Nama aplikasi sudah terdaftar")

    app_obj = Application(
        **payload.model_dump(),
        authorization_status="pending",
        created_by=actor.id,
    )
    app_obj.name = payload.name.strip()
    db.add(app_obj)
    db.flush()
    audit.record(
        db,
        actor_id=actor.id,
        action="application.create",
        entity_type="application",
        entity_id=app_obj.id,
        meta={"name": app_obj.name, "source_url": app_obj.source_url},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(app_obj)
    return app_obj


@router.get("/{application_id}", response_model=ApplicationOut)
def get_application(
    application_id: int,
    _: User = Depends(require_permission("applications:read")),
    db: Session = Depends(get_db),
) -> Application:
    app_obj = db.get(Application, application_id)
    if app_obj is None:
        raise NotFoundError("Aplikasi tidak ditemukan")
    return app_obj


@router.patch("/{application_id}", response_model=ApplicationOut)
def update_application(
    application_id: int,
    payload: ApplicationUpdate,
    request: Request,
    actor: User = Depends(require_permission("applications:write")),
    db: Session = Depends(get_db),
) -> Application:
    app_obj = db.get(Application, application_id)
    if app_obj is None:
        raise NotFoundError("Aplikasi tidak ditemukan")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        name = data["name"].strip()
        duplicate = db.scalar(
            select(Application).where(
                func.lower(Application.name) == name.lower(), Application.id != application_id
            )
        )
        if duplicate:
            raise ConflictError("Nama aplikasi sudah dipakai")
        data["name"] = name

    for key, value in data.items():
        setattr(app_obj, key, value)

    audit.record(
        db,
        actor_id=actor.id,
        action="application.update",
        entity_type="application",
        entity_id=app_obj.id,
        meta={"changes": list(data.keys())},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(app_obj)
    return app_obj


@router.patch("/{application_id}/authorization", response_model=ApplicationOut)
def update_authorization(
    application_id: int,
    payload: AuthorizationUpdate,
    request: Request,
    actor: User = Depends(require_permission("applications:authorize")),
    db: Session = Depends(get_db),
) -> Application:
    app_obj = db.get(Application, application_id)
    if app_obj is None:
        raise NotFoundError("Aplikasi tidak ditemukan")
    if payload.authorization_status == "approved" and not payload.authorization_ref:
        raise ConflictError(
            "Status approved wajib menyertakan rujukan dokumen izin (authorization_ref)"
        )

    app_obj.authorization_status = payload.authorization_status
    app_obj.authorization_ref = payload.authorization_ref
    app_obj.authorization_note = payload.authorization_note

    audit.record(
        db,
        actor_id=actor.id,
        action="application.authorization",
        entity_type="application",
        entity_id=app_obj.id,
        meta={
            "status": payload.authorization_status,
            "ref": payload.authorization_ref,
        },
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(app_obj)
    return app_obj


@router.delete("/{application_id}", response_model=MessageResponse)
def delete_application(
    application_id: int,
    request: Request,
    actor: User = Depends(require_permission("applications:write")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    app_obj = db.get(Application, application_id)
    if app_obj is None:
        raise NotFoundError("Aplikasi tidak ditemukan")
    if app_obj.projects:
        raise ConflictError(
            "Aplikasi masih memiliki project. Hapus atau arsipkan project terlebih dahulu."
        )

    audit.record(
        db,
        actor_id=actor.id,
        action="application.delete",
        entity_type="application",
        entity_id=app_obj.id,
        meta={"name": app_obj.name},
        ip_address=_ip(request),
    )
    db.delete(app_obj)
    db.commit()
    return MessageResponse(message="Aplikasi berhasil dihapus")
