"""Unify lists into projects

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-14 12:00:00.000000

"""
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "b2c3d4e5f6g7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add temporary column to track which list each new project came from
    op.execute(text("ALTER TABLE projects ADD COLUMN old_list_id INTEGER"))

    # 2. Insert a project for each existing list
    op.execute(text("""
        INSERT INTO projects (name, color, icon, owner_id, position, project_type, status, old_list_id, created_at, updated_at)
        SELECT name, color, icon, owner_id, position, 'personal', 'active', id, NOW(), NOW()
        FROM lists
    """))

    # 3. Update tasks: set project_id from old list mapping where list_id is set and project_id is NULL
    op.execute(text("""
        UPDATE tasks
        SET project_id = (
            SELECT p.id FROM projects p WHERE p.old_list_id = tasks.list_id
        )
        WHERE tasks.list_id IS NOT NULL
          AND tasks.project_id IS NULL
    """))

    # 4. Migrate list_members to project_members
    op.execute(text("""
        INSERT INTO project_members (project_id, user_id, role)
        SELECT p.id, lm.user_id, lm.role
        FROM list_members lm
        JOIN projects p ON p.old_list_id = lm.list_id
        ON CONFLICT (project_id, user_id) DO NOTHING
    """))

    # 5. Set jira_config.default_list_id to NULL for all rows
    op.execute(text("UPDATE jira_config SET default_list_id = NULL"))

    # 6. Drop the temporary column
    op.execute(text("ALTER TABLE projects DROP COLUMN old_list_id"))

    # 7. Drop list_id column from tasks (first drop the FK constraint)
    op.execute(text("""
        ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_list_id_fkey
    """))
    op.execute(text("ALTER TABLE tasks DROP COLUMN IF EXISTS list_id"))

    # 8. Drop default_list_id column from jira_config (first drop the FK constraint)
    op.execute(text("""
        ALTER TABLE jira_config DROP CONSTRAINT IF EXISTS jira_config_default_list_id_fkey
    """))
    op.execute(text("ALTER TABLE jira_config DROP COLUMN IF EXISTS default_list_id"))

    # 9. Drop habits.list_id column (FK to lists)
    op.execute(text("""
        ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_list_id_fkey
    """))
    op.execute(text("ALTER TABLE habits DROP COLUMN IF EXISTS list_id"))

    # 10. Drop list_members table
    op.execute(text("DROP TABLE IF EXISTS list_members"))

    # 11. Drop lists table
    op.execute(text("DROP TABLE IF EXISTS lists"))


def downgrade() -> None:
    # This migration is not reversible in a meaningful way.
    # To downgrade, restore from a database backup taken before the migration.
    raise NotImplementedError("Downgrade not supported for this migration. Restore from backup.")
