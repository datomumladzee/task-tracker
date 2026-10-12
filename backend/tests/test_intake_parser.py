"""The parser and structured output, with the model replaced by a fake.

No test here calls Google. Real calls are slow, cost free-tier quota, and give
different answers each time, so they belong in the eval suite later. These
check our own code: the prompt we build, the schema we send, and what we do
with the reply.
"""

from datetime import date

import pytest
from pydantic import ValidationError

from app.core import llm
from app.core.config import settings
from app.intake import parser
from app.intake.schemas import TaskDraft
from app.tasks.models import TaskPriority

# A Friday, so "friday" handling is easy to reason about in these tests.
FRIDAY = date(2026, 10, 16)


def _draft_json(**overrides) -> str:
    fields = {
        "title": "Ship auth docs",
        "description": None,
        "due_date": "2026-10-16",
        "priority": "high",
        "status": None,
        "project_ref": "auth",
        "assignee_ref": "me",
    }
    fields.update(overrides)
    return TaskDraft.model_validate(fields).model_dump_json()


@pytest.fixture
def fake_generate(monkeypatch):
    """Replace the network call. Records what would have been sent, and
    returns whatever reply text the test chooses."""
    calls = []
    reply = {"text": _draft_json()}

    async def _fake(prompt, config):
        calls.append({"prompt": prompt, "config": config})
        return llm.LLMResult(text=reply["text"], input_tokens=100, output_tokens=40, latency_ms=5)

    monkeypatch.setattr(llm, "_generate", _fake)
    return {"calls": calls, "reply": reply}


# ---------------------------------------------------------------------------
# the prompt
# ---------------------------------------------------------------------------


def test_prompt_includes_today_with_its_weekday():
    """Without the weekday the model has to work out what day 2026-10-16 is,
    which is exactly the kind of arithmetic it gets wrong."""
    prompt = parser.build_prompt("ship docs by friday", today=FRIDAY)

    assert "2026-10-16" in prompt
    assert "Friday" in prompt


def test_message_is_fenced_and_comes_last():
    prompt = parser.build_prompt("  ship docs  ", today=FRIDAY)

    assert prompt.rstrip().endswith("<message>\nship docs\n</message>")
    # Fixed instructions first, so a cache could reuse them later.
    assert prompt.index("Rules:") < prompt.index("Today is")


def test_instructions_never_change_between_requests():
    """The part before today's date must be byte-identical every time."""
    a = parser.build_prompt("one", today=FRIDAY)
    b = parser.build_prompt("two", today=date(2027, 1, 1))

    assert a.split("Today is")[0] == b.split("Today is")[0]


# ---------------------------------------------------------------------------
# what gets sent
# ---------------------------------------------------------------------------


async def test_asks_for_json_matching_the_draft_schema(fake_generate):
    await parser.parse_task("ship docs", today=FRIDAY)

    [call] = fake_generate["calls"]
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_json_schema == TaskDraft.model_json_schema()


async def test_function_calling_stays_off_for_structured_calls(fake_generate):
    await parser.parse_task("ship docs", today=FRIDAY)

    [call] = fake_generate["calls"]
    assert call["config"].automatic_function_calling.disable is True


async def test_structured_calls_use_temperature_zero(fake_generate):
    await parser.parse_task("ship docs", today=FRIDAY)

    [call] = fake_generate["calls"]
    assert call["config"].temperature == 0


# ---------------------------------------------------------------------------
# what comes back
# ---------------------------------------------------------------------------


async def test_a_good_reply_becomes_a_validated_draft(fake_generate):
    draft, result = await parser.parse_task("ship auth docs by friday", today=FRIDAY)

    assert isinstance(draft, TaskDraft)
    assert draft.due_date == FRIDAY
    assert draft.priority == TaskPriority.HIGH
    assert draft.assignee_ref == "me"
    assert result.input_tokens == 100


async def test_not_json_at_all_is_bad_output(fake_generate):
    fake_generate["reply"]["text"] = "Sure! Here is your task: ship docs"

    with pytest.raises(llm.LLMBadOutput):
        await parser.parse_task("ship docs", today=FRIDAY)


async def test_a_value_outside_the_enum_is_bad_output(fake_generate):
    """The model was told the allowed priorities and returned another one.
    Validation, not hope, is what stops it reaching the database."""
    fake_generate["reply"]["text"] = _draft_json().replace('"high"', '"critical"')

    with pytest.raises(llm.LLMBadOutput):
        await parser.parse_task("ship docs", today=FRIDAY)


async def test_a_missing_field_is_bad_output(fake_generate):
    fake_generate["reply"]["text"] = '{"title": "ship docs"}'

    with pytest.raises(llm.LLMBadOutput):
        await parser.parse_task("ship docs", today=FRIDAY)


