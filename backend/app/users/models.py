import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UserRole(str, enum.Enum):
    """Roles for RBAC. (RBAC = Role-Based Access Control.)

    Inherits from str as well as Enum so FastAPI and Pydantic can serialise a
    role straight to JSON. Without that, responses would need manual .value.

    The member names (ADMIN) are what Postgres stores, not the values.
    """

    ADMIN = "admin"
    MEMBER = "member"

#ORM model “I want the database to have a `users` table with this structure.”

class User(Base):
    __tablename__ = "users"

    # Mapped[...] is the SQLAlchemy 2.0 style. The Python type annotation is
    # what decides nullability: Mapped[str] is NOT NULL, Mapped[str | None]
    # is nullable. No need to repeat it in mapped_column().

    id: Mapped[int] = mapped_column(primary_key=True)

    # index=True because every login looks a user up by email. unique=True
    # gives the database the final say on duplicates, which an application
    # check cannot do safely when two requests register at the same moment.
    # 320 is the maximum length of an email address per the RFC.
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)

    # The argon2 output, never the password itself. Long enough for argon2id
    # and for any future algorithm change.
    hashed_password: Mapped[str] = mapped_column(String(255))

    full_name: Mapped[str] = mapped_column(String(255))

    # A real Postgres enum type, so the database rejects a role that is not
    # in the list. A typo'd role in RBAC is a security bug, not a display bug.
    # Changing the allowed set later needs its own migration, which is the
    # tradeoff taken here on purpose.
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"),
        # default is Python side, applied by SQLAlchemy during flush.
        default=UserRole.MEMBER,
        # server_default is SQL text stored on the column itself, so an INSERT
        # that never goes through SQLAlchemy still gets a role. Without it a
        # raw insert fails the NOT NULL constraint, which is what happened
        # when this was tested from psql.
        #
        # "MEMBER", not "member", because SQLAlchemy stores the enum member
        # NAME in Postgres. The value is what reaches JSON. Using the value
        # here would write a label the enum type does not contain.
        server_default="MEMBER",
    )

    # Disable an account without deleting the row, so their tasks and history
    # survive. server_default is the string "true" because it is SQL text,
    # not a Python bool.
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")

    # timezone=True stores timestamptz. func.now() means Postgres sets the
    # value, so the timestamp does not depend on the app server's clock.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # The shared TOTP secret, base32. Null until the user starts 2FA setup.
    #
    # Stored in clear text, unlike hashed_password. A password only ever needs
    # to be compared, so a hash is enough. A TOTP secret has to be fed back
    # into the algorithm on every login, so the server must be able to read it.
    # Doing this properly means encrypting it at rest under a separate key.
    # Skipped deliberately for now, and worth revisiting before this holds real
    # accounts: anyone who reads this column can generate valid codes.
    totp_secret: Mapped[str | None] = mapped_column(String(64), default=None)

    # Separate from totp_secret on purpose. Having a secret means setup was
    # started. This means a code was actually confirmed. Without the gap, a
    # failed QR scan would lock the user out of their own account.
    totp_enabled: Mapped[bool] = mapped_column(default=False, server_default="false")


    def __repr__(self) -> str:
        # role is None on an object that has not been flushed yet, because
        # both defaults land at INSERT time and neither runs at construction.
        # A __repr__ must never raise: it is a debugging tool, so crashing
        # here fails at exactly the moment you need it.
        role = self.role.value if self.role is not None else None
        return f"<User id={self.id} email={self.email!r} role={role}>"
"""
    id — primary key, auto-incrementing integer
    email — unique, indexed, max 320 characters
    hashed_password — the Argon2 hash, never the real password
    full_name — display name
    role — Admin or Member (Postgres enum)
    is_active — true/false, lets you disable an account without deleting it
    created_at — timestamp, set automatically by Postgres when the row is inserted
That's the full users table shape.
"""