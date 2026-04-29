import logging
import time
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import httpx
from auth import get_current_user
from db import get_pool
from models import ExecuteRequest
from plugin_loader import get_processor, get_node_def
from routers.meta_prompt import generate_meta_prompt, MetaPromptRequest
from xfs import upload_data_uri

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["execute"])


async def _get_source(source_id: int | None) -> dict | None:
    pool = await get_pool()
    if source_id is not None:
        row = await pool.fetchrow("SELECT * FROM api_sources WHERE id = $1", source_id)
    else:
        row = await pool.fetchrow("SELECT * FROM api_sources WHERE is_default = TRUE LIMIT 1")
    return dict(row) if row else None


async def _insert_log(def_id: str, action: str, prompt: str, user_id: int | None = None) -> int:
    pool = await get_pool()
    row = await pool.fetchrow(
        "INSERT INTO task_logs (def_id, action, prompt, user_id) VALUES ($1, $2, $3, $4) RETURNING id",
        def_id, action, prompt, user_id,
    )
    return row["id"]


async def _update_log(log_id: int, status: str, duration_ms: int,
                      result_url: str = "", error: str = "", credits_used: Decimal = Decimal(0)):
    pool = await get_pool()
    await pool.execute(
        "UPDATE task_logs SET status=$1, duration_ms=$2, result_url=$3, error=$4, credits_used=$5 WHERE id=$6",
        status, duration_ms, result_url, error, credits_used, log_id,
    )


async def _deduct_credits(user_id: int, cost: Decimal, reason: str):
    """扣除积分，余额不足抛异常。"""
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits",
        cost, user_id,
    )
    if row is None:
        raise HTTPException(402, "积分不足")
    await pool.execute(
        "INSERT INTO credit_logs (user_id, amount, balance_after, reason) VALUES ($1, $2, $3, $4)",
        user_id, -cost, row["credits"], reason,
    )
    return row["credits"]


async def _auto_meta_prompt(image_url: str, action: str, source_id: int | None) -> str:
    try:
        req = MetaPromptRequest(image_url=image_url, action=action, source_id=source_id)
        resp = await generate_meta_prompt(req)
        logger.info("auto meta-prompt 生成: %s", resp.prompt[:100])
        return resp.prompt
    except Exception as e:
        logger.warning("auto meta-prompt 失败，跳过: %s", e)
        return ""


class _UploadBody(BaseModel):
    image: str


@router.post("/upload")
async def upload_image(body: _UploadBody, _user: dict = Depends(get_current_user)):
    if not body.image:
        raise HTTPException(400, "缺少图片数据")
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        try:
            url = await upload_data_uri(client, body.image, "infinite-canvas/upload")
        except Exception as e:
            raise HTTPException(500, str(e))
    return {"url": url}


@router.post("/execute")
async def execute_node(body: ExecuteRequest, _user: dict = Depends(get_current_user)):
    node_def = get_node_def(body.def_id)
    if not node_def:
        raise HTTPException(404, f"未知节点: {body.def_id}")

    processor = get_processor(body.def_id)
    if not processor:
        raise HTTPException(500, f"节点 {body.def_id} 无 process 函数")

    source = await _get_source(body.source_id)

    # 计算积分消耗
    cost = Decimal(0)
    if source:
        billing_type = source.get("billing_type", "per_call")
        credit_cost = Decimal(str(source.get("credit_cost", 1)))
        if billing_type == "per_call":
            cost = credit_cost

    user_id = int(_user.get("sub", 0)) or None

    # 扣费（per_call 预扣）
    if cost > 0 and user_id:
        await _deduct_credits(user_id, cost, f"{body.def_id} 调用")

    action = body.controls.get("action", "")
    prompt = body.controls.get("edit_prompt") or body.controls.get("prompt", "")

    if not prompt and action and action != "erase":
        image_url = body.inputs.get("image", "")
        if image_url:
            prompt = await _auto_meta_prompt(image_url, action, body.source_id)
            if prompt:
                body.controls["edit_prompt"] = prompt

    if isinstance(prompt, str) and len(prompt) > 500:
        prompt = prompt[:500] + "..."

    log_id = await _insert_log(body.def_id, action, prompt, user_id)
    t0 = time.monotonic()

    context = {"api_source": source}

    async with httpx.AsyncClient(timeout=httpx.Timeout(1200.0)) as client:
        context["http_client"] = client
        try:
            result = await processor(body.inputs, body.controls, context)
        except Exception as e:
            ms = int((time.monotonic() - t0) * 1000)
            await _update_log(log_id, "failed", ms, error=str(e), credits_used=cost)
            # 失败退还积分
            if cost > 0 and user_id:
                pool = await get_pool()
                row = await pool.fetchrow(
                    "UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits",
                    cost, user_id,
                )
                await pool.execute(
                    "INSERT INTO credit_logs (user_id, amount, balance_after, reason) VALUES ($1, $2, $3, $4)",
                    user_id, cost, row["credits"], f"{body.def_id} 失败退还",
                )
            raise HTTPException(500, str(e))

    ms = int((time.monotonic() - t0) * 1000)
    result_url = ""
    if isinstance(result, dict):
        result_url = result.get("image", "") or result.get("url", "")

    await _update_log(log_id, "success", ms, result_url=result_url, credits_used=cost)
    return result
