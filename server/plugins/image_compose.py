"""AI 合成节点 — 将素材图合成到底图上，用掩码指定放置位置。"""

import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from api_client import submit_and_poll
from xfs import upload_data_uri

logger = logging.getLogger(__name__)

NODE_DEF = {
    "def_id": "image-compose",
    "name": "AI 合成",
    "category": "生成",
    "view": "image-compose",
    "inputs": [
        {"id": "foreground", "label": "素材图", "type": "IMAGE"},
        {"id": "background", "label": "底图", "type": "IMAGE"},
    ],
    "outputs": [{"id": "image", "label": "图片", "type": "IMAGE"}],
    "controls": [
        {"kind": "imageEdit", "id": "edit_area", "label": "放置区域"},
        {"kind": "text", "id": "edit_prompt", "label": "合成提示词", "multiline": True, "placeholder": "描述合成效果，如：自然融合到背景中"},
    ],
}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置 API 来源，请先在设置中添加")

    fg = inputs.get("foreground")
    bg = inputs.get("background")
    if not fg or not bg:
        raise RuntimeError("素材图和底图都不能为空")

    client = context["http_client"]
    prompt = (controls.get("edit_prompt") or "").strip() or "将素材自然合成到掩码指定的区域"

    mask_data = controls.get("edit_area") or None
    mask_url = None
    if mask_data and isinstance(mask_data, str):
        try:
            mask_url = await upload_data_uri(client, mask_data, "infinite-canvas/mask")
        except Exception as e:
            logger.warning("mask 上传失败: %s", e)

    image_urls = [bg, fg]
    if mask_url:
        image_urls.append(mask_url)

    return await submit_and_poll(
        client,
        source,
        {
            "prompt": prompt,
            "negative_prompt": "blurry, low quality, watermark, text, logo",
            "image_urls": image_urls,
        },
        label="合成",
    )
