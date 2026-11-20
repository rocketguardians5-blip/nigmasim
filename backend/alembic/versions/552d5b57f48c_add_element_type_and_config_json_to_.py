"""add element_type and config_json to reconstruction_components

Revision ID: 552d5b57f48c
Revises: 20261116_add_detection_fields
Create Date: 2026-11-20 09:45:59.458460
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '552d5b57f48c'
down_revision: str | None = '20261116_add_detection_fields'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('reconstruction_components', schema=None) as batch_op:
        batch_op.add_column(sa.Column('element_type', sa.String(length=30), nullable=False, server_default='button'))
        batch_op.add_column(sa.Column('config_json', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('reconstruction_components', schema=None) as batch_op:
        batch_op.drop_column('config_json')
        batch_op.drop_column('element_type')