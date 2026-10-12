"""Finding projects and people by name, the database side of the resolver."""

import pytest

from app.projects import service
from app.projects.models import ProjectRole
from app.users.models import User
from app.users.schemas import UserCreate
from app.users.service import create_user


async def _user(db, email, full_name):
    return await create_user(
        db, UserCreate(email=email, password="hunter2!!", full_name=full_name)
    )


@pytest.fixture
async def world(db):
    me = await _user(db, "dato@example.com", "Dato Mumladze")
    anna = await _user(db, "anna@example.com", "Anna Smith")
    annabel = await _user(db, "annabel@example.com", "Annabel Jones")
    stranger = await _user(db, "stranger@example.com", "Some Stranger")

    projects = {}
    for name in ("Auth", "Auth API", "Mobile App", "Billing"):
        projects[name] = await service.create_project(db, user_id=me.id, name=name)
    # A project Dato is not in, with a name that would match.
    projects["Secret Auth"] = await service.create_project(db, user_id=stranger.id, name="Secret Auth")

    for person in (anna, annabel):
        await service.add_member(
            db, project_id=projects["Mobile App"].id, email=person.email, role=ProjectRole.STANDARD
        )
    return {"me": me, "anna": anna, "annabel": annabel, "projects": projects}


async def _names(db, user_id, ref):
    return [p.name for p in await service.find_projects_by_name(db, user_id, ref)]


# ---------------------------------------------------------------------------
# projects
# ---------------------------------------------------------------------------


async def test_exact_match_ignores_case(db, world):
    assert await _names(db, world["me"].id, "billing") == ["Billing"]


async def test_exact_match_wins_over_partial(db, world):
    """"auth" names a project exactly, so "Auth API" is not offered as well."""
    assert await _names(db, world["me"].id, "AUTH") == ["Auth"]


async def test_partial_match_when_nothing_is_exact(db, world):
    assert await _names(db, world["me"].id, "mobile") == ["Mobile App"]


async def test_several_partial_matches_are_all_returned(db, world):
    # "Billing" has no "a", so it is correctly left out.
    assert await _names(db, world["me"].id, "a") == ["Auth", "Auth API", "Mobile App"]


async def test_never_finds_a_project_you_are_not_in(db, world):
    """Secret Auth matches "secret" perfectly, and belongs to someone else."""
    assert await _names(db, world["me"].id, "secret") == []


async def test_like_wildcards_are_escaped(db, world):
    """Without autoescape, "%" would match every project and "_" any letter."""
    assert await _names(db, world["me"].id, "%") == []
    assert await _names(db, world["me"].id, "Aut_") == []


async def test_extra_spaces_do_not_matter(db, world):
    assert await _names(db, world["me"].id, "  mobile    app ") == ["Mobile App"]


async def test_blank_finds_nothing(db, world):
    assert await _names(db, world["me"].id, "   ") == []


# ---------------------------------------------------------------------------
# people
# ---------------------------------------------------------------------------


async def _people(db, world, ref):
    pid = world["projects"]["Mobile App"].id
    return [u.full_name for u in await service.find_members_by_reference(db, pid, ref)]


async def test_by_email(db, world):
    assert await _people(db, world, "ANNA@example.com") == ["Anna Smith"]


async def test_by_full_name(db, world):
    assert await _people(db, world, "anna smith") == ["Anna Smith"]


async def test_first_name_does_not_match_a_longer_name(db, world):
    """"Anna" means Anna Smith, not Annabel."""
    assert await _people(db, world, "anna") == ["Anna Smith"]


async def test_only_members_of_that_project(db, world):
    """Anna is not in Billing, so she cannot be found there."""
    pid = world["projects"]["Billing"].id
    assert await service.find_members_by_reference(db, pid, "anna") == []


async def test_inactive_accounts_are_left_out(db, world):
    world["anna"].is_active = False
    await db.commit()

    assert await _people(db, world, "anna smith") == []


async def test_two_people_with_the_same_first_name(db, world):
    other = await _user(db, "anna2@example.com", "Anna Brown")
    await service.add_member(
        db, project_id=world["projects"]["Mobile App"].id, email=other.email
    )

    assert await _people(db, world, "anna") == ["Anna Brown", "Anna Smith"]
