"""Skema Fase 3 - rekonstruksi UI."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ComponentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    region: str
    component_type: str
    label: str | None = None
    props: dict | None = None
    order_index: int
    source: str
    element_type: str = "button"
    config_json: str | None = None
    notes: str | None = None


class AssumptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic: str
    description: str
    confidence: str
    resolved: bool
    resolved_by: int | None = None
    resolved_at: datetime | None = None


class ReconstructionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    screen_id: int
    project_id: int
    status: str
    layout: dict | None = None
    code_text: str | None = None
    generated_by: str
    created_by: int | None = None
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ReconstructionDetail(ReconstructionOut):
    components: list[ComponentOut] = []
    assumptions: list[AssumptionOut] = []

    @property
    def unresolved_count(self) -> int:
        return sum(1 for a in self.assumptions if not a.resolved)


class CodeUpdate(BaseModel):
    code_text: str = Field(min_length=1)


class ComponentCreate(BaseModel):
    region: str = Field(default="main", max_length=30)
    component_type: str = Field(max_length=40)
    label: str | None = Field(default=None, max_length=200)
    props: dict | None = None
    element_type: str = Field(default="button", max_length=30)
    config_json: str | None = None
    notes: str | None = None


class ComponentUpdate(BaseModel):
    region: str | None = Field(default=None, max_length=30)
    component_type: str | None = Field(default=None, max_length=40)
    label: str | None = Field(default=None, max_length=200)
    props: dict | None = None
    element_type: str | None = Field(default=None, max_length=30)
    config_json: str | None = None
    notes: str | None = None


class ReviewRequest(BaseModel):
    status: str = Field(pattern="^(draft|in_review|approved|rejected)$")
    notes: str | None = None


class AIAnalyzeRequest(BaseModel):
    force_refresh: bool = False


class AIAnalyzeResponse(BaseModel):
    components_added: int
    assumptions_added: int
    layout_updated: bool
    message: str
    status: str
    error: str | None = None


class HotspotStateIn(BaseModel):
    deleted: list[str] = []
    overrides: dict[str, Any] = {}


class HotspotStateOut(BaseModel):
    deleted: list[str] = []
    overrides: dict[str, Any] = {}

