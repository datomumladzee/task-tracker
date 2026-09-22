from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.projects.deps import ROLE_RANK, require_project_role
from app.projects.models import ProjectMember, ProjectRole
from app.tasks import service
from app.tasks.models import Comment, Task, TaskStatus
from app.tasks.schemas import (
    CommentCreate,
    CommentRead,
    CommentUpdate,
    TaskCreate,
    TaskMove,
    TaskRead,
    TaskUpdate,
)

# Nested under a project, so the project id is in the path and the same
# require_project_role dependency that guards projects guards tasks too.
router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])

viewer = require_project_role(ProjectRole.VIEWER)
standard = require_project_role(ProjectRole.STANDARD)
admin = require_project_role(ProjectRole.ADMIN)


async def _task_or_404(db: AsyncSession, project_id: int, task_id: int) -> Task:
    """Fetch a task inside this project, or 404.

    The project id is part of the lookup, so a task id from another project is
    missing rather than forbidden and cannot be probed from here.
    """
    task = await service.get_task(db, project_id, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return task


def _unprocessable(detail: str) -> HTTPException:
    """422 for input that is well formed but wrong about the world.

    An assignee who is not a member, or an anchor task in another column, are
    both valid JSON that the database says cannot be.
    """
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    member: ProjectMember = Depends(standard),
    db: AsyncSession = Depends(get_db),
) -> Task:
    try:
        return await service.create_task(
            db,
            project_id=member.project_id,
            created_by_id=member.user_id,
            **data.model_dump(),
        )
    except service.AssigneeNotMember:
        raise _unprocessable("Assignee is not a member of this project") from None


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    status: TaskStatus | None = None,
    assignee_id: int | None = None,
    member: ProjectMember = Depends(viewer),
    db: AsyncSession = Depends(get_db),
) -> list[Task]:
    """The board, already ordered by column and position."""
    return await service.list_tasks(
        db, member.project_id, status=status, assignee_id=assignee_id
    )


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: int,
    member: ProjectMember = Depends(viewer),
    db: AsyncSession = Depends(get_db),
) -> Task:
    return await _task_or_404(db, member.project_id, task_id)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    member: ProjectMember = Depends(standard),
    db: AsyncSession = Depends(get_db),
) -> Task:
    """Edit a task. Status is not editable here, /move handles that."""
    task = await _task_or_404(db, member.project_id, task_id)
    try:
        return await service.update_task(db, task, **data.model_dump(exclude_unset=True))
    except service.AssigneeNotMember:
        raise _unprocessable("Assignee is not a member of this project") from None


@router.post("/{task_id}/move", response_model=TaskRead)
async def move_task(
    task_id: int,
    data: TaskMove,
    member: ProjectMember = Depends(standard),
    db: AsyncSession = Depends(get_db),
) -> Task:
    """Reorder a task, or send it to another column.

    A POST rather than a PATCH because it is an action with side effects on
    neighbouring rows, not a field being set to a value the caller chose.
    """
    task = await _task_or_404(db, member.project_id, task_id)
    try:
        return await service.move_task(
            db,
            task,
            status=data.status,
            before_task_id=data.before_task_id,
            after_task_id=data.after_task_id,
        )
    except service.InvalidAnchor:
        raise _unprocessable(
            "The task to position against is not in this column"
        ) from None


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    member: ProjectMember = Depends(admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Admin only. Deleting is the one irreversible action here, and it takes
    the task's comments with it. Everything else on a task can be undone."""
    task = await _task_or_404(db, member.project_id, task_id)
    await service.delete_task(db, task)


# ---------------------------------------------------------------------------
# comments
# ---------------------------------------------------------------------------
#
# A comment belongs to a person, not just to a project, so the rules differ
# from tasks. Editing is author only: nobody, admin included, rewrites what
# someone else said. Deleting is author or project admin, because an admin has
# to be able to remove abuse or a leaked secret. Same split as Jira, Linear
# and GitHub.


async def _comment_or_404(db: AsyncSession, task_id: int, comment_id: int) -> Comment:
    comment = await service.get_comment(db, task_id, comment_id)
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )
    return comment


@router.post(
    "/{task_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    task_id: int,
    data: CommentCreate,
    member: ProjectMember = Depends(standard),
    db: AsyncSession = Depends(get_db),
) -> Comment:
    await _task_or_404(db, member.project_id, task_id)
    return await service.create_comment(
        db, task_id=task_id, author_id=member.user_id, body=data.body
    )


@router.get("/{task_id}/comments", response_model=list[CommentRead])
async def list_comments(
    task_id: int,
    member: ProjectMember = Depends(viewer),
    db: AsyncSession = Depends(get_db),
) -> list[Comment]:
    await _task_or_404(db, member.project_id, task_id)
    return await service.list_comments(db, task_id)


@router.patch("/{task_id}/comments/{comment_id}", response_model=CommentRead)
async def update_comment(
    task_id: int,
    comment_id: int,
    data: CommentUpdate,
    member: ProjectMember = Depends(standard),
    db: AsyncSession = Depends(get_db),
) -> Comment:
    await _task_or_404(db, member.project_id, task_id)
    comment = await _comment_or_404(db, task_id, comment_id)

    if comment.author_id != member.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author can edit a comment",
        )

    return await service.update_comment(db, comment, body=data.body)


@router.delete(
    "/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    task_id: int,
    comment_id: int,
    member: ProjectMember = Depends(viewer),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _task_or_404(db, member.project_id, task_id)
    comment = await _comment_or_404(db, task_id, comment_id)

    is_author = comment.author_id == member.user_id
    is_admin = ROLE_RANK[member.role] >= ROLE_RANK[ProjectRole.ADMIN]
    if not (is_author or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or a project admin can delete a comment",
        )

    await service.delete_comment(db, comment)
