import enum
from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, StringConstraints, field_validator

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


# ---------------------------------------------------------------------------
# What the resolver returns
# ---------------------------------------------------------------------------


class Outcome(str, enum.Enum):
    RESOLVED = "resolved"    # exactly one match, id is set
    AMBIGUOUS = "ambiguous"  # several matches, pick from candidates
    UNKNOWN = "unknown"      # no match, a question explains
    NOT_GIVEN = "not_given"  # nothing was said, and nothing is needed
    WAITING = "waiting"      # cannot be checked until the project is known


class Candidate(BaseModel):
    id: int
    label: str


class Resolution(BaseModel):
    """The answer for one reference field.

    A question rather than an error, so the frontend can show what the model
    was unsure about and let the user fix it in place.
    """

    outcome: Outcome
    ref: str | None = Field(description="The words the model returned for this field.")
    id: int | None = None
    candidates: list[Candidate] = []
    question: str | None = None


class ResolvedDraft(BaseModel):
    draft: TaskDraft
    project: Resolution
    assignee: Resolution

    @property
    def ready(self) -> bool:
        """True when nothing needs asking. A task must have a project; an
        assignee is optional."""
        return self.project.outcome == Outcome.RESOLVED and self.assignee.outcome in (
            Outcome.RESOLVED,
            Outcome.NOT_GIVEN,
        )


# ---------------------------------------------------------------------------
# The HTTP shapes
# ---------------------------------------------------------------------------


class ParseRequest(BaseModel):
    # 2000 is generous for one task and keeps a pasted essay from spending the
    # free-tier quota on a single request.
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]

    # The user's IANA timezone, e.g. "Asia/Tbilisi". Browsers report it with
    # Intl.DateTimeFormat().resolvedOptions().timeZone. Without it, dates are
    # worked out in UTC.
    timezone: str | None = Field(default=None, max_length=64, examples=["Asia/Tbilisi"])

    @field_validator("timezone")
    @classmethod
    def must_be_a_real_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            # ValueError covers malformed keys, including path tricks like
            # "../../etc/passwd", which zoneinfo refuses to open.
            raise ValueError(f"unknown timezone {value!r}, expected an IANA name like Asia/Tbilisi") from None
        return value


class ParseResponse(BaseModel):
    """What the user sees before anything is saved as a task."""

    draft_id: int
    text: str
    draft: TaskDraft
    project: Resolution
    assignee: Resolution
    ready: bool
    expires_at: datetime


class DraftConfirm(BaseModel):
    """Fixes to apply before the draft becomes a task. Only what is sent changes.

    project_id and assignee_id are how the user answers the resolver's
    questions, picking from the candidates it offered. Both are checked again
    on confirm: an id sent here is never trusted just because it was sent.
    """

    project_id: int | None = None
    assignee_id: int | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    description: str | None = None
    due_date: date | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None

    @field_validator("project_id", "title", "priority", "status")
    @classmethod
    def cannot_be_null(cls, value):
        # Runs only for fields actually sent. Omitting them keeps the draft's
        # value. Sending null for these would mean "no project" or "no title",
        # which a task cannot have. description, due_date and assignee_id may be
        # null: that clears them.
        if value is None:
            raise ValueError("cannot be null")
        return value
