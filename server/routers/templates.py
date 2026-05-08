import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    thumbnail: str = ""
    nodes: list
    edges: list
    is_public: bool = False


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_public: bool | None = None


@router.get("")
async def list_templates(user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user.get("sub", 0))
    rows = await pool.fetch(
        "SELECT id, name, description, thumbnail, user_id, is_public, created_at "
        "FROM workflow_templates WHERE user_id = $1 OR is_public = TRUE ORDER BY created_at DESC",
        user_id,
    )
    return [dict(r) for r in rows]


@router.post("")
async def create_template(body: TemplateCreate, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user.get("sub", 0))
    row = await pool.fetchrow(
        "INSERT INTO workflow_templates (name, description, thumbnail, nodes_json, edges_json, user_id, is_public) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at",
        body.name, body.description, body.thumbnail,
        json.dumps(body.nodes), json.dumps(body.edges),
        user_id, body.is_public,
    )
    return {"id": row["id"], "created_at": row["created_at"]}


@router.get("/{template_id}")
async def get_template(template_id: int, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user.get("sub", 0))
    row = await pool.fetchrow(
        "SELECT * FROM workflow_templates WHERE id = $1 AND (user_id = $2 OR is_public = TRUE)",
        template_id, user_id,
    )
    if not row:
        raise HTTPException(404, "模板不存在")
    result = dict(row)
    result["nodes"] = json.loads(result.pop("nodes_json"))
    result["edges"] = json.loads(result.pop("edges_json"))
    return result


@router.delete("/{template_id}")
async def delete_template(template_id: int, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user.get("sub", 0))
    result = await pool.execute(
        "DELETE FROM workflow_templates WHERE id = $1 AND user_id = $2",
        template_id, user_id,
    )
    if result == "DELETE 0":
        raise HTTPException(404, "模板不存在或无权删除")
    return {"ok": True}
