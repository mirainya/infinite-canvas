import asyncio
import json
import logging
import time
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import httpx
from sse_starlette.sse import EventSourceResponse
from auth import get_current_user
from db import get_pool
from models import ExecuteRequest
from plugin_loader import get_processor, get_node_def
from prism import get_prism_source
from routers.meta_prompt import generate_meta_prompt, MetaPromptRequest
from routers.models import get_model_billing
from xfs import upload_data_uri
import wallet

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["execute"])

_active_tasks: dict[int, tuple[int, asyncio.Task]] = {}

FREE_NODE_IDS = {
    "grid-split",
    "image-preview",
    "image-upload",
    "image-group",
    "text-box",
    "text-split",
}


def _billing_model(controls: dict) -> str:
    phase = controls.get("phase", "")
    if phase in ("step", "prompts"):
        return controls.get("chat_model") or ""
    if phase == "images":
        return controls.get("image_model") or ""
    return controls.get("model") or controls.get("image_model") or controls.get("chat_model") or ""


def _register_active_task(log_id: int, user_id: int) -> None:
    task = asyncio.current_task()
    if task is not None:
        _active_tasks[log_id] = (user_id, task)


def _unregister_active_task(log_id: int) -> None:
    active = _active_tasks.get(log_id)
    if active and active[1] is asyncio.current_task():
        _active_tasks.pop(log_id, None)


def cancel_active_task(log_id: int, user_id: int) -> bool:
    """取消当前进程中属于该用户的执行任务。"""
    active = _active_tasks.get(log_id)
    if not active or active[0] != user_id or active[1].done():
        return False
    active[1].cancel()
    return True


async def _get_source() -> dict | None:
    return await get_prism_source()


async def _get_cost(def_id: str, controls: dict) -> tuple[Decimal, str]:
    """根据 controls 中的 model 字段查计费配置，返回 (cost, billing_type)。"""
    if def_id in FREE_NODE_IDS:
        return Decimal(0), "per_call"
    phase = controls.get("phase", "")
    # load_steps 不调 LLM，零费用
    if phase == "load_steps":
        return Decimal(0), "per_call"
    model = _billing_model(controls)
    if not model:
        return Decimal(1), "per_call"
    billing = await get_model_billing()
    info = billing.get(model, {})
    billing_type = info.get("billing_type", "per_call")
    if billing_type == "per_token":
        return Decimal(0), "per_token"
    unit_cost = Decimal(str(info.get("credit_cost", 1)))
    # 生图阶段：按实际提示词数量计费
    if phase == "images":
        raw = controls.get("prompts_list") or "[]"
        try:
            count = len(json.loads(raw)) if isinstance(raw, str) else len(raw)
        except (json.JSONDecodeError, TypeError):
            count = 1
        count = max(1, min(count, 30))
        return unit_cost * count, "per_call"
    # 兼容旧逻辑：有 image_model + count 时按生图数量计费
    if controls.get("image_model") and controls.get("count") and not phase:
        count = max(1, min(int(controls.get("count", 1)), 30))
        return unit_cost * count, "per_call"
    return unit_cost, "per_call"


def _calc_token_cost(result: dict, controls: dict, billing: dict) -> Decimal:
    """根据 usage 和计费配置计算 token 费用。"""
    usage = result.get("_usage")
    if not usage:
        return Decimal(0)
    model = _billing_model(controls)
    info = billing.get(model, {})
    input_cost = Decimal(str(info.get("input_cost", 0)))
    output_cost = Decimal(str(info.get("output_cost", 0)))
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    # 费率是 积分/千token
    cost = input_cost * input_tokens / 1000 + output_cost * output_tokens / 1000
    return cost.quantize(Decimal("0.0001"))


async def _insert_log(def_id: str, action: str, prompt: str,
                      user_id: int | None = None, request_id: str = "") -> int:
    pool = await get_pool()
    row = await pool.fetchrow(
        "INSERT INTO task_logs (def_id, action, prompt, user_id, request_id) "
        "VALUES ($1, $2, $3, $4, $5) RETURNING id",
        def_id, action, prompt, user_id, request_id,
    )
    return row["id"]


async def _update_log(log_id: int, status: str, duration_ms: int,
                      result_url: str = "", error: str = "", credits_used: Decimal = Decimal(0)):
    pool = await get_pool()
    await pool.execute(
        "UPDATE task_logs SET status=$1, duration_ms=$2, result_url=$3, error=$4, credits_used=$5 WHERE id=$6",
        status, duration_ms, result_url, error, credits_used, log_id,
    )


async def _record_charge(log_id: int, charged: int) -> None:
    """扣费成功后立即持久化，供进程异常退出时恢复退款。"""
    pool = await get_pool()
    await pool.execute(
        "UPDATE task_logs SET credits_used=$1 WHERE id=$2",
        Decimal(charged), log_id,
    )


