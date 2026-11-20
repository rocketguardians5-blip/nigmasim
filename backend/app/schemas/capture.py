"""Skema untuk modul capture: sesi, screen, elemen, interaksi."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CaptureSessionCreate(BaseModel):
    notes: str | None = None
    viewport_width: int | None = Field(default=None, ge=320, le=3840)
    viewport_height: int | None = Field(default=None, ge=240, le=2160)
    # Preset perangkat: desktop / tablet / phone
    device: str = Field(default="desktop", pattern="^(desktop|tablet|phone)$")


class CaptureSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    operator_id: int
    status: str
    viewport_width: int
    viewport_height: int
    device: str = "desktop"
    browser_mode: str
    started_at: datetime | None = None
    ended_at: datetime | None = None
    notes: str | None = None
    created_at: datetime


class ScreenUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    screen_key: str | None = Field(default=None, min_length=1, max_length=80)
    route_label: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=60)
    parent_screen_id: int | None = None
    tags: list[str] | None = None
    notes: str | None = None


class ScreenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    capture_session_id: int | None = None
    screen_key: str
    title: str
    route_label: str | None = None
    source_url: str | None = None
    screenshot_path: str
    full_page: bool
    capture_version: int
    category: str | None = None
    parent_id: int | None = None
    tags: list[str] = []
    review_status: str
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    notes: str | None = None
    captured_at: datetime
    created_at: datetime
    updated_at: datetime


class ScreenCategory(BaseModel):
    name: str
    count: int


class ScreenVersionOut(BaseModel):
    """Ringkasan satu versi capture - untuk perbandingan."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    screen_key: str
    title: str
    capture_version: int
    review_status: str
    captured_at: datetime
    source_url: str | None = None


class NavigationNode(BaseModel):
    id: int
    title: str
    screen_key: str
    route_label: str | None = None
    capture_version: int
    review_status: str
    children: list["NavigationNode"] = []


class ScreenComparison(BaseModel):
    """Dua versi layar berdampingan untuk ditinjau manual."""

    left: ScreenOut
    right: ScreenOut


class ReviewRequest(BaseModel):
    review_status: str = Field(pattern="^(pending|approved|rejected)$")
    notes: str | None = None


class ElementCreate(BaseModel):
    element_type: str = Field(min_length=1, max_length=40)
    label: str | None = Field(default=None, max_length=200)
    selector_or_hint: str | None = Field(default=None, max_length=500)
    bounding_box: dict[str, int] | None = None
    mask: bool = False
    notes: str | None = None


class ElementUpdate(BaseModel):
    element_type: str | None = Field(default=None, min_length=1, max_length=40)
    label: str | None = Field(default=None, max_length=200)
    selector_or_hint: str | None = Field(default=None, max_length=500)
    bounding_box: dict[str, int] | None = None
    mask: bool | None = None
    notes: str | None = None


class ElementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    screen_id: int
    element_type: str
    label: str | None = None
    selector_or_hint: str | None = None
    bounding_box: dict[str, Any] | None = None
    # Enhanced detection fields
    percent_box: dict[str, float] | None = None
    source: str = "dom"
    tag: str | None = None
    href: str | None = None
    target: str | None = None
    role: str | None = None
    input_type: str | None = None
    parent_element_id: str | None = None
    state: str | None = None
    confidence: float = 1.0
    mask: bool
    notes: str | None = None


class InteractionCreate(BaseModel):
    action: str = Field(min_length=1, max_length=40)
    target_element_id: int | None = None
    expected_result: str | None = None
    notes: str | None = None


class InteractionUpdate(BaseModel):
    action: str | None = Field(default=None, min_length=1, max_length=40)
    target_element_id: int | None = None
    expected_result: str | None = None
    notes: str | None = None


class InteractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    screen_id: int
    sequence_no: int
    action: str
    target_element_id: int | None = None
    expected_result: str | None = None
    notes: str | None = None


NavigationNode.model_rebuild()


class DetectedElementData(BaseModel):
    """Enhanced element data from the new detector."""
    type: str
    label: str | None = None
    hint: str | None = None
    box: dict[str, int] | None = None
    percent_box: dict[str, float] | None = None
    source: str = "dom"  # "dom", "hover", "visual"
    tag: str | None = None
    href: str | None = None
    target: str | None = None
    role: str | None = None
    input_type: str | None = None
    parent_id: str | None = None
    state: str | None = None  # "default", "hover", "open"
    confidence: float = 1.0


class DetectionReport(BaseModel):
    """Summary report of element detection."""
    total_elements: int
    by_type: dict[str, int]
    by_source: dict[str, int]
    low_confidence_count: int
    low_confidence_elements: list[dict[str, Any]] = []
    hover_revealed_count: int
    hover_triggers_count: int
