from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.unset import UNSET, Unset
from app.projects.models import ProjectMember
from app.tasks.models import Comment, Task, TaskPriority, TaskStatus
from app.tasks.position import needs_rebalance, position_at_end, position_between, rebalance
from app.users.models import User

# Plain arguments in, plain objects out, same rule as the projects service.
# Week 3 calls create_task directly from the intake flow, with no request in
# sight, so nothing here may assume one exists.


class AssigneeNotMember(Exception):
    """The chosen assignee is not in this project.

    Checked here rather than in the schema, because only the database knows
    who is in a project. Without it a task could be assigned to someone who
    cannot open the project it lives in.
    """


async def _assignee_or_raise(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> User:
    """Return the user if they are a member of the project, else raise.

    Returns the User rather than just validating, so the caller can attach it
    to the task and read task.assignee without another query.
    """
    result = await db.execute(
        select(User)
        .join(ProjectMember, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id, User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise AssigneeNotMember(user_id)
    return user


async def _last_position(db: AsyncSession, project_id: int, status: TaskStatus) -> float | None:
    """The position of the bottom task in one column, or None if it is empty.

    Scoped to (project, status) because a task is ordered within its own
    column, not across the whole project.
    """
    return await db.scalar(
        select(Task.position)
        .where(Task.project_id == project_id, Task.status == status)
        .order_by(Task.position.desc())
        .limit(1)
    )


async def create_task(
    db: AsyncSession,
    *,
    project_id: int,
    title: str,
    created_by_id: int | None = None,
    description: str | None = None,
    status: TaskStatus = TaskStatus.TODO,
    priority: TaskPriority = TaskPriority.MEDIUM,
    due_date: date | None = None,
    assignee_id: int | None = None,
) -> Task:
    """Create a task at the bottom of its column.

    The position is computed here and never accepted from the caller, so two
    tasks cannot be given the same one.
    """
    assignee = None
    if assignee_id is not None:
        assignee = await _assignee_or_raise(db, project_id, assignee_id)

    task = Task(
        project_id=project_id,
        title=title,
        description=description,
        status=status,
        priority=priority,
        due_date=due_date,
        assignee_id=assignee_id,
        created_by_id=created_by_id,
        position=position_at_end(await _last_position(db, project_id, status)),
    )
    # Assigned as an object so task.assignee is usable straight away, rather
    # than tripping lazy="raise" on the way into the response.
    task.assignee = assignee

    db.add(task)
    await db.commit()
    return task


async def get_task(db: AsyncSession, project_id: int, task_id: int) -> Task | None:
    """One task, scoped to a project.

    project_id is part of the lookup, not a check afterwards. A task id from
    another project simply does not match, so it reads as missing rather than
    forbidden, and no id from elsewhere can be probed through this route.
    """
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.project_id == project_id, Task.id == task_id)
    )
    return result.scalar_one_or_none()


async def list_tasks(
    db: AsyncSession,
    project_id: int,
    *,
    status: TaskStatus | None = None,
    assignee_id: int | None = None,
) -> list[Task]:
    """Every task in a project, already in board order.

    Ordered by (status, position), which matches ix_tasks_board, so Postgres
    reads the index instead of sorting afterwards.
    """
    query = (
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.project_id == project_id)
        .order_by(Task.status, Task.position)
    )
    if status is not None:
        query = query.where(Task.status == status)
    if assignee_id is not None:
        query = query.where(Task.assignee_id == assignee_id)

    result = await db.execute(query)
    return list(result.scalars().all())


async def update_task(
    db: AsyncSession,
    task: Task,
    *,
    title: str | Unset = UNSET,
    description: str | None | Unset = UNSET,
    priority: TaskPriority | Unset = UNSET,
    due_date: date | None | Unset = UNSET,
    assignee_id: int | None | Unset = UNSET,
) -> Task:
    """Change only the fields that were passed.

    No status here. Moving between columns also needs a new position in the
    target column, which is move_task's job.
    """
    if not isinstance(title, Unset):
        task.title = title
    if not isinstance(description, Unset):
        task.description = description
    if not isinstance(priority, Unset):
        task.priority = priority
    if not isinstance(due_date, Unset):
        task.due_date = due_date

    if not isinstance(assignee_id, Unset):
        if assignee_id is None:
            task.assignee_id = None
            task.assignee = None
        else:
            assignee = await _assignee_or_raise(db, task.project_id, assignee_id)
            task.assignee_id = assignee_id
            task.assignee = assignee

    await db.commit()
    return task


async def delete_task(db: AsyncSession, task: Task) -> None:
    """Delete a task, and its comments with it through ON DELETE CASCADE."""
    await db.delete(task)
    await db.commit()


class InvalidAnchor(Exception):
    """The task to position against is not usable.

    It is in another project, in another column, or is the task being moved.
    Raised rather than ignored, because silently falling back to the bottom of
    the column would look like the drag simply did not work.
    """


