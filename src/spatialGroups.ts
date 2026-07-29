import type { Node } from 'reactflow';
import { GROUP_HEIGHT, GROUP_WIDTH } from './constants';
import type { CanvasNodeData } from './types';

export const GROUP_MIN_WIDTH = 360;
export const GROUP_MIN_HEIGHT = 240;
export const GROUP_TITLE_HEIGHT = 44;
export const GROUP_CONTENT_PADDING = 32;

export type SpatialRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const numericSize = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export function getSpatialNodeSize(node: Node<CanvasNodeData>) {
  return {
    width: numericSize(node.width) ?? numericSize(node.style?.width) ?? (node.type === 'groupNode' ? GROUP_WIDTH : 280),
    height: numericSize(node.height) ?? numericSize(node.style?.height) ?? (node.type === 'groupNode' ? GROUP_HEIGHT : 180),
  };
}

function getLegacyAbsolutePosition(
  node: Node<CanvasNodeData>,
  nodeById: Map<string, Node<CanvasNodeData>>,
  cache: Map<string, { x: number; y: number }>,
  visiting: Set<string>,
): { x: number; y: number } {
  const cached = cache.get(node.id);
  if (cached) return cached;
  if (!node.parentNode || visiting.has(node.id)) return node.position;

  visiting.add(node.id);
  const parent = nodeById.get(node.parentNode);
  const parentPosition: { x: number; y: number } = parent
    ? getLegacyAbsolutePosition(parent, nodeById, cache, visiting)
    : { x: 0, y: 0 };
  visiting.delete(node.id);
  const absolute: { x: number; y: number } = {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  };
  cache.set(node.id, absolute);
  return absolute;
}

export function normalizeSpatialNodes(nodes: Node<CanvasNodeData>[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, { x: number; y: number }>();
  const normalized = nodes.map((node) => {
    const position = getLegacyAbsolutePosition(node, nodeById, cache, new Set());
    return {
      ...node,
      position,
      parentNode: undefined,
      extent: undefined,
      zIndex: node.type === 'groupNode' ? 0 : 1,
      dragHandle: node.type === 'groupNode' ? '.group-node__header' : node.dragHandle,
    };
  });
  return sortSpatialNodes(normalized);
}

export function getSpatialNodeRect(node: Node<CanvasNodeData>): SpatialRect {
  const size = getSpatialNodeSize(node);
  return { x: node.position.x, y: node.position.y, ...size };
}

const containsRect = (outer: SpatialRect, inner: SpatialRect) => (
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height
);

export function spatialGroupContainsNode(
  group: Node<CanvasNodeData>,
  node: Node<CanvasNodeData>,
) {
  if (group.type !== 'groupNode' || group.id === node.id) return false;
  const groupRect = getSpatialNodeRect(group);
  const nodeRect = getSpatialNodeRect(node);
  if (node.type === 'groupNode') return containsRect(groupRect, nodeRect);
  const centerX = nodeRect.x + nodeRect.width / 2;
  const centerY = nodeRect.y + nodeRect.height / 2;
  return centerX >= groupRect.x && centerX <= groupRect.x + groupRect.width &&
    centerY >= groupRect.y && centerY <= groupRect.y + groupRect.height;
}

export function getSpatialParentGroup(
  nodes: Node<CanvasNodeData>[],
  node: Node<CanvasNodeData>,
) {
  return nodes
    .filter((candidate) => spatialGroupContainsNode(candidate, node))
    .sort((a, b) => {
      const aSize = getSpatialNodeSize(a);
      const bSize = getSpatialNodeSize(b);
      return aSize.width * aSize.height - bSize.width * bSize.height;
    })[0];
}

export function getSpatialParentMap(nodes: Node<CanvasNodeData>[]) {
  const groups = nodes
    .filter((node) => node.type === 'groupNode')
    .sort((a, b) => {
      const aSize = getSpatialNodeSize(a);
      const bSize = getSpatialNodeSize(b);
      return aSize.width * aSize.height - bSize.width * bSize.height;
    });
  const parents = new Map<string, Node<CanvasNodeData>>();
  for (const node of nodes) {
    const parent = groups.find((group) => spatialGroupContainsNode(group, node));
    if (parent) parents.set(node.id, parent);
  }
  return parents;
}

export function getSpatialGroupContents(
  nodes: Node<CanvasNodeData>[],
  groupId: string,
) {
  const group = nodes.find((node) => node.id === groupId && node.type === 'groupNode');
  if (!group) return [];
  return nodes.filter((node) => spatialGroupContainsNode(group, node));
}

export function getDirectSpatialGroupContents(
  nodes: Node<CanvasNodeData>[],
  groupId: string,
) {
  return nodes.filter((node) => getSpatialParentGroup(nodes, node)?.id === groupId);
}

export function getSpatialFrameBounds(
  nodes: Node<CanvasNodeData>[],
  padding = GROUP_CONTENT_PADDING,
) {
  if (nodes.length === 0) return null;
  const rects = nodes.map(getSpatialNodeRect);
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: minX - padding,
    y: minY - padding - GROUP_TITLE_HEIGHT,
    width: Math.max(GROUP_MIN_WIDTH, maxX - minX + padding * 2),
    height: Math.max(GROUP_MIN_HEIGHT, maxY - minY + padding * 2 + GROUP_TITLE_HEIGHT),
  };
}

export function fitSpatialGroupToNodes(
  group: Node<CanvasNodeData>,
  nodes: Node<CanvasNodeData>[],
) {
  const bounds = getSpatialFrameBounds(nodes);
  if (!bounds) return group;
  return {
    ...group,
    position: { x: bounds.x, y: bounds.y },
    style: { ...group.style, width: bounds.width, height: bounds.height },
  };
}

export function sortSpatialNodes(nodes: Node<CanvasNodeData>[]) {
  return [...nodes].sort((a, b) => {
    if (a.type !== 'groupNode' && b.type === 'groupNode') return 1;
    if (a.type === 'groupNode' && b.type !== 'groupNode') return -1;
    if (a.type === 'groupNode' && b.type === 'groupNode') {
      const aSize = getSpatialNodeSize(a);
      const bSize = getSpatialNodeSize(b);
      return bSize.width * bSize.height - aSize.width * aSize.height;
    }
    return 0;
  });
}
