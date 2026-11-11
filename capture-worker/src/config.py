"""Konfigurasi Capture Worker.

Worker adalah proses TERPISAH dari backend API. Ia hanya listen di loopback
dan hanya diakses memakai token internal.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Dicoba berurutan. Worker bisa dijalankan dari folder capture-worker/
        # maupun capture-worker/src/, jadi beberapa lokasi diperiksa.
        env_file=("../.env", "../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Token internal. Wajib diisi, tidak boleh default.
    # Nama env disamakan dengan backend: CAPTURE_WORKER_TOKEN
    capture_worker_token: str = "dev-only-worker-token"

    # Selalu 127.0.0.1 - worker tidak boleh terekspos ke jaringan.
    host: str = "127.0.0.1"
    port: int = 8010

    headless: bool = False
    default_viewport_width: int = 1440
    default_viewport_height: int = 900

    # Akar penyimpanan screenshot yang boleh ditulis worker.
    storage_root: str = "./storage"

    # Batas jumlah elemen DOM yang dicatat per halaman (bukan HTML mentah).
    max_elements_per_page: int = 80

    # Host yang boleh dibuka. Kosong = operator harus mengisinya per sesi.
    allowed_hosts: str = ""

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_root).resolve()

    @property
    def allowed_host_list(self) -> list[str]:
        return [h.strip().lower() for h in self.allowed_hosts.split(",") if h.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