async def recover_incomplete_tasks() -> tuple[int, int]:
    """将遗留任务标记失败，并重试未退还的扣费。"""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, def_id, user_id, credits_used, request_id FROM task_logs "
        "WHERE status = 'pending' OR (status = 'failed' AND credits_used > 0)"
    )
    recovered = 0
    refunds_pending = 0
    for row in rows:
        charged = int(row["credits_used"] or 0)
        net_charge = charged
        error = "服务重启，任务未完成"
        if charged > 0 and row["user_id"] and row["request_id"]:
            refunded = await wallet.refund(
                int(row["user_id"]),
                charged,
                f"{row['def_id']} 异常中断退还",
                row["request_id"],
                request_id=wallet.recovery_request_id(row["request_id"]),
            )
            if refunded:
                net_charge = 0
            else:
                refunds_pending += 1
                error = "服务重启，退款待重试"
        await pool.execute(
            "UPDATE task_logs SET status='failed', error=$1, credits_used=$2 WHERE id=$3",
            error, Decimal(net_charge), row["id"],
        )
        recovered += 1
    return recovered, refunds_pending


async def _refund_charge(user_id: int | None, charged: int, reason: str,
                         original_request_id: str) -> int:
    """返回退款后的净扣费；退款失败时保留原扣费。"""
    if not user_id or charged <= 0:
        return charged
    refunded = await wallet.refund(
        user_id, charged, reason, original_request_id,
    )
    return 0 if refunded else charged


