"""Fase 2 (lanjutan): preset perangkat untuk capture.

Revision ID: 2026_11_12_0007
Revises: 2026_11_12_0006
Create Date: 2026-11-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_11_12_0007"
down_revision: str | None = "2026_11_12_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("capture_sessions") as batch:
        batch.add_column(
            sa.Column(
                "device", sa.String(length=20), nullable=False, server_default="desktop"
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("capture_sessions") as batch:
        batch.drop_column("device")
