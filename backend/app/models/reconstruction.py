"""Model Fase 3 - UI Reconstruction.

Draf rekonstruksi selalu-butuh review manusia sebelum dipakai (master prompt §12:
"Do not infer hidden business rules from screenshots").
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base, now_utc


class Reconstruction(Base):
    __tablename__ = "reconstructions"

    id: Mapped[int] = mapped_column(primary_key=True)
    screen_id: Mapped[int] = mapped_column(ForeignKey("screens.id"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    # Ringkasan hasil analisis: wilayah layout, jumlah komponen, dll.
    layout: Mapped[dict | None] = mapped_column(JSON)
    # Draft React + TypeScript - BISA DIEDIT sebelum dipakai.
    code_text: Mapped[str | None] = mapped_column(Text)
    generated_by: Mapped[str] = mapped_column(String(40), default="rule-engine", nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )

    components: Mapped[list["ReconstructionComponent"]] = relationship(
        back_populates="reconstruction", cascade="all, delete-orphan"
    )
    assumptions: Mapped[list["ReconstructionAssumption"]] = relationship(
        back_populates="reconstruction", cascade="all, delete-orphan"
    )


class ReconstructionComponent(Base):
    __tablename__ = "reconstruction_components"

    id: Mapped[int] = mapped_column(primary_key=True)
    reconstruction_id: Mapped[int] = mapped_column(
        ForeignKey("reconstructions.id"), nullable=False, index=True
    )
    region: Mapped[str] = mapped_column(String(30), default="main", nullable=False)
    component_type: Mapped[str] = mapped_column(String(40), default="unknown", nullable=False)
    label: Mapped[str | None] = mapped_column(String(200))
    props: Mapped[dict | None] = mapped_column(JSON)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="ai-vision", nullable=False)
    element_type: Mapped[str] = mapped_column(String(30), default="button", nullable=False)
    config_json: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    reconstruction: Mapped[Reconstruction] = relationship(back_populates="components")


class ReconstructionAssumption(Base):
    """Setiap asumsi mesin harus dicek manusia sebelum draft dipakai."""

    __tablename__ = "reconstruction_assumptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    reconstruction_id: Mapped[int] = mapped_column(
        ForeignKey("reconstructions.id"), nullable=False, index=True
    )
    topic: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)

    reconstruction: Mapped[Reconstruction] = relationship(back_populates="assumptions")
