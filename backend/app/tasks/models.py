import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class TaskStatus(str, enum.Enum):
    """The board columns.

    Four rather than three, because the week 3 stretch goal talks about moving
    things "to in review". How many columns the frontend draws is a separate
    decision from what the database allows.
    """

    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"


class TaskPriority(str, enum.Enum):
    """Three levels, on purpose.

    Week 3 has to map "high priority" out of a sentence onto one of these.
    Fewer values means fewer ways for that to be wrong.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        # The board query: every task in a project, grouped by column, already
        # in display order. Column order matches the sort, so Postgres reads
        # the index rather than sorting afterwards.
        Index("ix_tasks_board", "project_id", "status", "position"),
        Index("ix_tasks_assignee", "assignee_id"),
    )

    # Fetch server-generated values back in the same statement, via
    # UPDATE ... RETURNING. updated_at is set by Postgres through
    # onupdate=func.now(), so without this the attribute is expired after a
    # commit and Pydantic triggers a lazy reload while serialising the
    # response, which fails under async with MissingGreenlet.
    __mapper_args__ = {"eager_defaults": True}


    id: Mapped[int] = mapped_column(primary_key=True)

    # NOT NULL. A task with no project would need a branch in every permission
    # check, since permissions are resolved through project membership.
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
    )

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, default=None)

    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status"),
        default=TaskStatus.TODO,
        server_default="TODO",
    )

    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, name="task_priority"),
        default=TaskPriority.MEDIUM,
        server_default="MEDIUM",
    )

    # Date, not DateTime. "Friday" has no time of day, and a timestamp would
    # force a timezone decision that has no right answer for a due date.
    due_date: Mapped[date | None] = mapped_column(Date, default=None)

    # SET NULL, not CASCADE. Deleting a person must not delete their work.
    # Nullable anyway, because an unassigned task is normal.
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        default=None,
    )

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        default=None,
    )

    # Float so a task can be dropped between two others by giving it their
    # midpoint, one UPDATE instead of renumbering the column. Ordering is
    # within (project_id, status), so a task sorts inside its own column.
    #
    # Repeated midpoints converge: 0.5, 0.25, 0.125. After enough moves two
    # tasks collide at the limit of float precision, so the service layer
    # needs a rebalance path.
    position: Mapped[float] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # onupdate is applied by SQLAlchemy when it builds the UPDATE, so it only
    # fires for writes that go through a session.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    project: Mapped["Project"] = relationship(  # noqa: F821
        back_populates="tasks",
        lazy="raise",
    )

    # Two foreign keys point at users, so SQLAlchemy cannot guess which column
    # each relationship means. foreign_keys says it explicitly.
    assignee: Mapped["User | None"] = relationship(  # noqa: F821
        foreign_keys=[assignee_id],
        lazy="raise",
    )

    comments: Mapped[list["Comment"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )

    def __repr__(self) -> str:
        status = self.status.value if self.status is not None else None
        return f"<Task id={self.id} title={self.title!r} status={status}>"


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        # A task's comments, oldest first, without a sort step.
        Index("ix_comments_task", "task_id", "created_at"),
    )

    # Fetch server-generated values back in the same statement, via
    # UPDATE ... RETURNING. updated_at is set by Postgres through
    # onupdate=func.now(), so without this the attribute is expired after a
    # commit and Pydantic triggers a lazy reload while serialising the
    # response, which fails under async with MissingGreenlet.
    __mapper_args__ = {"eager_defaults": True}


    id: Mapped[int] = mapped_column(primary_key=True)

    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
    )

    # SET NULL, so a comment survives its author leaving and the thread still
    # reads in order. The UI shows it as a deleted user.
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        default=None,
    )

    # Text rather than String(n). There is no length a comment should be
    # refused at.
    body: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    task: Mapped["Task"] = relationship(back_populates="comments", lazy="raise")

    author: Mapped["User | None"] = relationship(lazy="raise")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Comment id={self.id} task={self.task_id}>"
