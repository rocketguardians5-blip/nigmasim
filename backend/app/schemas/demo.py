"""Skema untuk modul demo publik dan skenario demo (Phase 7)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, validator


# ---------------------------------------------------------------- Demo Link


class DemoLinkBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    project_id: int | None = None
    screen_ids: list[int] = Field(default_factory=list)
    password: str | None = Field(default=None, max_length=128)
    is_active: bool = True
    expires_at: datetime | None = None


class DemoLinkCreate(DemoLinkBase):
    pass


class DemoLinkUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    project_id: int | None = None
    screen_ids: list[int] | None = None
    password: str | None = Field(default=None, max_length=128)
    is_active: bool | None = None
    expires_at: datetime | None = None


class DemoLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    name: str
    description: str | None = None
    project_id: int | None = None
    screen_ids: list[int]
    is_active: bool
    expires_at: datetime | None = None
    view_count: int
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime

    # Tidak mengembalikan password_hash ke klien.


class DemoLinkPublic(BaseModel):
    """Data yang dikirim ke publik (tanpa login) untuk akses demo."""

    token: str
    name: str
    description: str | None = None
    screen_ids: list[int]
    is_active: bool
    expires_at: datetime | None = None
    password_required: bool


# ---------------------------------------------------------------- Demo Scenario


class DemoScenarioStep(BaseModel):
    screen_id: int
    title: str
    instructor_notes: str | None = None


class DemoScenarioBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    steps: list[DemoScenarioStep] = Field(default_factory=list)
    is_template: bool = False
    project_id: int | None = None


class DemoScenarioCreate(DemoScenarioBase):
    pass


class DemoScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    steps: list[DemoScenarioStep] | None = None
    is_template: bool | None = None
    project_id: int | None = None


class DemoScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    steps: list[DemoScenarioStep]
    is_template: bool
    project_id: int | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- Public access


class DemoPasswordVerify(BaseModel):
    password: str


class DemoAccessResult(BaseModel):
    access_granted: bool
    token: str
    name: str
    description: str | None = None
    screen_ids: list[int]
    password_required: bool
    message: str | None = None
