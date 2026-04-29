from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_admin
from db import get_pool, get_config, set_config

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/users")
async def list_users():
    pool = await get_pool()
    rows = await pool.fetch("SELECT id, username, is_admin, credits, created_at FROM users ORDER BY id")
    return [dict(r) for r in rows]


class UserPatch(BaseModel):
    is_admin: bool | None = None
    credits_delta: float | None = None


@router.patch("/users/{user_id}")
async def update_user(user_id: int, body: UserPatch):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT id FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(404, "用户不存在")
    if body.is_admin is not None:
        await pool.execute("UPDATE users SET is_admin = $1 WHERE id = $2", body.is_admin, user_id)
    if body.credits_delta is not None and body.credits_delta != 0:
        delta = Decimal(str(body.credits_delta))
        r = await pool.fetchrow(
            "UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits", delta, user_id,
        )
        await pool.execute(
            "INSERT INTO credit_logs (user_id, amount, balance_after, reason) VALUES ($1, $2, $3, $4)",
            user_id, delta, r["credits"], "管理员调整",
        )
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int):
    pool = await get_pool()
    result = await pool.execute("DELETE FROM users WHERE id = $1", user_id)
    if result == "DELETE 0":
        raise HTTPException(404, "用户不存在")
    return {"ok": True}


@router.get("/credit-logs")
async def list_credit_logs(user_id: int | None = None, limit: int = 100):
    pool = await get_pool()
    if user_id:
        rows = await pool.fetch(
            "SELECT cl.*, u.username FROM credit_logs cl JOIN users u ON u.id = cl.user_id "
            "WHERE cl.user_id = $1 ORDER BY cl.id DESC LIMIT $2", user_id, limit,
        )
    else:
        rows = await pool.fetch(
            "SELECT cl.*, u.username FROM credit_logs cl JOIN users u ON u.id = cl.user_id "
            "ORDER BY cl.id DESC LIMIT $1", limit,
        )
    return [dict(r) for r in rows]


EDITABLE_CONFIG_KEYS = ["xfs_base_url", "xfs_api_key", "jwt_secret"]


@router.get("/config")
async def get_all_config():
    pool = await get_pool()
    rows = await pool.fetch("SELECT key, value FROM system_config WHERE key = ANY($1)", EDITABLE_CONFIG_KEYS)
    result = {k: "" for k in EDITABLE_CONFIG_KEYS}
    for r in rows:
        result[r["key"]] = r["value"]
    return result


class ConfigPatch(BaseModel):
    configs: dict[str, str]


@router.put("/config")
async def update_config(body: ConfigPatch):
    for key, value in body.configs.items():
        if key not in EDITABLE_CONFIG_KEYS:
            continue
        await set_config(key, value)
    if "jwt_secret" in body.configs:
        import auth
        auth._secret_key = None
    return {"ok": True}
