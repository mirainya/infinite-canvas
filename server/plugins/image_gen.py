"""AI 生图节点 — 调用棱镜等 API 来源生成图片。"""

import logging

from api_client import submit_and_poll

logger = logging.getLogger(__name__)

NODE_DEF = {
    "def_id": "image-gen",
    "name": "AI 生图",
    "category": "生成",
    "inputs": [],
    "outputs": [{"id": "image", "label": "图片", "type": "IMAGE"}],
    "controls": [
        {"kind": "text", "id": "prompt", "label": "提示词", "multiline": True, "placeholder": "描述你想生成的图片..."},
        {"kind": "text", "id": "negative_prompt", "label": "反向提示词", "placeholder": "不想出现的内容"},
        {"kind": "select", "id": "aspect_ratio", "label": "比例", "options": ["1:1", "2:3", "3:2", "9:16", "16:9"], "default": "1:1"},
    ],
}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置 API 来源，请先在设置中添加")

    prompt = (controls.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("提示词不能为空")

    return await submit_and_poll(
        context["http_client"],
        source,
        {
            "prompt": prompt,
            "negative_prompt": (controls.get("negative_prompt") or "").strip() or "blurry, low quality, watermark, text, logo",
            "aspect_ratio": controls.get("aspect_ratio") or "1:1",
        },
        label="生图",
    )
