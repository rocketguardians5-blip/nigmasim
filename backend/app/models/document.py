"""Model Fase 6 - dokumen SOP / user guide.

Dokumen disusun dari data yang SUDAH DIREVIEW: layar hasil capture, langkah
tutorial, dan alur workflow. Isi dokumen tetap boleh disunting manusia.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base, now_utc


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )
    simulation_id: Mapped[int | None] = mapped_column(ForeignKey("simulations.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(40), default="sop", nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Isi dokumen (bagian + langkah) - bisa disunting manusia
    content: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Hasil render: markdown & html
    markdown: Mapped[str | None] = mapped_column(Text)
    html: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(20), default="1.0", nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )
