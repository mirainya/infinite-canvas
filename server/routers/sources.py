from fastapi import APIRouter, HTTPException, Depends
from auth import get_current_user, require_admin
from db import get_pool
from models import ApiSourceCreate, ApiSourceUpdate, ApiSourceOut

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.get("", response_model=list[ApiSourceOut])
async def list_sources(_admin: dict = Depends(require_admin)):
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM api_sources ORDER BY id")
    return [dict(r) for r in rows]


@router.post("", response_model=ApiSourceOut)
async def create_source(body: ApiSourceCreate, _admin: dict = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if body.is_default:
            await conn.execute("UPDATE api_sources SET is_default = FALSE")
        row = await conn.fetchrow(
            """INSERT INTO api_sources (name, base_url, token, capability, chat_model, poll_interval_ms, max_polls, is_default, billing_type, credit_cost)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               RETURNING *""",
            body.name, body.base_url, body.token, body.capability, body.chat_model,
            body.poll_interval_ms, body.max_polls, body.is_default, body.billing_type, body.credit_cost,
        )
        return dict(row)


@router.put("/{source_id}", response_model=ApiSourceOut)
async def update_source(source_id: int, body: ApiSourceUpdate, _admin: dict = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM api_sources WHERE id = $1", source_id)
        if not existing:
            raise HTTPException(404, "来源不存在")

        fields = []
        values = []
        idx = 1
        for field, col in [
            ("name", "name"), ("base_url", "base_url"), ("token", "token"),
            ("capability", "capability"), ("chat_model", "chat_model"),
            ("poll_interval_ms", "poll_interval_ms"),
            ("max_polls", "max_polls"),
            ("billing_type", "billing_type"),
            ("credit_cost", "credit_cost"),
        ]:
            val = getattr(body, field)
            if val is not None:
                fields.append(f"{col} = ${idx}")
                values.append(val)
                idx += 1

        if body.is_default is not None:
            if body.is_default:
                await conn.execute("UPDATE api_sources SET is_default = FALSE")
            fields.append(f"is_default = ${idx}")
            values.append(body.is_default)
            idx += 1

        if fields:
            values.append(source_id)
            await conn.execute(
                f"UPDATE api_sources SET {', '.join(fields)} WHERE id = ${idx}",
                *values,
            )

        row = await conn.fetchrow("SELECT * FROM api_sources WHERE id = $1", source_id)
        return dict(row)


@router.delete("/{source_id}")
async def delete_source(source_id: int, _admin: dict = Depends(require_admin)):
    pool = await get_pool()
    result = await pool.execute("DELETE FROM api_sources WHERE id = $1", source_id)
    if result == "DELETE 0":
        raise HTTPException(404, "来源不存在")
    return {"ok": True}