async def test_bad_output_does_not_leak_the_reply(fake_generate):
    """The reply may echo what the user typed, so it stays out of the error."""
    fake_generate["reply"]["text"] = '{"title": "secret project codename"}'

    with pytest.raises(llm.LLMBadOutput) as exc:
        await parser.parse_task("ship docs", today=FRIDAY)

    assert "codename" not in str(exc.value)


async def test_no_key_means_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", None)
    monkeypatch.setattr(llm, "_client", None)

    with pytest.raises(llm.LLMNotConfigured):
        await parser.parse_task("ship docs", today=FRIDAY)


# ---------------------------------------------------------------------------
# the schema itself
# ---------------------------------------------------------------------------


def test_every_field_is_required_even_when_nullable():
    """So the model has to decide on each field rather than skip it."""
    schema = TaskDraft.model_json_schema()

    assert set(schema["required"]) == set(TaskDraft.model_fields)


def test_nulls_are_allowed_for_everything_but_title():
    draft = TaskDraft(
        title="x", description=None, due_date=None, priority=None,
        status=None, project_ref=None, assignee_ref=None,
    )
    assert draft.project_ref is None

    with pytest.raises(ValidationError):
        TaskDraft(
            title="", description=None, due_date=None, priority=None,
            status=None, project_ref=None, assignee_ref=None,
        )


# ---------------------------------------------------------------------------
# grounding in the user's projects
# ---------------------------------------------------------------------------


def test_project_names_are_listed_in_their_own_block():
    prompt = parser.build_prompt("x", today=FRIDAY, project_names=["Auth API", "Mobile"])

    assert "<projects>\n- Auth API\n- Mobile\n</projects>" in prompt
    # Before today and the message, so it sits in the more stable part.
    assert prompt.index("<projects>") < prompt.index("Today is") < prompt.index("<message>")


def test_no_projects_means_no_block():
    assert "<projects>" not in parser.build_prompt("x", today=FRIDAY)


async def test_parse_task_passes_project_names_through(fake_generate):
    await parser.parse_task("x", today=FRIDAY, project_names=["Billing"])

    [call] = fake_generate["calls"]
    assert "- Billing" in call["prompt"]


# ---------------------------------------------------------------------------
# the user's today, not the server's
# ---------------------------------------------------------------------------

from datetime import datetime, timezone  # noqa: E402


@pytest.fixture
def frozen(monkeypatch):
    """Freeze the clock at 21:56 UTC on Monday 12 October 2026, the moment
    the bug was found: already Tuesday in Tbilisi."""
    moment = datetime(2026, 10, 12, 21, 56, tzinfo=timezone.utc)
    monkeypatch.setattr(parser, "_utcnow", lambda: moment)
    return moment


@pytest.mark.parametrize(
    ("tz", "expected"),
    [
        (None, date(2026, 10, 12)),                     # no timezone: UTC
        ("UTC", date(2026, 10, 12)),
        ("Asia/Tbilisi", date(2026, 10, 13)),           # +4, already Tuesday
        ("Europe/Berlin", date(2026, 10, 12)),          # +2, still Monday
        ("America/Los_Angeles", date(2026, 10, 12)),    # -7
        ("Asia/Tokyo", date(2026, 10, 13)),             # +9
        ("Pacific/Kiritimati", date(2026, 10, 13)),     # +14, first to the next day
        ("Pacific/Pago_Pago", date(2026, 10, 12)),      # -11, last
        ("Asia/Kolkata", date(2026, 10, 13)),           # +5:30, a half-hour offset
        ("Asia/Kathmandu", date(2026, 10, 13)),         # +5:45, a quarter-hour offset
    ],
)
def test_today_follows_the_users_timezone(frozen, tz, expected):
    assert parser.today_in(tz) == expected


def test_one_moment_can_be_two_different_days(frozen):
    """The whole bug in one line."""
    assert parser.today_in("Pacific/Kiritimati") != parser.today_in("Pacific/Pago_Pago")


def test_daylight_saving_is_handled(monkeypatch):
    """Berlin is +1 in winter and +2 in summer. 22:30 UTC is past midnight in
    summer and not yet in winter, so a fixed offset would get one of them wrong."""
    monkeypatch.setattr(parser, "_utcnow", lambda: datetime(2026, 7, 1, 22, 30, tzinfo=timezone.utc))
    assert parser.today_in("Europe/Berlin") == date(2026, 7, 2)

    monkeypatch.setattr(parser, "_utcnow", lambda: datetime(2026, 1, 1, 22, 30, tzinfo=timezone.utc))
    assert parser.today_in("Europe/Berlin") == date(2026, 1, 1)


def test_every_known_timezone_works(frozen):
    """All of them, not a sample."""
    import zoneinfo

    zones = zoneinfo.available_timezones()
    assert len(zones) > 400
    for name in zones:
        parser.today_in(name)
