"""Model fallback in core/llm.py, with every model replaced by a script.

Each test decides how each model behaves, then checks which ones were asked
and what came out. No request reaches Google.
"""

import pytest
from pydantic import BaseModel

from app.core import llm
from app.core.config import settings


@pytest.fixture
def models(monkeypatch):
    """Three models: main, then two fallbacks. script[name] says how each one
    behaves: an LLMResult text to return, or an exception to raise."""
    monkeypatch.setattr(settings, "gemini_model", "main")
    monkeypatch.setattr(settings, "gemini_fallback_models", "backup-1, backup-2")

    state = {"script": {}, "asked": []}

    async def fake_call_once(model, prompt, config):
        state["asked"].append(model)
        outcome = state["script"].get(model, "ok")
        if isinstance(outcome, Exception):
            raise outcome
        return llm.LLMResult(text=outcome, input_tokens=1, output_tokens=1, latency_ms=1, model=model)

    monkeypatch.setattr(llm, "_call_once", fake_call_once)
    return state


def busy():
    return llm.LLMUnavailable("503", retryable=True)


def limited():
    return llm.LLMRateLimited("429")


# ---------------------------------------------------------------------------
# the order
# ---------------------------------------------------------------------------


def test_models_are_main_then_fallbacks_without_repeats(monkeypatch):
    monkeypatch.setattr(settings, "gemini_model", "a")
    monkeypatch.setattr(settings, "gemini_fallback_models", " b, a ,, c ")

    assert settings.llm_models == ["a", "b", "c"]


def test_an_empty_fallback_list_means_only_the_main_model(monkeypatch):
    monkeypatch.setattr(settings, "gemini_model", "a")
    monkeypatch.setattr(settings, "gemini_fallback_models", "")

    assert settings.llm_models == ["a"]


async def test_main_model_answers_and_nothing_else_is_asked(models):
    result = await llm.complete("hi")

    assert models["asked"] == ["main"]
    assert result.model == "main"


# ---------------------------------------------------------------------------
# when to move on
# ---------------------------------------------------------------------------


async def test_busy_moves_to_the_next_model(models):
    models["script"]["main"] = busy()

    result = await llm.complete("hi")

    assert models["asked"] == ["main", "backup-1"]
    assert result.model == "backup-1"


async def test_rate_limited_moves_to_the_next_model(models):
    """Free-tier limits are counted per model, so another one may have room."""
    models["script"]["main"] = limited()

    assert (await llm.complete("hi")).model == "backup-1"


async def test_keeps_going_down_the_list(models):
    models["script"]["main"] = busy()
    models["script"]["backup-1"] = limited()

    result = await llm.complete("hi")

    assert models["asked"] == ["main", "backup-1", "backup-2"]
    assert result.model == "backup-2"


# ---------------------------------------------------------------------------
# when not to
# ---------------------------------------------------------------------------


async def test_a_rejected_request_is_not_retried(models):
    """A 400 or 403 is our request or our key. Every model would refuse it,
    so asking them all only makes the user wait."""
    models["script"]["main"] = llm.LLMUnavailable("400", retryable=False)

    with pytest.raises(llm.LLMUnavailable):
        await llm.complete("hi")

    assert models["asked"] == ["main"]


async def test_bad_output_is_not_retried_on_another_model(models):
    """A wrong shape is a prompt problem, which the eval suite is for."""

    class Shape(BaseModel):
        value: int

    models["script"]["main"] = "not json"

    with pytest.raises(llm.LLMBadOutput):
        await llm.complete_structured("hi", Shape)

    assert models["asked"] == ["main"]


async def test_missing_key_is_not_retried(models, monkeypatch):
    models["script"]["main"] = llm.LLMNotConfigured("no key")

    with pytest.raises(llm.LLMNotConfigured):
        await llm.complete("hi")

    assert models["asked"] == ["main"]


# ---------------------------------------------------------------------------
# when everything fails
# ---------------------------------------------------------------------------


async def test_all_busy_is_unavailable(models):
    for name in ("main", "backup-1", "backup-2"):
        models["script"][name] = busy()

    with pytest.raises(llm.LLMUnavailable):
        await llm.complete("hi")

    assert models["asked"] == ["main", "backup-1", "backup-2"]


async def test_all_rate_limited_says_rate_limited(models):
    """Only then is "try again in 30 seconds" the honest answer."""
    for name in ("main", "backup-1", "backup-2"):
        models["script"][name] = limited()

    with pytest.raises(llm.LLMRateLimited):
        await llm.complete("hi")


async def test_a_mix_of_failures_says_unavailable(models):
    models["script"]["main"] = limited()
    models["script"]["backup-1"] = busy()
    models["script"]["backup-2"] = limited()

    with pytest.raises(llm.LLMUnavailable):
        await llm.complete("hi")


# ---------------------------------------------------------------------------
# which provider errors are worth another model
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("code", "retryable"),
    [
        (401, False),   # bad key: every model refuses it
        (403, False),   # forbidden key: same
        (404, True),    # this model retired or not on this key
        (400, True),    # this model may reject a setting another accepts
        (500, True),
        (503, True),    # busy
        (504, True),    # timed out on Google's side
        (None, True),
    ],
)
def test_only_auth_failures_stop_the_fallback(code, retryable):
    assert llm._is_retryable(code) is retryable

