"""Logika modul capture.

Yang disimpan hanya screenshot (PNG) dan metadata terstruktur.
Tidak ada HTML/JavaScript aplikasi sumber yang disimpan atau dieksekusi.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.db.session import now_utc
from app.models.capture import CaptureSession, Interaction, Screen, ScreenElement
from app.models.registry import Application, Project
from app.models.user import User


def allowed_hosts_for(application: Application) -> list[str]:
    """Host yang boleh dibuka worker: hanya aplikasi yang sudah diotorisasi."""
    hosts: list[str] = []
    for url in (application.source_url, application.login_url):
        if not url:
            continue
        host = (urlparse(url).hostname or "").lower()
        if host and host not in hosts:
            hosts.append(host)
    return hosts


def create_session(
    db: Session,
    project: Project,
    operator: User,
    *,
    notes: str | None = None,
    viewport_width: int | None = None,
    viewport_height: int | None = None,
) -> CaptureSession:
    application = db.get(Application, project.application_id)
    if application is None:
        raise NotFoundError("Aplikasi tidak ditemukan")
    if not application.is_authorized:
        raise ConflictError(
            "Aplikasi belum memiliki otorisasi capture (status harus approved)."
        )

    session = CaptureSession(
        project_id=project.id,
        operator_id=operator.id,
        status="active",
        viewport_width=viewport_width or settings.capture_default_viewport_width,
        viewport_height=viewport_height or settings.capture_default_viewport_height,
        browser_mode="headed",
        started_at=now_utc(),
        notes=notes,
    )
    db.add(session)
    db.flush()
    return session


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9-_]+", "-", value.strip().lower()).strip("-")
    return slug[:60] or "screen"


def _relative_path(absolute: str) -> str:
    """Simpan path RELATIF terhadap storage root (aman, portabel)."""
    root = settings.storage_path
    try:
        return str(Path(absolute).resolve().relative_to(root)).replace("\\", "/")
    except ValueError:
        # Di luar storage root: simpan basename saja, file tidak akan terbaca.
        return Path(absolute).name


def absolute_path(relative: str) -> Path:
    root = settings.storage_path
    candidate = (root / relative).resolve()
    if not str(candidate).startswith(str(root)):
        raise NotFoundError("File tidak ditemukan")
    return candidate


def record_capture(
    db: Session,
    session: CaptureSession,
    project: Project,
    meta: dict[str, Any],
    *,
    title: str | None = None,
) -> Screen:
    """Simpan hasil capture: screen + elemen + interaksi.

    Kalau halaman yang sama dicapture ulang, hasilnya menjadi **versi baru**
    (capture_version naik) dengan screen_key yang sama — bukan screen terpisah.
    Kalau judulnya sama tapi URL-nya berbeda, itu layar berbeda → key diberi akhiran.
    """
    relative = _relative_path(str(meta.get("file_path", "")))
    source_url = meta.get("url")
    page_title = title or str(meta.get("title") or "Layar tanpa judul")[:200]

    base_key = slugify(page_title)
    key = base_key
    version = 1

    existing = db.scalars(
        select(Screen).where(Screen.project_id == project.id, Screen.screen_key == base_key)
    ).all()
    same_url = [s for s in existing if (s.source_url or "") == (source_url or "")]

    if same_url:
        # Halaman sama -> versi baru
        version = max(s.capture_version for s in same_url) + 1
    elif existing:
        # Judul sama tapi URL berbeda -> layar berbeda
        counter = 2
        while db.scalar(
            select(Screen).where(
                Screen.project_id == project.id,
                Screen.screen_key == f"{base_key}-{counter}",
                Screen.capture_version == 1,
            )
        ):
            counter += 1
        key = f"{base_key}-{counter}"

    screen = Screen(
        project_id=project.id,
        capture_session_id=session.id,
        screen_key=key,
        title=page_title,
        route_label=urlparse(source_url).path if source_url else None,
        source_url=source_url,
        screenshot_path=relative,
        full_page=bool(meta.get("full_page")),
        capture_version=version,
        category=None,
        # Struktur semantik (tabel, heading, form, card) untuk mesin rekonstruksi.
        structure=meta.get("structure"),
        tags=[],
        review_status="pending",
        captured_at=now_utc(),
    )
    db.add(screen)
    db.flush()

    # Elemen interaktif yang terdeteksi (label + tipe saja, tanpa HTML).
    for raw in meta.get("elements", []) or []:
        db.add(
            ScreenElement(
                screen_id=screen.id,
                element_type=str(raw.get("type") or "unknown")[:40],
                label=(str(raw["label"])[:200] if raw.get("label") else None),
                selector_or_hint=(str(raw["hint"])[:500] if raw.get("hint") else None),
                bounding_box=raw.get("box"),
                mask=False,
            )
        )

    # Interaksi yang direkam worker.
    for index, raw in enumerate(meta.get("interactions", []) or [], start=1):
        db.add(
            Interaction(
                screen_id=screen.id,
                sequence_no=index,
                action=str(raw.get("action") or "unknown")[:40],
                expected_result=None,
                notes=raw.get("label"),
            )
        )

    db.flush()
    return screen


def unique_screen_key(db: Session, project_id: int, desired: str) -> str:
    key = slugify(desired)
    counter = 1
    while db.scalar(select(Screen).where(Screen.project_id == project_id, Screen.screen_key == key)):
        counter += 1
        key = f"{slugify(desired)}-{counter}"
    return key
