"""Add enhanced detection fields to screen_elements

Revision ID: 20261116_add_detection_fields
Revises: 2026_11_13_0009
Create Date: 2026-11-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = '20261116_add_detection_fields'
down_revision: str = '2026_11_13_0009'
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    with op.batch_alter_table('screen_elements', schema=None) as batch_op:
        batch_op.add_column(sa.Column('percent_box', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('source', sa.String(length=20), nullable=True, default='dom'))
        batch_op.add_column(sa.Column('tag', sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column('href', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('target', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('role', sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column('input_type', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('parent_element_id', sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column('state', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('confidence', sa.Float(), nullable=True, default=1.0))

    # Update existing rows to have default values
    op.execute("UPDATE screen_elements SET source = 'dom' WHERE source IS NULL")
    op.execute("UPDATE screen_elements SET confidence = 1.0 WHERE confidence IS NULL")

    # Make source and confidence non-nullable after setting defaults
    with op.batch_alter_table('screen_elements', schema=None) as batch_op:
        batch_op.alter_column('source', nullable=False)
        batch_op.alter_column('confidence', nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('screen_elements', schema=None) as batch_op:
        batch_op.drop_column('confidence')
        batch_op.drop_column('state')
        batch_op.drop_column('parent_element_id')
        batch_op.drop_column('input_type')
        batch_op.drop_column('role')
        batch_op.drop_column('target')
        batch_op.drop_column('href')
        batch_op.drop_column('tag')
        batch_op.drop_column('source')
        batch_op.drop_column('percent_box')