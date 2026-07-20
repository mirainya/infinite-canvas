"""提示词增强 — 调用 meta-prompt 服务优化提示词，并记录历史。"""

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import httpx

from auth import get_current_user
from db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prompt-enhance", tags=["prompt-enhance"])

METAPROMPT_BASE = "https://metaprompt.mirainya.icu"


async def _get_api_key() -> str:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT value FROM system_config WHERE key = 'metaprompt_api_key'")
    if not row or not row["value"]:
        raise HTTPException(500, "未配置 meta-prompt API Key，请在管理面板设置")
    return row["value"]


async def _poll_task(client: httpx.AsyncClient, api_key: str, task_id: str) -> dict:
    for _ in range(120):
        await asyncio.sleep(3)
        resp = await client.get(
            f"{METAPROMPT_BASE}/open/v1/tasks/{task_id}",
            headers={"X-API-Key": api_key},
        )
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")
        if status == "done":
            return data
        if status in ("failed", "error"):
            raise RuntimeError(f"meta-prompt 任务失败: {data.get('error', '未知错误')}")
    raise RuntimeError("meta-prompt 任务超时（已等待360s）")


def _parse_generator_output(data: dict) -> str:
    gen_output = data.get("generator_output")
    if isinstance(gen_output, list):
        texts = [item.get("prompt_text", "") for item in gen_output if isinstance(item, dict) and item.get("prompt_text")]
        if texts:
            return "\n\n---\n\n".join(texts)
    if isinstance(gen_output, str) and gen_output.strip():
        return gen_output
    return str(data)


class EnhanceRequest(BaseModel):
    input: str
    model: str | None = None


class EnhanceResponse(BaseModel):
    task_id: int | None = None
    status: str
    output: str | None = None
    duration_ms: int = 0


@router.post("", response_model=EnhanceResponse)
async def enhance_prompt(body: EnhanceRequest, user: dict = Depends(get_current_user)):
    api_key = await _get_api_key()
    user_id = int(user["sub"])
    pool = await get_pool()

    model_row = await pool.fetchrow("SELECT value FROM system_config WHERE key = 'metaprompt_model'")
    default_model = (model_row["value"] if model_row and model_row["value"] else "claude-sonnet-4-6")

    row = await pool.fetchrow(
        "INSERT INTO prompt_enhance_logs (user_id, input) VALUES ($1, $2) RETURNING id",
        user_id, body.input,
    )
    log_id = row["id"]

    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            req_body: dict = {"input": body.input, "model": body.model or default_model}

            resp = await client.post(
                f"{METAPROMPT_BASE}/open/v1/generate",
                json=req_body,
                headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            )

            if resp.status_code == 402:
                raise HTTPException(402, "meta-prompt 积分不足")
            resp.raise_for_status()
            data = resp.json()

            task_id = data.get("task_id")
            if task_id:
                data = await _poll_task(client, api_key, task_id)

        duration_ms = int((time.time() - t0) * 1000)
        output = _parse_generator_output(data)

        await pool.execute(
            "UPDATE prompt_enhance_logs SET status='success', output=$1, duration_ms=$2 WHERE id=$3",
            output, duration_ms, log_id,
        )
        return EnhanceResponse(task_id=log_id, status="success", output=output, duration_ms=duration_ms)

    except HTTPException as e:
        duration_ms = int((time.time() - t0) * 1000)
        await pool.execute(
            "UPDATE prompt_enhance_logs SET status='failed', output=$1, duration_ms=$2 WHERE id=$3",
            str(e.detail), duration_ms, log_id,
        )
        raise
    except Exception as e:
        duration_ms = int((time.time() - t0) * 1000)
        await pool.execute(
            "UPDATE prompt_enhance_logs SET status='failed', output=$1, duration_ms=$2 WHERE id=$3",
            str(e), duration_ms, log_id,
        )
        raise HTTPException(500, f"提示词增强失败: {e}")


@router.get("/history")
async def enhance_history(
    limit: int = Query(default=30, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM prompt_enhance_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
        int(user["sub"]), limit,
    )
    return [dict(r) for r in rows]


@router.get("/models")
async def list_metaprompt_models(_user: dict = Depends(get_current_user)):
    api_key = await _get_api_key()
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        resp = await client.get(
            f"{METAPROMPT_BASE}/open/v1/models",
            headers={"X-API-Key": api_key},
        )
        resp.raise_for_status()
        return resp.json()
