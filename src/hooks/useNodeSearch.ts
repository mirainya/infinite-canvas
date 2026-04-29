import { useEffect, useMemo } from 'react';
import type { Node } from 'reactflow';
import type { CanvasNodeData } from '../types';

export function useNodeSearch(
  nodes: Node<CanvasNodeData>[],
  query: string,
  resetActiveIndex: () => void,
) {
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    return nodes.filter((node) =>
      [
        node.data.title,
        node.data.prompt,
        node.data.result,
        node.data.note,
        node.data.color,
        node.data.tags?.join(' '),
        node.type,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [nodes, query]);

  useEffect(() => {
    resetActiveIndex();
  }, [query, resetActiveIndex]);

  return matches;
}
