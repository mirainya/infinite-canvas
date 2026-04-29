"""图片预览节点 — 纯展示，接收上游图片并大面积显示。"""

NODE_DEF = {
    "def_id": "image-preview",
    "name": "图片预览",
    "category": "工具",
    "view": "image-preview",
    "inputs": [{"id": "image", "label": "图片", "type": "IMAGE"}],
    "outputs": [],
    "controls": [],
}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    return {}
