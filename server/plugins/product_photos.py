"""商品套图节点 — 逐步执行模板 steps，每步用户审核，最后批量生图。"""

import asyncio
import json
import logging
import re

import httpx

from api_client import submit_and_poll
from db import get_pool

logger = logging.getLogger(__name__)

_CHAT_ATTEMPTS = 2
_CHAT_TIMEOUT_SECONDS = 240.0
_IMAGE_CONCURRENCY = 4

NODE_DEF = {
    "def_id": "product-photos",
    "name": "商品套图",
    "category": "生成",
    "inputs": [{"id": "image", "label": "商品参考图(可选)", "type": "IMAGE"}],
    "outputs": [
        {"id": "images", "label": "图片列表", "type": "IMAGE_LIST"},
        {"id": "prompts", "label": "提示词列表", "type": "STRING"},
    ],
    "controls": [
        {"kind": "model", "id": "chat_model", "label": "文案模型", "modelType": "chat"},
        {"kind": "model", "id": "image_model", "label": "图片模型", "modelType": "image"},
        {"kind": "text", "id": "description", "label": "商品描述", "multiline": True, "placeholder": "描述商品特点、风格、场景要求..."},
        {"kind": "number", "id": "count", "label": "生成数量", "default": 15, "min": 1, "max": 30},
        {"kind": "select", "id": "aspect_ratio", "label": "比例", "options": ["1:1", "2:3", "3:2", "9:16", "16:9"], "default": "2:3"},
        {"kind": "template", "id": "template_id", "label": "提示词模板"},
    ],
}

JSON_FORMAT_SUFFIX = (
    "\n\n【输出格式要求】请严格以JSON数组格式输出，每个元素是一条纯英文提示词字符串。"
    '示例：["prompt one here", "prompt two here"]'
    "\n只输出JSON数组，不要任何其他内容。"
)

DEFAULT_STEPS = [
    {
        "order": 1,
        "name": "生成图片提示词",
        "system_prompt": (
            "你是资深电商视觉策划与AI生图提示词设计师。"
            "请基于用户的商品描述，生成一组可直接用于AI图像生成工具的英文提示词。"
            "每条提示词应包含：商品主体描述、场景/背景、光线、构图、摄影风格。"
            "不同图片应覆盖：主图白底、场景图、细节特写、模特上身、生活方式等不同角度。"
        ),
        "user_template": "商品描述：{description}\n请生成{count}张不同场景/角度的商品图英文提示词。",
    }
]


async def _chat(client: httpx.AsyncClient, source: dict, model: str,
                system: str, user: str, image_urls: list[str] | None = None) -> str:
    base_url = source["base_url"].rstrip("/")
    if image_urls:
        user_content = [{"type": "text", "text": user}]
        for url in image_urls:
            user_content.append({"type": "image_url", "image_url": {"url": url}})
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]
    else:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    for attempt in range(_CHAT_ATTEMPTS):
        try:
            logger.info("商品套图: _chat attempt=%d model=%s msg_len=%d",
                        attempt, model, len(system) + len(user))
            resp = await asyncio.wait_for(
                client.post(
                    f"{base_url}/v1/chat/completions",
                    json={"model": model, "messages": messages},
                    headers={"Authorization": source["token"],
                             "Content-Type": "application/json"},
                ),
                timeout=_CHAT_TIMEOUT_SECONDS,
            )
        except (asyncio.TimeoutError, httpx.TimeoutException):
            logger.warning("商品套图: 请求超时 attempt=%d", attempt)
            if attempt < _CHAT_ATTEMPTS - 1:
                await asyncio.sleep(3)
                continue
            raise RuntimeError("LLM 请求超时")
        if resp.status_code >= 500:
            if attempt < _CHAT_ATTEMPTS - 1:
                await asyncio.sleep(3)
                continue
            raise RuntimeError(f"LLM 服务错误(HTTP {resp.status_code})，请稍后重试")
        if resp.status_code >= 400:
            raise RuntimeError(f"LLM 请求失败(HTTP {resp.status_code}): {resp.text[:200]}")
        break
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _parse_prompts(text: str) -> list[str]:
    """从 LLM 输出中解析提示词列表。"""
    json_match = re.search(r'\[[\s\S]*\]', text)
    if json_match:
        try:
            parsed = json.loads(json_match.group())
            if isinstance(parsed, list) and parsed:
                return [str(p).strip() for p in parsed if str(p).strip()]
        except json.JSONDecodeError:
            pass
    lines = re.split(r"\n\d+[\.\)、]\s*", "\n" + text)
    prompts = [l.strip() for l in lines if l.strip() and len(l.strip()) > 20 and not l.strip().startswith("#")]
    if prompts:
        return prompts
    parts = re.split(r"\n\s*\n", text)
    return [p.strip() for p in parts if p.strip() and len(p.strip()) > 20 and not p.strip().startswith("#")]


EXTRACT_SYSTEM = (
    "从用户提供的内容中提取所有AI绘图正向提示词（英文prompt部分）。"
    "以JSON数组格式返回，每个元素是一条纯英文提示词字符串。"
    "只输出JSON数组，不要任何其他内容。不要输出空数组。"
)


async def _load_steps(template_id: int | None, user_id: int) -> list[dict]:
    if not template_id:
        return DEFAULT_STEPS
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT steps FROM prompt_templates WHERE id = $1 AND (user_id = $2 OR is_public = TRUE)",
        template_id, user_id,
    )
    if not row:
        logger.warning("模板 %d 不存在，使用默认", template_id)
        return DEFAULT_STEPS
    steps = row["steps"]
    if isinstance(steps, str):
        steps = json.loads(steps)
    return sorted(steps, key=lambda s: s.get("order", 0))


