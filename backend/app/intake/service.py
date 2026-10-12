"""Saving drafts, and turning a confirmed draft into a real task.

Same rule as every other service: plain arguments in, plain objects out, no
HTTP. confirm_draft ends by calling tasks.service.create_task, the exact
function POST /projects/{id}/tasks calls, so there is one way to write a task
and the AI path cannot drift from the normal one.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.unset import UNSET, Unset
from app.intake.models import IntakeDraft
from app.intake.resolver import resolve_assignee, resolve_draft
from app.intake.schemas import Outcome, Resolution, TaskDraft
from app.projects.deps import ROLE_RANK
from app.projects.models import ProjectRole
from app.projects.service import get_membership
from app.tasks import service as tasks_service
from app.tasks.models import Task, TaskPriority, TaskStatus

DRAFT_LIFETIME = timedelta(minutes=30)


class DraftNotFound(Exception):
    """No draft with that id belongs to this user."""


class DraftExpired(Exception):
    pass


class DraftAlreadyConfirmed(Exception):
    pass


class DraftNotReady(Exception):
    """A question is still open, and the confirm did not answer it."""

    def __init__(self, field: str, resolution: Resolution):
        super().__init__(field)
        self.field = field
        self.resolution = resolution


class ProjectNotVisible(Exception):
    """The chosen project does not exist or the user is not in it.

    One error for both, the same rule as the project endpoints: nobody learns
    which project ids are real by trying them here.
    """


class RoleTooLow(Exception):
    """In the project, but below STANDARD, so not allowed to create tasks."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def create_draft(
    db: AsyncSession,
    *,
    user_id: int,
    text: str,
    draft: TaskDraft,
    now: datetime | None = None,
) -> IntakeDraft:
    """Store a draft for 30 minutes.

    Also clears this user's expired, unconfirmed drafts, so the table cannot
    grow without limit and no background job is needed.
    """
    now = now or _now()

    await db.execute(
        delete(IntakeDraft).where(
            IntakeDraft.user_id == user_id,
            IntakeDraft.confirmed_at.is_(None),
            IntakeDraft.expires_at <= now,
        )
    )

    row = IntakeDraft(
        user_id=user_id,
        text=text,
        # mode="json" turns the date into "2026-10-16" so it fits in JSONB.
        draft=draft.model_dump(mode="json"),
        expires_at=now + DRAFT_LIFETIME,
    )
    db.add(row)
    await db.commit()
    return row


async def confirm_draft(
    db: AsyncSession,
    *,
    user_id: int,
    draft_id: int,
    project_id: int | Unset = UNSET,
    assignee_id: int | None | Unset = UNSET,
    title: str | Unset = UNSET,
    description: str | None | Unset = UNSET,
    due_date: date | None | Unset = UNSET,
    priority: TaskPriority | Unset = UNSET,
    status: TaskStatus | Unset = UNSET,
    now: datetime | None = None,
) -> Task:
    """Apply the user's fixes and create the task. Once only.

    Everything is checked again here rather than trusted from parse time:
    memberships and roles can change in 30 minutes, and project_id and
    assignee_id arrive from the client.
    """
    now = now or _now()

    # FOR UPDATE, so two confirms of the same draft at the same moment cannot
    # both pass the "already confirmed" check and create two tasks. The second
    # waits, then sees confirmed_at set.
    row = (
        await db.execute(
            select(IntakeDraft)
            .where(IntakeDraft.id == draft_id, IntakeDraft.user_id == user_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if row is None:
        raise DraftNotFound(draft_id)
    if row.confirmed_at is not None:
        raise DraftAlreadyConfirmed(draft_id)
    if row.expires_at <= now:
        raise DraftExpired(draft_id)

    stored = TaskDraft.model_validate(row.draft)

    # --- project -----------------------------------------------------------
    if isinstance(project_id, Unset):
        resolved = await resolve_draft(db, stored, user_id=user_id)
        if resolved.project.outcome != Outcome.RESOLVED:
            raise DraftNotReady("project", resolved.project)
        project_id = resolved.project.id

    membership = await get_membership(db, project_id, user_id)
    if membership is None:
        raise ProjectNotVisible(project_id)
    # The same bar as POST /projects/{id}/tasks. The resolver only checked
    # that the user is in the project, which a viewer is.
    if ROLE_RANK[membership.role] < ROLE_RANK[ProjectRole.STANDARD]:
        raise RoleTooLow(project_id)

    # --- assignee ----------------------------------------------------------
    if isinstance(assignee_id, Unset):
        # Checked against the project actually chosen, which may not be the
        # one the resolver guessed.
        chosen = Resolution(outcome=Outcome.RESOLVED, ref=None, id=project_id)
        assignee = await resolve_assignee(db, stored.assignee_ref, chosen, user_id)
        if assignee.outcome == Outcome.NOT_GIVEN:
            assignee_id = None
        elif assignee.outcome == Outcome.RESOLVED:
            assignee_id = assignee.id
        else:
            raise DraftNotReady("assignee", assignee)

    # --- the rest, edits winning over the draft ------------------------------
    def pick(edit, from_draft):
        return from_draft if isinstance(edit, Unset) else edit

    fields = {
        "title": pick(title, stored.title),
        "description": pick(description, stored.description),
        "due_date": pick(due_date, stored.due_date),
    }
    # Left out when unset, so create_task's own defaults apply rather than a
    # None that the NOT NULL columns would reject.
    chosen_priority = pick(priority, stored.priority)
    chosen_status = pick(status, stored.status)
    if chosen_priority is not None:
        fields["priority"] = chosen_priority
    if chosen_status is not None:
        fields["status"] = chosen_status

    # Marked confirmed before create_task, so its commit writes both the task
    # and the mark in one transaction. If it fails, neither is saved.
    row.confirmed_at = now
    try:
        task = await tasks_service.create_task(
            db,
            project_id=project_id,
            created_by_id=user_id,
            assignee_id=assignee_id,
            **fields,
        )
    except Exception:
        await db.rollback()
        raise

    row.task_id = task.id
    await db.commit()
    return task
