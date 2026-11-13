"""Model registry: Application dan Project (Phase 1).

Catatan keamanan: TIDAK ADA kolom untuk menyimpan kredensial, token,
atau session aplikasi sumber. Login aplikasi sumber dilakukan manual
oleh operator di browser Playwright.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base, now_utc


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(String(120))
    category: Mapped[str | None] = mapped_column(String(80))
    source_url: Mapped[str] = mapped_column(String(500), nullable=False)
    login_url: Mapped[str | None] = mapped_column(String(500))
    environment_label: Mapped[str] = mapped_column(String(40), default="staging", nullable=False)
    authorization_status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )
    authorization_ref: Mapped[str | None] = mapped_column(String(255))
    authorization_note: Mapped[str | None] = mapped_column(Text)
    logo_path: Mapped[str | None] = mapped_column(String(500))
    version_label: Mapped[str | None] = mapped_column(String(40))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )

    projects: Mapped[list["Project"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )

    @property
    def is_authorized(self) -> bool:
        return self.authorization_status == "approved"


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("application_id", "name", name="uq_project_app_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(20), default="1.0", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )

    application: Mapped[Application] = relationship(back_populates="projects")
    demo_links: Mapped[list["DemoLink"]] = relationship(back_populates="project")
    demo_scenarios: Mapped[list["DemoScenario"]] = relationship(back_populates="project")
