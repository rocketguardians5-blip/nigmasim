"""Model Fase 4 - Full Simulation.

Simulasi berdiri sendiri: data dummy, navigasi, dan aksi hanya bekerja
di dalam simulasi. Tidak pernah menyentuh data aplikasi sumber.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base, now_utc


class Simulation(Base):
    __tablename__ = "simulations"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"), nullable=False, unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_utc, onupdate=now_utc, nullable=False
    )

    screens: Mapped[list["SimulationScreen"]] = relationship(
        back_populates="simulation", cascade="all, delete-orphan"
    )
    datasets: Mapped[list["SimulationDataset"]] = relationship(
        back_populates="simulation", cascade="all, delete-orphan"
    )


class SimulationScreen(Base):
    __tablename__ = "simulation_screens"

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_id: Mapped[int] = mapped_column(
        ForeignKey("simulations.id"), nullable=False, index=True
    )
    screen_key: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    route: Mapped[str] = mapped_column(String(200), nullable=False)
    # Deskripsi tampilan: kartu, tabel, form, tombol, navigasi.
    layout: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Aksi antar layar (navigate / open modal / submit).
    actions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    order_index: Mapped[int] = mapped_column(default=0, nullable=False)
    source_screen_id: Mapped[int | None] = mapped_column(ForeignKey("screens.id"))

    simulation: Mapped[Simulation] = relationship(back_populates="screens")


class SimulationDataset(Base):
    __tablename__ = "simulation_datasets"
    __table_args__ = (UniqueConstraint("simulation_id", "name", name="uq_dataset_sim_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    simulation_id: Mapped[int] = mapped_column(
        ForeignKey("simulations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Definisi kolom: [{"key","label","type"}]
    schema: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Baris data dummy saat ini
    rows: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Baris asli (seed) untuk tombol Reset
    seed: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    simulation: Mapped[Simulation] = relationship(back_populates="datasets")
