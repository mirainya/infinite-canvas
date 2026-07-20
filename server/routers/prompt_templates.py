"""提示词模板 CRUD + 通过 meta-prompt 生成模板。"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx

from auth import get_current_user
from db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prompt-templates", tags=["prompt-templates"])

METAPROMPT_BASE = "https://metaprompt.mirainya.icu"


# ── Models ──

class TemplateStep(BaseModel):
    order: int
    name: str
    system_prompt: str
    user_template: str = "{description}"


class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    steps: list[TemplateStep]
    is_public: bool = False


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    steps: list[TemplateStep] | None = None
    is_public: bool | None = None


class GenerateRequest(BaseModel):
    input: str
    model: str | None = None


# ── Generate (调用 meta-prompt，返回模板 steps 但不保存) ──

@router.post("/generate")
async def generate_template(body: GenerateRequest, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT value FROM system_config WHERE key = 'metaprompt_api_key'")
    if not row or not row["value"]:
        raise HTTPException(500, "未配置 meta-prompt API Key")

    api_key = row["value"]
    model_row = await pool.fetchrow("SELECT value FROM system_config WHERE key = 'metaprompt_model'")
    default_model = (model_row["value"] if model_row and model_row["value"] else "claude-sonnet-4-6")

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        resp = await client.post(
            f"{METAPROMPT_BASE}/open/v1/generate",
            json={"input": body.input, "model": body.model or default_model},
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        )
        if resp.status_code == 402:
            raise HTTPException(402, "meta-prompt 积分不足")
        resp.raise_for_status()
        data = resp.json()

        task_id = data.get("task_id")
        if task_id:
            for _ in range(120):
                await asyncio.sleep(3)
                r = await client.get(
                    f"{METAPROMPT_BASE}/open/v1/tasks/{task_id}",
                    headers={"X-API-Key": api_key},
                )
                r.raise_for_status()
                data = r.json()
                if data["status"] == "done":
                    break
                if data["status"] in ("failed", "error"):
                    raise HTTPException(500, f"meta-prompt 失败: {data.get('error')}")
            else:
                raise HTTPException(504, "meta-prompt 超时")

    gen_output = data.get("generator_output", [])
    if not isinstance(gen_output, list) or not gen_output:
        raise HTTPException(500, "meta-prompt 未返回有效结果")

    # 转换为 steps
    steps = []
    for i, item in enumerate(gen_output):
        steps.append({
            "order": item.get("order", i + 1),
            "name": item.get("name", f"步骤{i+1}"),
            "system_prompt": item.get("prompt_text", ""),
            "user_template": _infer_user_template(i, len(gen_output)),
        })

    return {"steps": steps}


def _infer_user_template(index: int, total: int) -> str:
    """根据 step 位置推断 user_template。"""
    if index == 0:
        return "商品描述：{description}\n需要生成{count}张不同场景/角度的商品图。"
    elif index == total - 1:
        return "{prev_output}\n\n请为每张图生成详细的英文图片生成提示词，用编号列表输出，共{count}张。"
    else:
        return "{prev_output}"


# ── CRUD ──

@router.get("")
async def list_templates(user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user["sub"])
    rows = await pool.fetch(
        "SELECT id, name, description, is_public, created_at FROM prompt_templates "
        "WHERE user_id = $1 OR is_public = TRUE ORDER BY created_at DESC",
        user_id,
    )
    return [dict(r) for r in rows]


@router.post("")
async def create_template(body: TemplateCreate, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user["sub"])
    steps_json = json.dumps([s.model_dump() for s in body.steps], ensure_ascii=False)
    row = await pool.fetchrow(
        "INSERT INTO prompt_templates (user_id, name, description, steps, is_public) "
        "VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id, created_at",
        user_id, body.name, body.description, steps_json, body.is_public,
    )
    return {"id": row["id"], "created_at": row["created_at"]}


@router.get("/{template_id}")
async def get_template(template_id: int, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user["sub"])
    row = await pool.fetchrow(
        "SELECT * FROM prompt_templates WHERE id = $1 AND (user_id = $2 OR is_public = TRUE)",
        template_id, user_id,
    )
    if not row:
        raise HTTPException(404, "模板不存在")
    result = dict(row)
    result["steps"] = json.loads(result["steps"]) if isinstance(result["steps"], str) else result["steps"]
    return result


@router.put("/{template_id}")
async def update_template(template_id: int, body: TemplateUpdate, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user["sub"])
    row = await pool.fetchrow(
        "SELECT id FROM prompt_templates WHERE id = $1 AND user_id = $2",
        template_id, user_id,
    )
    if not row:
        raise HTTPException(404, "模板不存在或无权修改")

    updates, params = [], []
    idx = 1
    if body.name is not None:
        updates.append(f"name = ${idx}")
        params.append(body.name)
        idx += 1
    if body.description is not None:
        updates.append(f"description = ${idx}")
        params.append(body.description)
        idx += 1
    if body.steps is not None:
        updates.append(f"steps = ${idx}::jsonb")
        params.append(json.dumps([s.model_dump() for s in body.steps], ensure_ascii=False))
        idx += 1
    if body.is_public is not None:
        updates.append(f"is_public = ${idx}")
        params.append(body.is_public)
        idx += 1

    if updates:
        params.append(template_id)
        await pool.execute(
            f"UPDATE prompt_templates SET {', '.join(updates)} WHERE id = ${idx}",
            *params,
        )
    return {"ok": True}


@router.delete("/{template_id}")
async def delete_template(template_id: int, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    user_id = int(user["sub"])
    result = await pool.execute(
        "DELETE FROM prompt_templates WHERE id = $1 AND user_id = $2",
        template_id, user_id,
    )
    if result == "DELETE 0":
        raise HTTPException(404, "模板不存在或无权删除")
    return {"ok": True}
