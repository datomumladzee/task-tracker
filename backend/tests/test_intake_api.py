"""The parse and confirm endpoints, with the model replaced by a fake.

Each test decides what the "model" returns, so these check our own handling:
what gets saved, what gets asked, who may confirm, and what happens when the
AI fails. No request reaches Google.
"""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.core import llm
from app.intake import parser
from app.intake.router import parse_limiter
from app.intake.models import IntakeDraft
from app.intake.schemas import TaskDraft


def _draft(**overrides) -> TaskDraft:
    fields = dict(
        title="Ship auth docs", description=None, due_date="2026-10-16",
        priority="high", status=None, project_ref="Mobile", assignee_ref="me",
    )
    fields.update(overrides)
    return TaskDraft.model_validate(fields)


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    """The limiter lives in the router module and outlives a single test, so
    every test starts with nobody having used any of their allowance."""
    parse_limiter.clear()
    yield
    parse_limiter.clear()


@pytest.fixture
def model(monkeypatch):
    """Whatever the test puts in model.next is what the AI "returns".
    Put an exception there instead to make the AI fail."""
    state = SimpleNamespace(next=_draft(), calls=[])

    async def fake_parse_task(text, *, today, project_names=None):
        state.calls.append({"text": text, "today": today, "project_names": project_names})
        if isinstance(state.next, Exception):
            raise state.next
        return state.next, llm.LLMResult(text="", input_tokens=1, output_tokens=1, latency_ms=1)

    monkeypatch.setattr(parser, "parse_task", fake_parse_task)
    return state


@pytest.fixture
async def team(client: AsyncClient, auth_headers):
    h, ids = {}, {}
    for who in ("me", "viewer", "outsider"):
        h[who] = await auth_headers(f"{who}@example.com")
        ids[who] = (await client.get("/users/me", headers=h[who])).json()["id"]

    projects = {}
    for name in ("Mobile", "Auth API", "Auth Docs"):
        projects[name] = (await client.post("/projects", json={"name": name}, headers=h["me"])).json()["id"]

    await client.post(
        f"/projects/{projects['Mobile']}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=h["me"],
    )
    return SimpleNamespace(h=h, ids=ids, projects=projects)


async def _parse(client, team, who="me", text="ship auth docs by friday, assign to me"):
    return await client.post("/intake/parse", json={"text": text}, headers=team.h[who])


async def _confirm(client, team, draft_id, who="me", **edits):
    return await client.post(f"/intake/drafts/{draft_id}/confirm", json=edits, headers=team.h[who])


# ---------------------------------------------------------------------------
# parse
# ---------------------------------------------------------------------------


async def test_parse_returns_a_ready_draft(client: AsyncClient, team, model):
    response = await _parse(client, team)

    assert response.status_code == 201
    body = response.json()
    assert body["ready"] is True
    assert body["project"] == {
        "outcome": "resolved", "ref": "Mobile", "id": team.projects["Mobile"],
        "candidates": [], "question": None,
    }
    assert body["assignee"]["id"] == team.ids["me"]
    assert body["text"] == "ship auth docs by friday, assign to me"


async def test_parse_sends_only_your_project_names(client: AsyncClient, team, model):
    await client.post("/projects", json={"name": "Not Mine"}, headers=team.h["outsider"])

    await _parse(client, team)

    assert sorted(model.calls[0]["project_names"]) == ["Auth API", "Auth Docs", "Mobile"]


async def test_parse_saves_the_original_sentence(client: AsyncClient, team, model, db):
    draft_id = (await _parse(client, team, text="  exactly what I typed  ")).json()["draft_id"]

    row = await db.get(IntakeDraft, draft_id)
    assert row.text == "exactly what I typed"
    assert row.confirmed_at is None


async def test_parse_with_an_ambiguous_project_asks(client: AsyncClient, team, model):
    model.next = _draft(project_ref="auth")

    body = (await _parse(client, team)).json()

    assert body["ready"] is False
    assert body["project"]["outcome"] == "ambiguous"
    assert body["project"]["question"] == "Which project did you mean: Auth API or Auth Docs?"
    assert body["assignee"]["outcome"] == "waiting"


async def test_parse_needs_login(client: AsyncClient, model):
    assert (await client.post("/intake/parse", json={"text": "x"})).status_code == 401


async def test_blank_text_is_rejected_before_the_model(client: AsyncClient, team, model):
    response = await _parse(client, team, text="   ")

    assert response.status_code == 422
    assert model.calls == []


@pytest.mark.parametrize(
    ("error", "status_code"),
    [
        (llm.LLMUnavailable("down"), 503),
        (llm.LLMBadOutput("wrong shape"), 503),
        (llm.LLMNotConfigured("no key"), 503),
        (llm.LLMRateLimited("slow down"), 429),
    ],
)
async def test_ai_failures_hand_the_sentence_back(client: AsyncClient, team, model, error, status_code):
    """Whatever breaks on Google's side, the user does not retype anything."""
    model.next = error

    response = await _parse(client, team, text="my carefully written task")

    assert response.status_code == status_code
    assert response.json()["detail"]["text"] == "my carefully written task"


