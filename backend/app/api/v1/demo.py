"""Endpoint demo publik dan skenario demo (Phase 7).

- Auth: CRUD demo link dan skenario (butuh izin demo:read / demo:write)
- Publik: akses demo link tanpa login (verifikasi password opsional)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.db.session import get_db
from app.models.demo import DemoLink, DemoScenario
from app.models.user import User
from app.schemas.demo import (
    DemoLinkCreate,
    DemoLinkOut,
    DemoLinkPublic,
    DemoLinkUpdate,
    DemoPasswordVerify,
    DemoScenarioCreate,
    DemoScenarioOut,
    DemoScenarioUpdate,
    DemoAccessResult,
)
from app.services import demo as demo_service

router = APIRouter(tags=["demo"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


# ---------------------------------------------------------------- Demo Link (auth)


@router.post(
    "/demo-links",
    response_model=DemoLinkOut,
    status_code=201,
)
def create_demo_link(
    payload: DemoLinkCreate,
    request: Request,
    operator: User = Depends(require_permission("demo:write")),
    db: Session = Depends(get_db),
) -> DemoLink:
    try:
        link = demo_service.create_demo_link(db, payload=payload, user_id=operator.id)
    except ConflictError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ConflictError(f"Gagal membuat demo link: {exc}") from exc
    db.commit()
    db.refresh(link)
    return link


@router.get("/demo-links", response_model=list[DemoLinkOut])
def list_demo_links(
    project_id: int | None = Query(default=None),
    _: User = Depends(require_permission("demo:read")),
    db: Session = Depends(get_db),
) -> list[DemoLink]:
    return demo_service.list_demo_links(db, project_id=project_id)


@router.get("/demo-links/{link_id}", response_model=DemoLinkOut)
def get_demo_link(
    link_id: int,
    _: User = Depends(require_permission("demo:read")),
    db: Session = Depends(get_db),
) -> DemoLink:
    link = demo_service.get_demo_link(db, link_id)
    if link is None:
        raise NotFoundError("Demo link tidak ditemukan")
    return link


@router.patch("/demo-links/{link_id}", response_model=DemoLinkOut)
def update_demo_link(
    link_id: int,
    payload: DemoLinkUpdate,
    request: Request,
    operator: User = Depends(require_permission("demo:write")),
    db: Session = Depends(get_db),
) -> DemoLink:
    link = demo_service.get_demo_link(db, link_id)
    if link is None:
        raise NotFoundError("Demo link tidak ditemukan")
    try:
        link = demo_service.update_demo_link(db, link, payload)
    except Exception as exc:  # noqa: BLE001
        raise ConflictError(f"Gagal memperbarui demo link: {exc}") from exc
    db.commit()
    db.refresh(link)
    return link


@router.delete("/demo-links/{link_id}", response_model=dict[str, str])
def delete_demo_link(
    link_id: int,
    operator: User = Depends(require_permission("demo:write")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    link = demo_service.get_demo_link(db, link_id)
    if link is None:
        raise NotFoundError("Demo link tidak ditemukan")
    demo_service.delete_demo_link(db, link)
    db.commit()
    return {"message": "Demo link dihapus"}


# ---------------------------------------------------------------- Demo Scenario (auth)


@router.post(
    "/demo-scenarios",
    response_model=DemoScenarioOut,
    status_code=201,
)
def create_demo_scenario(
    payload: DemoScenarioCreate,
    operator: User = Depends(require_permission("demo:write")),
    db: Session = Depends(get_db),
) -> DemoScenario:
    try:
        scenario = demo_service.create_demo_scenario(
            db, payload=payload, user_id=operator.id
        )
    except ConflictError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ConflictError(f"Gagal membuat skenario demo: {exc}") from exc
    db.commit()
    db.refresh(scenario)
    return scenario


@router.get("/demo-scenarios", response_model=list[DemoScenarioOut])
def list_demo_scenarios(
    project_id: int | None = Query(default=None),
    is_template: bool | None = Query(default=None),
    _: User = Depends(require_permission("demo:read")),
    db: Session = Depends(get_db),
) -> list[DemoScenario]:
    return demo_service.list_demo_scenarios(
        db, project_id=project_id, is_template=is_template
    )


@router.get("/demo-scenarios/{scenario_id}", response_model=DemoScenarioOut)
def get_demo_scenario(
    scenario_id: int,
    _: User = Depends(require_permission("demo:read")),
    db: Session = Depends(get_db),
) -> DemoScenario:
    scenario = demo_service.get_demo_scenario(db, scenario_id)
    if scenario is None:
        raise NotFoundError("Skenario demo tidak ditemukan")
    return scenario


@router.patch("/demo-scenarios/{scenario_id}", response_model=DemoScenarioOut)
def update_demo_scenario(
    scenario_id: int,
    payload: DemoScenarioUpdate,
    operator: User = Depends(require_permission("demo:write")),
    db: Session = Depends(get_db),
) -> DemoScenario:
    scenario = demo_service.get_demo_scenario(db, scenario_id)
    if scenario is None:
        raise NotFoundError("Skenario demo tidak ditemukan")
    try:
        scenario = demo_service.update_demo_scenario(db, scenario, payload)
    except Exception as exc:  # noqa: BLE001
        raise ConflictError(f"Gagal memperbarui skenario demo: {exc}") from exc
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/demo-scenarios/{scenario_id}", response_model=dict[str, str])
def delete_demo_scenario(
    scenario_id: int,
    operator: User = Depends(require_permission("demo:write")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    scenario = demo_service.get_demo_scenario(db, scenario_id)
    if scenario is None:
        raise NotFoundError("Skenario demo tidak ditemukan")
    demo_service.delete_demo_scenario(db, scenario)
    db.commit()
    return {"message": "Skenario demo dihapus"}


# ---------------------------------------------------------------- Public demo access


@router.get(
    "/public/demo/{token}",
    response_model=DemoLinkPublic,
)
def public_demo_info(
    token: str,
    db: Session = Depends(get_db),
) -> DemoLinkPublic:
    """Info publik demo link. Tidak butuh autentikasi."""
    info = demo_service.get_public_demo_info(db, token)
    if info is None:
        raise NotFoundError("Demo link tidak ditemukan atau tidak aktif")
    return info


@router.post(
    "/public/demo/{token}/verify",
    response_model=DemoAccessResult,
)
def public_demo_verify(
    token: str,
    payload: DemoPasswordVerify,
    db: Session = Depends(get_db),
) -> DemoAccessResult:
    """Verifikasi password demo. Tidak butuh autentikasi."""
    ok, message = demo_service.verify_demo_password(db, token, payload.password)
    if not ok:
        raise ForbiddenError(message or "Verifikasi gagal")
    link = demo_service.get_demo_link_by_token(db, token)
    assert link is not None
    demo_service.record_demo_view(db, token)
    return DemoAccessResult(
        access_granted=True,
        token=link.token,
        name=link.name,
        description=link.description,
        screen_ids=link.screen_ids,
        password_required=link.password_hash is not None,
        message=None,
    )


@router.get(
    "/public/demo/{token}/screens",
    response_model=list[dict[str, Any]],
)
def public_demo_screens(
    token: str,
    x_demo_token: str | None = Header(default=None, alias="X-Demo-Token"),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Ambil daftar layar untuk demo publik.

    Memerlukan header X-Demo-Token yang didapat setelah verifikasi password.
    Untuk demo tanpa password, header boleh diabaikan.
    """
    link = demo_service.get_demo_link_by_token(db, token)
    if link is None or not link.is_active:
        raise NotFoundError("Demo link tidak ditemukan atau tidak aktif")

    # Jika demo dilindungi password, wajib menyertakan X-Demo-Token valid.
    if link.password_hash is not None:
        if not x_demo_token or x_demo_token != f"demo:{token}":
            raise ForbiddenError("Token demo tidak valid. Verifikasi password terlebih dahulu.")

    screens = demo_service.get_demo_screens(db, token)
    if screens is None:
        raise NotFoundError("Demo link tidak ditemukan")
    return screens
