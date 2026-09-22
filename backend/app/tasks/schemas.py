from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator, model_validator

from app.tasks.models import TaskPriority, TaskStatus
from app.users.schemas import UserSummary

TaskTitle = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]


class TaskCreate(BaseModel):
    """What creating a task accepts.

    No position here. The server puts a new task at the bottom of its column,
    so a client can never send a position that collides with another task.
    """

    title: TaskTitle
    description: str | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: date | None = None
    # Checked in the service, not here: the assignee must be a member of this
    # project, and only the database can answer that.
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    """Partial edit. Only the fields sent change.

    No status here on purpose. Changing status moves the task to another
    column, which also needs a new position there. That goes through
    TaskMove, so a task can never land in a column with a stale position.
    """

    title: TaskTitle | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    due_date: date | None = None
    assignee_id: int | None = None

    @field_validator("title", "priority")
    @classmethod
    def cannot_be_null(cls, value):
        # Runs only when the field was sent. Omitting it is fine, an explicit
        # null is a 422 rather than a NOT NULL crash in Postgres.
        # description, due_date and assignee_id may be null: that clears them.
        if value is None:
            raise ValueError("cannot be null")
        return value


class TaskMove(BaseModel):
    """Move a task within its column or to another one.

    Placed relative to a neighbour instead of by raw number, so the client
    never has to know the float positions. The server works out the midpoint.

    before_task_id  put it directly above that task
    after_task_id   put it directly below that task
    neither         put it at the bottom of the column
    """

    # None keeps the current column.
    status: TaskStatus | None = None
    before_task_id: int | None = None
    after_task_id: int | None = None

    @model_validator(mode="after")
    def one_anchor_at_most(self):
        # Both at once is ambiguous if the two tasks are not neighbours.
        if self.before_task_id is not None and self.after_task_id is not None:
            raise ValueError("give before_task_id or after_task_id, not both")
        return self


class TaskRead(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None
    # Nested so the board can show a name without a second request. The
    # service must selectinload Task.assignee, or lazy="raise" fires.
    assignee: UserSummary | None
    created_by_id: int | None
    position: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


CommentBody = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=5000),
]


class CommentCreate(BaseModel):
    body: CommentBody


class CommentUpdate(BaseModel):
    body: CommentBody


class CommentRead(BaseModel):
    """A comment with its author.

    author is nullable because comments.author_id is ON DELETE SET NULL: the
    thread survives someone leaving, and the frontend shows a deleted user.
    """

    id: int
    task_id: int
    author: UserSummary | None
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