async def _position_above(
    db: AsyncSession,
    project_id: int,
    status: TaskStatus,
    below: float,
    exclude_id: int,
) -> float | None:
    """The nearest position above `below`, ignoring the task being moved."""
    return await db.scalar(
        select(Task.position)
        .where(
            Task.project_id == project_id,
            Task.status == status,
            Task.position < below,
            Task.id != exclude_id,
        )
        .order_by(Task.position.desc())
        .limit(1)
    )


async def _position_below(
    db: AsyncSession,
    project_id: int,
    status: TaskStatus,
    above: float,
    exclude_id: int,
) -> float | None:
    """The nearest position below `above`, ignoring the task being moved."""
    return await db.scalar(
        select(Task.position)
        .where(
            Task.project_id == project_id,
            Task.status == status,
            Task.position > above,
            Task.id != exclude_id,
        )
        .order_by(Task.position)
        .limit(1)
    )


async def _rebalance_column(db: AsyncSession, project_id: int, status: TaskStatus) -> None:
    """Spread one column back out to 1000, 2000, 3000.

    The expensive path: every row in the column is rewritten. It runs only
    when needs_rebalance says the gap can no longer be split, which with a
    starting gap of 1000 takes about thirty moves into the same slot.

    flush rather than commit, so this and the move that triggered it land in
    one transaction.
    """
    result = await db.execute(
        select(Task)
        .where(Task.project_id == project_id, Task.status == status)
        .order_by(Task.position, Task.id)
    )
    tasks = list(result.scalars().all())

    for task, position in zip(tasks, rebalance(len(tasks))):
        task.position = position

    await db.flush()


async def move_task(
    db: AsyncSession,
    task: Task,
    *,
    status: TaskStatus | None = None,
    before_task_id: int | None = None,
    after_task_id: int | None = None,
) -> Task:
    """Move a task within its column or into another one.

    Placed relative to a neighbour, never by a number the caller invents:

        before_task_id  directly above that task
        after_task_id   directly below that task
        neither         the bottom of the column

    status None keeps the current column.
    """
    target_status = status if status is not None else task.status

    anchor_id = before_task_id if before_task_id is not None else after_task_id
    anchor = None
    if anchor_id is not None:
        if anchor_id == task.id:
            raise InvalidAnchor("cannot position a task against itself")
        anchor = await get_task(db, task.project_id, anchor_id)
        if anchor is None:
            raise InvalidAnchor(anchor_id)
        if anchor.status != target_status:
            # Otherwise the task would land next to something in a different
            # column, where its position means nothing.
            raise InvalidAnchor("anchor is in a different column")

    async def neighbours() -> tuple[float | None, float | None]:
        """The positions this task must land between, read fresh.

        Recomputed after a rebalance, because every position in the column
        changed.
        """
        if anchor is None:
            last = await _last_position_excluding(db, task.project_id, target_status, task.id)
            return last, None
        if before_task_id is not None:
            above = await _position_above(
                db, task.project_id, target_status, anchor.position, task.id
            )
            return above, anchor.position
        below = await _position_below(
            db, task.project_id, target_status, anchor.position, task.id
        )
        return anchor.position, below

    above, below = await neighbours()

    if needs_rebalance(above, below):
        await _rebalance_column(db, task.project_id, target_status)
        above, below = await neighbours()

    task.status = target_status
    task.position = position_between(above, below)
    await db.commit()
    return task


async def _last_position_excluding(
    db: AsyncSession,
    project_id: int,
    status: TaskStatus,
    exclude_id: int,
) -> float | None:
    """Bottom of a column, ignoring the task being moved.

    Without the exclusion, moving a task to the bottom of the column it is
    already at the bottom of would compute a midpoint with itself.
    """
    return await db.scalar(
        select(Task.position)
        .where(
            Task.project_id == project_id,
            Task.status == status,
            Task.id != exclude_id,
        )
        .order_by(Task.position.desc())
        .limit(1)
    )


# ---------------------------------------------------------------------------
# comments
# ---------------------------------------------------------------------------


async def create_comment(
    db: AsyncSession,
    *,
    task_id: int,
    author_id: int,
    body: str,
) -> Comment:
    author = await db.get(User, author_id)
    comment = Comment(task_id=task_id, author_id=author_id, author=author, body=body)
    db.add(comment)
    await db.commit()
    return comment


async def list_comments(db: AsyncSession, task_id: int) -> list[Comment]:
    """A task's comments, oldest first.

    Matches ix_comments_task, so the order comes from the index. selectinload
    fetches every author in one extra query rather than one per comment.
    """
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.author))
        .where(Comment.task_id == task_id)
        .order_by(Comment.created_at, Comment.id)
    )
    return list(result.scalars().all())


async def get_comment(db: AsyncSession, task_id: int, comment_id: int) -> Comment | None:
    """One comment, scoped to its task, so an id from another task is missing
    rather than forbidden."""
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.author))
        .where(Comment.task_id == task_id, Comment.id == comment_id)
    )
    return result.scalar_one_or_none()


async def update_comment(db: AsyncSession, comment: Comment, *, body: str) -> Comment:
    comment.body = body
    await db.commit()
    return comment


async def delete_comment(db: AsyncSession, comment: Comment) -> None:
    await db.delete(comment)
    await db.commit()
