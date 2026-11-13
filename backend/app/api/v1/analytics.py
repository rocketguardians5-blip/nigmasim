"""Endpoint statistik pengunjung (Phase 7).

- POST /analytics/visit: catat kunjungan (publik, tanpa auth).
- GET  /analytics/stats: lihat ringkasan statistik (butuh auth).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models.user import User
from app.schemas.analytics import VisitorStatCreate, VisitorStatsSummary
from app.services import analytics as analytics_service

router = APIRouter(tags=["analytics"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/analytics/visit", status_code=201, response_model=dict[str, Any])
def record_visit(
    request: Request,
    payload: VisitorStatCreate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Catat satu kunjungan halaman publik/demo. Tidak butuh autentikasi."""
    stat = analytics_service.record_visit(
        db,
        path=payload.path,
        ip_address=_ip(request),
        user_agent=payload.user_agent,
        referrer=payload.referrer,
    )
    db.commit()
    return {"status": "recorded", "id": stat.id}


@router.get("/analytics/stats", response_model=VisitorStatsSummary)
def get_visitor_stats(
    limit: int = Query(default=50, ge=1, le=500),
    _: User = Depends(require_permission("analytics:read")),
    db: Session = Depends(get_db),
) -> VisitorStatsSummary:
    """Lihat ringkasan statistik pengunjung. Butuh izin analytics:read."""
    return analytics_service.get_stats(db, limit=limit)
