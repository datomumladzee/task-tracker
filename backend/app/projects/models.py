import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class ProjectRole(str, enum.Enum):
    """A role inside one project, not a system wide role.

    Different from User.role, which is ADMIN or MEMBER across the whole app.
    A system admin is not automatically an admin of a project they joined,
    which is why these are two separate Postgres enum types.

    ADMIN    manage members, and everything below
    STANDARD create and edit tasks and comments
    VIEWER   read only
    """

    ADMIN = "admin"
    STANDARD = "standard"
    VIEWER = "viewer"


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        # Case-insensitive name lookup for week 3, which has to resolve "the
        # auth project" out of a sentence. Declared here as well as in the
        # migration, or autogenerate sees an index the models do not know
        # about and proposes dropping it on the next run.
        Index("ix_projects_lower_name", text("lower(name)")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Deliberately not unique. Week 3 has to resolve "the auth project" out of
    # a sentence, and two projects with similar names is a case to handle, not
    # one to forbid. The migration adds a lower(name) index for that lookup.
    name: Mapped[str] = mapped_column(String(200))

    description: Mapped[str | None] = mapped_column(Text, default=None)

    # Informational only. Permissions live entirely in project_members, so
    # nothing should read this to decide whether an action is allowed.
    # Nullable because the creator's account can be deleted later.
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        default=None,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # cascade and passive_deletes are the pair that matters.
    #
    # ondelete="CASCADE" on the ForeignKey is Postgres doing the delete, and
    # works even for SQL that never goes through SQLAlchemy.
    # cascade="all, delete-orphan" is SQLAlchemy doing it in Python.
    # passive_deletes=True tells SQLAlchemy to stand back and let the database
    # do it, instead of loading every child row to delete them one at a time.
    #
    # lazy="raise" makes a missing selectinload fail immediately, naming this
    # relationship, instead of failing somewhere unrelated. Lazy loading does
    # not work under async and its error is unhelpful.
    members: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )

    # "Task" as a string, because tasks/models.py imports nothing from here.
    # SQLAlchemy resolves the name later, once both classes are registered.
    tasks: Mapped[list["Task"]] = relationship(  # noqa: F821
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id} name={self.name!r}>"


class ProjectMember(Base):
    """Who is in a project, and what they may do there.

    The only source of truth for permissions. There is no owner column on
    Project, so every check is one question: what role does this user have
    here. The cost of that simplicity is that something has to stop the last
    ADMIN being removed, or the project becomes unmanageable.
    """

    __tablename__ = "project_members"
    __table_args__ = (
        # One membership per person per project. Enforced by the database,
        # because an application check loses the same race registration does.
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )

    # CASCADE rather than SET NULL. A membership with no user means nothing,
    # unlike a task, which outlives the person who filed it.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )

    role: Mapped[ProjectRole] = mapped_column(
        Enum(ProjectRole, name="project_role"),
        default=ProjectRole.STANDARD,
        server_default="STANDARD",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    project: Mapped["Project"] = relationship(back_populates="members", lazy="raise")

    # No back_populates on User. That would mean users/models.py knowing about
    # projects, and nothing needs that direction yet.
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821

    def __repr__(self) -> str:
        role = self.role.value if self.role is not None else None
        return f"<ProjectMember project={self.project_id} user={self.user_id} role={role}>"
