"""Skema untuk modul statistik pengunjung (Phase 7)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class VisitorStatCreate(BaseModel):
    path: str = Field(..., min_length=1, max_length=500)
    ip_address: str | None = Field(default=None, max_length=45)
    user_agent: str | None = None
    referrer: str | None = None


class VisitorStatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    path: str
    ip_address: str | None = None
    user_agent: str | None = None
    referrer: str | None = None
    visited_at: datetime


class PathStat(BaseModel):
    path: str
    count: int


class VisitorStatsSummary(BaseModel):
    total_visits: int
    visits_by_path: list[PathStat]
    recent_visits: list[VisitorStatOut]
