"""Fase 2: pengelompokan modul, versi capture, dan relasi antar layar.

Revision ID: 2026_11_12_0002
Revises: f786ef540a52
Create Date: 2026-11-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_12_0002"
down_revision: str | None = "f786ef540a52"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("screens") as batch:
        batch.add_column(sa.Column("category", sa.String(length=60), nullable=True))
        batch.add_column(sa.Column("parent_id", sa.Integer(), nullable=True))
        batch.create_index("ix_screens_category", ["category"])
        batch.create_index("ix_screens_parent_id", ["parent_id"])
        batch.create_foreign_key(
            "fk_screens_parent_id", "screens", ["parent_id"], ["id"], ondelete="SET NULL"
        )
        # Versi capture: satu layar boleh punya banyak versi.
        batch.drop_constraint("uq_screen_project_key", type_="unique")
        batch.create_unique_constraint(
            "uq_screen_project_key_version",
            ["project_id", "screen_key", "capture_version"],
        )


def downgrade() -> None:
    with op.batch_alter_table("screens") as batch:
        batch.drop_constraint("uq_screen_project_key_version", type_="unique")
        batch.create_unique_constraint(
            "uq_screen_project_key", ["project_id", "screen_key"]
        )
        batch.drop_index("ix_screens_parent_id")
        batch.drop_index("ix_screens_category")
        batch.drop_constraint("fk_screens_parent_id", type_="foreignkey")
        batch.drop_column("parent_id")
        batch.drop_column("category")
