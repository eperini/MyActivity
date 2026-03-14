"""add project headings

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-03-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c3d4e5f6g7h8"
down_revision = "b2c3d4e5f6g7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_headings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_project_headings_project_id", "project_headings", ["project_id"])

    op.add_column("tasks", sa.Column("heading_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_heading_id",
        "tasks",
        "project_headings",
        ["heading_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tasks_heading_id", "tasks", ["heading_id"])


def downgrade() -> None:
    op.drop_index("ix_tasks_heading_id", table_name="tasks")
    op.drop_constraint("fk_tasks_heading_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "heading_id")
    op.drop_index("ix_project_headings_project_id", table_name="project_headings")
    op.drop_table("project_headings")
