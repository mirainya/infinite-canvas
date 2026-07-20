"""管理端路由: IC 自身配置(模型/插件/Prism/存储等)。

用户与积分管理已移交账号中心运营后台, IC 不再管。
鉴权: require_admin 据 IC_ADMINS 白名单(账号中心用户名)放行。
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import require_admin
from db import get_pool, set_config

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/task-logs")
async def list_task_logs(
    user_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
):
    """任务流水(只读, 含账号中心 user_id)。需按用户名展示时由前端调账号中心查。"""
    pool = await get_pool()
    if user_id:
        rows = await pool.fetch(
            "SELECT * FROM task_logs WHERE user_id = $1 ORDER BY id DESC LIMIT $2", user_id, limit,
        )
    else:
        rows = await pool.fetch("SELECT * FROM task_logs ORDER BY id DESC LIMIT $1", limit)
    return [dict(r) for r in rows]


EDITABLE_CONFIG_KEYS = [
    "prism_base_url", "prism_token",
    "xfs_base_url", "xfs_api_key",
    "metaprompt_api_key", "metaprompt_model",
]
SECRET_CONFIG_KEYS = {"prism_token", "xfs_api_key", "metaprompt_api_key"}
MASKED_SECRET = "********"


@router.get("/config")
async def get_all_config():
    pool = await get_pool()
    rows = await pool.fetch("SELECT key, value FROM system_config WHERE key = ANY($1)", EDITABLE_CONFIG_KEYS)
    result = {k: "" for k in EDITABLE_CONFIG_KEYS}
    for r in rows:
        key = r["key"]
        value = r["value"]
        result[key] = MASKED_SECRET if key in SECRET_CONFIG_KEYS and value else value
    return result


class ConfigPatch(BaseModel):
    configs: dict[str, str]


@router.put("/config")
async def update_config(body: ConfigPatch):
    for key, value in body.configs.items():
        if key not in EDITABLE_CONFIG_KEYS:
            continue
        if key in SECRET_CONFIG_KEYS and value == MASKED_SECRET:
            continue
        await set_config(key, value)
    return {"ok": True}
