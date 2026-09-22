"""The task service, called directly with no HTTP."""

import pytest
from sqlalchemy import func, select

from app.projects import service as projects
from app.projects.models import ProjectRole
from app.tasks import service
from app.tasks.models import Comment, TaskPriority, TaskStatus
from app.tasks.position import GAP
from app.users.schemas import UserCreate
from app.users.service import create_user


async def _user(db, email):
    return await create_user(
        db, UserCreate(email=email, password="hunter2!!", full_name=email.split("@")[0])
    )


@pytest.fixture
async def setup(db):
    owner = await _user(db, "owner@example.com")
    mate = await _user(db, "mate@example.com")
    outsider = await _user(db, "outsider@example.com")
    project = await projects.create_project(db, user_id=owner.id, name="P")
    await projects.add_member(
        db, project_id=project.id, email=mate.email, role=ProjectRole.STANDARD
    )
    return {"owner": owner, "mate": mate, "outsider": outsider, "project": project}


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------


async def test_new_tasks_stack_at_the_bottom(db, setup):
    pid = setup["project"].id

    positions = [
        (await service.create_task(db, project_id=pid, title=f"t{i}")).position
        for i in range(3)
    ]

    assert positions == [GAP, GAP * 2, GAP * 3]


async def test_each_column_is_ordered_separately(db, setup):
    """Position is scoped to (project, status), so a new task in an empty
    column starts at the beginning even if another column is full."""
    pid = setup["project"].id
    await service.create_task(db, project_id=pid, title="a")
    await service.create_task(db, project_id=pid, title="b")

    done = await service.create_task(db, project_id=pid, title="c", status=TaskStatus.DONE)

    assert done.position == GAP


async def test_defaults(db, setup):
    task = await service.create_task(
        db, project_id=setup["project"].id, title="t", created_by_id=setup["owner"].id
    )

    assert task.status == TaskStatus.TODO
    assert task.priority == TaskPriority.MEDIUM
    assert task.due_date is None
    assert task.assignee is None
    assert task.created_by_id == setup["owner"].id


async def test_assigning_a_member_works(db, setup):
    task = await service.create_task(
        db,
        project_id=setup["project"].id,
        title="t",
        assignee_id=setup["mate"].id,
    )

    # Loaded by assignment, so reading it does not trip lazy="raise".
    assert task.assignee.email == "mate@example.com"


async def test_assigning_an_outsider_is_refused(db, setup):
    """Otherwise a task could be assigned to someone who cannot open the
    project it lives in."""
    with pytest.raises(service.AssigneeNotMember):
        await service.create_task(
            db,
            project_id=setup["project"].id,
            title="t",
            assignee_id=setup["outsider"].id,
        )


# ---------------------------------------------------------------------------
# read
# ---------------------------------------------------------------------------


async def test_get_is_scoped_to_the_project(db, setup):
    """A task id from another project reads as missing, not forbidden."""
    other = await projects.create_project(db, user_id=setup["owner"].id, name="Other")
    task = await service.create_task(db, project_id=other.id, title="theirs")

    assert await service.get_task(db, other.id, task.id) is not None
    assert await service.get_task(db, setup["project"].id, task.id) is None


async def test_list_comes_back_in_board_order(db, setup):
    pid = setup["project"].id
    await service.create_task(db, project_id=pid, title="todo 1")
    await service.create_task(db, project_id=pid, title="done 1", status=TaskStatus.DONE)
    await service.create_task(db, project_id=pid, title="todo 2")

    titles = [t.title for t in await service.list_tasks(db, pid)]

    # TODO sorts before DONE, and within TODO by position.
    assert titles == ["todo 1", "todo 2", "done 1"]


async def test_list_filters(db, setup):
    pid = setup["project"].id
    await service.create_task(db, project_id=pid, title="mine", assignee_id=setup["mate"].id)
    await service.create_task(db, project_id=pid, title="unassigned")
    await service.create_task(db, project_id=pid, title="finished", status=TaskStatus.DONE)

    by_status = await service.list_tasks(db, pid, status=TaskStatus.DONE)
    by_assignee = await service.list_tasks(db, pid, assignee_id=setup["mate"].id)

    assert [t.title for t in by_status] == ["finished"]
    assert [t.title for t in by_assignee] == ["mine"]


# ---------------------------------------------------------------------------
# update
# ---------------------------------------------------------------------------


async def test_update_touches_only_what_was_passed(db, setup):
    task = await service.create_task(
        db, project_id=setup["project"].id, title="old", description="keep"
    )

    await service.update_task(db, task, title="new")

    assert task.title == "new"
    assert task.description == "keep"


async def test_update_can_clear_nullable_fields(db, setup):
    task = await service.create_task(
        db,
        project_id=setup["project"].id,
        title="t",
        description="remove me",
        assignee_id=setup["mate"].id,
    )

    await service.update_task(db, task, description=None, assignee_id=None)

    assert task.description is None
    assert task.assignee_id is None
    assert task.assignee is None


async def test_update_refuses_an_outsider_as_assignee(db, setup):
    task = await service.create_task(db, project_id=setup["project"].id, title="t")

    with pytest.raises(service.AssigneeNotMember):
        await service.update_task(db, task, assignee_id=setup["outsider"].id)


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


async def test_delete_takes_the_comments_with_it(db, setup):
    task = await service.create_task(db, project_id=setup["project"].id, title="t")
    db.add(Comment(task_id=task.id, author_id=setup["owner"].id, body="hi"))
    await db.commit()
    task_id = task.id

    await service.delete_task(db, task)

    left = await db.scalar(
        select(func.count()).select_from(Comment).where(Comment.task_id == task_id)
    )
    assert left == 0
    assert await service.get_task(db, setup["project"].id, task_id) is None
