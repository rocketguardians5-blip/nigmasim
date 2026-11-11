"""Seed data awal: role bawaan dan akun super admin pertama.

Hanya berjalan bila data belum ada — aman dijalankan berulang.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import Role, User

logger = logging.getLogger("nigmasim.seed")

DEFAULT_ROLES: dict[str, dict[str, object]] = {
    "super_admin": {
        "description": "Akses penuh ke seluruh platform",
        "permissions": ["*"],
    },
    "project_admin": {
        "description": "Mengelola aplikasi dan project yang ditugaskan",
        "permissions": [
            "users:read",
            "applications:read",
            "applications:write",
            "projects:read",
            "projects:write",
            "capture:operate",
            "capture:read",
            "screens:read",
            "screens:write",
        ],
    },
    "capture_operator": {
        "description": "Menjalankan capture aplikasi yang diotorisasi",
        "permissions": [
            "applications:read",
            "projects:read",
            "capture:operate",
            "capture:read",
            "screens:read",
            "screens:write",
        ],
    },
    "developer_reviewer": {
        "description": "Mereview hasil capture dan rekonstruksi",
        "permissions": [
            "applications:read",
            "projects:read",
            "capture:read",
            "screens:read",
            "screens:review",
        ],
    },
    "demo_viewer": {
        "description": "Hanya melihat demo dan screen yang sudah disetujui",
        "permissions": ["screens:read"],
    },
}


def seed(db: Session) -> None:
    changed = False

    for name, payload in DEFAULT_ROLES.items():
        existing = db.scalar(select(Role).where(Role.name == name))
        if existing is None:
            db.add(
                Role(
                    name=name,
                    description=str(payload["description"]),
                    permissions=list(payload["permissions"]),  # type: ignore[arg-type]
                )
            )
            changed = True
    if changed:
        db.flush()

    admin_role = db.scalar(select(Role).where(Role.name == "super_admin"))
    assert admin_role is not None

    admin = db.scalar(select(User).where(User.email == settings.admin_email.lower()))
    if admin is None:
        db.add(
            User(
                name=settings.admin_name,
                email=settings.admin_email.lower(),
                password_hash=hash_password(settings.admin_initial_password),
                role_id=admin_role.id,
                status="active",
            )
        )
        changed = True
        if settings.is_development:
            logger.warning(
                "Akun admin awal dibuat: %s — SEGERA ganti password, "
                "password default TIDAK boleh dipakai di production.",
                settings.admin_email,
            )

    if changed:
        db.commit()
