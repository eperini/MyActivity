"""Initial schema - all tables created from SQLAlchemy models

Revision ID: 0001_initial
Revises: None
Create Date: 2026-03-14

This migration represents the full schema as of v3.0.
All tables are created by SQLAlchemy's Base.metadata.create_all().
This file exists as a baseline for future incremental migrations.
"""

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Schema is created by SQLAlchemy models directly.
    # This migration serves as the baseline marker.
    # To initialize a fresh DB, run:
    #   python -c "from app.core.database import Base, engine; import app.models; ..."
    pass


def downgrade() -> None:
    pass
