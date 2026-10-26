"""add persisted accounts, roles, permissions, sessions, and profile ownership"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision = "0012_security_foundation"
down_revision = "7f2b5c9d1e33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table("organizations",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("name", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_table("user_accounts",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("organization_id", sa.UUID(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("email", name="uq_user_accounts_email"))
    op.create_table("roles",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("name", sa.String(32), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_table("permissions",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("key", sa.String(80), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_table("account_roles",
        sa.Column("account_id", sa.UUID(), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", sa.UUID(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.UniqueConstraint("account_id", "role_id", name="uq_account_roles"))
    op.create_table("role_permissions",
        sa.Column("role_id", sa.UUID(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", sa.UUID(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permissions"))
    op.create_table("auth_sessions",
        sa.Column("id", sa.UUID(), primary_key=True), sa.Column("account_id", sa.UUID(), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_hash", sa.String(64), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("rotated_at", sa.DateTime(timezone=True)))
    op.create_index("ix_auth_sessions_account_active", "auth_sessions", ["account_id", "revoked_at"])
    op.add_column("entrepreneur_profiles", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_profile_organization", "entrepreneur_profiles", "organizations", ["organization_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_profile_user", "entrepreneur_profiles", "user_accounts", ["user_id"], ["id"], ondelete="SET NULL")
    op.execute(sa.text("INSERT INTO organizations (id, name, slug) VALUES (gen_random_uuid(), 'Inkomoko', 'inkomoko') ON CONFLICT (slug) DO NOTHING"))
    roles = ["super_admin", "admin", "adviser", "entrepreneur"]
    for role in roles:
        op.execute(sa.text("INSERT INTO roles (id, name) VALUES (gen_random_uuid(), :name) ON CONFLICT (name) DO NOTHING").bindparams(name=role))
    permissions = ["users.manage", "roles.manage", "reports.view", "profile.read_own", "profile.write_own", "learning.use", "business.use"]
    for key in permissions:
        op.execute(sa.text("INSERT INTO permissions (id, key) VALUES (gen_random_uuid(), :key) ON CONFLICT (key) DO NOTHING").bindparams(key=key))


def downgrade() -> None:
    op.drop_constraint("fk_profile_user", "entrepreneur_profiles", type_="foreignkey")
    op.drop_constraint("fk_profile_organization", "entrepreneur_profiles", type_="foreignkey")
    op.drop_column("entrepreneur_profiles", "organization_id")
    for table in ("auth_sessions", "role_permissions", "account_roles", "permissions", "roles", "user_accounts", "organizations"):
        op.drop_table(table)
