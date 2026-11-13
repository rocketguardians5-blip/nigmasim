"""Model demo publik dan skenario demo (Phase 7 - Publishing + Analytics).

DemoLink: link publik yang mengekspos layar tertentu tanpa login.
DemoScenario: alur demo tertentu (urutan layar + instruksi presenter).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base, now_utc


class DemoLink(Base):
    """Link publik untuk membagikan layar tanpa login."""

    __tablename__ = "demo_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Token unik untuk link publik (mis. abc123xyz). Akses via /public/demo/{token}.
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    # Daftar ID layar yang akan ditampilkan dalam demo (JSON array).
    screen_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    # Password opsional (disimpan sebagai hash). Kosong = tanpa proteksi.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="demo_links", lazy="joined")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by], lazy="joined")


class DemoScenario(Base):
    """Skenario demo: alur layar yang dipandu untuk presentasi."""

    __tablename__ = "demo_scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Langkah-langkah demo dalam urutan (JSON array of step objects).
    # Contoh step: {"screen_id": 5, "title": "Halaman Login", "instructor_notes": "Tunjukkan..."}
    steps: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    is_template: Mapped[bool] = mapped_column(default=False, nullable=False)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="demo_scenarios", lazy="joined")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by], lazy="joined")
