"""Endpoint Fase 3 - UI Reconstruction.

Alur: pilih screen -> analisis -> draf React -> cek asumsi -> review/approve.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_permission
from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db, now_utc
from app.models.capture import Screen, ScreenElement
from app.models.reconstruction import (
    Reconstruction,
    ReconstructionAssumption,
    ReconstructionComponent,
)
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.reconstruction import (
    AssumptionOut,
    CodeUpdate,
    ComponentCreate,
    ComponentOut,
    ComponentUpdate,
    HotspotStateIn,
    HotspotStateOut,
    ReconstructionDetail,
    ReconstructionOut,
    ReviewRequest,
)
from app.services import audit, reconstructor
from app.services.simulation import (
    get_screen_dimensions,
    normalize_box_to_percent,
    sync_simulation_hotspots_for_screen,
)
from app.services.simulation_generator import check_reconstruction_usability
from app.schemas.reconstruction import AIAnalyzeRequest, AIAnalyzeResponse

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


@router.post("/screen/{screen_id}/ai-analyze", response_model=AIAnalyzeResponse)
async def ai_analyze_screen(
    screen_id: int,
    payload: AIAnalyzeRequest,
    request: Request,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> AIAnalyzeResponse:
    """Analisis ulang screenshot dengan AI Vision (Gemini) untuk menambah komponen yang terlewat."""
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Fitur AI Vision belum dikonfigurasi (GEMINI_API_KEY tidak di-set). Hubungi administrator.",
        )

    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")

    # Tombol di UI hanya memakai AI. Kalau layar belum punya draf, endpoint ini
    # yang membuat draf awal (analisis deterministik jadi baseline, lalu AI).
    draft = db.scalar(
        select(Reconstruction)
        .where(Reconstruction.screen_id == screen_id)
        .options(
            selectinload(Reconstruction.components),
            selectinload(Reconstruction.assumptions),
        )
    )
    original_components = len(draft.components) if draft is not None else 0
    original_assumptions = len(draft.assumptions) if draft is not None else 0
    manual_preserved = (
        sum(1 for c in draft.components if c.region == "manual" or c.source == "manual")
        if draft is not None
        else 0
    )

    elements = list(
        db.scalars(
            select(ScreenElement)
            .where(ScreenElement.screen_id == screen_id)
            .order_by(ScreenElement.id)
        )
    )

    # Run AI vision analysis (async, called directly since endpoint is async).
    # Baseline diambil SEBELUM AI agar delta hanya menghitung kontribusi AI,
    # bukan selisih terhadap draf lama yang bisa membuat angka negatif.
    analysis = reconstructor.analyze_screen(screen, elements)
    baseline_components = len(analysis.components)
    baseline_assumptions = len(analysis.assumptions)
    analysis = await reconstructor.analyze_with_ai(screen, analysis)

    # Regenerate code with updated analysis
    code = reconstructor.generate_code(screen, analysis)

    # Store updated analysis (membuat draf baru bila belum ada)
    reconstruction = reconstructor.store_analysis(
        db, screen, analysis, code, actor_id=actor.id, replace=True
    )

    new_components = max(0, len(analysis.components) - baseline_components)
    new_assumptions = max(0, len(analysis.assumptions) - baseline_assumptions)

    audit.record(
        db,
        actor_id=actor.id,
        action="reconstruction.ai_analyze",
        entity_type="reconstruction",
        entity_id=reconstruction.id,
        meta={
            "screen_id": screen_id,
            "components_before": original_components,
            "components_after": len(analysis.components),
            "assumptions_before": original_assumptions,
            "assumptions_after": len(analysis.assumptions),
        },
        ip_address=_ip(request),
    )
    db.commit()

    model_label = analysis.ai_model or settings.gemini_model
    message = (
        f"AI Vision ({model_label}) selesai: +{new_components} komponen, "
        f"+{new_assumptions} asumsi masuk ke layer Otomatis."
    )
    if manual_preserved:
        message += f" {manual_preserved} hotspot manual tetap utuh."

    return AIAnalyzeResponse(
        components_added=new_components,
        assumptions_added=new_assumptions,
        layout_updated=bool(analysis.layout.get("regions")),
        message=message,
    )


@router.get("/screen/{screen_id}", response_model=ReconstructionDetail)
def get_screen_reconstruction(
    screen_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> ReconstructionDetail:
    return _load(_get_draft(db, screen_id))


@router.get("/screen/{screen_id}/usability", response_model=dict)
def check_usability(
    screen_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> dict:
    """Cek apakah draf rekonstruksi bisa dipakai Simulation Generator.

    Mengembalikan usable_count dan warning bila 0.
    """
    draft = _get_draft(db, screen_id)
    return check_reconstruction_usability(draft)


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


def _box_iou(b1: dict | None, b2: dict | None) -> float:
    if not b1 or not b2:
        return 0.0
    try:
        x1 = max(float(b1.get("x", 0)), float(b2.get("x", 0)))
        y1 = max(float(b1.get("y", 0)), float(b2.get("y", 0)))
        x2 = min(float(b1.get("x", 0)) + float(b1.get("w", 0)), float(b2.get("x", 0)) + float(b2.get("w", 0)))
        y2 = min(float(b1.get("y", 0)) + float(b1.get("h", 0)), float(b2.get("y", 0)) + float(b2.get("h", 0)))
        inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        a1 = float(b1.get("w", 0)) * float(b1.get("h", 0))
        a2 = float(b2.get("w", 0)) * float(b2.get("h", 0))
        union = a1 + a2 - inter
        return inter / union if union > 0 else 0.0
    except (ValueError, TypeError):
        return 0.0


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

    recon = db.get(Reconstruction, component.reconstruction_id)
    screen = db.get(Screen, recon.screen_id) if recon else None
    img_w, img_h = get_screen_dimensions(screen) if screen else (1440, 900)

    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "props" and isinstance(value, dict) and "box" in value and value["box"]:
            value["box"] = normalize_box_to_percent(value["box"], img_w, img_h)
        setattr(component, key, value)

    db.commit()
    db.refresh(component)

    try:
        if recon:
            sync_simulation_hotspots_for_screen(db, recon.screen_id)
    except Exception:
        pass

    return component


@router.post("/component", response_model=ComponentOut, status_code=201)
def create_component(
    screen_id: int,
    payload: ComponentCreate,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> ReconstructionComponent:
    """Buat komponen manual untuk draf rekonstruksi layar tertentu.
    
    Dilengkapi pencegahan duplikasi di server: bila komponen dengan reconstruction,
    label, tipe, dan posisi berdekatan (IoU > 0.7) sudah ada, baris yang ada di-update
    alih-alih menambah baris baru.
    """
    screen = db.get(Screen, screen_id)
    if screen is None:
        raise NotFoundError("Screen tidak ditemukan")

    draft = _get_draft(db, screen_id)
    img_w, img_h = get_screen_dimensions(screen)

    # Standardisasi koordinat box ke persentase murni sebelum disimpan
    if payload.props and "box" in payload.props and payload.props["box"]:
        payload.props["box"] = normalize_box_to_percent(payload.props["box"], img_w, img_h)

    req_box = (payload.props or {}).get("box") if payload.props else None
    norm_label = (payload.label or "").strip().lower()
    norm_type = (payload.component_type or "").strip().lower()

    if req_box:
        for ex in draft.components:
            ex_box = (ex.props or {}).get("box") if ex.props else None
            if not ex_box:
                continue
            ex_label = (ex.label or "").strip().lower()
            ex_type = (ex.component_type or "").strip().lower()
            if norm_type == ex_type and (norm_label == ex_label or not norm_label):
                norm_ex_box = normalize_box_to_percent(ex_box, img_w, img_h)
                if _box_iou(req_box, norm_ex_box) > 0.7:
                    # Update komponen yang sudah ada
                    ex.props = payload.props
                    if payload.label:
                        ex.label = payload.label
                    if payload.notes:
                        ex.notes = payload.notes
                    if payload.element_type:
                        ex.element_type = payload.element_type
                    if payload.config_json is not None:
                        ex.config_json = payload.config_json
                    db.commit()
                    db.refresh(ex)
                    try:
                        sync_simulation_hotspots_for_screen(db, screen_id)
                    except Exception:
                        pass
                    return ex

    # Simpan seluruh props (box + action) supaya hotspot manual tidak kehilangan aksi.
    component = ReconstructionComponent(
        reconstruction_id=draft.id,
        region=payload.region,
        component_type=payload.component_type,
        label=payload.label,
        props=payload.props,
        element_type=payload.element_type,
        config_json=payload.config_json,
        notes=payload.notes,
        source="manual",
    )
    db.add(component)
    db.commit()
    db.refresh(component)

    try:
        sync_simulation_hotspots_for_screen(db, screen_id)
    except Exception:
        pass

    return component


@router.delete("/component/{component_id}", response_model=MessageResponse)
def delete_component(
    component_id: int,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Hapus komponen (dipakai saat hotspot dihapus di editor)."""
    component = db.get(ReconstructionComponent, component_id)
    if component is None:
        raise NotFoundError("Komponen tidak ditemukan")

    recon_id = component.reconstruction_id
    recon = db.get(Reconstruction, recon_id)
    screen_id = recon.screen_id if recon else None

    audit.record(
        db,
        actor_id=actor.id,
        action="reconstruction.delete_component",
        entity_type="reconstruction_component",
        entity_id=component.id,
    )
    db.delete(component)
    db.commit()

    if screen_id:
        try:
            sync_simulation_hotspots_for_screen(db, screen_id)
        except Exception:
            pass

    return MessageResponse(message="Komponen manual dihapus")


