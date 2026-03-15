"""Add drive_links to projects table

Revision ID: 0004_add_drive_url
Revises: 0003_add_show_undated_eisenhower
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_add_drive_url"
down_revision = "0003_add_show_undated_eisenhower"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("drive_links", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "drive_links")
