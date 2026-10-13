"""The only file in the app that knows which AI provider is used.

Everything else calls complete() or complete_structured() and catches the
errors defined here.
Nothing outside this file imports google.genai or catches Google's error
types, so swapping to a different provider later means rewriting this file
and nothing else.

Provider today: Google Gemini, free tier. Free-tier inputs may be used by
Google to improve its products, so only test data should ever pass through.
"""

import logging
import time
from dataclasses import dataclass
from typing import TypeVar

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.core.config import settings

logger = logging.getLogger(__name__)

SchemaT = TypeVar("SchemaT", bound=BaseModel)


# ---------------------------------------------------------------------------
# The errors the rest of the app is allowed to know about
# ---------------------------------------------------------------------------


class LLMError(Exception):
    """Base for everything below, so a caller can catch one class."""


class LLMNotConfigured(LLMError):
    """No API key is set. The app runs fine; only AI features refuse."""


class LLMRateLimited(LLMError):
    """The provider said slow down (HTTP 429).

    Separate from LLMUnavailable because the right reaction differs: wait and
    retry, rather than tell the user the feature is down.
    """


class LLMBadOutput(LLMError):
    """The model answered, but not in the shape that was asked for.

    Even with a schema the model can return JSON that fails validation, a
    missing field or a value outside an enum. Kept separate from unavailable:
    the service is up, its answer was unusable.
    """


class LLMUnavailable(LLMError):
    """Timed out, network failed, or the provider returned an error.

    The caller should answer 503 and keep the user's text, so nothing they
    typed is lost.

    retryable says whether another model could plausibly succeed. A 503 or a
    timeout might be this model alone. A 400 or 403 is our request or our key,
    and every model would refuse it the same way.
    """

    def __init__(self, message: str, *, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


# ---------------------------------------------------------------------------
# What a call returns
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LLMResult:
    """The reply plus what it cost, measured rather than guessed.

    Free tier means no bill, but token counts and latency still matter: they
    are what the README reports, and what rate limits are measured in.
    """

    text: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    # Which model actually answered. With fallbacks this is not always the
    # one configured first, and an answer is only explainable if you know.
    model: str = ""


# ---------------------------------------------------------------------------
# The client
# ---------------------------------------------------------------------------

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Build the client once, on first use.

    Lazy rather than at import time, so the app starts without a key and the
    error only appears when someone actually uses an AI feature.
    """
    global _client

    if not settings.gemini_api_key:
        raise LLMNotConfigured("GEMINI_API_KEY is not set")

    if _client is None:
        _client = genai.Client(
            api_key=settings.gemini_api_key,
            # The SDK takes this timeout in milliseconds, unlike our setting.
            http_options=types.HttpOptions(
                timeout=int(settings.llm_timeout_seconds * 1000),
            ),
        )
    return _client


def _is_retryable(code: int | None) -> bool:
    """Whether a different model might succeed where this one failed.

    Only an authentication failure is the same for every model: a missing,
    wrong or forbidden key. Everything else can be specific to one model. A
    404 means that model was retired or never offered on this key, a 400 can
    mean one model rejects a setting another accepts, and a 5xx is that model
    being busy. Found by probing: two models on the fallback list returned 404,
    which an "any 4xx is our fault" rule would have treated as fatal.
    """
    return code not in (401, 403)


async def _call_once(model: str, prompt: str, config: types.GenerateContentConfig) -> LLMResult:
    """One request to one model: sent, timed, measured, logged.

    Uses models.generate_content rather than the newer interactions API shown
    in Google's quickstart. Both work, but interactions raises its errors from
    a private module, google.genai._gaos, which Google does not promise to keep
    stable. generate_content raises the public google.genai.errors.APIError.
    """
    client = _get_client()
    started = time.perf_counter()

    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )
    except errors.APIError as e:
        # 429 is the free tier's per-minute or per-day cap.
        if e.code == 429:
            raise LLMRateLimited(f"{model}: {e}") from e
        raise LLMUnavailable(f"{model} returned {e.code}", retryable=_is_retryable(e.code)) from e
    except (httpx.TimeoutException, httpx.TransportError) as e:
        # A timeout or a dropped connection. The SDK does not wrap these.
        raise LLMUnavailable(f"{model}: network error {type(e).__name__}") from e

    latency_ms = int((time.perf_counter() - started) * 1000)

    usage = response.usage_metadata
    input_tokens = (usage.prompt_token_count or 0) if usage else 0
    # Thinking tokens are counted separately by Gemini, but they are output
    # the model generated, so they count toward the total here.
    output_tokens = (
        (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)
        if usage
        else 0
    )

    # Never log the prompt or the reply. Only the measurements.
    logger.info(
        "llm call model=%s input_tokens=%d output_tokens=%d latency_ms=%d",
        model,
        input_tokens,
        output_tokens,
        latency_ms,
    )

    return LLMResult(
        text=response.text or "",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        model=model,
    )


async def _generate(prompt: str, config: types.GenerateContentConfig) -> LLMResult:
    """Try the main model, then each fallback, until one answers.

    Moves on for anything another model might not share: busy, timed out,
    retired, or rate limited, since free-tier limits are counted per model. An
    authentication failure stops at once, because every model would refuse the
    same key and trying them all only makes the user wait.

    If every model fails, the error raised says rate limited only when all of
    them were, so the caller's "try again in 30 seconds" is honest.
    """
    models = settings.llm_models
    rate_limited = 0
    last_error: LLMError | None = None

    for i, model in enumerate(models):
        try:
            return await _call_once(model, prompt, config)
        except LLMRateLimited as e:
            rate_limited += 1
            last_error = e
        except LLMUnavailable as e:
            if not e.retryable:
                raise
            last_error = e

        if i + 1 < len(models):
            logger.warning(
                "llm fallback from=%s to=%s reason=%s",
                model,
                models[i + 1],
                type(last_error).__name__,
            )

    if rate_limited == len(models):
        raise LLMRateLimited(f"all {len(models)} models rate limited") from last_error
    raise LLMUnavailable(f"all {len(models)} models failed") from last_error


def _base_config(**extra) -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        # On by default in the SDK. It lets the model call Python functions on
        # its own, which we never want: the model only proposes, our code
        # decides what runs. Off also silences the SDK's warning about it.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        **extra,
    )


async def complete(prompt: str) -> LLMResult:
    """Send one prompt, get plain text and its measurements back."""
    return await _generate(prompt, _base_config())


async def complete_structured(
    prompt: str,
    schema: type[SchemaT],
) -> tuple[SchemaT, LLMResult]:
    """Send one prompt and get back an instance of `schema`, validated.

    The provider is asked to reply in JSON matching the schema, but that is a
    request, not a guarantee. The reply is validated with Pydantic here, so
    nothing that fails the schema ever leaves this function.
    """
    result = await _generate(
        prompt,
        _base_config(
            response_mime_type="application/json",
            response_json_schema=schema.model_json_schema(),
            # Extraction has one right answer, so no creativity wanted. 0 makes
            # replies as repeatable as the model allows, which is also what
            # makes eval scores comparable from one run to the next.
            temperature=0,
        ),
    )

    try:
        parsed = schema.model_validate_json(result.text)
    except ValidationError as e:
        # The reply text is not logged or included, in case it echoes the
        # user's input. Only how many fields failed.
        raise LLMBadOutput(
            f"reply did not match {schema.__name__} ({e.error_count()} errors)"
        ) from e

    return parsed, result
