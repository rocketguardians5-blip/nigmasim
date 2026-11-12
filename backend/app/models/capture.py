"""Model hasil capture: CaptureSession, Screen, ScreenElement, Interaction.

Yang disimpan hanya screenshot (PNG) dan metadata terstruktur.
HTML/JavaScript hasil capture TIDAK disimpan dan TIDAK dieksekusi.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base, now_utc


class CaptureSession(Base):
    __tablename__ = "capture_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )
    operator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    viewport_width: Mapped[int] = mapped_column(Integer, default=1440, nullable=False)
    viewport_height: Mapped[int] = mapped_column(Integer, default=900, nullable=False)
    browser_mode: Mapped[str] = mapped_column(String(20), default="headed", nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)

    screens: Mapped[list["Screen"]] = relationship(
        back_populates="capture_session", cascade="all, delete-orphan"
    )


class Screen(Base):
    __tablename__ = "screens"
    __table_args__ = (
        # Satu "layar" bisa punya beberapa versi capture.
        UniqueConstraint(
            "project_id", "screen_key", "capture_version", name="uq_screen_project_key_version"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )
    capture_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("capture_sessions.id"), index=True
    )
    screen_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    route_label: Mapped[str | None] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(String(500))
    screenshot_path: Mapped[str] = mapped_column(String(500), nullable=False)
    full_page: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    capture_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Pengelompokan modul, mis. Dashboard / Project Risk / Risk Assessment
    category: Mapped[str | None] = mapped_column(String(60), index=True)
    # Relasi antar layar: layar ini muncul dari layar mana
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("screens.id"), index=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    review_status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )

    capture_session: Mapped[CaptureSession | None] = relationship(back_populates="screens")
    elements: Mapped[list["ScreenElement"]] = relationship(
        back_populates="screen", cascade="all, delete-orphan"
    )
    interactions: Mapped[list["Interaction"]] = relationship(
        back_populates="screen", cascade="all, delete-orphan"
    )


class ScreenElement(Base):
    __tablename__ = "screen_elements"

    id: Mapped[int] = mapped_column(primary_key=True)
    screen_id: Mapped[int] = mapped_column(ForeignKey("screens.id"), nullable=False, index=True)
    element_type: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str | None] = mapped_column(String(200))
    selector_or_hint: Mapped[str | None] = mapped_column(String(500))
    bounding_box: Mapped[dict | None] = mapped_column(JSON)
    mask: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)

    screen: Mapped[Screen] = relationship(back_populates="elements")


class Interaction(Base):
    __tablename__ = "interactions"
    __table_args__ = (
        UniqueConstraint("screen_id", "sequence_no", name="uq_interaction_sequence"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    screen_id: Mapped[int] = mapped_column(ForeignKey("screens.id"), nullable=False, index=True)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    target_element_id: Mapped[int | None] = mapped_column(ForeignKey("screen_elements.id"))
    expected_result: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)

    screen: Mapped[Screen] = relationship(back_populates="interactions")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False, index=True)
