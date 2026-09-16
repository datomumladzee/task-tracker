"""The projects service, called directly with no HTTP.

Possible only because the service takes plain arguments and knows nothing
about requests. Week 3's intake flow will call these the same way.
"""

import pytest
from sqlalchemy import func, select

from app.projects import service
from app.projects.models import Project, ProjectMember, ProjectRole
from app.tasks.models import Task
from app.users.schemas import UserCreate
from app.users.service import create_user


async def _user(db, email: str):
    return await create_user(
        db, UserCreate(email=email, password="hunter2!!", full_name=email.split("@")[0])
    )


# ---------------------------------------------------------------------------
# create and list
# ---------------------------------------------------------------------------


async def test_create_makes_the_creator_an_admin(db):
    owner = await _user(db, "owner@example.com")

    project = await service.create_project(db, user_id=owner.id, name="Auth")

    member = await service.get_membership(db, project.id, owner.id)
    assert member is not None
    assert member.role == ProjectRole.ADMIN
    assert project.created_by_id == owner.id


async def test_list_shows_only_projects_you_belong_to(db):
    alice = await _user(db, "alice@example.com")
    bob = await _user(db, "bob@example.com")

    await service.create_project(db, user_id=alice.id, name="Alice's")
    await service.create_project(db, user_id=bob.id, name="Bob's")

    names = [p.name for p, _ in await service.list_projects_for_user(db, alice.id)]
    assert names == ["Alice's"]


async def test_list_includes_the_callers_role(db):
    admin = await _user(db, "admin@example.com")
    viewer = await _user(db, "viewer@example.com")
    project = await service.create_project(db, user_id=admin.id, name="Shared")
    await service.add_member(
        db, project_id=project.id, email="viewer@example.com", role=ProjectRole.VIEWER
    )

    [(_, role)] = await service.list_projects_for_user(db, viewer.id)
    assert role == ProjectRole.VIEWER


# ---------------------------------------------------------------------------
# update
# ---------------------------------------------------------------------------


async def test_update_changes_only_what_was_passed(db):
    owner = await _user(db, "u@example.com")
    project = await service.create_project(
        db, user_id=owner.id, name="Old", description="keep me"
    )

    await service.update_project(db, project, name="New")

    assert project.name == "New"
    assert project.description == "keep me"


async def test_update_can_clear_the_description(db):
    """The reason UNSET exists. None here means clear it, not leave it."""
    owner = await _user(db, "u@example.com")
    project = await service.create_project(
        db, user_id=owner.id, name="P", description="remove me"
    )

    await service.update_project(db, project, description=None)

    assert project.description is None


# ---------------------------------------------------------------------------
# delete and cascade
# ---------------------------------------------------------------------------


async def test_delete_cascades_to_members_and_tasks(db):
    owner = await _user(db, "u@example.com")
    project = await service.create_project(db, user_id=owner.id, name="Doomed")
    db.add(Task(project_id=project.id, title="t", position=1.0))
    await db.commit()
    project_id = project.id

    await service.delete_project(db, project)

    members = await db.scalar(
        select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == project_id)
    )
    tasks = await db.scalar(
        select(func.count()).select_from(Task).where(Task.project_id == project_id)
    )
    assert members == 0
    assert tasks == 0


async def test_deleting_a_user_keeps_their_tasks(db):
    """SET NULL, not CASCADE. Work outlives the person who filed it."""
    owner = await _user(db, "owner@example.com")
    leaver = await _user(db, "leaver@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")
    task = Task(project_id=project.id, title="theirs", position=1.0, assignee_id=leaver.id)
    db.add(task)
    await db.commit()

    await db.delete(leaver)
    await db.commit()
    await db.refresh(task)

    assert task.assignee_id is None
    assert await db.get(Task, task.id) is not None


# ---------------------------------------------------------------------------
# members
# ---------------------------------------------------------------------------


async def test_add_member_by_email(db):
    owner = await _user(db, "owner@example.com")
    await _user(db, "new@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")

    member = await service.add_member(db, project_id=project.id, email="new@example.com")

    assert member.role == ProjectRole.STANDARD
    # Loaded by assignment, so reading it does not trip lazy="raise".
    assert member.user.email == "new@example.com"


async def test_add_member_twice_raises(db):
    owner = await _user(db, "owner@example.com")
    await _user(db, "dup@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")
    await service.add_member(db, project_id=project.id, email="dup@example.com")

    with pytest.raises(service.AlreadyMember):
        await service.add_member(db, project_id=project.id, email="dup@example.com")


async def test_add_unknown_email_raises(db):
    owner = await _user(db, "owner@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")

    with pytest.raises(service.UserNotFound):
        await service.add_member(db, project_id=project.id, email="ghost@example.com")


async def test_list_members_loads_each_user(db):
    """selectinload in action. Without it, member.user raises."""
    owner = await _user(db, "owner@example.com")
    await _user(db, "second@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")
    await service.add_member(db, project_id=project.id, email="second@example.com")
    db.expunge_all()  # forget what is cached, so the load must come from the query

    members = await service.list_members(db, project.id)

    assert [m.user.email for m in members] == ["owner@example.com", "second@example.com"]


async def test_reading_user_without_selectinload_fails_loudly(db):
    """What lazy="raise" buys. A forgotten selectinload names the relationship."""
    owner = await _user(db, "owner@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")
    db.expunge_all()

    member = (await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project.id)
    )).scalar_one()

    with pytest.raises(Exception, match="ProjectMember.user"):
        _ = member.user


# ---------------------------------------------------------------------------
# the last admin guard
# ---------------------------------------------------------------------------


async def test_cannot_demote_the_last_admin(db):
    owner = await _user(db, "owner@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")

    with pytest.raises(service.LastAdmin):
        await service.change_member_role(
            db, project_id=project.id, user_id=owner.id, role=ProjectRole.STANDARD
        )


async def test_cannot_remove_the_last_admin(db):
    owner = await _user(db, "owner@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")

    with pytest.raises(service.LastAdmin):
        await service.remove_member(db, project_id=project.id, user_id=owner.id)


async def test_can_demote_an_admin_when_another_exists(db):
    first = await _user(db, "first@example.com")
    second = await _user(db, "second@example.com")
    project = await service.create_project(db, user_id=first.id, name="P")
    await service.add_member(
        db, project_id=project.id, email="second@example.com", role=ProjectRole.ADMIN
    )

    member = await service.change_member_role(
        db, project_id=project.id, user_id=first.id, role=ProjectRole.STANDARD
    )

    assert member.role == ProjectRole.STANDARD
    assert member.user.email == "first@example.com"


async def test_changing_a_non_member_raises(db):
    owner = await _user(db, "owner@example.com")
    outsider = await _user(db, "outsider@example.com")
    project = await service.create_project(db, user_id=owner.id, name="P")

    with pytest.raises(service.NotMember):
        await service.change_member_role(
            db, project_id=project.id, user_id=outsider.id, role=ProjectRole.VIEWER
        )
