"""replace users with user_cache

Revision ID: d5e6f7a8b9c0
Revises: 801581372350
Create Date: 2026-09-08 18:34:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = '801581372350'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 2a. Create user_cache table
    op.create_table(
        'user_cache',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=True),
        sa.Column('storage_quota_bytes', sa.BigInteger(), server_default='5368709120', nullable=False),
        sa.Column('storage_used', sa.BigInteger(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('user_id')
    )
    op.create_index(op.f('ix_user_cache_user_id'), 'user_cache', ['user_id'], unique=False)

    # 2b. Backfill user_cache from existing users table
    op.execute(
        """
        INSERT INTO user_cache (user_id, display_name, storage_quota_bytes, storage_used)
        SELECT id, email, COALESCE(storage_quota_bytes, 5368709120), COALESCE(storage_used, 0)
        FROM users
        ON CONFLICT (user_id) DO NOTHING
        """
    )

    # 2c. Drop existing foreign key constraints referencing users
    op.drop_constraint('files_owner_id_fkey', 'files', type_='foreignkey')

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if 'folders' in tables:
        folder_fks = [fk['name'] for fk in inspector.get_foreign_keys('folders')]
        if 'folders_owner_id_fkey' in folder_fks:
            op.drop_constraint('folders_owner_id_fkey', 'folders', type_='foreignkey')

    if 'file_shares' in tables:
        share_fks = [fk['name'] for fk in inspector.get_foreign_keys('file_shares')]
        if 'file_shares_shared_with_user_id_fkey' in share_fks:
            op.drop_constraint('file_shares_shared_with_user_id_fkey', 'file_shares', type_='foreignkey')

    # 2d. Add new FK constraints referencing user_cache.user_id
    op.create_foreign_key('files_owner_id_fkey', 'files', 'user_cache', ['owner_id'], ['user_id'])
    if 'folders' in tables:
        op.create_foreign_key('folders_owner_id_fkey', 'folders', 'user_cache', ['owner_id'], ['user_id'])
    if 'file_shares' in tables:
        op.create_foreign_key('file_shares_shared_with_user_id_fkey', 'file_shares', 'user_cache', ['shared_with_user_id'], ['user_id'])

    # 2e. Drop old token_version table if it exists as a separate table
    if 'token_version' in tables:
        op.drop_table('token_version')
    if 'token_versions' in tables:
        op.drop_table('token_versions')

    # 2f. Drop the old users table
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')


def downgrade() -> None:
    # 1. Recreate users table
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('storage_used', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('storage_quota_bytes', sa.BigInteger(), server_default='5368709120', nullable=False),
        sa.Column('token_version', sa.Integer(), server_default='1', nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # 2. Backfill users from user_cache
    op.execute(
        """
        INSERT INTO users (id, email, hashed_password, storage_quota_bytes, storage_used, token_version)
        SELECT user_id, COALESCE(display_name, cast(user_id as text) || '@cachette.local'), '', storage_quota_bytes, storage_used, 1
        FROM user_cache
        ON CONFLICT (id) DO NOTHING
        """
    )

    # 3. Drop FK constraints pointing to user_cache
    op.drop_constraint('files_owner_id_fkey', 'files', type_='foreignkey')

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if 'folders' in tables:
        folder_fks = [fk['name'] for fk in inspector.get_foreign_keys('folders')]
        if 'folders_owner_id_fkey' in folder_fks:
            op.drop_constraint('folders_owner_id_fkey', 'folders', type_='foreignkey')

    if 'file_shares' in tables:
        share_fks = [fk['name'] for fk in inspector.get_foreign_keys('file_shares')]
        if 'file_shares_shared_with_user_id_fkey' in share_fks:
            op.drop_constraint('file_shares_shared_with_user_id_fkey', 'file_shares', type_='foreignkey')

    # 4. Restore FK constraints pointing to users.id
    op.create_foreign_key('files_owner_id_fkey', 'files', 'users', ['owner_id'], ['id'])
    if 'folders' in tables:
        op.create_foreign_key('folders_owner_id_fkey', 'folders', 'users', ['owner_id'], ['id'])
    if 'file_shares' in tables:
        op.create_foreign_key('file_shares_shared_with_user_id_fkey', 'file_shares', 'users', ['shared_with_user_id'], ['id'])

    # 5. Drop user_cache table
    op.drop_index(op.f('ix_user_cache_user_id'), table_name='user_cache')
    op.drop_table('user_cache')
