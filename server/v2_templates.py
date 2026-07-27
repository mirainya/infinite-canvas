"""随应用发布的 V2 系统模板。"""

from copy import deepcopy


SYSTEM_TEMPLATES = [
    {
        "id": "10000000-0000-4000-8000-000000000001",
        "slug": "product-studio-set",
        "name": "商品影棚套图",
        "description": "从一张商品图生成主视觉、细节与场景图。",
        "category": "商品设计",
        "accent": "coral",
        "graph": {
            "nodes": [
                {"id": "product", "type": "image-input", "position": {"x": 0, "y": 130}, "data": {"title": "商品图"}},
                {"id": "briefs", "type": "text-collection", "position": {"x": 0, "y": 390}, "data": {"title": "画面清单", "items": ["干净影棚主视觉", "材质细节特写", "生活方式场景"]}},
                {"id": "generate", "type": "ai-image", "position": {"x": 380, "y": 220}, "data": {"title": "生成套图", "aspectRatio": "1:1", "count": 1}},
                {"id": "gallery", "type": "image-output", "position": {"x": 780, "y": 220}, "data": {"title": "套图成果"}},
            ],
            "edges": [
                {"id": "e-product", "source": "product", "target": "generate", "sourceHandle": "image", "targetHandle": "images"},
                {"id": "e-briefs", "source": "briefs", "target": "generate", "sourceHandle": "texts", "targetHandle": "prompts"},
                {"id": "e-gallery", "source": "generate", "target": "gallery", "sourceHandle": "images", "targetHandle": "images"},
            ],
        },
    },
    {
        "id": "10000000-0000-4000-8000-000000000002",
        "slug": "prompt-to-image",
        "name": "灵感生图",
        "description": "增强简短灵感并生成一组候选图。",
        "category": "灵感创作",
        "accent": "mint",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "text-input", "position": {"x": 0, "y": 180}, "data": {"title": "灵感"}},
                {"id": "enhance", "type": "prompt-enhance", "position": {"x": 340, "y": 180}, "data": {"title": "完善提示词"}},
                {"id": "generate", "type": "ai-image", "position": {"x": 680, "y": 180}, "data": {"title": "生成图像", "aspectRatio": "1:1", "count": 4}},
                {"id": "gallery", "type": "image-output", "position": {"x": 1040, "y": 180}, "data": {"title": "成果"}},
            ],
            "edges": [
                {"id": "e-idea", "source": "idea", "target": "enhance", "sourceHandle": "text", "targetHandle": "brief"},
                {"id": "e-prompt", "source": "enhance", "target": "generate", "sourceHandle": "prompt", "targetHandle": "prompt"},
                {"id": "e-output", "source": "generate", "target": "gallery", "sourceHandle": "images", "targetHandle": "images"},
            ],
        },
    },
    {
        "id": "10000000-0000-4000-8000-000000000003",
        "slug": "storyboard-grid",
        "name": "分镜切分",
        "description": "生成完整分镜图并切分为独立画面。",
        "category": "内容创作",
        "accent": "lemon",
        "graph": {
            "nodes": [
                {"id": "script", "type": "text-input", "position": {"x": 0, "y": 180}, "data": {"title": "分镜描述"}},
                {"id": "generate", "type": "ai-image", "position": {"x": 350, "y": 180}, "data": {"title": "生成分镜", "aspectRatio": "16:9", "count": 1}},
                {"id": "split", "type": "image-split", "position": {"x": 700, "y": 180}, "data": {"title": "切分画面", "rows": 2, "columns": 3}},
                {"id": "gallery", "type": "image-output", "position": {"x": 1050, "y": 180}, "data": {"title": "独立分镜"}},
            ],
            "edges": [
                {"id": "e-script", "source": "script", "target": "generate", "sourceHandle": "text", "targetHandle": "prompt"},
                {"id": "e-image", "source": "generate", "target": "split", "sourceHandle": "image", "targetHandle": "image"},
                {"id": "e-gallery", "source": "split", "target": "gallery", "sourceHandle": "images", "targetHandle": "images"},
            ],
        },
    },
]


def list_system_templates() -> list[dict]:
    return deepcopy(SYSTEM_TEMPLATES)


def get_system_template(template_id: str) -> dict | None:
    return next((deepcopy(item) for item in SYSTEM_TEMPLATES if item["id"] == template_id), None)
