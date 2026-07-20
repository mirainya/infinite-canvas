"""LLM 对话节点 — 调用 chat completions API，支持系统提示词和用户消息。"""

import logging

logger = logging.getLogger(__name__)

NODE_DEF = {
    "def_id": "llm-chat",
    "name": "LLM 对话",
    "category": "工具",
    "inputs": [
        {"id": "system_prompt", "label": "系统提示词", "type": "STRING"},
        {"id": "user_message", "label": "用户消息", "type": "STRING"},
    ],
    "outputs": [{"id": "text", "label": "输出文本", "type": "STRING"}],
    "controls": [
        {"kind": "model", "id": "model", "label": "模型", "modelType": "chat"},
        {"kind": "text", "id": "system_prompt", "label": "系统提示词", "multiline": True, "placeholder": "设定AI角色和任务..."},
        {"kind": "text", "id": "user_message", "label": "用户消息", "multiline": True, "placeholder": "输入消息内容..."},
    ],
}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置棱镜连接，请在系统配置中设置")

    system_prompt = inputs.get("system_prompt") or controls.get("system_prompt") or ""
    user_message = inputs.get("user_message") or controls.get("user_message") or ""
    if not user_message.strip():
        raise RuntimeError("用户消息不能为空")

    base_url = source["base_url"].rstrip("/")
    token = source["token"]
    model = controls.get("model") or "doubao-seed-2-0-pro"

    messages = []
    if system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt.strip()})
    messages.append({"role": "user", "content": user_message.strip()})

    client = context["http_client"]
    resp = await client.post(
        f"{base_url}/v1/chat/completions",
        json={"model": model, "messages": messages},
        headers={"Authorization": token, "Content-Type": "application/json"},
    )
    resp.raise_for_status()
    data = resp.json()

    content = ""
    choices = data.get("choices", [])
    if choices:
        content = choices[0].get("message", {}).get("content", "")

    if not content:
        raise RuntimeError("LLM 未返回内容")

    result: dict = {"text": content}
    usage = data.get("usage")
    if usage:
        result["_usage"] = {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        }
    return result
