"""V2 工作流图定义、校验和执行顺序。"""

from collections import defaultdict, deque
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


NODE_PORTS: dict[str, dict[str, dict[str, set[str]]]] = {
    "image-input": {"inputs": {}, "outputs": {"image": {"image"}}},
    "text-input": {"inputs": {}, "outputs": {"text": {"text"}}},
    "image-collection": {
        "inputs": {"images": {"image", "image-list"}},
        "outputs": {"image": {"image"}, "images": {"image-list"}},
    },
    "text-collection": {
        "inputs": {"texts": {"text", "text-list"}},
        "outputs": {"text": {"text"}, "texts": {"text-list"}},
    },
    "ai-image": {
        "inputs": {
            "prompt": {"text"},
            "prompts": {"text-list"},
            "images": {"image", "image-list"},
            "mask": {"image"},
        },
        "outputs": {"image": {"image"}, "images": {"image-list"}},
    },
    "text-generation": {
        "inputs": {
            "instruction": {"text"},
            "content": {"text", "text-list"},
            "images": {"image", "image-list"},
        },
        "outputs": {"text": {"text"}},
    },
    "prompt-enhance": {
        "inputs": {"brief": {"text", "text-list"}, "images": {"image", "image-list"}},
        "outputs": {"prompt": {"text"}, "prompts": {"text-list"}},
    },
    "image-split": {
        "inputs": {"image": {"image"}},
        "outputs": {"images": {"image-list"}},
    },
    "image-output": {"inputs": {"images": {"image", "image-list"}}, "outputs": {}},
    "text-output": {"inputs": {"texts": {"text", "text-list"}}, "outputs": {}},
}

NODE_TYPES = frozenset(NODE_PORTS)


class Point(BaseModel):
    x: float = 0
    y: float = 0


class GraphNode(BaseModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    type: str
    position: Point = Field(default_factory=Point)
    data: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str = Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9_-]+$")
    source: str
    target: str
    source_handle: str = Field(alias="sourceHandle")
    target_handle: str = Field(alias="targetHandle")

    model_config = {"populate_by_name": True}


class GraphSnapshot(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list, max_length=2000)
    edges: list[GraphEdge] = Field(default_factory=list, max_length=5000)

    @model_validator(mode="after")
    def validate_graph(self):
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("节点 ID 不能重复")
        edge_ids = [edge.id for edge in self.edges]
        if len(edge_ids) != len(set(edge_ids)):
            raise ValueError("连线 ID 不能重复")

        nodes = {node.id: node for node in self.nodes}
        for node in self.nodes:
            if node.type not in NODE_TYPES:
                raise ValueError(f"不支持的节点类型: {node.type}")

        for edge in self.edges:
            source = nodes.get(edge.source)
            target = nodes.get(edge.target)
            if not source or not target:
                raise ValueError(f"连线引用了不存在的节点: {edge.id}")
            if edge.source == edge.target:
                raise ValueError("节点不能连接自身")
            source_types = NODE_PORTS[source.type]["outputs"].get(edge.source_handle)
            target_types = NODE_PORTS[target.type]["inputs"].get(edge.target_handle)
            if not source_types or not target_types:
                raise ValueError(f"连线端口不存在: {edge.id}")
            if source_types.isdisjoint(target_types):
                raise ValueError(f"连线数据类型不兼容: {edge.id}")

        topological_order(self)
        return self


class Viewport(BaseModel):
    x: float = 0
    y: float = 0
    zoom: float = Field(default=1, ge=0.05, le=4)


class ProjectCreate(BaseModel):
    name: str = Field(default="未命名项目", min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    graph: GraphSnapshot = Field(default_factory=GraphSnapshot)
    viewport: Viewport = Field(default_factory=Viewport)
    settings: dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    revision: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    graph: GraphSnapshot
    viewport: Viewport = Field(default_factory=Viewport)
    settings: dict[str, Any] = Field(default_factory=dict)
    reason: Literal["auto", "manual", "run", "restore"] = "auto"


class ProjectPatch(BaseModel):
    revision: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    upsert_nodes: list[GraphNode] = Field(default_factory=list, max_length=2000)
    delete_node_ids: list[str] = Field(default_factory=list, max_length=2000)
    upsert_edges: list[GraphEdge] = Field(default_factory=list, max_length=5000)
    delete_edge_ids: list[str] = Field(default_factory=list, max_length=5000)
    viewport: Viewport | None = None


def topological_order(graph: GraphSnapshot) -> list[str]:
    """返回稳定拓扑顺序；环路会被拒绝。"""
    indegree = {node.id: 0 for node in graph.nodes}
    outgoing: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        outgoing[edge.source].append(edge.target)
        indegree[edge.target] += 1

    ready = deque(node.id for node in graph.nodes if indegree[node.id] == 0)
    ordered: list[str] = []
    while ready:
        node_id = ready.popleft()
        ordered.append(node_id)
        for target in outgoing[node_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)

    if len(ordered) != len(graph.nodes):
        raise ValueError("工作流不能包含循环连线")
    return ordered
