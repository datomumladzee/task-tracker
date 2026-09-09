"""add server default to users.role

Revision ID: cbcf14eac03e
Revises: 79e47f38a784
Create Date: 2026-09-09 14:51:48.238577

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cbcf14eac03e'
down_revision: Union[str, None] = '79e47f38a784'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Autogenerate produced an empty file here. Alembic does not compare server
# defaults unless compare_server_default=True is set in env.py, which it now
# is. Both statements below were written by hand.
#
# "MEMBER" is the enum member NAME, which is what SQLAlchemy stores in
# Postgres. Writing "member" would set a default the user_role type rejects.

_ENUM = sa.Enum("ADMIN", "MEMBER", name="user_role")


def upgrade() -> None:
    op.alter_column(
        "users",
        "role",
        existing_type=_ENUM,
        existing_nullable=False,
        server_default="MEMBER",
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "role",
        existing_type=_ENUM,
        existing_nullable=False,
        server_default=None,
    )
