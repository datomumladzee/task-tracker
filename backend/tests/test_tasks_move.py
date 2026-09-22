"""Moving and reordering tasks, where position.py meets the database."""

import pytest
from sqlalchemy import select

from app.projects import service as projects
from app.tasks import service
from app.tasks.models import Task, TaskStatus
from app.tasks.position import GAP, MIN_GAP
from app.users.schemas import UserCreate
from app.users.service import create_user


@pytest.fixture
async def board(db):
    """A project with three TODO tasks: a, b, c."""
    owner = await create_user(
        db, UserCreate(email="owner@example.com", password="hunter2!!", full_name="Owner")
    )
    project = await projects.create_project(db, user_id=owner.id, name="P")
    tasks = {
        name: await service.create_task(db, project_id=project.id, title=name)
        for name in ("a", "b", "c")
    }
    return {"project": project, "tasks": tasks}


async def _order(db, project_id, status=TaskStatus.TODO):
    result = await db.execute(
        select(Task.title)
        .where(Task.project_id == project_id, Task.status == status)
        .order_by(Task.position)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# reordering inside one column
# ---------------------------------------------------------------------------


async def test_move_before_the_first_task(db, board):
    pid = board["project"].id

    await service.move_task(db, board["tasks"]["c"], before_task_id=board["tasks"]["a"].id)

    assert await _order(db, pid) == ["c", "a", "b"]


async def test_move_between_two_tasks(db, board):
    pid = board["project"].id

    moved = await service.move_task(
        db, board["tasks"]["c"], after_task_id=board["tasks"]["a"].id
    )

    assert await _order(db, pid) == ["a", "c", "b"]
    # Exactly the midpoint of 1000 and 2000.
    assert moved.position == GAP * 1.5


async def test_move_to_the_bottom_with_no_anchor(db, board):
    pid = board["project"].id

    await service.move_task(db, board["tasks"]["a"])

    assert await _order(db, pid) == ["b", "c", "a"]


async def test_moving_the_bottom_task_to_the_bottom_is_a_no_op(db, board):
    """Without excluding the task itself, this would compute a midpoint
    against its own position."""
    pid = board["project"].id

    await service.move_task(db, board["tasks"]["c"])

    assert await _order(db, pid) == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# moving between columns
# ---------------------------------------------------------------------------


async def test_move_to_another_column_lands_at_the_bottom(db, board):
    pid = board["project"].id

    moved = await service.move_task(db, board["tasks"]["b"], status=TaskStatus.DONE)

    assert moved.status == TaskStatus.DONE
    assert moved.position == GAP
    assert await _order(db, pid) == ["a", "c"]
    assert await _order(db, pid, TaskStatus.DONE) == ["b"]


async def test_status_is_kept_when_not_given(db, board):
    moved = await service.move_task(
        db, board["tasks"]["a"], after_task_id=board["tasks"]["b"].id
    )

    assert moved.status == TaskStatus.TODO


# ---------------------------------------------------------------------------
# bad anchors
# ---------------------------------------------------------------------------


async def test_anchor_in_another_column_is_refused(db, board):
    await service.move_task(db, board["tasks"]["c"], status=TaskStatus.DONE)

    with pytest.raises(service.InvalidAnchor):
        await service.move_task(db, board["tasks"]["a"], after_task_id=board["tasks"]["c"].id)


async def test_anchor_from_another_project_is_refused(db, board):
    owner = await create_user(
        db, UserCreate(email="other@example.com", password="hunter2!!", full_name="O")
    )
    other = await projects.create_project(db, user_id=owner.id, name="Other")
    elsewhere = await service.create_task(db, project_id=other.id, title="theirs")

    with pytest.raises(service.InvalidAnchor):
        await service.move_task(db, board["tasks"]["a"], after_task_id=elsewhere.id)


async def test_anchoring_a_task_to_itself_is_refused(db, board):
    with pytest.raises(service.InvalidAnchor):
        await service.move_task(db, board["tasks"]["a"], after_task_id=board["tasks"]["a"].id)


# ---------------------------------------------------------------------------
# the rebalance
# ---------------------------------------------------------------------------


async def test_a_squeezed_gap_triggers_a_rebalance(db, board):
    """Force a and b almost on top of each other, then drop c between them.

    The move must notice the gap cannot be split, spread the column out, and
    still place c in the middle.
    """
    board["tasks"]["a"].position = 1000.0
    board["tasks"]["b"].position = 1000.0 + MIN_GAP / 4
    await db.commit()
    pid = board["project"].id

    await service.move_task(db, board["tasks"]["c"], before_task_id=board["tasks"]["b"].id)

    assert await _order(db, pid) == ["a", "c", "b"]
    positions = await db.scalars(
        select(Task.position).where(Task.project_id == pid).order_by(Task.position)
    )
    positions = list(positions)
    # Spread out again, so the next insert has room.
    assert min(b - a for a, b in zip(positions, positions[1:])) > MIN_GAP


async def test_many_moves_into_the_same_slot_never_collide(db, board):
    """Forty drops into one gap. Without the rebalance the positions would
    converge until two tasks matched and the order became arbitrary."""
    pid = board["project"].id
    a, b = board["tasks"]["a"], board["tasks"]["b"]

    for _ in range(40):
        await service.move_task(db, board["tasks"]["c"], after_task_id=a.id)
        await db.refresh(a)
        await db.refresh(b)

    assert await _order(db, pid) == ["a", "c", "b"]
    positions = list(
        await db.scalars(select(Task.position).where(Task.project_id == pid))
    )
    assert len(set(positions)) == 3
