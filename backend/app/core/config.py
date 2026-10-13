from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All config that differs between laptop and production.

    Typed, so a missing value stops the app at startup.
    """

    # Lowercase fields match uppercase env vars because pydantic-settings is
    # case-insensitive by default. case_sensitive=True would break this.

    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 30

    # Optional on purpose, unlike the three above. Without a key the app still
    # starts and every other endpoint works; only the AI features refuse, with
    # a 503. Someone who clones the repo can run it before getting a key.
    gemini_api_key: str | None = None
    # flash-lite rather than the newest flash: on the free tier it was the only
    # one that answered every time in testing, and it spends no tokens on
    # thinking, so the daily limit lasts longer. Override with GEMINI_MODEL.
    gemini_model: str = "gemini-3.5-flash-lite"
    # Tried in order when the main model is busy, times out, or hits its rate
    # limit. Comma-separated, empty for no fallback.
    #
    # Chosen by probing three calls each on 2026-10-14. 3.1-flash-lite answered
    # every time but ten times slower, around 6 s, so it is the safety net
    # rather than the default. 3.7-flash is smarter but was busy on every try;
    # it stays last in case it frees up. Availability on the free tier shifts,
    # so re-probe if fallbacks start failing.
    gemini_fallback_models: str = "gemini-3.1-flash-lite,gemini-3.7-flash"
    # Seconds. A request slower than this is abandoned rather than holding a
    # server worker, and the caller is told the AI is unavailable.
    llm_timeout_seconds: float = 20.0

    # Parses per user per minute. On the free tier the daily quota is shared by
    # everyone on this server, so one person cannot be allowed to spend it all.
    intake_parse_limit_per_minute: int = 10

    # env_file is only used outside Docker. Compose injects real env vars,
    # which take priority. extra="ignore" skips unrelated ones.

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def llm_models(self) -> list[str]:
        """The main model, then each fallback, without repeats."""
        models = [self.gemini_model]
        for name in self.gemini_fallback_models.split(","):
            name = name.strip()
            if name and name not in models:
                models.append(name)
        return models


# Singleton: Python caches modules, so every import gets this same object.

settings = Settings()
