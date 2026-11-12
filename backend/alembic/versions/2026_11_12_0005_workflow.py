"""Fase 5: tabel workflow & tutorial.

Revision ID: 2026_11_12_0005
Revises: 2026_11_12_0004
Create Date: 2026-11-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_12_0005"
down_revision: str | None = "2026_11_12_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "simulation_workflows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("states", sa.JSON(), nullable=False),
        sa.Column("transitions", sa.JSON(), nullable=False),
        sa.Column("initial_state", sa.String(length=40), nullable=False, server_default="draft"),
        sa.Column("state_field", sa.String(length=60), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["simulation_id"], ["simulations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("simulation_id"),
    )
    op.create_index(
        "ix_simulation_workflows_simulation_id", "simulation_workflows", ["simulation_id"]
    )

    op.create_table(
        "simulation_workflow_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workflow_id", sa.Integer(), nullable=False),
        sa.Column("dataset_name", sa.String(length=80), nullable=False),
        sa.Column("row_id", sa.String(length=40), nullable=False),
        sa.Column("current_state", sa.String(length=40), nullable=False),
        sa.Column("history", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["workflow_id"], ["simulation_workflows.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_simulation_workflow_records_workflow_id",
        "simulation_workflow_records",
        ["workflow_id"],
    )

    op.create_table(
        "simulation_tutorials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["simulation_id"], ["simulations.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_simulation_tutorials_simulation_id",
        "simulation_tutorials",
        ["simulation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_simulation_tutorials_simulation_id", table_name="simulation_tutorials")
    op.drop_table("simulation_tutorials")
    op.drop_index(
        "ix_simulation_workflow_records_workflow_id",
        table_name="simulation_workflow_records",
    )
    op.drop_table("simulation_workflow_records")
    op.drop_index("ix_simulation_workflows_simulation_id", table_name="simulation_workflows")
    op.drop_table("simulation_workflows")