async def _apply_partial_refund(body: ExecuteRequest, result: dict,
                                user_id: int | None, charged: int,
                                billing_type: str, request_id: str) -> int:
    generated = result.pop("_generated_count", None)
    if generated is None or not user_id or charged <= 0 or billing_type != "per_call":
        return charged

    requested = max(1, min(int(body.controls.get("count", 1)), 30))
    if generated >= requested:
        return charged

    refund_amount = int(charged * (requested - generated) // requested)
    if refund_amount <= 0:
        return charged

    refunded = await wallet.refund(
        user_id, refund_amount,
        f"{body.def_id} 部分失败退还({requested - generated}张)", request_id,
    )
    return charged - refund_amount if refunded else charged


async def _auto_meta_prompt(image_url: str, action: str) -> str:
    try:
        req = MetaPromptRequest(image_url=image_url, action=action)
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

    source = await _get_source()

    # 计算积分消耗(Decimal → 整数, 账号中心钱包是整数积分)
    cost_dec, billing_type = await _get_cost(body.def_id, body.controls)
    amount = wallet.to_int_credits(cost_dec)

    user_id = int(_user.get("sub", 0)) or None
    request_id = wallet.new_request_id()
    charged = 0  # 实扣整数积分(记入 task_logs.credits_used)

    action = body.controls.get("action", "")
    prompt = body.controls.get("edit_prompt") or body.controls.get("prompt", "")

    if not prompt and action and action != "erase":
        image_url = body.inputs.get("image", "")
        if image_url:
            prompt = await _auto_meta_prompt(image_url, action)
            if prompt:
                body.controls["edit_prompt"] = prompt

    if isinstance(prompt, str) and len(prompt) > 500:
        prompt = prompt[:500] + "..."

    log_id = await _insert_log(body.def_id, action, prompt, user_id, request_id)
    _register_active_task(log_id, user_id or 0)
    t0 = time.monotonic()

    context = {"api_source": source, "user_id": user_id or 0}
    try:
        # 任务日志必须先于扣费创建，避免扣费成功但无本地记录。
        if billing_type == "per_call" and amount > 0 and user_id:
            await wallet.deduct(user_id, amount, f"{body.def_id} 调用", request_id)
            charged = amount
            await _record_charge(log_id, charged)

        async with httpx.AsyncClient(timeout=httpx.Timeout(1200.0)) as client:
            context["http_client"] = client
            result = await processor(body.inputs, body.controls, context)

        ms = int((time.monotonic() - t0) * 1000)
        result_url = ""
        if isinstance(result, dict):
            result_url = result.get("image", "") or result.get("url", "")

        if billing_type == "per_token" and user_id and isinstance(result, dict):
            billing_data = await get_model_billing()
            token_cost = wallet.to_int_credits(_calc_token_cost(result, body.controls, billing_data))
            if token_cost > 0:
                await wallet.deduct(user_id, token_cost, f"{body.def_id} token计费", request_id)
                charged = token_cost
                await _record_charge(log_id, charged)

        if isinstance(result, dict):
            charged = await _apply_partial_refund(
                body, result, user_id, charged, billing_type, request_id,
            )
            result.pop("_usage", None)

        await _update_log(log_id, "success", ms, result_url=result_url, credits_used=Decimal(charged))
        return result
    except asyncio.CancelledError:
        ms = int((time.monotonic() - t0) * 1000)
        charged = await _refund_charge(
            user_id, charged, f"{body.def_id} 取消退还", request_id,
        )
        await _update_log(
            log_id, "failed", ms, error="用户手动取消",
            credits_used=Decimal(charged),
        )
        raise HTTPException(409, "任务已取消")
    except HTTPException as e:
        ms = int((time.monotonic() - t0) * 1000)
        charged = await _refund_charge(
            user_id, charged, f"{body.def_id} 失败退还", request_id,
        )
        await _update_log(
            log_id, "failed", ms, error=str(e.detail),
            credits_used=Decimal(charged),
        )
        raise
    except Exception as e:
        ms = int((time.monotonic() - t0) * 1000)
        charged = await _refund_charge(
            user_id, charged, f"{body.def_id} 失败退还", request_id,
        )
        await _update_log(
            log_id, "failed", ms, error=str(e),
            credits_used=Decimal(charged),
        )
        raise HTTPException(500, str(e))
    finally:
        _unregister_active_task(log_id)


@router.post("/execute/stream")
async def execute_node_stream(body: ExecuteRequest, _user: dict = Depends(get_current_user)):
    """SSE 流式执行：推送 queued → running → done/failed 状态。"""
    node_def = get_node_def(body.def_id)
    if not node_def:
        raise HTTPException(404, f"未知节点: {body.def_id}")
    processor = get_processor(body.def_id)
    if not processor:
        raise HTTPException(500, f"节点 {body.def_id} 无 process 函数")

    source = await _get_source()
    cost_dec, billing_type = await _get_cost(body.def_id, body.controls)
    amount = wallet.to_int_credits(cost_dec)

    user_id = int(_user.get("sub", 0)) or None
    request_id = wallet.new_request_id()

    async def stream():
        charged = 0  # 实扣整数积分
        yield {"event": "status", "data": json.dumps({"status": "queued"})}

        action = body.controls.get("action", "")
        prompt = body.controls.get("edit_prompt") or body.controls.get("prompt", "")

        if not prompt and action and action != "erase":
            image_url = body.inputs.get("image", "")
            if image_url:
                prompt = await _auto_meta_prompt(image_url, action)
                if prompt:
                    body.controls["edit_prompt"] = prompt

        if isinstance(prompt, str) and len(prompt) > 500:
            prompt = prompt[:500] + "..."

        try:
            log_id = await _insert_log(body.def_id, action, prompt, user_id, request_id)
        except Exception as e:
            logger.exception("创建任务日志失败")
            yield {"event": "status", "data": json.dumps({"status": "failed", "error": str(e)})}
            return
        _register_active_task(log_id, user_id or 0)
        t0 = time.monotonic()

        try:
            # 任务日志必须先于扣费创建，避免扣费成功但无本地记录。
            if billing_type == "per_call" and amount > 0 and user_id:
                await wallet.deduct(user_id, amount, f"{body.def_id} 调用", request_id)
                charged = amount
                await _record_charge(log_id, charged)

            yield {"event": "status", "data": json.dumps({"status": "running"})}

            context = {"api_source": source, "user_id": user_id or 0}
            async with httpx.AsyncClient(timeout=httpx.Timeout(1200.0)) as client:
                context["http_client"] = client
                result = await processor(body.inputs, body.controls, context)

            ms = int((time.monotonic() - t0) * 1000)
            result_url = ""
            if isinstance(result, dict):
                result_url = result.get("image", "") or result.get("url", "")

            # per_token 后扣；计费失败时不向前端交付结果。
            if billing_type == "per_token" and user_id and isinstance(result, dict):
                billing_data = await get_model_billing()
                token_cost = wallet.to_int_credits(_calc_token_cost(result, body.controls, billing_data))
                if token_cost > 0:
                    await wallet.deduct(user_id, token_cost, f"{body.def_id} token计费", request_id)
                    charged = token_cost
                    await _record_charge(log_id, charged)

            if isinstance(result, dict):
                charged = await _apply_partial_refund(
                    body, result, user_id, charged, billing_type, request_id,
                )
                result.pop("_usage", None)

            await _update_log(log_id, "success", ms, result_url=result_url, credits_used=Decimal(charged))
            yield {"event": "status", "data": json.dumps({"status": "done", "result": result})}
        except asyncio.CancelledError:
            ms = int((time.monotonic() - t0) * 1000)
            charged = await _refund_charge(
                user_id, charged, f"{body.def_id} 取消退还", request_id,
            )
            await _update_log(
                log_id, "failed", ms, error="用户手动取消",
                credits_used=Decimal(charged),
            )
            yield {"event": "status", "data": json.dumps({"status": "failed", "error": "任务已取消"})}
        except HTTPException as e:
            ms = int((time.monotonic() - t0) * 1000)
            charged = await _refund_charge(
                user_id, charged, f"{body.def_id} 失败退还", request_id,
            )
            await _update_log(
                log_id, "failed", ms, error=str(e.detail),
                credits_used=Decimal(charged),
            )
            yield {"event": "status", "data": json.dumps({"status": "failed", "error": e.detail})}
        except Exception as e:
            ms = int((time.monotonic() - t0) * 1000)
            charged = await _refund_charge(
                user_id, charged, f"{body.def_id} 失败退还", request_id,
            )
            await _update_log(
                log_id, "failed", ms, error=str(e),
                credits_used=Decimal(charged),
            )
            yield {"event": "status", "data": json.dumps({"status": "failed", "error": str(e)})}
        finally:
            _unregister_active_task(log_id)

    return EventSourceResponse(stream())
