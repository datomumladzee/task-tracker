from datetime import date

from pydantic import BaseModel, Field

from app.tasks.models import TaskPriority, TaskStatus

# The shape the model is asked to fill in. Every description below is sent to
# the model as part of the JSON schema, so they double as per-field
# instructions. Keep them short and literal.
#
# Every field is required but may be null. That forces the model to make a
# decision on each one, instead of leaving a field out and leaving us unsure
# whether it was considered.


class TaskDraft(BaseModel):
    """A task proposed by the model. Not saved, not trusted yet.

    project_ref and assignee_ref are words the user said, never ids. The model
    cannot check an id, and a guessed one is either a crash or, worse, a task
    quietly created on someone else's project. Turning these words into real
    ids is our own code's job, against the database.
    """

    title: str = Field(
        min_length=1,
        max_length=200,
        description="Short imperative task title, without the date, priority or assignee.",
    )
    description: str | None = Field(
        description="Extra detail the user gave beyond the title, or null.",
    )
    due_date: date | None = Field(
        description="Absolute due date as YYYY-MM-DD, resolved from relative words "
        "like 'friday' or 'tomorrow' using today's date, or null if none was given.",
    )
    priority: TaskPriority | None = Field(
        description="Only if the user stated or clearly implied it, else null.",
    )
    status: TaskStatus | None = Field(
        description="Only if the user stated it, else null.",
    )
    project_ref: str | None = Field(
        description="The project name as the user said it, without words like "
        "'the' or 'project'. Null if no project was mentioned. Never invent one.",
    )
    assignee_ref: str | None = Field(
        description="Who the task is for, as the user said it: 'me', a name, or an "
        "email. Null if nobody was mentioned. Never invent one.",
    )
