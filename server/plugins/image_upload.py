"""图片上传节点 — 从本地上传图片，作为源节点输出给下游。"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from xfs import upload_data_uri

NODE_DEF = {
    "def_id": "image-upload",
    "name": "图片上传",
    "category": "工具",
    "view": "image-upload",
    "inputs": [],
    "outputs": [{"id": "image", "label": "图片", "type": "IMAGE"}],
    "controls": [{"id": "upload", "label": "上传图片", "kind": "imageUpload"}],
}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    value = controls.get("upload") or ""
    if not value:
        raise RuntimeError("请先上传图片")

    # 前端已上传拿到 URL，直接透传
    if value.startswith("http"):
        return {"image": value}

    # 兼容旧逻辑：data URI
    client = context["http_client"]
    url = await upload_data_uri(client, value, "infinite-canvas/upload")
    return {"image": url}
