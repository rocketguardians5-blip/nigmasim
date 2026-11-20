"""Skema AI Agent (Chat Assistant)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AgentMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system|tool)$")
    content: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None


class AgentRequest(BaseModel):
    messages: list[AgentMessage] = Field(min_length=1, max_length=20)
    stream: bool = False


class AgentResponse(BaseModel):
    message: AgentMessage
    usage: dict[str, int] | None = None


class ToolDefinition(BaseModel):
    type: str = "function"
    function: dict[str, Any]


# Tool parameter schemas
class ListApplicationsParams(BaseModel):
    search: str | None = None
    status: str | None = None
    page: int = 1


class GetApplicationParams(BaseModel):
    id: int


class ListScreensParams(BaseModel):
    project_id: int
    search: str | None = None
    page: int = 1


class GetScreenElementsParams(BaseModel):
    screen_id: int


class GetReconstructionParams(BaseModel):
    screen_id: int


class GetSimulationParams(BaseModel):
    project_id: int


# Tool result schemas (simplified for agent consumption)
class ApplicationSummary(BaseModel):
    id: int
    name: str
    description: str | None
    source_url: str
    authorization_status: str


class ScreenSummary(BaseModel):
    id: int
    name: str
    description: str | None
    status: str


class ScreenElementSummary(BaseModel):
    id: int
    element_type: str
    label: str | None
    selector: str | None
    percent_box: dict | None


class ReconstructionSummary(BaseModel):
    id: int
    status: str
    layout: dict | None
    components_count: int
    assumptions_count: int
    unresolved_count: int


class SimulationSummary(BaseModel):
    id: int
    name: str
    status: str
    version: str


# Union for tool results
ToolResult = (
    list[ApplicationSummary]
    | ApplicationSummary
    | list[ScreenSummary]
    | list[ScreenElementSummary]
    | ReconstructionSummary
    | SimulationSummary
    | dict[str, Any]
    | str
)