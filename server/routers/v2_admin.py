"""V2 管理统计与受控扩展重载。"""

import json

from fastapi import APIRouter, Depends

from auth import require_admin
from db import get_pool
from plugin_loader import reload_plugins

router = APIRouter(prefix="/api/v2/admin", tags=["v2-admin"])


@router.get("/overview")
async def overview(_admin: dict = Depends(require_admin)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT
             (SELECT COUNT(*) FROM projects WHERE archived_at IS NULL) AS projects,
             (SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL) AS assets,
             (SELECT COUNT(*) FROM workflow_runs) AS runs,
             (SELECT COUNT(*) FROM workflow_runs WHERE status='running') AS running,
             (SELECT COALESCE(SUM(credits_used),0) FROM workflow_runs) AS credits_used"""
    )
    return dict(row)


@router.get("/runs")
async def list_runs(_admin: dict = Depends(require_admin)):
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT r.id, r.owner_id, r.project_id, p.name AS project_name,
                  r.status, r.progress, r.credits_used, r.error,
                  r.created_at, r.started_at, r.finished_at
           FROM workflow_runs r
           JOIN projects p ON p.id=r.project_id
           ORDER BY r.created_at DESC LIMIT 100"""
    )
    return [dict(row) for row in rows]


@router.get("/extensions")
async def list_extensions(_admin: dict = Depends(require_admin)):
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM extensions ORDER BY name")
    result = []
    for row in rows:
        item = dict(row)
        if isinstance(item.get("manifest"), str):
            item["manifest"] = json.loads(item["manifest"])
        result.append(item)
    return result


@router.post("/extensions/reload")
async def reload_extensions(_admin: dict = Depends(require_admin)):
    reload_plugins()
    return {"ok": True}
