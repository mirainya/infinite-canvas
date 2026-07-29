import { Graph, layout } from '@dagrejs/dagre';
import type { Edge, Node } from 'reactflow';
import type { CanvasNodeData } from './types';
import { getSpatialParentGroup, normalizeSpatialNodes } from './spatialGroups';

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 420;
const CANVAS_MARGIN = 120;
const COMPONENT_GAP_X = 180;
const COMPONENT_GAP_Y = 160;

type RootEdge = {
  id: string;
  source: string;
  target: string;
};

function numericSize(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function getNodeSize(node: Node<CanvasNodeData>) {
  return {
    width: numericSize(node.width) ?? numericSize(node.style?.width) ?? DEFAULT_NODE_WIDTH,
    height: numericSize(node.height) ?? numericSize(node.style?.height) ?? DEFAULT_NODE_HEIGHT,
  };
}

function getRootNodeId(
  nodeId: string,
  nodes: Node<CanvasNodeData>[],
): string | undefined {
  let current = nodes.find((node) => node.id === nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = getSpatialParentGroup(nodes, current);
    if (!parent) break;
    current = parent;
  }
  return current?.id;
}

function getConnectedComponents(nodeIds: string[], edges: RootEdge[]) {
  const adjacency = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) continue;
    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function layoutComponent(
  nodeIds: string[],
  edges: RootEdge[],
  sizes: Map<string, { width: number; height: number }>,
) {
  const componentIds = new Set(nodeIds);
  const graph = new Graph({ multigraph: true });
  graph.setGraph({
    rankdir: 'LR',
    ranker: 'network-simplex',
    acyclicer: 'greedy',
    ranksep: 160,
    nodesep: 100,
    edgesep: 48,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const nodeId of nodeIds) graph.setNode(nodeId, sizes.get(nodeId)!);
  edges.forEach((edge, index) => {
    if (!componentIds.has(edge.source) || !componentIds.has(edge.target)) return;
    graph.setEdge(edge.source, edge.target, { weight: 2 }, `${edge.id}-${index}`);
  });
  layout(graph);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const positions = new Map<string, { x: number; y: number }>();
  for (const nodeId of nodeIds) {
    const point = graph.node(nodeId);
    const size = sizes.get(nodeId)!;
    const x = point.x - size.width / 2;
    const y = point.y - size.height / 2;
    positions.set(nodeId, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + size.width);
    maxY = Math.max(maxY, y + size.height);
  }

  for (const [nodeId, position] of positions) {
    positions.set(nodeId, { x: position.x - minX, y: position.y - minY });
  }
  return { positions, width: maxX - minX, height: maxY - minY };
}

export function layoutNodesByEdges(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): Node<CanvasNodeData>[] {
  const spatialNodes = normalizeSpatialNodes(nodes);
  const topLevelNodes = spatialNodes.filter((node) => !getSpatialParentGroup(spatialNodes, node));
  if (topLevelNodes.length < 2) return spatialNodes;

  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of topLevelNodes) {
    const size = getNodeSize(node);
    sizes.set(node.id, size);
  }

  const rootEdges: RootEdge[] = [];
  edges.forEach((edge, index) => {
    const source = getRootNodeId(edge.source, spatialNodes);
    const target = getRootNodeId(edge.target, spatialNodes);
    if (!source || !target || source === target || !sizes.has(source) || !sizes.has(target)) return;
    rootEdges.push({ id: `${edge.id || 'edge'}-${index}`, source, target });
  });

  const components = getConnectedComponents(topLevelNodes.map((node) => node.id), rootEdges)
    .map((component) => layoutComponent(component, rootEdges, sizes));
  const columnCount = Math.min(3, components.length);
  const positions = new Map<string, { x: number; y: number }>();
  let rowX = CANVAS_MARGIN;
  let rowY = CANVAS_MARGIN;
  let rowHeight = 0;

  components.forEach((component, index) => {
    if (index > 0 && index % columnCount === 0) {
      rowX = CANVAS_MARGIN;
      rowY += rowHeight + COMPONENT_GAP_Y;
      rowHeight = 0;
    }
    for (const [nodeId, position] of component.positions) {
      positions.set(nodeId, {
        x: Math.round(position.x + rowX),
        y: Math.round(position.y + rowY),
      });
    }
    rowX += component.width + COMPONENT_GAP_X;
    rowHeight = Math.max(rowHeight, component.height);
  });

  const originalRootPositions = new Map(topLevelNodes.map((node) => [node.id, node.position]));
  return spatialNodes.map((node) => {
    const rootId = getRootNodeId(node.id, spatialNodes);
    if (!rootId) return node;
    const rootPosition = positions.get(rootId);
    const originalRootPosition = originalRootPositions.get(rootId);
    if (!rootPosition || !originalRootPosition) return node;
    if (node.id === rootId) return { ...node, position: rootPosition };
    return {
      ...node,
      position: {
        x: node.position.x + rootPosition.x - originalRootPosition.x,
        y: node.position.y + rootPosition.y - originalRootPosition.y,
      },
    };
  });
}
