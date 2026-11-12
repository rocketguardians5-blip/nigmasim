"""Fase 4: tabel simulasi.

Revision ID: 2026_11_12_0004
Revises: 2026_11_12_0003
Create Date: 2026-11-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_12_0004"
down_revision: str | None = "2026_11_12_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "simulations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.UniqueConstraint("project_id"),
    )
    op.create_index("ix_simulations_project_id", "simulations", ["project_id"])
    op.create_index("ix_simulations_status", "simulations", ["status"])

    op.create_table(
        "simulation_screens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_id", sa.Integer(), nullable=False),
        sa.Column("screen_key", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("route", sa.String(length=200), nullable=False),
        sa.Column("layout", sa.JSON(), nullable=False),
        sa.Column("actions", sa.JSON(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_screen_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["simulation_id"], ["simulations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_screen_id"], ["screens.id"]),
    )
    op.create_index(
        "ix_simulation_screens_simulation_id", "simulation_screens", ["simulation_id"]
    )

    op.create_table(
        "simulation_datasets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("schema", sa.JSON(), nullable=False),
        sa.Column("rows", sa.JSON(), nullable=False),
        sa.Column("seed", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["simulation_id"], ["simulations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("simulation_id", "name", name="uq_dataset_sim_name"),
    )
    op.create_index(
        "ix_simulation_datasets_simulation_id", "simulation_datasets", ["simulation_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_simulation_datasets_simulation_id", table_name="simulation_datasets")
    op.drop_table("simulation_datasets")
    op.drop_index("ix_simulation_screens_simulation_id", table_name="simulation_screens")
    op.drop_table("simulation_screens")
    op.drop_index("ix_simulations_status", table_name="simulations")
    op.drop_index("ix_simulations_project_id", table_name="simulations")
    op.drop_table("simulations")