async def _phase_load_steps(controls: dict, context: dict) -> dict:
    """加载模板步骤信息（不调 LLM）。"""
    template_id = int(controls["template_id"]) if controls.get("template_id") else None
    user_id = context.get("user_id", 0)
    steps = await _load_steps(template_id, user_id)
    return {
        "steps": [{"name": s.get("name", f"步骤{i+1}")} for i, s in enumerate(steps)],
        "total": len(steps),
    }


async def _phase_step(inputs: dict, controls: dict, context: dict) -> dict:
    """执行单个模板步骤。"""
    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置棱镜连接，请在系统配置中设置")

    description = (controls.get("description") or "").strip()
    if not description:
        raise RuntimeError("请输入商品描述")

    count = max(1, min(int(controls.get("count") or 15), 30))
    chat_model = controls.get("chat_model") or "doubao-seed-2-0-pro"
    template_id = int(controls["template_id"]) if controls.get("template_id") else None
    user_id = context.get("user_id", 0)
    step_index = int(controls.get("step_index", 0))
    prev_output = controls.get("prev_output") or ""

    steps = await _load_steps(template_id, user_id)
    if not steps:
        raise RuntimeError("模板无有效步骤")
    if step_index >= len(steps):
        raise RuntimeError(f"步骤索引 {step_index} 超出范围（共 {len(steps)} 步）")

    step = steps[step_index]
    is_last = step_index == len(steps) - 1

    # 最后一步追加 JSON 格式要求
    system_prompt = step["system_prompt"]
    if is_last:
        system_prompt += JSON_FORMAT_SUFFIX

    fmt_vars = {"description": description, "count": count, "prev_output": prev_output}
    try:
        user_msg = step["user_template"].format_map(
            {**fmt_vars, **{k: f"{{{k}}}" for k in
             set(re.findall(r"\{(\w+)\}", step["user_template"])) - fmt_vars.keys()}}
        )
    except (KeyError, ValueError):
        user_msg = step["user_template"]

    client = context["http_client"]
    ref_image = inputs.get("image")
    step_images = [ref_image] if ref_image else None

    logger.info("商品套图(step): 执行 Step %d/%d [%s]", step_index + 1, len(steps), step.get("name", ""))
    output = await _chat(client, source, chat_model, system_prompt, user_msg, image_urls=step_images)
    logger.info("商品套图(step): Step %d 完成, 输出长度=%d", step_index + 1, len(output))

    result: dict = {
        "step_output": output,
        "step_name": step.get("name", f"步骤{step_index + 1}"),
    }

    # 最后一步：解析提示词
    if is_last:
        prompts = _parse_prompts(output)[:count]
        if not prompts:
            extract_result = await _chat(client, source, chat_model, EXTRACT_SYSTEM, output)
            prompts = _parse_prompts(extract_result)[:count]
        if prompts:
            result["prompts_list"] = prompts
            logger.info("商品套图(step): 最后一步解析到 %d 条提示词", len(prompts))
        else:
            logger.warning("商品套图(step): 最后一步未能解析出提示词")

    return result


async def _phase_images(inputs: dict, controls: dict, context: dict) -> dict:
    """使用用户审核后的提示词批量生图。"""
    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置棱镜连接，请在系统配置中设置")

    raw = controls.get("prompts_list") or "[]"
    if isinstance(raw, str):
        try:
            prompts = json.loads(raw)
        except json.JSONDecodeError:
            prompts = []
    elif isinstance(raw, list):
        prompts = raw
    else:
        prompts = []

    prompts = [p.strip() for p in prompts if isinstance(p, str) and p.strip()]
    if not prompts:
        raise RuntimeError("提示词列表为空，请先生成或手动添加提示词")

    image_model = controls.get("image_model") or None
    aspect_ratio = controls.get("aspect_ratio") or "2:3"

    client = context["http_client"]
    ref_image = inputs.get("image")

    logger.info("商品套图(生图): %d 条提示词，开始生图...", len(prompts))

    semaphore = asyncio.Semaphore(_IMAGE_CONCURRENCY)

    async def generate_one(index: int, prompt: str):
        body: dict = {
            "prompt": prompt,
            "negative_prompt": "blurry, low quality, watermark, text, logo, deformed",
            "aspect_ratio": aspect_ratio,
        }
        if ref_image:
            body["image_urls"] = [ref_image]
        async with semaphore:
            return await submit_and_poll(
                client, source, body,
                capability=image_model,
                label=f"套图[{index + 1}/{len(prompts)}]",
            )

    tasks = []
    for i, prompt in enumerate(prompts):
        tasks.append(generate_one(i, prompt))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    images = []
    for r in results:
        if isinstance(r, dict) and r.get("image"):
            images.append(r["image"])
        elif isinstance(r, Exception):
            logger.warning("套图部分失败: %s", r)

    if not images:
        raise RuntimeError("所有生图任务均失败")

    return {"images": images, "prompts": json.dumps(prompts, ensure_ascii=False), "_generated_count": len(images)}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    phase = (controls.get("phase") or "load_steps").strip()
    if phase == "load_steps":
        return await _phase_load_steps(controls, context)
    if phase == "step":
        return await _phase_step(inputs, controls, context)
    if phase == "images":
        return await _phase_images(inputs, controls, context)
    raise RuntimeError(f"未知 phase: {phase}")
