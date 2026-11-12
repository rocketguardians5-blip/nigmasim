"""Fase 6: tabel dokumen.

Revision ID: 2026_11_12_0006
Revises: 2026_11_12_0005
Create Date: 2026-11-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_12_0006"
down_revision: str | None = "2026_11_12_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("simulation_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("doc_type", sa.String(length=40), nullable=False, server_default="sop"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=True),
        sa.Column("html", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("version", sa.String(length=20), nullable=False, server_default="1.0"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["simulation_id"], ["simulations.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index("ix_documents_project_id", "documents", ["project_id"])
    op.create_index("ix_documents_status", "documents", ["status"])


def downgrade() -> None:
    op.drop_index("ix_documents_status", table_name="documents")
    op.drop_index("ix_documents_project_id", table_name="documents")
    op.drop_table("documents")