async def test_rate_limit_says_when_to_retry(client: AsyncClient, team, model):
    model.next = llm.LLMRateLimited("slow down")

    response = await _parse(client, team)

    assert response.headers["retry-after"] == "30"


# ---------------------------------------------------------------------------
# confirm, the happy paths
# ---------------------------------------------------------------------------


async def test_confirm_creates_the_task(client: AsyncClient, team, model):
    draft_id = (await _parse(client, team)).json()["draft_id"]

    response = await _confirm(client, team, draft_id)

    assert response.status_code == 201
    task = response.json()
    assert task["project_id"] == team.projects["Mobile"]
    assert task["title"] == "Ship auth docs"
    assert task["due_date"] == "2026-10-16"
    assert task["priority"] == "high"
    assert task["status"] == "todo"
    assert task["assignee"]["id"] == team.ids["me"]
    assert task["created_by_id"] == team.ids["me"]


async def test_the_task_shows_up_like_any_other(client: AsyncClient, team, model):
    """Same create_task as the normal endpoint, so it is an ordinary task."""
    draft_id = (await _parse(client, team)).json()["draft_id"]
    await _confirm(client, team, draft_id)

    board = await client.get(f"/projects/{team.projects['Mobile']}/tasks", headers=team.h["me"])

    assert [t["title"] for t in board.json()] == ["Ship auth docs"]


async def test_answering_the_project_question(client: AsyncClient, team, model):
    model.next = _draft(project_ref="auth")
    draft_id = (await _parse(client, team)).json()["draft_id"]

    response = await _confirm(client, team, draft_id, project_id=team.projects["Auth Docs"])

    assert response.status_code == 201
    assert response.json()["project_id"] == team.projects["Auth Docs"]
    # "me" was waiting on the project, and is resolved against the one chosen.
    assert response.json()["assignee"]["id"] == team.ids["me"]


async def test_edits_win_over_the_draft(client: AsyncClient, team, model):
    model.next = _draft(description="from the model")
    draft_id = (await _parse(client, team)).json()["draft_id"]

    task = (await _confirm(
        client, team, draft_id,
        title="My better title", description=None, priority="low", assignee_id=None,
    )).json()

    assert task["title"] == "My better title"
    assert task["description"] is None
    assert task["priority"] == "low"
    assert task["assignee"] is None


async def test_missing_priority_falls_back_to_the_default(client: AsyncClient, team, model):
    model.next = _draft(priority=None)
    draft_id = (await _parse(client, team)).json()["draft_id"]

    assert (await _confirm(client, team, draft_id)).json()["priority"] == "medium"


# ---------------------------------------------------------------------------
# confirm, the refusals
# ---------------------------------------------------------------------------


async def test_an_open_question_must_be_answered(client: AsyncClient, team, model):
    model.next = _draft(project_ref="auth")
    draft_id = (await _parse(client, team)).json()["draft_id"]

    response = await _confirm(client, team, draft_id)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["field"] == "project"
    assert detail["message"] == "Choose a project before confirming"
    assert [c["label"] for c in detail["candidates"]] == ["Auth API", "Auth Docs"]


async def test_an_open_assignee_question_says_an_assignee(client: AsyncClient, team, model):
    model.next = _draft(project_ref="Mobile", assignee_ref="nobody by this name")
    draft_id = (await _parse(client, team)).json()["draft_id"]

    response = await _confirm(client, team, draft_id)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["field"] == "assignee"
    assert detail["message"] == "Choose an assignee before confirming"


async def test_confirming_twice_makes_one_task(client: AsyncClient, team, model):
    draft_id = (await _parse(client, team)).json()["draft_id"]

    first = await _confirm(client, team, draft_id)
    second = await _confirm(client, team, draft_id)

    assert first.status_code == 201
    assert second.status_code == 409
    board = await client.get(f"/projects/{team.projects['Mobile']}/tasks", headers=team.h["me"])
    assert len(board.json()) == 1


async def test_someone_elses_draft_is_404(client: AsyncClient, team, model):
    draft_id = (await _parse(client, team)).json()["draft_id"]

    assert (await _confirm(client, team, draft_id, who="outsider")).status_code == 404


async def test_an_expired_draft_is_gone(client: AsyncClient, team, model, db):
    draft_id = (await _parse(client, team)).json()["draft_id"]
    row = await db.get(IntakeDraft, draft_id)
    await db.execute(
        update(IntakeDraft).where(IntakeDraft.id == draft_id)
        .values(expires_at=row.created_at - timedelta(minutes=1))
    )
    await db.commit()

    assert (await _confirm(client, team, draft_id)).status_code == 410


