"""文本分割节点 — 将长文本按分隔符拆分为多条。"""

import re

NODE_DEF = {
    "def_id": "text-split",
    "name": "文本分割",
    "category": "工具",
    "inputs": [{"id": "text", "label": "文本", "type": "STRING"}],
    "outputs": [
        {"id": "texts", "label": "文本列表", "type": "STRING_LIST"},
        {"id": "count", "label": "数量", "type": "NUMBER"},
    ],
    "controls": [
        {"kind": "select", "id": "separator", "label": "分隔方式", "options": ["双换行", "换行", "编号列表", "---", "自定义"], "default": "双换行"},
        {"kind": "text", "id": "custom_sep", "label": "自定义分隔符", "placeholder": "仅在选择自定义时生效"},
    ],
}

NUMBERED_RE = re.compile(r"^\d+[\.\)、]\s*", re.MULTILINE)


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    text = inputs.get("text") or ""
    if not text.strip():
        raise RuntimeError("输入文本为空")

    sep = controls.get("separator") or "双换行"

    if sep == "双换行":
        parts = re.split(r"\n\s*\n", text)
    elif sep == "换行":
        parts = text.split("\n")
    elif sep == "编号列表":
        parts = NUMBERED_RE.split(text)
    elif sep == "---":
        parts = text.split("---")
    else:
        custom = controls.get("custom_sep") or "\n"
        parts = text.split(custom)

    parts = [p.strip() for p in parts if p.strip()]
    return {"texts": parts, "count": len(parts)}
