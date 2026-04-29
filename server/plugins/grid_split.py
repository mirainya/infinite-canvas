"""九宫格切图节点 — 纯本地图片处理，不调外部 API。"""

import base64
import io
import logging
import httpx
from PIL import Image

logger = logging.getLogger(__name__)

NODE_DEF = {
    "def_id": "grid-split",
    "name": "九宫格切图",
    "category": "工具",
    "inputs": [{"id": "image", "label": "原图", "type": "IMAGE"}],
    "outputs": [{"id": "image", "label": "切图结果", "type": "IMAGE"}],
    "controls": [
        {"kind": "select", "id": "grid", "label": "网格", "options": ["3x3", "2x2", "4x4", "1x3", "3x1"], "default": "3x3"},
    ],
}


async def _to_image(src: str) -> Image.Image:
    if src.startswith("data:"):
        header, b64 = src.split(",", 1)
        return Image.open(io.BytesIO(base64.b64decode(b64)))
    async with httpx.AsyncClient() as client:
        resp = await client.get(src, timeout=60, follow_redirects=True)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content))


def _image_to_data_url(img: Image.Image, fmt: str = "PNG") -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    b64 = base64.b64encode(buf.getvalue()).decode()
    mime = "image/png" if fmt == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    src = inputs.get("image")
    if not src:
        raise RuntimeError("缺少输入图片")

    grid_str = controls.get("grid", "3x3")
    parts = grid_str.split("x")
    cols, rows = int(parts[0]), int(parts[1])

    img = await _to_image(src)
    w, h = img.size
    cell_w, cell_h = w // cols, h // rows

    # 拼成一张长图（竖排），方便前端展示
    result = Image.new("RGB", (cell_w, cell_h * rows * cols))
    idx = 0
    for r in range(rows):
        for c in range(cols):
            box = (c * cell_w, r * cell_h, (c + 1) * cell_w, (r + 1) * cell_h)
            cell = img.crop(box)
            result.paste(cell, (0, idx * cell_h))
            idx += 1

    return {"image": _image_to_data_url(result)}
