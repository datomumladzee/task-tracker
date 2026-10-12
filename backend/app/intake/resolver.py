"""Turns the words in a TaskDraft into real ids, against the database.

The model proposed "mobile" and "Anna". This decides which project and which
person those mean, for this user, or asks a question when it cannot tell.
The model never sees ids and never decides one: this file is where every id
in an AI-created task comes from.
"""

import enum

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.intake.schemas import TaskDraft
from app.projects.models import Project
from app.projects.service import (
    find_members_by_reference,
    find_projects_by_name,
    list_projects_for_user,
)
from app.users.models import User

# Words that mean the person typing. Compared after lowercasing.
_SELF = {"me", "myself", "i", "self"}


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


def _project_candidate(p: Project) -> Candidate:
    return Candidate(id=p.id, label=p.name)


def _user_candidate(u: User) -> Candidate:
    return Candidate(id=u.id, label=f"{u.full_name} <{u.email}>")


def _which(labels: list[str]) -> str:
    return ", ".join(labels[:-1]) + " or " + labels[-1] if len(labels) > 1 else labels[0]


async def _resolve_project(db: AsyncSession, ref: str | None, user_id: int) -> Resolution:
    if ref is None:
        # Nothing mentioned. Every task needs a project, so either there is
        # only one it could be, or we have to ask.
        mine = [p for p, _role in await list_projects_for_user(db, user_id)]
        if len(mine) == 1:
            return Resolution(outcome=Outcome.RESOLVED, ref=None, id=mine[0].id)
        if not mine:
            return Resolution(
                outcome=Outcome.UNKNOWN,
                ref=None,
                question="You are not in any project yet. Create one first.",
            )
        return Resolution(
            outcome=Outcome.UNKNOWN,
            ref=None,
            candidates=[_project_candidate(p) for p in mine],
            question="Which project should this go in?",
        )

    found = await find_projects_by_name(db, user_id, ref)

    if len(found) == 1:
        return Resolution(outcome=Outcome.RESOLVED, ref=ref, id=found[0].id)
    if found:
        return Resolution(
            outcome=Outcome.AMBIGUOUS,
            ref=ref,
            candidates=[_project_candidate(p) for p in found],
            question=f"Which project did you mean: {_which([p.name for p in found])}?",
        )
    return Resolution(
        outcome=Outcome.UNKNOWN,
        ref=ref,
        question=f'I could not find a project called "{ref}". Which project?',
    )


async def _resolve_assignee(
    db: AsyncSession,
    ref: str | None,
    project: Resolution,
    user_id: int,
) -> Resolution:
    if ref is None:
        return Resolution(outcome=Outcome.NOT_GIVEN, ref=None)

    if project.outcome != Outcome.RESOLVED:
        # "Anna" means a member of some project. Until we know which one there
        # is nobody to check her against.
        return Resolution(
            outcome=Outcome.WAITING,
            ref=ref,
            question="Choose the project first, then the assignee can be checked.",
        )

    if ref.strip().lower() in _SELF:
        # The project was found by searching only the user's own projects,
        # so they are a member of it.
        return Resolution(outcome=Outcome.RESOLVED, ref=ref, id=user_id)

    found = await find_members_by_reference(db, project.id, ref)

    if len(found) == 1:
        return Resolution(outcome=Outcome.RESOLVED, ref=ref, id=found[0].id)
    if found:
        return Resolution(
            outcome=Outcome.AMBIGUOUS,
            ref=ref,
            candidates=[_user_candidate(u) for u in found],
            question=f"Which {ref} did you mean?",
        )
    return Resolution(
        outcome=Outcome.UNKNOWN,
        ref=ref,
        question=f'Nobody called "{ref}" is in this project. Who should it be assigned to?',
    )


async def resolve_draft(db: AsyncSession, draft: TaskDraft, *, user_id: int) -> ResolvedDraft:
    """Resolve the project, then the assignee, for one user."""
    project = await _resolve_project(db, draft.project_ref, user_id)
    assignee = await _resolve_assignee(db, draft.assignee_ref, project, user_id)
    return ResolvedDraft(draft=draft, project=project, assignee=assignee)
