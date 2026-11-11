"""Skema registry: Application & Project."""

from __future__ import annotations

import ipaddress
from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

ENVIRONMENTS = {"production", "staging", "demo"}
AUTHORIZATION_STATUSES = {"pending", "approved", "revoked"}
PROJECT_STATUSES = {"draft", "capturing", "building", "published", "archived"}


def _validate_url(value: str) -> str:
    """Hanya http/https, dan tolak host IP privat (mitigasi SSRF)."""
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("URL harus menggunakan http atau https")
    if not parsed.hostname:
        raise ValueError("URL tidak valid")
    host = parsed.hostname.lower()
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return value
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        raise ValueError("URL tidak boleh mengarah ke alamat jaringan internal")
    return value


class ApplicationBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    owner: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=80)
    source_url: str = Field(max_length=500)
    login_url: str | None = Field(default=None, max_length=500)
    environment_label: str = "staging"
    logo_path: str | None = Field(default=None, max_length=500)
    version_label: str | None = Field(default=None, max_length=40)

    @field_validator("source_url")
    @classmethod
    def _check_source_url(cls, v: str) -> str:
        return _validate_url(v)

    @field_validator("login_url")
    @classmethod
    def _check_login_url(cls, v: str | None) -> str | None:
        return _validate_url(v) if v else v

    @field_validator("environment_label")
    @classmethod
    def _check_env(cls, v: str) -> str:
        if v not in ENVIRONMENTS:
            raise ValueError(f"environment_label harus salah satu dari {sorted(ENVIRONMENTS)}")
        return v


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    owner: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=80)
    source_url: str | None = Field(default=None, max_length=500)
    login_url: str | None = Field(default=None, max_length=500)
    environment_label: str | None = None
    logo_path: str | None = Field(default=None, max_length=500)
    version_label: str | None = Field(default=None, max_length=40)

    @field_validator("source_url")
    @classmethod
    def _check_source_url(cls, v: str | None) -> str | None:
        return _validate_url(v) if v else v

    @field_validator("login_url")
    @classmethod
    def _check_login_url(cls, v: str | None) -> str | None:
        return _validate_url(v) if v else v

    @field_validator("environment_label")
    @classmethod
    def _check_env(cls, v: str | None) -> str | None:
        if v is not None and v not in ENVIRONMENTS:
            raise ValueError(f"environment_label harus salah satu dari {sorted(ENVIRONMENTS)}")
        return v


class AuthorizationUpdate(BaseModel):
    authorization_status: str
    authorization_ref: str | None = Field(default=None, max_length=255)
    authorization_note: str | None = None

    @field_validator("authorization_status")
    @classmethod
    def _check_status(cls, v: str) -> str:
        if v not in AUTHORIZATION_STATUSES:
            raise ValueError(f"status harus salah satu dari {sorted(AUTHORIZATION_STATUSES)}")
        return v


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    owner: str | None = None
    category: str | None = None
    source_url: str
    login_url: str | None = None
    environment_label: str
    authorization_status: str
    authorization_ref: str | None = None
    authorization_note: str | None = None
    logo_path: str | None = None
    version_label: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    version: str = Field(default="1.0", max_length=20)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    version: str | None = Field(default=None, max_length=20)
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _check_status(cls, v: str | None) -> str | None:
        if v is not None and v not in PROJECT_STATUSES:
            raise ValueError(f"status harus salah satu dari {sorted(PROJECT_STATUSES)}")
        return v


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    name: str
    description: str | None = None
    version: str
    status: str
    created_at: datetime
    updated_at: datetime
