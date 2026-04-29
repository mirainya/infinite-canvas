"""AI 生图节点 — 支持文生图和以图生图。"""

import json
import logging

from api_client import submit_and_poll

logger = logging.getLogger(__name__)

NODE_DEF = {
    "def_id": "image-gen",
    "name": "AI 生图",
    "category": "生成",
    "inputs": [{"id": "image", "label": "参考图(可选)", "type": "IMAGE"}],
    "outputs": [{"id": "image", "label": "图片", "type": "IMAGE"}],
    "controls": [
        {"kind": "imageUploadMulti", "id": "ref_images", "label": "参考图(可选)", "max": 5},
        {"kind": "text", "id": "prompt", "label": "提示词", "multiline": True, "placeholder": "描述你想生成的图片..."},
        {"kind": "text", "id": "negative_prompt", "label": "反向提示词", "placeholder": "不想出现的内容"},
        {"kind": "select", "id": "aspect_ratio", "label": "比例", "options": ["1:1", "2:3", "3:2", "9:16", "16:9"], "default": "1:1"},
    ],
}


def _collect_image_urls(inputs: dict, controls: dict) -> list[str]:
    """合并连线输入和控件上传的参考图 URL。"""
    urls: list[str] = []

    ref_input = inputs.get("image")
    if ref_input and isinstance(ref_input, str):
        urls.append(ref_input)

    raw = controls.get("ref_images") or ""
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                urls.extend(u for u in parsed if isinstance(u, str) and u.strip())
        except json.JSONDecodeError:
            if raw.startswith("http"):
                urls.append(raw)

    return urls


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置 API 来源，请先在设置中添加")

    prompt = (controls.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("提示词不能为空")

    body: dict = {
        "prompt": prompt,
        "negative_prompt": (controls.get("negative_prompt") or "").strip() or "blurry, low quality, watermark, text, logo",
        "aspect_ratio": controls.get("aspect_ratio") or "1:1",
    }

    image_urls = _collect_image_urls(inputs, controls)
    if image_urls:
        body["image_urls"] = image_urls

    return await submit_and_poll(
        context["http_client"],
        source,
        body,
        label="生图",
    )
