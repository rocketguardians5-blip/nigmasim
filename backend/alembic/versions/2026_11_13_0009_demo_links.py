"""Fase 7: tabel demo link dan skenario demo.

Revision ID: 2026_11_13_0009
Revises: 2026_11_13_0008
Create Date: 2026-11-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_13_0009"
down_revision: str | None = "2026_11_13_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "demo_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("screen_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(
        op.f("ix_demo_links_token"), "demo_links", ["token"], unique=True
    )
    op.create_index(
        op.f("ix_demo_links_project_id"), "demo_links", ["project_id"], unique=False
    )

    op.create_table(
        "demo_scenarios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("steps", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_template", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_demo_scenarios_project_id"),
        "demo_scenarios",
        ["project_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_demo_scenarios_project_id"), table_name="demo_scenarios")
    op.drop_table("demo_scenarios")
    op.drop_index(op.f("ix_demo_links_project_id"), table_name="demo_links")
    op.drop_index(op.f("ix_demo_links_token"), table_name="demo_links")
    op.drop_table("demo_links")
