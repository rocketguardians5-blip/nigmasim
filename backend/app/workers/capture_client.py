"""Jembatan backend ke Capture Worker.

Backend TIDAK pernah menyentuh browser. Semua perintah browser dikirim ke
worker terpisah melalui HTTP lokal dengan token internal.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class WorkerUnavailableError(RuntimeError):
    """Worker tidak aktif atau tidak bisa dihubungi."""


class WorkerError(RuntimeError):
    """Worker menolak perintah."""


def _client(timeout: float = 60.0) -> httpx.Client:
    return httpx.Client(
        base_url=settings.capture_worker_url,
        headers={"X-Worker-Token": settings.capture_worker_token},
        timeout=timeout,
    )


def _call(
    method: str, path: str, payload: dict[str, Any] | None = None, timeout: float = 60.0
) -> dict[str, Any]:
    try:
        with _client(timeout) as client:
            response = client.request(method, path, json=payload)
    except httpx.HTTPError as exc:
        raise WorkerUnavailableError(
            "Capture Worker tidak dapat dihubungi. Pastikan worker berjalan "
            f"di {settings.capture_worker_url}."
        ) from exc

    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("detail", detail)
        except Exception:  # noqa: BLE001
            pass
        raise WorkerError(str(detail))

    try:
        return response.json()
    except Exception as exc:  # noqa: BLE001
        raise WorkerError("Respons worker tidak valid") from exc


def worker_health() -> dict[str, Any]:
    return _call("GET", "/health")


def start_session(
    url: str,
    viewport_width: int | None,
    viewport_height: int | None,
    allowed_hosts: list[str],
    device: str = "desktop",
) -> dict[str, Any]:
    return _call(
        "POST",
        "/session/start",
        {
            "url": url,
            "viewport_width": viewport_width,
            "viewport_height": viewport_height,
            "allowed_hosts": allowed_hosts,
            "device": device,
        },
    )


def pause_session() -> dict[str, Any]:
    return _call("POST", "/session/pause")


def resume_session() -> dict[str, Any]:
    return _call("POST", "/session/resume")


def stop_session() -> dict[str, Any]:
    return _call("POST", "/session/stop")


def session_state() -> dict[str, Any]:
    return _call("GET", "/session/state")


def focus_browser() -> dict[str, Any]:
    """Angkat jendela browser ke depan (kalau tersembunyi di belakang)."""
    return _call("POST", "/session/focus")


def take_capture(label: str, full_page: bool, relative_dir: str) -> dict[str, Any]:
    return _call(
        "POST",
        "/session/capture",
        {"label": label, "full_page": full_page, "relative_dir": relative_dir},
    )


def render_pdf(html: str, filename: str) -> str:
    """Render HTML menjadi PDF memakai Chromium yang sudah terpasang.

    Dipakai untuk ekspor dokumen SOP (Fase 6).
    """
    result = _call(
        "POST",
        "/document/pdf",
        {"html": html, "filename": filename},
        timeout=120.0,
    )
    return str(result.get("pdf_base64", ""))
