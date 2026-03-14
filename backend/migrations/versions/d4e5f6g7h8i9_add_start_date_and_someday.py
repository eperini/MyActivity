"""add start_date and someday status

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-03-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = "d4e5f6g7h8i9"
down_revision = "c3d4e5f6g7h8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add start_date column
    op.add_column("tasks", sa.Column("start_date", sa.Date(), nullable=True))
    op.create_index(op.f("ix_tasks_start_date"), "tasks", ["start_date"], unique=False)

    # Add 'someday' to taskstatus enum
    op.execute(text("ALTER TYPE taskstatus ADD VALUE IF NOT EXISTS 'someday'"))


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_start_date"), table_name="tasks")
    op.drop_column("tasks", "start_date")
    # Note: PostgreSQL does not support removing values from an enum type.
    # To fully downgrade, you would need to recreate the enum without 'someday'.
