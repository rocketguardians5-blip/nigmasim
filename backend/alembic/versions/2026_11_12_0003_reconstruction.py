"""Fase 3: tabel rekonstruksi + struktur semantik pada screens.

Revision ID: 2026_11_12_0003
Revises: 2026_11_12_0002
Create Date: 2026-11-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_12_0003"
down_revision: str | None = "2026_11_12_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("screens") as batch:
        batch.add_column(sa.Column("structure", sa.JSON(), nullable=True))

    op.create_table(
        "reconstructions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("screen_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("layout", sa.JSON(), nullable=True),
        sa.Column("code_text", sa.Text(), nullable=True),
        sa.Column("generated_by", sa.String(length=40), nullable=False, server_default="rule-engine"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["screen_id"], ["screens.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
    )
    op.create_index("ix_reconstructions_screen_id", "reconstructions", ["screen_id"])
    op.create_index("ix_reconstructions_project_id", "reconstructions", ["project_id"])
    op.create_index("ix_reconstructions_status", "reconstructions", ["status"])

    op.create_table(
        "reconstruction_components",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reconstruction_id", sa.Integer(), nullable=False),
        sa.Column("region", sa.String(length=30), nullable=False, server_default="main"),
        sa.Column("component_type", sa.String(length=40), nullable=False, server_default="unknown"),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("props", sa.JSON(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="detected"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["reconstruction_id"], ["reconstructions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_reconstruction_components_reconstruction_id",
        "reconstruction_components",
        ["reconstruction_id"],
    )

    op.create_table(
        "reconstruction_assumptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reconstruction_id", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(length=60), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("confidence", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("resolved_by", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["reconstruction_id"], ["reconstructions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_reconstruction_assumptions_reconstruction_id",
        "reconstruction_assumptions",
        ["reconstruction_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reconstruction_assumptions_reconstruction_id",
        table_name="reconstruction_assumptions",
    )
    op.drop_table("reconstruction_assumptions")
    op.drop_index(
        "ix_reconstruction_components_reconstruction_id",
        table_name="reconstruction_components",
    )
    op.drop_table("reconstruction_components")
    op.drop_index("ix_reconstructions_status", table_name="reconstructions")
    op.drop_index("ix_reconstructions_project_id", table_name="reconstructions")
    op.drop_index("ix_reconstructions_screen_id", table_name="reconstructions")
    op.drop_table("reconstructions")

    with op.batch_alter_table("screens") as batch:
        batch.drop_column("structure")
