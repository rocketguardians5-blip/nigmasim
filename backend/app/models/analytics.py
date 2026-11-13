"""Model statistik pengunjung (Phase 7 - Publishing + Analytics).

Tidak ada data pribadi yang disimpan: hanya path, IP, user agent, dan referrer
untuk tujuan analisis kunjungan halaman publik/demo.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base, now_utc


class VisitorStat(Base):
    __tablename__ = "visitor_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    path: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    referrer: Mapped[str | None] = mapped_column(Text, nullable=True)
    visited_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False, index=True)
