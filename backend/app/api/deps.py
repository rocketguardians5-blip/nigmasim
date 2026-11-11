"""Dependency FastAPI: user aktif dan pengecekan permission."""

from __future__ import annotations

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_token, has_permission
from app.db.session import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise UnauthorizedError("Token akses tidak ditemukan")
    try:
        payload = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Token akses sudah kedaluwarsa") from None
    except jwt.PyJWTError:
        raise UnauthorizedError("Token akses tidak valid") from None

    if payload.get("type") != "access":
        raise UnauthorizedError("Jenis token tidak sesuai")

    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise UnauthorizedError("Token akses tidak valid") from None

    user = db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("Pengguna tidak ditemukan")
    if not user.is_active:
        raise ForbiddenError("Akun Anda dinonaktifkan")
    return user


def require_permission(permission: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user.permissions, permission):
            raise ForbiddenError(
                f"Anda tidak memiliki izin '{permission}' untuk aksi ini"
            )
        return user

    return dependency
