from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import llm
from app.core.config import settings
from app.core.db import get_db
from app.core.ratelimit import RateLimiter
from app.core.deps import get_current_user
from app.intake import parser, service
from app.intake.resolver import resolve_draft
from app.intake.schemas import DraftConfirm, ParseRequest, ParseResponse
from app.projects.service import list_projects_for_user
from app.tasks.models import Task
from app.tasks.schemas import TaskRead
from app.tasks.service import AssigneeNotMember
from app.users.models import User

router = APIRouter(prefix="/intake", tags=["intake"])

# Per user, per process. See core/ratelimit.py for why that is fine locally.
parse_limiter = RateLimiter(limit=settings.intake_parse_limit_per_minute, window_seconds=60)


def _ai_failed(code: int, message: str, text: str, headers: dict | None = None) -> HTTPException:
    """An AI failure that hands the user's sentence back.

    Whatever went wrong on Google's side, the person should not have to type
    it again. The frontend can put this text straight back in the box.
    """
    return HTTPException(
        status_code=code,
        detail={"message": message, "text": text},
        headers=headers,
    )


@router.post("/parse", response_model=ParseResponse, status_code=status.HTTP_201_CREATED)
async def parse(
    data: ParseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ParseResponse:
    """A sentence in, a draft out. Nothing becomes a task until confirm."""
    # Before the model is called, so a refused request costs no quota.
    # Every attempt counts, including ones where the AI then fails, because
    # those spend quota too.
    wait = parse_limiter.hit(user.id)
    if wait is not None:
        raise _ai_failed(
            429,
            f"You are sending requests too quickly, try again in {wait} seconds",
            data.text,
            headers={"Retry-After": str(wait)},
        )

    project_names = [p.name for p, _role in await list_projects_for_user(db, user.id)]

    # The user's today, not the server's. See parser.today_in.
    today = parser.today_in(data.timezone)

    try:
        draft, _result = await parser.parse_task(data.text, today=today, project_names=project_names)
    except llm.LLMNotConfigured:
        raise _ai_failed(503, "The AI feature is not configured on this server", data.text) from None
    except llm.LLMRateLimited:
        raise _ai_failed(
            429, "Too many AI requests right now, try again shortly", data.text,
            headers={"Retry-After": "30"},
        ) from None
    except (llm.LLMUnavailable, llm.LLMBadOutput):
        raise _ai_failed(503, "The AI could not read that right now", data.text) from None

    resolved = await resolve_draft(db, draft, user_id=user.id)
    row = await service.create_draft(db, user_id=user.id, text=data.text, draft=draft)

    return ParseResponse(
        draft_id=row.id,
        text=row.text,
        draft=draft,
        project=resolved.project,
        assignee=resolved.assignee,
        ready=resolved.ready,
        expires_at=row.expires_at,
    )


@router.post(
    "/drafts/{draft_id}/confirm",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
)
async def confirm(
    draft_id: int,
    data: DraftConfirm,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Task:
    """Turn a draft into a task, applying any fixes sent in the body."""
    try:
        return await service.confirm_draft(
            db,
            user_id=user.id,
            draft_id=draft_id,
            **data.model_dump(exclude_unset=True),
        )
    except service.DraftNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft not found") from None
    except service.DraftExpired:
        # 410 rather than 404: it did exist, the user should parse again.
        raise HTTPException(status.HTTP_410_GONE, "This draft has expired, parse it again") from None
    except service.DraftAlreadyConfirmed:
        raise HTTPException(status.HTTP_409_CONFLICT, "This draft was already turned into a task") from None
    except service.DraftNotReady as e:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                # The fields are "project" and "assignee", so the article
                # depends on the word: "a project", "an assignee".
                "message": f"Choose {'an' if e.field[0] in 'aeiou' else 'a'} {e.field} before confirming",
                "field": e.field,
                "question": e.resolution.question,
                "candidates": [c.model_dump() for c in e.resolution.candidates],
            },
        ) from None
    except service.ProjectNotVisible:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found") from None
    except service.RoleTooLow:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Requires the standard role on this project"
        ) from None
    except AssigneeNotMember:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Assignee is not a member of this project"
        ) from None
