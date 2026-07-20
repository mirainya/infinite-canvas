"""画布云端同步 API"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/canvases", tags=["canvases"])


class CanvasSaveRequest(BaseModel):
    id: str
    name: str = "未命名项目"
    snapshot: dict
    versions: list = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)


@router.get("")
async def list_canvases(user: dict = Depends(get_current_user)):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, name, updated_at, created_at FROM canvases WHERE user_id = $1 ORDER BY updated_at DESC",
        int(user["sub"]),
    )
    return [dict(r) for r in rows]


@router.get("/{canvas_id}")
async def get_canvas(canvas_id: str, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM canvases WHERE id = $1 AND user_id = $2",
        canvas_id, int(user["sub"]),
    )
    if not row:
        raise HTTPException(404, "画布不存在")
    r = dict(row)
    r["snapshot"] = json.loads(r["snapshot"]) if isinstance(r["snapshot"], str) else r["snapshot"]
    r["versions"] = json.loads(r["versions"]) if isinstance(r["versions"], str) else r["versions"]
    r["settings"] = json.loads(r["settings"]) if isinstance(r["settings"], str) else r["settings"]
    return r


@router.put("/{canvas_id}")
async def save_canvas(canvas_id: str, body: CanvasSaveRequest, user: dict = Depends(get_current_user)):
    if body.id != canvas_id:
        raise HTTPException(400, "画布 ID 与请求路径不一致")

    pool = await get_pool()
    user_id = int(user["sub"])
    now = datetime.now(timezone.utc)
    snapshot_json = json.dumps(body.snapshot, ensure_ascii=False)
    versions_json = json.dumps(body.versions, ensure_ascii=False)
    settings_json = json.dumps(body.settings, ensure_ascii=False)

    saved_id = await pool.fetchval(
        """INSERT INTO canvases (id, user_id, name, snapshot, versions, settings, updated_at, created_at)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             snapshot = EXCLUDED.snapshot,
             versions = EXCLUDED.versions,
             settings = EXCLUDED.settings,
             updated_at = EXCLUDED.updated_at
           WHERE canvases.user_id = EXCLUDED.user_id
           RETURNING id""",
        canvas_id, user_id, body.name, snapshot_json, versions_json, settings_json, now,
    )
    if saved_id is None:
        raise HTTPException(409, "画布 ID 已被其他账号占用")
    return {"ok": True}


@router.delete("/{canvas_id}")
async def delete_canvas(canvas_id: str, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM canvases WHERE id = $1 AND user_id = $2",
        canvas_id, int(user["sub"]),
    )
    if result == "DELETE 0":
        raise HTTPException(404, "画布不存在")
    return {"ok": True}
