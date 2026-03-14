"""Add show_undated_eisenhower to projects table

Revision ID: 0003_add_show_undated_eisenhower
Revises: 0002_add_has_seen_tour
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_add_show_undated_eisenhower"
down_revision = "0002_add_has_seen_tour"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("show_undated_eisenhower", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("projects", "show_undated_eisenhower")
