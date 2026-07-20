"""提示词增强节点 — 调用 meta-prompt 获取系统指令，再通过 LLM 生成最终可用的图片提示词。"""

import asyncio
import logging

import httpx

from db import get_pool

logger = logging.getLogger(__name__)

METAPROMPT_BASE = "https://metaprompt.mirainya.icu"

NODE_DEF = {
    "def_id": "prompt-enhance",
    "name": "提示词增强",
    "category": "工具",
    "inputs": [
        {"id": "text", "label": "原始描述", "type": "STRING"},
    ],
    "outputs": [{"id": "text", "label": "增强提示词", "type": "STRING"}],
    "controls": [
        {"kind": "text", "id": "input_text", "label": "描述", "multiline": True, "placeholder": "输入你想生成的图片描述，如：一只猫在月光下散步"},
        {"kind": "select", "id": "llm_provider", "label": "LLM 提供商", "options": ["openai"], "default": "openai"},
        {"kind": "model", "id": "model", "label": "执行模型", "modelType": "chat"},
    ],
}


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


def _parse_system_prompt(data: dict) -> str:
    """从 meta-prompt 响应中提取系统指令。"""
    gen_output = data.get("generator_output")
    if isinstance(gen_output, list):
        texts = [item.get("prompt_text", "") for item in gen_output if isinstance(item, dict) and item.get("prompt_text")]
        if texts:
            return "\n\n---\n\n".join(texts)
    if isinstance(gen_output, str) and gen_output.strip():
        return gen_output
    return str(data)


async def _call_llm(client: httpx.AsyncClient, source: dict, model: str, system_prompt: str, user_text: str) -> str:
    """用 LLM 执行元提示词，生成最终图片 prompt。"""
    base_url = source["base_url"].rstrip("/")
    token = source["token"]
    resp = await client.post(
        f"{base_url}/v1/chat/completions",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"请根据以上指令，为以下描述生成完整的图像生成提示词：\n\n{user_text}"},
            ],
        },
        headers={"Authorization": token, "Content-Type": "application/json"},
    )
    resp.raise_for_status()
    choices = resp.json().get("choices", [])
    if not choices:
        raise RuntimeError("LLM 未返回内容")
    return choices[0].get("message", {}).get("content", "")


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    text = inputs.get("text") or controls.get("input_text") or ""
    if not text.strip():
        raise RuntimeError("请输入描述文本")

    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置棱镜连接，请在系统配置中设置")

    pool = await get_pool()
    row = await pool.fetchrow("SELECT value FROM system_config WHERE key = 'metaprompt_api_key'")
    if not row or not row["value"]:
        raise RuntimeError("未配置 meta-prompt API Key，请在管理面板设置")

    api_key = row["value"]
    model = controls.get("model") or "doubao-seed-2-0-pro"
    model_row = await pool.fetchrow("SELECT value FROM system_config WHERE key = 'metaprompt_model'")
    mp_model = (model_row["value"] if model_row and model_row["value"] else "claude-sonnet-4-6")

    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
        # Step 1: 获取元提示词
        resp = await client.post(
            f"{METAPROMPT_BASE}/open/v1/generate",
            json={"input": text.strip(), "model": mp_model},
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        )
        if resp.status_code == 402:
            raise RuntimeError("meta-prompt 积分不足")
        resp.raise_for_status()
        data = resp.json()

        task_id = data.get("task_id")
        if task_id:
            data = await _poll_task(client, api_key, task_id)

        system_prompt = _parse_system_prompt(data)
        if not system_prompt.strip():
            raise RuntimeError("meta-prompt 未返回有效指令")

        logger.info("Step1 完成，system_prompt 长度: %d，开始调用 LLM (model=%s)", len(system_prompt), model)

        # Step 2: 用 LLM 执行元提示词，生成最终 prompt
        result = await _call_llm(client, source, model, system_prompt, text.strip())
        logger.info("Step2 完成，LLM 输出长度: %d", len(result))

    if not result.strip():
        raise RuntimeError("LLM 未生成有效提示词")

    return {"text": result.strip()}
