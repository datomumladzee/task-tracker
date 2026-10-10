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
