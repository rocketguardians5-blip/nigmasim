"""Konfigurasi aplikasi NigmaSim.

Nilai dibaca dari environment / file .env. Jangan pernah menaruh secret
di source code.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Hanya dua model Gemini yang diizinkan. Semua validasi (startup + runtime) menolak model lain.
ALLOWED_GEMINI_MODELS: tuple[str, ...] = ("gemini-3.8-flash", "gemini-3.6-flash")


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
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "*"]

    # ---------- Bootstrap admin ----------
    admin_email: str = "admin@nigmasim.com"
    admin_name: str = "Super Administrator"
    admin_initial_password: str = "Admin#12345"

    # ---------- Database ----------
    database_url: str = "sqlite:///./nigmasim.db"

    # Hanya untuk development: izinkan mendaftarkan aplikasi pada host internal
    # (127.0.0.1/lokal) supaya alur capture bisa diuji tanpa aplikasi produksi.
    # WAJIB false di production.
    allow_private_hosts_in_registry: bool = False

    # ---------- Storage ----------
    storage_root: str = "./storage"
    max_screenshot_mb: int = 25

    # ---------- Simulation runtime (Stage 2) ----------
    # Folder workspace runtime React. Generator menulis apps/<slug>/ dan
    # registry.json di sini. Backend TIDAK menjalankan npm build.
    simulation_runtime_root: str = "../simulation-runtime"

    # ---------- Capture worker ----------
    capture_worker_url: str = "http://127.0.0.1:8010"
    capture_worker_token: str = "dev-only-worker-token"
    capture_headless: bool = False
    capture_default_viewport_width: int = 1440
    capture_default_viewport_height: int = 900
    capture_allowed_hosts: str = ""

    # ---------- Google Gemini (AI Vision) ----------
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    gemini_fallback_models: str = ""
    gemini_allow_fallback: bool = False
    gemini_max_retries: int = 3
    gemini_retry_base_delay: float = 5.0
    gemini_retry_max_delay: float = 60.0
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"

    @field_validator("gemini_model")
    @classmethod
    def _validate_gemini_model(cls, v: str) -> str:
        model = v.strip()
        if model not in ALLOWED_GEMINI_MODELS:
            allowed = ", ".join(ALLOWED_GEMINI_MODELS)
            raise ValueError(f"Model tidak diizinkan: {model}. Pilihan: {allowed}.")
        return model

    @field_validator("gemini_fallback_models", mode="before")
    @classmethod
    def _validate_gemini_fallback_models(cls, v: str, info) -> str:
        raw = v.strip()
        if not raw:
            return ""
        # Validasi terhadap daftar izin
        # info.data berisi field yang sudah divalidasi (gemini_model didefinisikan duluan)
        primary = ""
        if hasattr(info, "data") and info.data and isinstance(info.data, dict):
            primary = info.data.get("gemini_model", "").strip()
        for item in raw.split(","):
            name = item.strip()
            if not name:
                continue
            if name not in ALLOWED_GEMINI_MODELS:
                allowed = ", ".join(ALLOWED_GEMINI_MODELS)
                raise ValueError(f"Model cadangan tidak diizinkan: {name}. Pilihan: {allowed}.")
            if primary and name == primary:
                raise ValueError(f"Model cadangan ({name}) tidak boleh sama dengan model utama ({primary}).")
        return raw

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
    def gemini_model_chain(self) -> list[str]:
        """Model utama + cadangan (hanya jika fallback diaktifkan).
        Validasi kedua: hanya model dari ALLOWED_GEMINI_MODELS yang masuk rantai.
        """
        allowed = set(ALLOWED_GEMINI_MODELS)
        chain: list[str] = []
        primary = self.gemini_model.strip()
        if primary and primary in allowed:
            chain.append(primary)
        if self.gemini_allow_fallback and self.gemini_fallback_models.strip():
            for item in self.gemini_fallback_models.split(","):
                name = item.strip()
                if name and name in allowed and name not in chain:
                    chain.append(name)
        return chain

    @property
    def gemini_primary_model(self) -> str:
        """Model utama yang seharusnya dipakai (tanpa fallback)."""
        return self.gemini_model.strip()

    @property
    def is_secret_configured(self) -> bool:
        return len(self.secret_key) >= 32 and "change" not in self.secret_key.lower()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
