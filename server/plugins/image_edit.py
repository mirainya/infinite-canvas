"""AI 改图节点 — 支持擦除/替换/添加/扣图操作。"""

import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from api_client import submit_and_poll
from xfs import upload_data_uri

logger = logging.getLogger(__name__)

NODE_DEF = {
    "def_id": "image-edit",
    "name": "AI 改图",
    "category": "生成",
    "inputs": [{"id": "image", "label": "原图", "type": "IMAGE"}],
    "outputs": [{"id": "image", "label": "图片", "type": "IMAGE"}],
    "controls": [
        {"kind": "imageEdit", "id": "edit_area", "label": "编辑区域"},
        {"kind": "text", "id": "edit_prompt", "label": "修改提示词", "multiline": True, "placeholder": "描述要如何修改..."},
    ],
}

ACTION_LABELS = {
    "erase": "擦除",
    "replace": "替换",
    "add": "添加",
    "extract": "扣图",
}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    source = context.get("api_source")
    if not source:
        raise RuntimeError("未配置 API 来源，请先在设置中添加")

    client = context["http_client"]
    action = (controls.get("action") or "replace").strip()
    prompt = (controls.get("edit_prompt") or controls.get("prompt") or "").strip()
    mask_data = controls.get("mask") or None

    mask_url = None
    if mask_data and isinstance(mask_data, str):
        try:
            mask_url = await upload_data_uri(client, mask_data, "infinite-canvas/mask")
        except Exception as e:
            logger.warning("mask 上传失败: %s", e)

    if action not in ("erase", "extract") and not prompt:
        raise RuntimeError("提示词不能为空")

    input_image = inputs.get("image")
    image_urls = [input_image] if input_image else []
    if mask_url:
        image_urls.append(mask_url)

    body: dict = {
        "prompt": prompt or ("remove the selected area, fill with background" if action == "erase" else "extract the selected element"),
        "negative_prompt": "blurry, low quality, watermark, text, logo",
    }
    if image_urls:
        body["image_urls"] = image_urls

    action_label = ACTION_LABELS.get(action, action)
    return await submit_and_poll(client, source, body, label=action_label)
