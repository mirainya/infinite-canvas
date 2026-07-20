from pydantic import BaseModel, Field
from typing import Any


class ExecuteRequest(BaseModel):
    model_config = {"populate_by_name": True}

    def_id: str = Field(alias="defId")
    inputs: dict[str, Any] = Field(default_factory=dict)
    controls: dict[str, Any] = Field(default_factory=dict)
