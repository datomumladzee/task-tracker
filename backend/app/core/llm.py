"""The only file in the app that knows which AI provider is used.

Everything else calls complete() and catches the three errors defined here.
Nothing outside this file imports google.genai or catches Google's error
types, so swapping to a different provider later means rewriting this file
and nothing else.

Provider today: Google Gemini, free tier. Free-tier inputs may be used by
Google to improve its products, so only test data should ever pass through.
"""

import logging
import time
from dataclasses import dataclass

import httpx
from google import genai
from google.genai import errors, types

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# The three errors the rest of the app is allowed to know about
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


class LLMUnavailable(LLMError):
    """Timed out, network failed, or the provider returned an error.

    The caller should answer 503 and keep the user's text, so nothing they
    typed is lost.
    """


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


async def complete(prompt: str) -> LLMResult:
    """Send one prompt, get the reply and its measurements back.

    Uses models.generate_content rather than the newer interactions API shown
    in Google's quickstart. Both work, but interactions raises its errors from
    a private module, google.genai._gaos, which Google does not promise to keep
    stable. generate_content raises the public google.genai.errors.APIError.
    """
    client = _get_client()
    started = time.perf_counter()

    try:
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                # On by default in the SDK. It lets the model call Python
                # functions on its own, which we never want: the model only
                # proposes, our code decides what runs. Off also silences the
                # SDK's warning about using it here.
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
    except errors.APIError as e:
        # 429 is the free tier's per-minute or per-day cap.
        if e.code == 429:
            raise LLMRateLimited(str(e)) from e
        raise LLMUnavailable(f"provider returned {e.code}: {e}") from e
    except (httpx.TimeoutException, httpx.TransportError) as e:
        # A timeout or a dropped connection. The SDK does not wrap these.
        raise LLMUnavailable(f"network error: {type(e).__name__}") from e

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
        settings.gemini_model,
        input_tokens,
        output_tokens,
        latency_ms,
    )

    return LLMResult(
        text=response.text or "",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
    )
