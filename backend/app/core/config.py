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
    gemini_model: str = "gemini-3.8-flash"
    # Seconds. A request slower than this is abandoned rather than holding a
    # server worker, and the caller is told the AI is unavailable.
    llm_timeout_seconds: float = 20.0

    # env_file is only used outside Docker. Compose injects real env vars,
    # which take priority. extra="ignore" skips unrelated ones.

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


# Singleton: Python caches modules, so every import gets this same object.

settings = Settings()
