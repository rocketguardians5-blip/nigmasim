"""Konfigurasi aplikasi NigmaSim.

Nilai dibaca dari environment / file .env. Jangan pernah menaruh secret
di source code.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---------- Aplikasi ----------
    app_name: str = "NigmaSim"
    app_env: str = "development"
    app_debug: bool = True
    app_base_url: str = "http://localhost:8000"
    api_prefix: str = "/api/v1"

    # ---------- Keamanan ----------
    secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cors_origins: list[str] = ["http://localhost:5173"]

    # ---------- Bootstrap admin ----------
    admin_email: str = "admin@nigmasim.com"
    admin_name: str = "Super Administrator"
    admin_initial_password: str = "Admin#12345"

    # ---------- Database ----------
    database_url: str = "sqlite:///./nigmasim.db"

    # ---------- Storage ----------
    storage_root: str = "./storage"
    max_screenshot_mb: int = 25

    # ---------- Capture worker ----------
    capture_worker_url: str = "http://127.0.0.1:8010"
    capture_worker_token: str = "dev-only-worker-token"
    capture_headless: bool = False
    capture_default_viewport_width: int = 1440
    capture_default_viewport_height: int = 900
    capture_allowed_hosts: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            raw = v.strip()
            if raw.startswith("["):
                import json

                return json.loads(raw)
            return [item.strip() for item in raw.split(",") if item.strip()]
        return v

    @property
    def is_development(self) -> bool:
        return self.app_env.lower() in {"dev", "development", "local"}

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_root).resolve()

    @property
    def allowed_capture_hosts(self) -> list[str]:
        return [h.strip().lower() for h in self.capture_allowed_hosts.split(",") if h.strip()]

    @property
    def is_secret_configured(self) -> bool:
        return len(self.secret_key) >= 32 and "change" not in self.secret_key.lower()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
