"""Layanan demo publik dan skenario demo (Phase 7).

Fungsi:
- Manajemen DemoLink (link publik untuk share layar tanpa login)
- Manajemen DemoScenario (alur demo terpandu)
- Akses publik ke demo (verifikasi password, ambil data layar)
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.capture import Screen
from app.models.demo import DemoLink, DemoScenario
from app.schemas.demo import (
    DemoLinkCreate,
    DemoLinkOut,
    DemoLinkPublic,
    DemoLinkUpdate,
    DemoScenarioCreate,
    DemoScenarioOut,
    DemoScenarioUpdate,
)


def _generate_token() -> str:
    return secrets.token_urlsafe(24)


# ---------------------------------------------------------------- Demo Link


def create_demo_link(db: Session, *, payload: DemoLinkCreate, user_id: int | None) -> DemoLink:
    token = _generate_token()
    # Pastikan token unik.
    while db.scalar(select(DemoLink).where(DemoLink.token == token)):
        token = _generate_token()

    password_hash = hash_password(payload.password) if payload.password else None

    link = DemoLink(
        token=token,
        name=payload.name,
        description=payload.description,
        project_id=payload.project_id,
        screen_ids=list(payload.screen_ids),
        password_hash=password_hash,
        is_active=payload.is_active,
        expires_at=payload.expires_at,
        created_by=user_id,
    )
    db.add(link)
    db.flush()
    return link


def get_demo_link(db: Session, link_id: int) -> DemoLink | None:
    return db.get(DemoLink, link_id)


def get_demo_link_by_token(db: Session, token: str) -> DemoLink | None:
    return db.scalar(select(DemoLink).where(DemoLink.token == token))


def list_demo_links(db: Session, *, project_id: int | None = None) -> list[DemoLink]:
    stmt = select(DemoLink).order_by(DemoLink.created_at.desc())
    if project_id is not None:
        stmt = stmt.where(DemoLink.project_id == project_id)
    return list(db.scalars(stmt).all())


def update_demo_link(
    db: Session, link: DemoLink, payload: DemoLinkUpdate
) -> DemoLink:
    data = payload.model_dump(exclude_unset=True)
    if "password" in data and data["password"] is not None:
        link.password_hash = hash_password(data.pop("password"))
    for key, value in data.items():
        setattr(link, key, value)
    db.add(link)
    db.flush()
    return link


def delete_demo_link(db: Session, link: DemoLink) -> None:
    db.delete(link)
    db.flush()


def increment_view_count(db: Session, link: DemoLink) -> None:
    link.view_count = (link.view_count or 0) + 1
    db.add(link)
    db.flush()


# ---------------------------------------------------------------- Public access


def get_public_demo_info(db: Session, token: str) -> DemoLinkPublic | None:
    """Info publik untuk link demo. Tidak membutuhkan autentikasi."""
    link = get_demo_link_by_token(db, token)
    if link is None:
        return None
    if not link.is_active:
        return None
    if link.expires_at is not None:
        exp = link.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return None
    return DemoLinkPublic(
        token=link.token,
        name=link.name,
        description=link.description,
        screen_ids=link.screen_ids,
        is_active=link.is_active,
        expires_at=link.expires_at,
        password_required=link.password_hash is not None,
    )


def verify_demo_password(
    db: Session, token: str, password: str
) -> tuple[bool, str | None]:
    """Verifikasi password demo. Mengembalikan (berhasil, pesan_error)."""
    link = get_demo_link_by_token(db, token)
    if link is None:
        return False, "Demo tidak ditemukan"
    if not link.is_active:
        return False, "Demo tidak aktif"
    if link.expires_at is not None:
        exp = link.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return False, "Demo sudah kedaluwarsa"
    if link.password_hash is None:
        return True, None
    if not verify_password(password, link.password_hash):
        return False, "Password salah"
    return True, None


def record_demo_view(db: Session, token: str) -> None:
    link = get_demo_link_by_token(db, token)
    if link:
        increment_view_count(db, link)


def get_demo_screens(db: Session, token: str) -> list[dict[str, Any]] | None:
    """Ambil data layar untuk demo publik. Tidak membutuhkan autentikasi."""
    link = get_demo_link_by_token(db, token)
    if link is None or not link.is_active:
        return None
    if not link.screen_ids:
        return []

    screens = []
    for screen_id in link.screen_ids:
        screen = db.get(Screen, screen_id)
        if screen is None:
            continue
        screens.append(
            {
                "id": screen.id,
                "screen_key": screen.screen_key,
                "title": screen.title,
                "source_url": screen.source_url,
                "screenshot_path": screen.screenshot_path,
                "capture_version": screen.capture_version,
                "category": screen.category,
            }
        )
    return screens


# ---------------------------------------------------------------- Demo Scenario


def create_demo_scenario(
    db: Session, *, payload: DemoScenarioCreate, user_id: int | None
) -> DemoScenario:
    scenario = DemoScenario(
        name=payload.name,
        description=payload.description,
        steps=[s.model_dump() for s in payload.steps],
        is_template=payload.is_template,
        project_id=payload.project_id,
        created_by=user_id,
    )
    db.add(scenario)
    db.flush()
    return scenario


def get_demo_scenario(db: Session, scenario_id: int) -> DemoScenario | None:
    return db.get(DemoScenario, scenario_id)


def list_demo_scenarios(
    db: Session, *, project_id: int | None = None, is_template: bool | None = None
) -> list[DemoScenario]:
    stmt = select(DemoScenario).order_by(DemoScenario.created_at.desc())
    if project_id is not None:
        stmt = stmt.where(DemoScenario.project_id == project_id)
    if is_template is not None:
        stmt = stmt.where(DemoScenario.is_template == is_template)
    return list(db.scalars(stmt).all())


def update_demo_scenario(
    db: Session, scenario: DemoScenario, payload: DemoScenarioUpdate
) -> DemoScenario:
    data = payload.model_dump(exclude_unset=True)
    if "steps" in data and data["steps"] is not None:
        data["steps"] = [s.model_dump() for s in data["steps"]]
    for key, value in data.items():
        setattr(scenario, key, value)
    db.add(scenario)
    db.flush()
    return scenario


def delete_demo_scenario(db: Session, scenario: DemoScenario) -> None:
    db.delete(scenario)
    db.flush()
