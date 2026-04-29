import { useMemo } from 'react';
import type { Edge, Node } from 'reactflow';
import type { CanvasNodeData } from '../types';

export function useCanvasStats(nodes: Node<CanvasNodeData>[], edges: Edge[]) {
  return useMemo(() => {
    const groupNodes = nodes.filter((node) => node.type === 'groupNode');
    const tagCounts = new Map<string, number>();
    const colorCounts = new Map<string, number>();

    nodes.forEach((node) => {
      if (node.data.color) {
        colorCounts.set(node.data.color, (colorCounts.get(node.data.color) ?? 0) + 1);
      }

      node.data.tags?.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      });
    });

    return {
      nodes: nodes.length,
      groups: groupNodes.length,
      edges: edges.length,
      tags: Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]),
      colors: Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [edges.length, nodes]);
}
