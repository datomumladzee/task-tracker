"""The RBAC dependency, called directly.

FastAPI would supply project_id, user and db. Passing them by hand tests the
exact same code without needing any endpoints to exist yet.
"""

import pytest
from fastapi import HTTPException

from app.projects import service
from app.projects.deps import ROLE_RANK, require_project_role
from app.projects.models import ProjectRole
from app.users.models import UserRole
from app.users.schemas import UserCreate
from app.users.service import create_user


async def _user(db, email: str):
    return await create_user(
        db, UserCreate(email=email, password="hunter2!!", full_name=email.split("@")[0])
    )


@pytest.fixture
async def project_with_roles(db):
    """One project with one member at each role, plus an outsider."""
    admin = await _user(db, "admin@example.com")
    standard = await _user(db, "standard@example.com")
    viewer = await _user(db, "viewer@example.com")
    outsider = await _user(db, "outsider@example.com")

    project = await service.create_project(db, user_id=admin.id, name="P")
    await service.add_member(
        db, project_id=project.id, email=standard.email, role=ProjectRole.STANDARD
    )
    await service.add_member(
        db, project_id=project.id, email=viewer.email, role=ProjectRole.VIEWER
    )

    return {
        "project": project,
        "admin": admin,
        "standard": standard,
        "viewer": viewer,
        "outsider": outsider,
    }


async def _check(db, minimum, project_id, user):
    return await require_project_role(minimum)(project_id=project_id, user=user, db=db)


def test_every_role_has_a_rank():
    """A role added to the enum and forgotten here would crash every check."""
    assert set(ROLE_RANK) == set(ProjectRole)


async def test_non_member_gets_404(db, project_with_roles):
    p = project_with_roles

    with pytest.raises(HTTPException) as exc:
        await _check(db, ProjectRole.VIEWER, p["project"].id, p["outsider"])

    assert exc.value.status_code == 404


async def test_missing_project_gets_the_same_404(db, project_with_roles):
    """Indistinguishable from not being a member, so ids cannot be probed."""
    p = project_with_roles

    with pytest.raises(HTTPException) as missing:
        await _check(db, ProjectRole.VIEWER, 999_999, p["admin"])
    with pytest.raises(HTTPException) as not_member:
        await _check(db, ProjectRole.VIEWER, p["project"].id, p["outsider"])

    assert missing.value.status_code == not_member.value.status_code == 404
    assert missing.value.detail == not_member.value.detail


@pytest.mark.parametrize(
    ("who", "minimum", "allowed"),
    [
        ("viewer", ProjectRole.VIEWER, True),
        ("viewer", ProjectRole.STANDARD, False),
        ("viewer", ProjectRole.ADMIN, False),
        ("standard", ProjectRole.VIEWER, True),
        ("standard", ProjectRole.STANDARD, True),
        ("standard", ProjectRole.ADMIN, False),
        ("admin", ProjectRole.VIEWER, True),
        ("admin", ProjectRole.STANDARD, True),
        ("admin", ProjectRole.ADMIN, True),
    ],
)
async def test_role_matrix(db, project_with_roles, who, minimum, allowed):
    """Every role against every requirement. Too low is 403, never 404."""
    p = project_with_roles

    if allowed:
        member = await _check(db, minimum, p["project"].id, p[who])
        assert member.user_id == p[who].id
    else:
        with pytest.raises(HTTPException) as exc:
            await _check(db, minimum, p["project"].id, p[who])
        assert exc.value.status_code == 403


async def test_returns_the_project_already_loaded(db, project_with_roles):
    """The endpoint reads member.project without another query, and without
    tripping lazy="raise"."""
    p = project_with_roles

    member = await _check(db, ProjectRole.VIEWER, p["project"].id, p["viewer"])

    assert member.project.name == "P"


async def test_system_admin_gets_no_project_access(db, project_with_roles):
    """User.role and ProjectRole are separate. Being ADMIN of the whole app
    does not make you a member of anyone's project."""
    p = project_with_roles
    p["outsider"].role = UserRole.ADMIN
    await db.commit()

    with pytest.raises(HTTPException) as exc:
        await _check(db, ProjectRole.VIEWER, p["project"].id, p["outsider"])

    assert exc.value.status_code == 404
