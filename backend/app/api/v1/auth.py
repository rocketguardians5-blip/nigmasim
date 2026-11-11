"""Endpoint autentikasi."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    MeResponse,
    RefreshRequest,
    TokenResponse,
    UserOut,
)
from app.schemas.common import MessageResponse
from app.services import audit
from app.services.auth import (
    authenticate,
    issue_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate(db, payload.email, payload.password)
    access, refresh = issue_tokens(
        db, user, user_agent=request.headers.get("user-agent")
    )
    audit.record(
        db,
        actor_id=user.id,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        ip_address=_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    payload: RefreshRequest, request: Request, db: Session = Depends(get_db)
) -> TokenResponse:
    access, new_refresh, user = rotate_refresh_token(
        db, payload.refresh_token, user_agent=request.headers.get("user-agent")
    )
    db.commit()
    return TokenResponse(
        access_token=access,
        refresh_token=new_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    payload: LogoutRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if payload.refresh_token:
        revoke_refresh_token(db, payload.refresh_token)
    audit.record(
        db,
        actor_id=user.id,
        action="auth.logout",
        entity_type="user",
        entity_id=user.id,
        ip_address=_client_ip(request),
    )
    db.commit()
    return MessageResponse(message="Logout berhasil")


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(user=UserOut.model_validate(user), permissions=user.permissions)