@router.get("/screen/{screen_id}/hotspot-state", response_model=HotspotStateOut)
def get_hotspot_state(
    screen_id: int,
    _: User = Depends(require_permission("screens:read")),
    db: Session = Depends(get_db),
) -> HotspotStateOut:
    """Ambil state tombstones (deleted) dan overrides dari backend (Single Source of Truth)."""
    draft = _get_draft(db, screen_id)
    layout = draft.layout or {}
    return HotspotStateOut(
        deleted=layout.get("tombstones", []),
        overrides=layout.get("overrides", {}),
    )


@router.put("/screen/{screen_id}/hotspot-state", response_model=HotspotStateOut)
def update_hotspot_state(
    screen_id: int,
    payload: HotspotStateIn,
    actor: User = Depends(require_permission("screens:write")),
    db: Session = Depends(get_db),
) -> HotspotStateOut:
    """Simpan state tombstones (deleted) dan overrides ke backend (Single Source of Truth)."""
    draft = _get_draft(db, screen_id)
    screen = db.get(Screen, screen_id)
    img_w, img_h = get_screen_dimensions(screen) if screen else (1440, 900)

    # Standardisasi seluruh koordinat overrides ke persentase murni
    norm_overrides: dict[str, Any] = {}
    for k, v in (payload.overrides or {}).items():
        if isinstance(v, dict):
            v_copy = dict(v)
            if any(coord in v_copy for coord in ("x", "y", "w", "h")):
                norm_b = normalize_box_to_percent(v_copy, img_w, img_h)
                v_copy.update(norm_b)
            norm_overrides[k] = v_copy
        else:
            norm_overrides[k] = v

    layout = dict(draft.layout or {})
    layout["tombstones"] = payload.deleted
    layout["overrides"] = norm_overrides
    draft.layout = layout
    db.add(draft)
    db.commit()
    db.refresh(draft)

    try:
        sync_simulation_hotspots_for_screen(db, screen_id)
    except Exception:
        pass

    return HotspotStateOut(
        deleted=payload.deleted,
        overrides=norm_overrides,
    )



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
