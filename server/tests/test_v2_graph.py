import pytest
from pydantic import ValidationError

from v2_graph import GraphSnapshot, topological_order
from v2_templates import list_system_templates


def graph(nodes, edges):
    return GraphSnapshot.model_validate({"nodes": nodes, "edges": edges})


def test_valid_graph_has_stable_topological_order():
    snapshot = graph(
        [
            {"id": "brief", "type": "text-input"},
            {"id": "generate", "type": "ai-image"},
            {"id": "result", "type": "image-output"},
        ],
        [
            {
                "id": "edge-1",
                "source": "brief",
                "target": "generate",
                "sourceHandle": "text",
                "targetHandle": "prompt",
            },
            {
                "id": "edge-2",
                "source": "generate",
                "target": "result",
                "sourceHandle": "images",
                "targetHandle": "images",
            },
        ],
    )
    assert topological_order(snapshot) == ["brief", "generate", "result"]


def test_graph_rejects_unknown_node_type():
    with pytest.raises(ValidationError, match="不支持的节点类型"):
        graph([{"id": "legacy", "type": "image-gen"}], [])


def test_graph_rejects_incompatible_ports():
    with pytest.raises(ValidationError, match="数据类型不兼容"):
        graph(
            [
                {"id": "text", "type": "text-input"},
                {"id": "output", "type": "image-output"},
            ],
            [
                {
                    "id": "bad-edge",
                    "source": "text",
                    "target": "output",
                    "sourceHandle": "text",
                    "targetHandle": "images",
                }
            ],
        )


def test_graph_rejects_cycles():
    with pytest.raises(ValidationError, match="循环连线"):
        graph(
            [
                {"id": "a", "type": "text-collection"},
                {"id": "b", "type": "text-collection"},
            ],
            [
                {"id": "ab", "source": "a", "target": "b", "sourceHandle": "texts", "targetHandle": "texts"},
                {"id": "ba", "source": "b", "target": "a", "sourceHandle": "texts", "targetHandle": "texts"},
            ],
        )


def test_all_system_templates_are_valid_v2_graphs():
    templates = list_system_templates()
    assert len(templates) >= 3
    for template in templates:
        snapshot = GraphSnapshot.model_validate(template["graph"])
        assert topological_order(snapshot)
