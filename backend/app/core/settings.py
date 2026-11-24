from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: Literal["development", "test", "production"] = "development"
    allowed_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: SecretStr = SecretStr("")
    worker_token: SecretStr = SecretStr("")
    model_base_url: str = "http://127.0.0.1:8001/v1"
    model_runtime: Literal["openai", "unsloth"] = "openai"
    model_name: str = ""
    model_api_key: SecretStr = SecretStr("")
    model_timeout_seconds: float = Field(default=90, ge=1, le=300)
    executor_url: str = ""
    executor_token: SecretStr = SecretStr("")
    worker_poll_seconds: float = Field(default=2, ge=0.1, le=60)

    @model_validator(mode="after")
    def validate_origins(self) -> "Settings":
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path
                or "*" in origin
            ):
                raise ValueError("ALLOWED_ORIGINS must contain exact HTTP(S) origins")
        if self.app_env == "production":
            if (
                not self.supabase_url.startswith("https://")
                or not self.supabase_publishable_key
            ):
                raise ValueError("Production requires Supabase URL and publishable key")
            if any(
                not origin.startswith("https://") for origin in self.allowed_origins
            ):
                raise ValueError("Production frontend origins must use HTTPS")
            if self.model_name and urlsplit(self.model_base_url).hostname in {
                "localhost",
                "127.0.0.1",
                "::1",
            }:
                raise ValueError(
                    "A cloud API cannot reach a model on your computer through localhost"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
