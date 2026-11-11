"""Primitif keamanan: hashing password dan token JWT.

Password aplikasi sumber TIDAK pernah disimpan di sini. Yang di-hash hanya
password akun NigmaSim sendiri.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except (InvalidHashError, ValueError):
        return True


def create_access_token(
    subject: str | int,
    *,
    permissions: list[str] | None = None,
    role: str | None = None,
    expires_minutes: int | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes or settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": "access",
        "jti": secrets.token_hex(8),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if permissions is not None:
        payload["perms"] = permissions
    if role is not None:
        payload["role"] = role
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def has_permission(granted: list[str], required: str) -> bool:
    if "*" in granted or "super_admin" in granted:
        return True
    if required in granted:
        return True
    # dukungan wildcard per-resource, contoh: "applications:*"
    resource = required.split(":")[0]
    return f"{resource}:*" in granted
