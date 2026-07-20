"""可用模型列表端点 — 从数据库缓存读取，管理员手动同步 Prism。"""

import json

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user, require_admin
from db import get_pool, get_config, set_config
from prism import get_prism_source

router = APIRouter(prefix="/api/models", tags=["models"])

DISABLED_MODELS_KEY = "disabled_models"
MODEL_BILLING_KEY = "model_billing"
MODEL_CACHE_KEY = "model_cache"


async def _get_disabled() -> set[str]:
    val = await get_config(DISABLED_MODELS_KEY)
    if not val:
        return set()
    try:
        return set(json.loads(val))
    except (json.JSONDecodeError, TypeError):
        return set()


async def get_model_billing() -> dict:
    """返回 {model_code: {"billing_type": "per_call", "credit_cost": 1}, ...}"""
    val = await get_config(MODEL_BILLING_KEY)
    if not val:
        return {}
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return {}


async def _get_cached_models() -> list[dict]:
    val = await get_config(MODEL_CACHE_KEY)
    if not val:
        return []
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return []


async def _fetch_from_prism() -> list[dict]:
    source = await get_prism_source()
    if not source:
        return []
    base_url = source["base_url"].rstrip("/")
    token = source["token"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{base_url}/v1/capabilities", headers={"Authorization": token})
        if resp.status_code != 200:
            return []
        data = resp.json()
    items = data.get("data") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []
    return [{"code": m["code"], "name": m.get("name", m["code"]), "type": m.get("type", "")} for m in items]


@router.post("/sync")
async def sync_models(_admin: dict = Depends(require_admin)):
    """管理员手动同步：从 Prism 拉取模型列表并缓存到数据库。"""
    items = await _fetch_from_prism()
    if not items:
        return {"ok": False, "error": "无法从 Prism 获取模型列表", "count": 0}
    await set_config(MODEL_CACHE_KEY, json.dumps(items))
    return {"ok": True, "count": len(items)}


@router.get("")
async def list_models(type: str = Query(default="", alias="type"), _user: dict = Depends(get_current_user)):
    items = await _get_cached_models()
    if not items:
        return []
    disabled = await _get_disabled()
    result = [m for m in items if m["code"] not in disabled]
    if type:
        result = [m for m in result if m.get("type") == type]
    return result


@router.get("/all")
async def list_all_models(_admin: dict = Depends(require_admin)):
    """管理员接口：返回所有模型（含禁用状态和计费）。"""
    items = await _get_cached_models()
    if not items:
        return []
    disabled = await _get_disabled()
    billing = await get_model_billing()
    return [
        {
            "code": m["code"],
            "name": m.get("name", m["code"]),
            "type": m.get("type", ""),
            "disabled": m["code"] in disabled,
            "credit_cost": billing.get(m["code"], {}).get("credit_cost", 1),
        }
        for m in items
    ]


class DisabledModelsBody(BaseModel):
    disabled: list[str]


@router.put("/disabled")
async def update_disabled_models(body: DisabledModelsBody, _admin: dict = Depends(require_admin)):
    await set_config(DISABLED_MODELS_KEY, json.dumps(body.disabled))
    return {"ok": True}


class ModelBillingBody(BaseModel):
    billing: dict[str, dict]  # {model_code: {"credit_cost": number}}


@router.get("/billing")
async def get_billing(_admin: dict = Depends(require_admin)):
    return await get_model_billing()


@router.put("/billing")
async def update_billing(body: ModelBillingBody, _admin: dict = Depends(require_admin)):
    await set_config(MODEL_BILLING_KEY, json.dumps(body.billing))
    return {"ok": True}
