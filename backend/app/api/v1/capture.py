"""Endpoint Capture Studio, Screen Repository, element, dan interaksi."""

from __future__ import annotations

import io
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db, now_utc
from app.models.capture import CaptureSession, Interaction, Screen, ScreenElement
from app.models.registry import Application, Project
from app.models.user import User
from app.schemas.capture import (
    CaptureSessionCreate,
    CaptureSessionOut,
    ElementCreate,
    ElementOut,
    ElementUpdate,
    InteractionCreate,
    InteractionOut,
    InteractionUpdate,
    ReviewRequest,
    ScreenOut,
    ScreenUpdate,
)
from app.schemas.common import MessageResponse, Page
from app.services import audit, capture as capture_service
from app.workers import capture_client
from app.workers.capture_client import WorkerError, WorkerUnavailableError

router = APIRouter(tags=["capture"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _worker_or_503(exc: Exception):
    if isinstance(exc, WorkerUnavailableError):
        return ConflictError(
            "Capture Worker tidak aktif. Jalankan worker terlebih dahulu di "
            "folder capture-worker (uvicorn src.main:app --port 8010)."
        )
    return ConflictError(str(exc))


# ---------------------------------------------------------------- Capture sessions


@router.post("/projects/{project_id}/capture-sessions", response_model=CaptureSessionOut, status_code=201)
def create_session(
    project_id: int,
    payload: CaptureSessionCreate,
    request: Request,
    operator: User = Depends(require_permission("capture:operate")),
    db: Session = Depends(get_db),
) -> CaptureSession:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")

    session = capture_service.create_session(
        db,
        project,
        operator,
        notes=payload.notes,
        viewport_width=payload.viewport_width,
        viewport_height=payload.viewport_height,
    )
    audit.record(
        db,
        actor_id=operator.id,
        action="capture.session_create",
        entity_type="capture_session",
        entity_id=session.id,
        meta={"project_id": project_id},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(session)
    return session


@router.get("/projects/{project_id}/capture-sessions", response_model=Page[CaptureSessionOut])
def list_sessions(
    project_id: int,
    _: User = Depends(require_permission("capture:read")),
    db: Session = Depends(get_db),
) -> Page[CaptureSessionOut]:
    base = select(CaptureSession).where(CaptureSession.project_id == project_id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(CaptureSession.id.desc()).limit(100)).all()
    return Page[CaptureSessionOut](
        items=[CaptureSessionOut.model_validate(r) for r in rows],
        page=1,
        page_size=100,
        total=total,
    )


def _get_session(db: Session, session_id: int) -> CaptureSession:
    session = db.get(CaptureSession, session_id)
    if session is None:
        raise NotFoundError("Sesi capture tidak ditemukan")
    return session


@router.get("/capture-sessions/{session_id}", response_model=CaptureSessionOut)
def get_session(
    session_id: int,
    _: User = Depends(require_permission("capture:read")),
    db: Session = Depends(get_db),
) -> CaptureSession:
    return _get_session(db, session_id)


@router.post("/capture-sessions/{session_id}/start", response_model=CaptureSessionOut)
def start_session(
    session_id: int,
    request: Request,
    operator: User = Depends(require_permission("capture:operate")),
    db: Session = Depends(get_db),
) -> CaptureSession:
    session = _get_session(db, session_id)
    project = db.get(Project, session.project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")

    application = db.get(Application, project.application_id)
    if application is None:
        raise NotFoundError("Aplikasi tidak ditemukan")

    hosts = capture_service.allowed_hosts_for(application)
    start_url = application.login_url or application.source_url

    try:
        capture_client.start_session(
            start_url,
            session.viewport_width,
            session.viewport_height,
            hosts,
        )
    except (WorkerUnavailableError, WorkerError) as exc:
        raise _worker_or_503(exc) from exc

    session.status = "running"
    audit.record(
        db,
        actor_id=operator.id,
        action="capture.start",
        entity_type="capture_session",
        entity_id=session.id,
        meta={"url": start_url, "hosts": hosts},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(session)
    return session


@router.post("/capture-sessions/{session_id}/pause", response_model=CaptureSessionOut)
def pause_session(
    session_id: int,
    operator: User = Depends(require_permission("capture:operate")),
    db: Session = Depends(get_db),
) -> CaptureSession:
    session = _get_session(db, session_id)
    try:
        capture_client.pause_session()
    except (WorkerUnavailableError, WorkerError) as exc:
        raise _worker_or_503(exc) from exc
    session.status = "paused"
    db.commit()
    db.refresh(session)
    return session


@router.post("/capture-sessions/{session_id}/resume", response_model=CaptureSessionOut)
def resume_session(
    session_id: int,
    operator: User = Depends(require_permission("capture:operate")),
    db: Session = Depends(get_db),
) -> CaptureSession:
    session = _get_session(db, session_id)
    try:
        capture_client.resume_session()
    except (WorkerUnavailableError, WorkerError) as exc:
        raise _worker_or_503(exc) from exc
    session.status = "running"
    db.commit()
    db.refresh(session)
    return session


@router.post("/capture-sessions/{session_id}/stop", response_model=CaptureSessionOut)
def stop_session(
    session_id: int,
    operator: User = Depends(require_permission("capture:operate")),
    db: Session = Depends(get_db),
) -> CaptureSession:
    session = _get_session(db, session_id)
    try:
        capture_client.stop_session()
    except (WorkerUnavailableError, WorkerError) as exc:
        raise _worker_or_503(exc) from exc
    session.status = "stopped"
    session.ended_at = now_utc()
    db.commit()
    db.refresh(session)
    return session


@router.get("/capture-sessions/{session_id}/state")
def session_state(
    session_id: int,
    _: User = Depends(require_permission("capture:read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _get_session(db, session_id)
    try:
        return capture_client.session_state()
    except (WorkerUnavailableError, WorkerError) as exc:
        raise _worker_or_503(exc) from exc


@router.post("/capture-sessions/{session_id}/capture", response_model=ScreenOut, status_code=201)
def take_capture(
    session_id: int,
    request: Request,
    title: str | None = Query(default=None, max_length=200),
    full_page: bool = Query(default=False),
    operator: User = Depends(require_permission("capture:operate")),
    db: Session = Depends(get_db),
) -> Screen:
    session = _get_session(db, session_id)
    project = db.get(Project, session.project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")

    relative_dir = f"captures/project-{project.id}/session-{session.id}"
    try:
        meta = capture_client.take_capture(
            title or f"screen-{session.id}", full_page, relative_dir
        )
    except (WorkerUnavailableError, WorkerError) as exc:
        raise _worker_or_503(exc) from exc

    screen = capture_service.record_capture(db, session, project, meta, title=title)
    audit.record(
        db,
        actor_id=operator.id,
        action="capture.screen",
        entity_type="screen",
        entity_id=screen.id,
        meta={"url": screen.source_url, "elements": len(meta.get("elements", []) or [])},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(screen)
    return screen


# ---------------------------------------------------------------- Screens


@router.get("/projects/{project_id}/screens", response_model=Page[ScreenOut])
def list_screens(
    project_id: int,
    search: str | None = Query(default=None, max_length=200),
    tag: str | None = Query(default=None, max_length=60),
    review_status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> Page[ScreenOut]:
    stmt = select(Screen).where(Screen.project_id == project_id)
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Screen.title).like(needle),
                func.lower(Screen.screen_key).like(needle),
                func.lower(Screen.source_url).like(needle),
            )
        )
    if review_status:
        stmt = stmt.where(Screen.review_status == review_status)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Screen.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    if tag:
        rows = [r for r in rows if tag in (r.tags or [])]
        total = len(rows)

    return Page[ScreenOut](
        items=[ScreenOut.model_validate(r) for r in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/screens/{screen_id}", response_model=ScreenOut)
def get_screen(
    screen_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> Screen:
    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")
    return screen


@router.patch("/screens/{screen_id}", response_model=ScreenOut)
def update_screen(
    screen_id: int,
    payload: ScreenUpdate,
    request: Request,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> Screen:
    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")

    data = payload.model_dump(exclude_unset=True)
    if data.get("screen_key"):
        data["screen_key"] = capture_service.unique_screen_key(
            db, screen.project_id, str(data["screen_key"])
        )
    if "tags" in data and data["tags"] is not None:
        data["tags"] = [t.strip().lower()[:60] for t in data["tags"] if t and t.strip()][:12]

    for key, value in data.items():
        setattr(screen, key, value)

    audit.record(
        db,
        actor_id=operator.id,
        action="screen.update",
        entity_type="screen",
        entity_id=screen.id,
        meta={"changes": list(data.keys())},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(screen)
    return screen


@router.post("/screens/{screen_id}/review", response_model=ScreenOut)
def review_screen(
    screen_id: int,
    payload: ReviewRequest,
    request: Request,
    operator: User = Depends(require_permission("screens:review")),
    db: Session = Depends(get_db),
) -> Screen:
    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")

    screen.review_status = payload.review_status
    screen.reviewed_by = operator.id
    screen.reviewed_at = now_utc()
    if payload.notes is not None:
        screen.notes = payload.notes

    audit.record(
        db,
        actor_id=operator.id,
        action="screen.review",
        entity_type="screen",
        entity_id=screen.id,
        meta={"status": payload.review_status},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(screen)
    return screen


@router.delete("/screens/{screen_id}", response_model=MessageResponse)
def delete_screen(
    screen_id: int,
    request: Request,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")

    audit.record(
        db,
        actor_id=operator.id,
        action="screen.delete",
        entity_type="screen",
        entity_id=screen.id,
        meta={"title": screen.title},
        ip_address=_ip(request),
    )
    db.delete(screen)
    db.commit()
    return MessageResponse(message="Screen dihapus")


@router.get("/screens/{screen_id}/screenshot")
def get_screenshot(
    screen_id: int,
    masked: bool = Query(default=True, description="True = versi yang sudah disamarkan"),
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> Response:
    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")

    path = capture_service.absolute_path(screen.screenshot_path)
    if not path.exists():
        raise NotFoundError("File screenshot tidak ditemukan di storage")

    if not masked:
        return FileResponse(path, media_type="image/png", filename=path.name)

    from PIL import Image

    boxes = [
        e.bounding_box
        for e in db.scalars(select(ScreenElement).where(ScreenElement.screen_id == screen.id))
        if e.mask and e.bounding_box
    ]

    image = Image.open(path).convert("RGB")
    if boxes:
        from PIL import ImageDraw

        draw = ImageDraw.Draw(image)
        for box in boxes:
            x, y = int(box.get("x", 0)), int(box.get("y", 0))
            w, h = int(box.get("w", 0)), int(box.get("h", 0))
            if w <= 0 or h <= 0:
                continue
            draw.rectangle(
                [max(0, x - 2), max(0, y - 2), min(image.width, x + w + 2), min(image.height, y + h + 2)],
                fill=(17, 24, 39),
            )

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="image/png")


# ---------------------------------------------------------------- Elements


@router.get("/screens/{screen_id}/elements", response_model=list[ElementOut])
def list_elements(
    screen_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> list[ScreenElement]:
    if db.get(Screen, screen_id) is None:
        raise NotFoundError("Screen tidak ditemukan")
    return list(
        db.scalars(
            select(ScreenElement)
            .where(ScreenElement.screen_id == screen_id)
            .order_by(ScreenElement.id)
        )
    )


@router.post("/screens/{screen_id}/elements", response_model=ElementOut, status_code=201)
def create_element(
    screen_id: int,
    payload: ElementCreate,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ScreenElement:
    if db.get(Screen, screen_id) is None:
        raise NotFoundError("Screen tidak ditemukan")

    element = ScreenElement(screen_id=screen_id, **payload.model_dump())
    db.add(element)
    db.flush()
    db.commit()
    db.refresh(element)
    return element


@router.patch("/elements/{element_id}", response_model=ElementOut)
def update_element(
    element_id: int,
    payload: ElementUpdate,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ScreenElement:
    element = db.get(ScreenElement, element_id)
    if element is None:
        raise NotFoundError("Elemen tidak ditemukan")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(element, key, value)

    db.commit()
    db.refresh(element)
    return element


@router.delete("/elements/{element_id}", response_model=MessageResponse)
def delete_element(
    element_id: int,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    element = db.get(ScreenElement, element_id)
    if element is None:
        raise NotFoundError("Elemen tidak ditemukan")
    db.delete(element)
    db.commit()
    return MessageResponse(message="Elemen dihapus")


# ---------------------------------------------------------------- Interactions


@router.get("/screens/{screen_id}/interactions", response_model=list[InteractionOut])
def list_interactions(
    screen_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> list[Interaction]:
    if db.get(Screen, screen_id) is None:
        raise NotFoundError("Screen tidak ditemukan")
    return list(
        db.scalars(
            select(Interaction)
            .where(Interaction.screen_id == screen_id)
            .order_by(Interaction.sequence_no)
        )
    )


@router.post("/screens/{screen_id}/interactions", response_model=InteractionOut, status_code=201)
def create_interaction(
    screen_id: int,
    payload: InteractionCreate,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> Interaction:
    if db.get(Screen, screen_id) is None:
        raise NotFoundError("Screen tidak ditemukan")

    next_no = (
        db.scalar(
            select(func.max(Interaction.sequence_no)).where(Interaction.screen_id == screen_id)
        )
        or 0
    ) + 1

    interaction = Interaction(screen_id=screen_id, sequence_no=next_no, **payload.model_dump())
    db.add(interaction)
    db.flush()
    db.commit()
    db.refresh(interaction)
    return interaction


@router.patch("/interactions/{interaction_id}", response_model=InteractionOut)
def update_interaction(
    interaction_id: int,
    payload: InteractionUpdate,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> Interaction:
    interaction = db.get(Interaction, interaction_id)
    if interaction is None:
        raise NotFoundError("Interaksi tidak ditemukan")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(interaction, key, value)

    db.commit()
    db.refresh(interaction)
    return interaction


@router.delete("/interactions/{interaction_id}", response_model=MessageResponse)
def delete_interaction(
    interaction_id: int,
    operator: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    interaction = db.get(Interaction, interaction_id)
    if interaction is None:
        raise NotFoundError("Interaksi tidak ditemukan")
    db.delete(interaction)
    db.commit()
    return MessageResponse(message="Interaksi dihapus")
