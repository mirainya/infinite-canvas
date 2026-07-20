"""文本框节点 — 可手动编辑或接收上游文本，输出给下游。"""

NODE_DEF = {
    "def_id": "text-box",
    "name": "文本框",
    "category": "工具",
    "view": "text-box",
    "inputs": [{"id": "text", "label": "文本", "type": "STRING"}],
    "outputs": [{"id": "text", "label": "文本", "type": "STRING"}],
    "controls": [
        {"kind": "text", "id": "content", "label": "内容", "multiline": True, "placeholder": "输入或接收文本..."},
    ],
}


async def process(inputs: dict, controls: dict, context: dict) -> dict:
    text = inputs.get("text") or controls.get("content") or ""
    return {"text": text}
