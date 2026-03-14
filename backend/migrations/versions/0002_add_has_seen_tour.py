"""Add has_seen_tour to users table

Revision ID: 0002_add_has_seen_tour
Revises: 0001_initial
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_add_has_seen_tour"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("has_seen_tour", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "has_seen_tour")
