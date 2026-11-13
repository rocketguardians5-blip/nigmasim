"""Fase 7: tabel statistik pengunjung (visitor_stats).

Revision ID: 2026_11_13_0008
Revises: 2026_11_12_0007
Create Date: 2026-11-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_13_0008"
down_revision: str | None = "2026_11_12_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "visitor_stats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("referrer", sa.Text(), nullable=True),
        sa.Column("visited_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_visitor_stats_path"), "visitor_stats", ["path"], unique=False
    )
    op.create_index(
        op.f("ix_visitor_stats_ip_address"),
        "visitor_stats",
        ["ip_address"],
        unique=False,
    )
    op.create_index(
        op.f("ix_visitor_stats_visited_at"),
        "visitor_stats",
        ["visited_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_visitor_stats_visited_at"), table_name="visitor_stats")
    op.drop_index(op.f("ix_visitor_stats_ip_address"), table_name="visitor_stats")
    op.drop_index(op.f("ix_visitor_stats_path"), table_name="visitor_stats")
    op.drop_table("visitor_stats")
