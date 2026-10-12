"""The resolver: a TaskDraft's words in, ids or questions out."""

import pytest

from app.intake.resolver import Outcome, resolve_draft
from app.intake.schemas import TaskDraft
from app.projects import service
from app.users.schemas import UserCreate
from app.users.service import create_user


def _draft(project_ref=None, assignee_ref=None) -> TaskDraft:
    return TaskDraft(
        title="Do the thing",
        description=None,
        due_date=None,
        priority=None,
        status=None,
        project_ref=project_ref,
        assignee_ref=assignee_ref,
    )


async def _user(db, email, full_name):
    return await create_user(
        db, UserCreate(email=email, password="hunter2!!", full_name=full_name)
    )


@pytest.fixture
async def world(db):
    me = await _user(db, "dato@example.com", "Dato Mumladze")
    anna = await _user(db, "anna@example.com", "Anna Smith")
    projects = {
        name: await service.create_project(db, user_id=me.id, name=name)
        for name in ("Auth API", "Auth Docs", "Mobile")
    }
    await service.add_member(db, project_id=projects["Mobile"].id, email=anna.email)
    return {"me": me, "anna": anna, "projects": projects}


async def _resolve(db, world, **refs):
    return await resolve_draft(db, _draft(**refs), user_id=world["me"].id)


# ---------------------------------------------------------------------------
# the happy path
# ---------------------------------------------------------------------------


async def test_project_and_me_both_resolve(db, world):
    r = await _resolve(db, world, project_ref="mobile", assignee_ref="me")

    assert r.project.outcome == Outcome.RESOLVED
    assert r.project.id == world["projects"]["Mobile"].id
    assert r.assignee.outcome == Outcome.RESOLVED
    assert r.assignee.id == world["me"].id
    assert r.ready


async def test_a_named_teammate_resolves(db, world):
    r = await _resolve(db, world, project_ref="mobile", assignee_ref="Anna")

    assert r.assignee.id == world["anna"].id
    assert r.ready


async def test_no_assignee_is_fine(db, world):
    r = await _resolve(db, world, project_ref="mobile")

    assert r.assignee.outcome == Outcome.NOT_GIVEN
    assert r.ready


# ---------------------------------------------------------------------------
# projects that need a question
# ---------------------------------------------------------------------------


async def test_two_matching_projects_is_ambiguous(db, world):
    r = await _resolve(db, world, project_ref="auth")

    assert r.project.outcome == Outcome.AMBIGUOUS
    assert [c.label for c in r.project.candidates] == ["Auth API", "Auth Docs"]
    assert r.project.question == "Which project did you mean: Auth API or Auth Docs?"
    assert not r.ready


async def test_no_matching_project_is_a_question_not_an_error(db, world):
    r = await _resolve(db, world, project_ref="billing")

    assert r.project.outcome == Outcome.UNKNOWN
    assert '"billing"' in r.project.question
    assert not r.ready


async def test_no_project_mentioned_and_several_exist(db, world):
    r = await _resolve(db, world)

    assert r.project.outcome == Outcome.UNKNOWN
    assert len(r.project.candidates) == 3
    assert r.project.question == "Which project should this go in?"


async def test_no_project_mentioned_and_only_one_exists(db):
    solo = await _user(db, "solo@example.com", "Solo Person")
    only = await service.create_project(db, user_id=solo.id, name="Only")

    r = await resolve_draft(db, _draft(), user_id=solo.id)

    assert r.project.outcome == Outcome.RESOLVED
    assert r.project.id == only.id


async def test_no_projects_at_all(db):
    new = await _user(db, "new@example.com", "New Person")

    r = await resolve_draft(db, _draft(), user_id=new.id)

    assert r.project.outcome == Outcome.UNKNOWN
    assert "not in any project" in r.project.question


# ---------------------------------------------------------------------------
# assignees that need a question
# ---------------------------------------------------------------------------


async def test_assignee_waits_until_the_project_is_known(db, world):
    """Anna can only be checked against a project's members."""
    r = await _resolve(db, world, project_ref="auth", assignee_ref="Anna")

    assert r.project.outcome == Outcome.AMBIGUOUS
    assert r.assignee.outcome == Outcome.WAITING
    assert r.assignee.id is None


async def test_a_name_not_in_the_project(db, world):
    r = await _resolve(db, world, project_ref="mobile", assignee_ref="Giorgi")

    assert r.assignee.outcome == Outcome.UNKNOWN
    assert '"Giorgi"' in r.assignee.question
    assert not r.ready


async def test_two_people_called_anna(db, world):
    other = await _user(db, "anna2@example.com", "Anna Brown")
    await service.add_member(db, project_id=world["projects"]["Mobile"].id, email=other.email)

    r = await _resolve(db, world, project_ref="mobile", assignee_ref="anna")

    assert r.assignee.outcome == Outcome.AMBIGUOUS
    assert [c.label for c in r.assignee.candidates] == [
        "Anna Brown <anna2@example.com>",
        "Anna Smith <anna@example.com>",
    ]


async def test_every_self_word_means_the_caller(db, world):
    for word in ("me", "Me", "myself", "I"):
        r = await _resolve(db, world, project_ref="mobile", assignee_ref=word)
        assert r.assignee.id == world["me"].id, word


async def test_the_original_words_are_kept(db, world):
    """So the frontend can show what the model heard next to the question."""
    r = await _resolve(db, world, project_ref="billing", assignee_ref="Giorgi")

    assert r.project.ref == "billing"
    assert r.assignee.ref == "Giorgi"
