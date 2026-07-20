"""账号中心对接的纯逻辑单测: 信封解包 / 钱包取整 / 身份归一。

不依赖真实账号中心(HTTP/JWKS), 只测可离线验证的纯函数。
"""
import asyncio
import os
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

os.environ.setdefault("AC_BASE_URL", "https://account.test")
os.environ.setdefault("AC_CLIENT_ID", "ic")
os.environ.setdefault("AC_CLIENT_SECRET", "secret")

import account_center as ac
import wallet
from routers import execute


# ── 钱包取整: Decimal → 正整数(向上取整) ──

@pytest.mark.parametrize("raw,expected", [
    (Decimal("0"), 0),
    (Decimal("-5"), 0),
    (Decimal("0.1"), 1),
    (Decimal("1.0"), 1),
    (Decimal("2.0001"), 3),
    (3, 3),
    (2.5, 3),
    (None, 0),
])
def test_to_int_credits(raw, expected):
    assert wallet.to_int_credits(raw) == expected


def test_new_request_id_unique():
    assert wallet.new_request_id() != wallet.new_request_id()
    assert len(wallet.new_request_id()) == 32


def test_recovery_request_id_is_stable_and_scoped():
    assert wallet.recovery_request_id("charge-1") == wallet.recovery_request_id("charge-1")
    assert wallet.recovery_request_id("charge-1") != wallet.recovery_request_id("charge-2")
    assert len(wallet.recovery_request_id("charge-1")) == 32


@pytest.mark.parametrize("def_id", sorted(execute.FREE_NODE_IDS))
@pytest.mark.asyncio
async def test_free_nodes_cost_zero(def_id):
    cost, billing_type = await execute._get_cost(def_id, {})
    assert cost == Decimal(0)
    assert billing_type == "per_call"


@pytest.mark.asyncio
async def test_ai_node_defaults_to_one_credit():
    cost, billing_type = await execute._get_cost("image-gen", {})
    assert cost == Decimal(1)
    assert billing_type == "per_call"


@pytest.mark.asyncio
async def test_refund_charge_zeroes_only_after_success(monkeypatch):
    async def success(*_args, **_kwargs):
        return True

    async def failure(*_args, **_kwargs):
        return False

    monkeypatch.setattr(wallet, "refund", success)
    assert await execute._refund_charge(3, 2, "test", "original") == 0

    monkeypatch.setattr(wallet, "refund", failure)
    assert await execute._refund_charge(3, 2, "test", "original") == 2


@pytest.mark.asyncio
async def test_recover_incomplete_tasks_refunds_recorded_charge(monkeypatch):
    class Pool:
        def __init__(self):
            self.updates = []

        async def fetch(self, *_args):
            return [{
                "id": 9,
                "def_id": "image-gen",
                "user_id": 3,
                "credits_used": Decimal("2"),
                "request_id": "charge-request",
            }]

        async def execute(self, query, *args):
            self.updates.append((query, args))

    pool = Pool()
    refund = MagicMock(return_value=True)

    async def refund_async(*args, **kwargs):
        refund(*args, **kwargs)
        return True

    async def get_pool():
        return pool

    monkeypatch.setattr(execute, "get_pool", get_pool)
    monkeypatch.setattr(wallet, "refund", refund_async)

    recovered, refunds_pending = await execute.recover_incomplete_tasks()

    assert (recovered, refunds_pending) == (1, 0)
    assert refund.call_args.kwargs["request_id"] == wallet.recovery_request_id("charge-request")
    assert pool.updates[0][1][1] == Decimal(0)


# ── 信封解包: 成功取 data, 4xx 透传状态码 ──

def _resp(status_code: int, body: dict) -> MagicMock:
    r = MagicMock()
    r.status_code = status_code
    r.json.return_value = body
    return r


def test_unwrap_success():
    data = ac._unwrap(_resp(200, {"code": 0, "data": {"x": 1}}))
    assert data == {"x": 1}


def test_unwrap_4xx_passthrough():
    with pytest.raises(HTTPException) as e:
        ac._unwrap(_resp(401, {"code": 401, "message": "未授权"}))
    assert e.value.status_code == 401


def test_unwrap_wallet_402_403_429():
    for code in (402, 403, 429):
        with pytest.raises(HTTPException) as e:
            wallet._unwrap_wallet(_resp(code, {"code": code, "message": "x"}))
        assert e.value.status_code == code


@pytest.mark.asyncio
@pytest.mark.parametrize("response,expected", [
    (_resp(200, {"code": 0, "data": {"balance_after": 3}}), True),
    (_resp(502, {"code": 502, "message": "down"}), False),
])
async def test_refund_returns_success_state(monkeypatch, response, expected):
    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return response

    monkeypatch.setattr(wallet.httpx, "AsyncClient", lambda **_kwargs: Client())
    assert await wallet.refund(3, 1, "test", "original") is expected


# ── 管理端白名单 ──

def test_is_ic_admin(monkeypatch):
    monkeypatch.setattr(ac, "ADMINS", {"alice", "bob"})
    assert ac.is_ic_admin("alice") is True
    assert ac.is_ic_admin("carol") is False


@pytest.mark.asyncio
async def test_cancel_active_task_checks_owner_and_cancels():
    ready = asyncio.Event()
    blocker = asyncio.Event()

    async def runner():
        execute._register_active_task(42, 7)
        ready.set()
        try:
            await blocker.wait()
        finally:
            execute._unregister_active_task(42)

    task = asyncio.create_task(runner())
    await ready.wait()

    assert execute.cancel_active_task(42, 8) is False
    assert execute.cancel_active_task(42, 7) is True
    with pytest.raises(asyncio.CancelledError):
        await task
    assert execute.cancel_active_task(42, 7) is False
