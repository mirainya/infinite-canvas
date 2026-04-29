"""Meta Prompt — 视觉分析图片，自动生成改图提示词。"""

import logging
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
import httpx

from db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["meta-prompt"])

# ── 分析提示词模板 ──────────────────────────────────────────

ANALYSIS_SYSTEM = """你是一个专业的图像分析助手。请仔细观察用户提供的图片，输出以下信息：
1. 图片整体描述（场景、风格、色调）
2. 图片中的主要元素列表（每个元素的位置、外观、大小）
3. 图片的背景描述"""

ACTION_TEMPLATES = {
    "replace": """基于上面的图片分析，用户选中了图片中的一个区域想要替换它。
请根据图片上下文，生成一段英文提示词，描述用什么内容替换选中区域最合适。
要求：
- 替换内容要与周围环境协调
- 提示词要具体（包含颜色、材质、风格等细节）
- 只输出提示词本身，不要解释

输出格式：
PROMPT: <你生成的英文提示词>""",

    "add": """基于上面的图片分析，用户选中了图片中的一个空白区域想要添加新元素。
请根据图片上下文，生成一段英文提示词，描述在选中区域添加什么元素最合适。
要求：
- 添加的元素要与画面风格一致
- 提示词要具体（包含颜色、材质、风格等细节）
- 只输出提示词本身，不要解释

输出格式：
PROMPT: <你生成的英文提示词>""",

    "extract": """基于上面的图片分析，用户选中了图片中的一个元素想要扣取出来。
请根据图片内容，生成一段英文提示词，精确描述选中区域的元素是什么。
要求：
- 描述要精确到具体物体
- 包含颜色、形状、材质等特征
- 只输出提示词本身，不要解释

输出格式：
PROMPT: <你生成的英文提示词>""",
}


class MetaPromptRequest(BaseModel):
    image_url: str
    action: str = "replace"
    source_id: int | None = None


class MetaPromptResponse(BaseModel):
    analysis: str
    prompt: str


async def _get_source(source_id: int | None) -> dict | None:
    pool = await get_pool()
    if source_id is not None:
        row = await pool.fetchrow("SELECT * FROM api_sources WHERE id = $1", source_id)
    else:
        row = await pool.fetchrow("SELECT * FROM api_sources WHERE is_default = TRUE LIMIT 1")
    return dict(row) if row else None


def _extract_content(resp_body: dict) -> str:
    """从 chat completions 响应中提取文本内容。"""
    try:
        choices = resp_body.get("choices", [])
        if choices:
            message = choices[0].get("message", {})
            return message.get("content", "")
    except Exception:
        pass
    return str(resp_body)


def _extract_prompt(text: str) -> str:
    """从分析结果中提取 PROMPT: 后面的内容。"""
    for line in text.splitlines():
        line = line.strip()
        if line.upper().startswith("PROMPT:"):
            return line[7:].strip()
    # fallback: 返回最后一段非空文本
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    return lines[-1] if lines else text


@router.post("/meta-prompt", response_model=MetaPromptResponse)
async def generate_meta_prompt(body: MetaPromptRequest):
    source = await _get_source(body.source_id)
    if not source:
        raise HTTPException(400, "未配置 API 来源")

    base_url = source["base_url"].rstrip("/")
    token = source["token"]
    chat_model = source.get("chat_model") or "gemini-3-pro-preview"

    action_template = ACTION_TEMPLATES.get(body.action)
    if not action_template:
        raise HTTPException(400, f"不支持的操作类型: {body.action}")

    url = f"{base_url}/v1/chat/completions"
    headers = {"Authorization": token, "Content-Type": "application/json"}

    # ── 第1轮：分析图片 ──
    messages_round1 = [
        {"role": "system", "content": ANALYSIS_SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "请分析这张图片："},
                {"type": "image_url", "image_url": {"url": body.image_url}},
            ],
        },
    ]

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        logger.info("meta-prompt 第1轮：分析图片 model=%s", chat_model)
        r1 = await client.post(url, json={
            "model": chat_model,
            "messages": messages_round1,
            "max_tokens": 1500,
            "stream": False,
        }, headers=headers)
        r1.raise_for_status()
        analysis = _extract_content(r1.json())
        conversation_id = r1.json().get("conversation_id")

        logger.info("meta-prompt 分析完成，长度=%d", len(analysis))

        # ── 第2轮：生成操作提示词 ──
        messages_round2 = [
            {"role": "user", "content": action_template},
        ]
        round2_body: dict = {
            "model": chat_model,
            "messages": messages_round2,
            "max_tokens": 500,
            "stream": False,
        }
        if conversation_id:
            round2_body["conversation_id"] = conversation_id

        logger.info("meta-prompt 第2轮：生成提示词 action=%s", body.action)
        r2 = await client.post(url, json=round2_body, headers=headers)
        r2.raise_for_status()
        raw_prompt = _extract_content(r2.json())
        prompt = _extract_prompt(raw_prompt)

        logger.info("meta-prompt 生成提示词: %s", prompt[:100])

    return MetaPromptResponse(analysis=analysis, prompt=prompt)
