"""图片组节点 - 管理底图、素材图和多张参考图。"""

import json


NODE_DEF = {
    "def_id": "image-group",
    "name": "图片组",
    "category": "素材",
    "view": "image-group",
    "inputs": [],
    "outputs": [
        {"id": "image", "label": "当前图片", "type": "IMAGE"},
        {"id": "background", "label": "底图", "type": "IMAGE"},
        {"id": "foreground", "label": "素材", "type": "IMAGE"},
        {"id": "references", "label": "参考图", "type": "IMAGE_LIST"},
        {"id": "images", "label": "全部图片", "type": "IMAGE_LIST"},
    ],
    "controls": [
        {"kind": "text", "id": "items", "label": "图片", "default": "[]"},
        {"kind": "text", "id": "selected_id", "label": "当前图片", "default": ""},
    ],
}


def _parse_items(value) -> list[dict]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    if not isinstance(value, list):
        return []
    return [
        item for item in value
        if isinstance(item, dict) and isinstance(item.get("url"), str) and item["url"]
    ]


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    items = _parse_items(controls.get("items"))
    selected_id = controls.get("selected_id")
    selected = next((item for item in items if item.get("id") == selected_id), None)
    if selected is None and items:
        selected = items[0]

    return {
        "image": selected.get("url") if selected else None,
        "background": next((item["url"] for item in items if item.get("role") == "background"), None),
        "foreground": next((item["url"] for item in items if item.get("role") == "foreground"), None),
        "references": [item["url"] for item in items if item.get("role") == "reference"],
        "images": [item["url"] for item in items],
    }
