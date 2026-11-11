"""Logika autentikasi: verifikasi kredensial dan pengelolaan token."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_token,
    needs_rehash,
    hash_password,
    verify_password,
)
from app.db.session import now_utc
from app.models.user import RefreshToken, User


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower().strip()))
    # Pesan error diseragamkan agar tidak membocorkan email mana yang terdaftar.
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Email atau password salah")
    if not user.is_active:
        raise ForbiddenError("Akun Anda dinonaktifkan")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = now_utc()
    db.flush()
    return user


def issue_tokens(db: Session, user: User, *, user_agent: str | None = None) -> tuple[str, str]:
    access = create_access_token(
        user.id,
        permissions=user.permissions,
        role=user.role.name,
    )
    raw_refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw_refresh),
            expires_at=now_utc() + timedelta(days=settings.refresh_token_expire_days),
            user_agent=user_agent,
        )
    )
    db.flush()
    return access, raw_refresh


def rotate_refresh_token(
    db: Session, raw_token: str, *, user_agent: str | None = None
) -> tuple[str, str, User]:
    token_hash = hash_token(raw_token)
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if stored is None or stored.revoked_at is not None:
        raise UnauthorizedError("Refresh token tidak valid")
    if stored.expires_at <= now_utc():
        raise UnauthorizedError("Refresh token sudah kedaluwarsa")

    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise ForbiddenError("Akun tidak aktif")

    stored.revoked_at = now_utc()
    access, refresh = issue_tokens(db, user, user_agent=user_agent)
    return access, refresh, user


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    token_hash = hash_token(raw_token)
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if stored is not None and stored.revoked_at is None:
        stored.revoked_at = now_utc()


def revoke_all_for_user(db: Session, user_id: int) -> None:
    for token in db.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    ):
        token.revoked_at = now_utc()
