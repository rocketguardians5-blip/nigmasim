"""Endpoint Fase 3 - UI Reconstruction.

Alur: pilih screen -> analisis -> draf React -> cek asumsi -> review/approve.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db, now_utc
from app.models.capture import Screen, ScreenElement
from app.models.reconstruction import (
    Reconstruction,
    ReconstructionAssumption,
    ReconstructionComponent,
)
from app.models.user import User
from app.schemas.reconstruction import (
    AssumptionOut,
    CodeUpdate,
    ComponentOut,
    ComponentUpdate,
    ReconstructionDetail,
    ReconstructionOut,
    ReviewRequest,
)
from app.services import audit, reconstructor

router = APIRouter(prefix="/reconstructions", tags=["reconstruction"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _load(draft: Reconstruction) -> ReconstructionDetail:
    detail = ReconstructionDetail.model_validate(draft)
    detail.components = [ComponentOut.model_validate(c) for c in draft.components]
    detail.assumptions = [AssumptionOut.model_validate(a) for a in draft.assumptions]
    return detail


def _get_draft(db: Session, screen_id: int) -> Reconstruction:
    draft = db.scalar(
        select(Reconstruction)
        .where(Reconstruction.screen_id == screen_id)
        .options(selectinload(Reconstruction.components), selectinload(Reconstruction.assumptions))
    )
    if draft is None:
        raise NotFoundError("Belum ada draf rekonstruksi untuk screen ini")
    return draft


@router.get("/project/{project_id}", response_model=list[ReconstructionOut])
def list_project_reconstructions(
    project_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> list[Reconstruction]:
    return list(
        db.scalars(
            select(Reconstruction)
            .where(Reconstruction.project_id == project_id)
            .order_by(Reconstruction.updated_at.desc())
        )
    )


@router.post("/screen/{screen_id}", response_model=ReconstructionDetail, status_code=201)
def analyze_screen(
    screen_id: int,
    request: Request,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ReconstructionDetail:
    """Analisis screenshot & hasil capture, lalu buat draf rekonstruksi."""
    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")

    elements = list(
        db.scalars(
            select(ScreenElement)
            .where(ScreenElement.screen_id == screen_id)
            .order_by(ScreenElement.id)
        )
    )
    if not elements and not screen.structure:
        raise ConflictError(
            "Screen ini belum punya data analisis. Capture ulang layarnya supaya struktur "
            "semantik (tabel, heading, form) ikut terekam."
        )

    analysis = reconstructor.analyze_screen(screen, elements)
    code = reconstructor.generate_code(screen, analysis)
    draft = reconstructor.store_analysis(db, screen, analysis, code, actor_id=actor.id)

    audit.record(
        db,
        actor_id=actor.id,
        action="reconstruction.analyze",
        entity_type="reconstruction",
        entity_id=draft.id,
        meta={
            "screen_id": screen_id,
            "components": len(analysis.components),
            "assumptions": len(analysis.assumptions),
        },
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(draft)
    return _load(draft)


@router.get("/screen/{screen_id}", response_model=ReconstructionDetail)
def get_screen_reconstruction(
    screen_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> ReconstructionDetail:
    return _load(_get_draft(db, screen_id))


@router.patch("/screen/{screen_id}/code", response_model=ReconstructionDetail)
def update_code(
    screen_id: int,
    payload: CodeUpdate,
    request: Request,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ReconstructionDetail:
    """Kode draf boleh diedit manual - ini inti dari 'editable before publication'."""
    draft = _get_draft(db, screen_id)
    draft.code_text = payload.code_text
    draft.status = "draft"
    draft.reviewed_by = None
    draft.reviewed_at = None

    audit.record(
        db,
        actor_id=actor.id,
        action="reconstruction.update_code",
        entity_type="reconstruction",
        entity_id=draft.id,
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(draft)
    return _load(draft)


@router.patch("/component/{component_id}", response_model=ComponentOut)
def update_component(
    component_id: int,
    payload: ComponentUpdate,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ReconstructionComponent:
    component = db.get(ReconstructionComponent, component_id)
    if component is None:
        raise NotFoundError("Komponen tidak ditemukan")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(component, key, value)

    db.commit()
    db.refresh(component)
    return component


@router.post("/assumption/{assumption_id}/resolve", response_model=AssumptionOut)
def resolve_assumption(
    assumption_id: int,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ReconstructionAssumption:
    """Tandai asumsi sudah dicek manusia."""
    assumption = db.get(ReconstructionAssumption, assumption_id)
    if assumption is None:
        raise NotFoundError("Asumsi tidak ditemukan")

    assumption.resolved = True
    assumption.resolved_by = actor.id
    assumption.resolved_at = now_utc()
    db.commit()
    db.refresh(assumption)
    return assumption


@router.post("/assumption/{assumption_id}/unresolve", response_model=AssumptionOut)
def unresolve_assumption(
    assumption_id: int,
    _: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ReconstructionAssumption:
    assumption = db.get(ReconstructionAssumption, assumption_id)
    if assumption is None:
        raise NotFoundError("Asumsi tidak ditemukan")

    assumption.resolved = False
    assumption.resolved_by = None
    assumption.resolved_at = None
    db.commit()
    db.refresh(assumption)
    return assumption


@router.post("/screen/{screen_id}/review", response_model=ReconstructionDetail)
def review_reconstruction(
    screen_id: int,
    payload: ReviewRequest,
    request: Request,
    actor: User = Depends(require_permission("screens:review")),
    db: Session = Depends(get_db),
) -> ReconstructionDetail:
    """Hanya boleh disetujui kalau SEMUA asumsi sudah dicek manusia."""
    draft = _get_draft(db, screen_id)

    if payload.status == "approved":
        unresolved = [a for a in draft.assumptions if not a.resolved]
        if unresolved:
            raise ConflictError(
                f"Masih ada {len(unresolved)} asumsi yang belum dicek. "
                "Periksa dulu semua asumsi sebelum menyetujui draf."
            )

    draft.status = payload.status
    draft.reviewed_by = actor.id
    draft.reviewed_at = now_utc()

    audit.record(
        db,
        actor_id=actor.id,
        action="reconstruction.review",
        entity_type="reconstruction",
        entity_id=draft.id,
        meta={"status": payload.status},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(draft)
    return _load(draft)