async def test_a_viewer_cannot_create_tasks_through_the_ai(client: AsyncClient, team, model):
    """The resolver only checks membership, which a viewer has. Confirm must
    apply the same role rule as the normal task endpoint."""
    draft_id = (await _parse(client, team, who="viewer")).json()["draft_id"]

    assert (await _confirm(client, team, draft_id, who="viewer")).status_code == 403


async def test_a_project_you_are_not_in_is_404(client: AsyncClient, team, model):
    elsewhere = (await client.post("/projects", json={"name": "Theirs"}, headers=team.h["outsider"])).json()["id"]
    draft_id = (await _parse(client, team)).json()["draft_id"]

    assert (await _confirm(client, team, draft_id, project_id=elsewhere)).status_code == 404


async def test_assigning_an_outsider_by_id_is_refused(client: AsyncClient, team, model):
    draft_id = (await _parse(client, team)).json()["draft_id"]

    response = await _confirm(client, team, draft_id, assignee_id=team.ids["outsider"])

    assert response.status_code == 422


async def test_a_failed_confirm_can_be_retried(client: AsyncClient, team, model, db):
    """The confirmed mark and the task are saved together. A refusal leaves
    the draft untouched, so fixing the input and trying again works."""
    draft_id = (await _parse(client, team)).json()["draft_id"]
    await _confirm(client, team, draft_id, assignee_id=team.ids["outsider"])

    retry = await _confirm(client, team, draft_id)

    assert retry.status_code == 201


async def test_null_project_is_rejected_by_the_schema(client: AsyncClient, team, model):
    draft_id = (await _parse(client, team)).json()["draft_id"]

    assert (await _confirm(client, team, draft_id, project_id=None)).status_code == 422


async def test_expired_drafts_are_cleared_on_the_next_parse(client: AsyncClient, team, model, db):
    old_id = (await _parse(client, team)).json()["draft_id"]
    await db.execute(
        update(IntakeDraft).where(IntakeDraft.id == old_id)
        .values(expires_at=IntakeDraft.created_at - timedelta(minutes=1))
    )
    await db.commit()

    await _parse(client, team)

    remaining = (await db.execute(select(IntakeDraft.id))).scalars().all()
    assert old_id not in remaining


# ---------------------------------------------------------------------------
# timezones
# ---------------------------------------------------------------------------


@pytest.fixture
def late_monday_utc(monkeypatch):
    """21:56 UTC on Monday 12 October 2026: Tuesday in Tbilisi."""
    from datetime import datetime, timezone

    moment = datetime(2026, 10, 12, 21, 56, tzinfo=timezone.utc)
    monkeypatch.setattr(parser, "_utcnow", lambda: moment)


async def test_parse_uses_the_users_today(client: AsyncClient, team, model, late_monday_utc):
    from datetime import date

    await client.post(
        "/intake/parse",
        json={"text": "x tomorrow", "timezone": "Asia/Tbilisi"},
        headers=team.h["me"],
    )
    await client.post("/intake/parse", json={"text": "x tomorrow"}, headers=team.h["me"])

    assert model.calls[0]["today"] == date(2026, 10, 13)   # Tbilisi: Tuesday
    assert model.calls[1]["today"] == date(2026, 10, 12)   # no timezone: UTC Monday


@pytest.mark.parametrize("bad", ["Mars/Olympus", "asia/tbilisi", "../../etc/passwd", "+04:00", ""])
async def test_an_unknown_timezone_is_rejected_before_the_model(client: AsyncClient, team, model, bad):
    response = await client.post(
        "/intake/parse", json={"text": "x", "timezone": bad}, headers=team.h["me"]
    )

    assert response.status_code == 422
    assert model.calls == []


# ---------------------------------------------------------------------------
# the per-user limit
# ---------------------------------------------------------------------------


async def test_the_eleventh_parse_in_a_minute_is_refused(client: AsyncClient, team, model):
    for _ in range(10):
        assert (await _parse(client, team)).status_code == 201

    response = await _parse(client, team, text="one too many")

    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 1
    assert response.json()["detail"]["text"] == "one too many"
    # Refused before the model, so no quota was spent on it.
    assert len(model.calls) == 10


async def test_one_user_hitting_the_limit_does_not_block_another(client: AsyncClient, team, model):
    for _ in range(10):
        await _parse(client, team, who="me")

    assert (await _parse(client, team, who="me")).status_code == 429
    assert (await _parse(client, team, who="viewer")).status_code == 201


async def test_failed_ai_calls_still_count(client: AsyncClient, team, model):
    """They spent quota too."""
    model.next = llm.LLMUnavailable("down")
    for _ in range(10):
        await _parse(client, team)

    model.next = _draft()
    assert (await _parse(client, team)).status_code == 429

