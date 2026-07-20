"""钱包: 调账号中心 /api/internal/wallet/* 扣费/退款(带 client 凭证)。

账号中心钱包是**整数积分**、幂等(request_id)、原子防超扣。
IC 侧把 Decimal 费用向上取整为整数(ceil, 宁可多扣不少扣), 每笔扣费生成 UUID request_id
存入 task_logs.request_id, 退款时引用它作 original_request_id。

错误码语义(照搬账号中心, 见 docs/API.md §2/§4):
- 402 余额不足 / 403 用户被禁 / 429 扣费限频 → 抛 HTTPException 透传给前端
"""

import logging
import math
import uuid
from decimal import Decimal

import httpx
from fastapi import HTTPException, status

import account_center as ac

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(15.0)


def new_request_id() -> str:
    return uuid.uuid4().hex


def recovery_request_id(original_request_id: str) -> str:
    """为同一笔异常退款生成稳定幂等键，避免服务多次重启重复退款。"""
    return uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"infinite-canvas:recovery-refund:{original_request_id}",
    ).hex


def to_int_credits(cost: Decimal | int | float) -> int:
    """费用归一为正整数积分(向上取整)。<=0 视为 0(不扣)。"""
    if cost is None:
        return 0
    c = Decimal(str(cost))
    if c <= 0:
        return 0
    return int(math.ceil(c))


async def deduct(user_id: int, amount: int, reason: str, request_id: str) -> int:
    """扣费, 返回扣后余额。amount<=0 直接跳过返回 -1(无需扣)。

    失败按账号中心 HTTP 状态码抛: 402 余额不足 / 403 被禁 / 429 限频。
    """
    if amount <= 0:
        return -1
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.post(
                f"{ac.BASE_URL}/api/internal/wallet/deduct",
                json={"user_id": user_id, "amount": amount,
                      "reason": reason, "request_id": request_id},
                headers={"X-Client-Id": ac.CLIENT_ID, "X-Client-Secret": ac.CLIENT_SECRET},
            )
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    data = _unwrap_wallet(resp)
    return int(data.get("balance_after", 0))


async def refund(user_id: int, amount: int, reason: str,
                 original_request_id: str, request_id: str | None = None) -> bool:
    """退款并返回是否成功；失败只记日志，不阻断主流程。"""
    if amount <= 0 or not original_request_id:
        return False
    rid = request_id or new_request_id()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.post(
                f"{ac.BASE_URL}/api/internal/wallet/refund",
                json={"user_id": user_id, "amount": amount, "reason": reason,
                      "request_id": rid, "original_request_id": original_request_id},
                headers={"X-Client-Id": ac.CLIENT_ID, "X-Client-Secret": ac.CLIENT_SECRET},
            )
            _unwrap_wallet(resp)
            return True
        except (httpx.HTTPError, HTTPException) as e:
            logger.warning("退款失败(忽略): user=%s amount=%s orig=%s err=%s",
                           user_id, amount, original_request_id, e)
            return False


def _unwrap_wallet(resp: httpx.Response) -> dict:
    """解包钱包响应。成功返回 data; 402/403/429 等按 HTTP 状态码透传。"""
    try:
        env = resp.json()
    except ValueError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心响应异常")
    if resp.status_code == 200 and env.get("code") == 0:
        return env.get("data") or {}
    msg = env.get("message") or "扣费失败"
    if resp.status_code == 402:
        raise HTTPException(402, msg or "余额不足")
    if resp.status_code == 403:
        raise HTTPException(403, msg or "用户已被禁用")
    if resp.status_code == 429:
        raise HTTPException(429, msg or "操作过于频繁")
    code = resp.status_code if 400 <= resp.status_code < 500 else status.HTTP_502_BAD_GATEWAY
    raise HTTPException(code, msg)
