"""Endpoint manajemen user dan role."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.core.security import hash_password
from app.db.session import get_db, now_utc
from app.models.user import Role, User
from app.schemas.auth import (
    PasswordReset,
    RoleOut,
    UserCreate,
    UserOut,
    UserStatusUpdate,
    UserUpdate,
)
from app.schemas.common import MessageResponse, Page
from app.services import audit
from app.services.auth import revoke_all_for_user

router = APIRouter(tags=["users"])


@router.get("/roles", response_model=list[RoleOut])
def list_roles(
    _: User = Depends(require_permission("users:read")),
    db: Session = Depends(get_db),
) -> list[Role]:
    return list(db.scalars(select(Role).order_by(Role.id)))


@router.get("/users", response_model=Page[UserOut])
def list_users(
    search: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status", pattern="^(active|disabled)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_permission("users:read")),
    db: Session = Depends(get_db),
) -> Page[UserOut]:
    stmt = select(User)
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(func.lower(User.name).like(needle) | func.lower(User.email).like(needle))
    if status_filter:
        stmt = stmt.where(User.status == status_filter)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(User.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page[UserOut](
        items=[UserOut.model_validate(r) for r in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    request: Request,
    actor: User = Depends(require_permission("users:write")),
    db: Session = Depends(get_db),
) -> User:
    email = payload.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise ConflictError("Email sudah terdaftar")
    role = db.get(Role, payload.role_id)
    if role is None:
        raise NotFoundError("Role tidak ditemukan")

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role_id=role.id,
        status="active",
    )
    db.add(user)
    db.flush()
    audit.record(
        db,
        actor_id=actor.id,
        action="user.create",
        entity_type="user",
        entity_id=user.id,
        meta={"email": email, "role": role.name},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    _: User = Depends(require_permission("users:read")),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Pengguna tidak ditemukan")
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    actor: User = Depends(require_permission("users:write")),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Pengguna tidak ditemukan")

    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        email = data["email"].lower().strip()
        existing = db.scalar(select(User).where(User.email == email, User.id != user_id))
        if existing:
            raise ConflictError("Email sudah dipakai pengguna lain")
        data["email"] = email
    if "role_id" in data and data["role_id"] is not None:
        if db.get(Role, data["role_id"]) is None:
            raise NotFoundError("Role tidak ditemukan")

    for key, value in data.items():
        setattr(user, key, value)

    audit.record(
        db,
        actor_id=actor.id,
        action="user.update",
        entity_type="user",
        entity_id=user.id,
        meta={"changes": list(data.keys())},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=UserOut)
def update_status(
    user_id: int,
    payload: UserStatusUpdate,
    request: Request,
    actor: User = Depends(require_permission("users:write")),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Pengguna tidak ditemukan")
    if user.id == actor.id and payload.status == "disabled":
        raise ConflictError("Anda tidak dapat menonaktifkan akun sendiri")

    user.status = payload.status
    if payload.status == "disabled":
        revoke_all_for_user(db, user.id)

    audit.record(
        db,
        actor_id=actor.id,
        action="user.status",
        entity_type="user",
        entity_id=user.id,
        meta={"status": payload.status},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/password", response_model=MessageResponse)
def reset_password(
    user_id: int,
    payload: PasswordReset,
    request: Request,
    actor: User = Depends(require_permission("users:write")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Pengguna tidak ditemukan")

    user.password_hash = hash_password(payload.new_password)
    revoke_all_for_user(db, user.id)
    audit.record(
        db,
        actor_id=actor.id,
        action="user.password_reset",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return MessageResponse(message="Password berhasil diubah")


@router.delete("/users/{user_id}", response_model=UserOut)
def disable_user(
    user_id: int,
    request: Request,
    actor: User = Depends(require_permission("users:write")),
    db: Session = Depends(get_db),
) -> User:
    """Soft delete: akun dinonaktifkan, tidak dihapus permanen (audit trail tetap utuh)."""
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Pengguna tidak ditemukan")
    if user.id == actor.id:
        raise ConflictError("Anda tidak dapat menghapus akun sendiri")

    user.status = "disabled"
    user.updated_at = now_utc()
    revoke_all_for_user(db, user.id)
    audit.record(
        db,
        actor_id=actor.id,
        action="user.disable",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(user)
    return user
