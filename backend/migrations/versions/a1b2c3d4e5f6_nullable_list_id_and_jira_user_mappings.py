"""nullable list_id and jira_user_mappings table

Revision ID: a1b2c3d4e5f6
Revises: 5f233bf6479b
Create Date: 2026-03-14 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '5f233bf6479b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make list_id nullable on tasks and change FK to SET NULL
    op.alter_column('tasks', 'list_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.drop_constraint('tasks_list_id_fkey', 'tasks', type_='foreignkey')
    op.create_foreign_key(None, 'tasks', 'lists', ['list_id'], ['id'], ondelete='SET NULL')

    # Create jira_user_mappings table
    op.create_table('jira_user_mappings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('config_id', sa.Integer(), nullable=False),
        sa.Column('jira_account_id', sa.String(100), nullable=False),
        sa.Column('jira_display_name', sa.String(200), nullable=False),
        sa.Column('jira_email', sa.String(200), nullable=True),
        sa.Column('zeno_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['config_id'], ['jira_config.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['zeno_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('config_id', 'jira_account_id', name='uq_jira_user_mapping'),
    )
    op.create_index('idx_jira_user_mapping_config', 'jira_user_mappings', ['config_id'])


def downgrade() -> None:
    op.drop_index('idx_jira_user_mapping_config', table_name='jira_user_mappings')
    op.drop_table('jira_user_mappings')

    op.drop_constraint(None, 'tasks', type_='foreignkey')
    op.create_foreign_key('tasks_list_id_fkey', 'tasks', 'lists', ['list_id'], ['id'], ondelete='CASCADE')
    op.alter_column('tasks', 'list_id',
               existing_type=sa.INTEGER(),
               nullable=False)
