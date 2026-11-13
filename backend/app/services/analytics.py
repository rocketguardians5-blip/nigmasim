"""Layanan statistik pengunjung (Phase 7).

Fungsi:
- catat kunjungan halaman publik/demo
- ambil ringkasan statistik untuk admin
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.analytics import VisitorStat
from app.schemas.analytics import VisitorStatCreate, VisitorStatOut, VisitorStatsSummary


def record_visit(
    db: Session,
    *,
    path: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
    referrer: str | None = None,
) -> VisitorStat:
    """Catat satu kunjungan halaman."""
    stat = VisitorStat(
        path=path,
        ip_address=ip_address,
        user_agent=user_agent,
        referrer=referrer,
    )
    db.add(stat)
    db.flush()
    return stat


def get_stats(db: Session, *, limit: int = 50) -> VisitorStatsSummary:
    """Ambil ringkasan statistik pengunjung."""
    total = db.scalar(select(func.count()).select_from(VisitorStat)) or 0

    # Kunjungan per path.
    rows = db.execute(
        select(VisitorStat.path, func.count(VisitorStat.id).label("count"))
        .group_by(VisitorStat.path)
        .order_by(func.count(VisitorStat.id).desc())
    ).all()
    visits_by_path = [{"path": r.path, "count": r.count} for r in rows]

    # Kunjungan terbaru.
    recent_rows = db.scalars(
        select(VisitorStat)
        .order_by(VisitorStat.visited_at.desc())
        .limit(limit)
    ).all()
    recent_visits = [VisitorStatOut.model_validate(r) for r in recent_rows]

    return VisitorStatsSummary(
        total_visits=total,
        visits_by_path=visits_by_path,
        recent_visits=recent_visits,
    )
