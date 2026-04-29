from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any


class ApiSourceCreate(BaseModel):
    name: str
    base_url: str
    token: str
    capability: str = ""
    chat_model: str = "gemini-3-pro-preview"
    poll_interval_ms: int = 5000
    max_polls: int = 60
    is_default: bool = False
    billing_type: str = "per_call"
    credit_cost: float = 1


class ApiSourceUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    token: str | None = None
    capability: str | None = None
    chat_model: str | None = None
    poll_interval_ms: int | None = None
    max_polls: int | None = None
    is_default: bool | None = None
    billing_type: str | None = None
    credit_cost: float | None = None


class ApiSourceOut(BaseModel):
    id: int
    name: str
    base_url: str
    token: str
    capability: str
    chat_model: str
    poll_interval_ms: int
    max_polls: int
    is_default: bool
    billing_type: str = "per_call"
    credit_cost: float = 1
    created_at: datetime


class ExecuteRequest(BaseModel):
    model_config = {"populate_by_name": True}

    def_id: str = Field(alias="defId")
    inputs: dict[str, Any] = {}
    controls: dict[str, Any] = {}
    source_id: int | None = Field(default=None, alias="sourceId")
