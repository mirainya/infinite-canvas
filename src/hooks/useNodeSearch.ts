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
    if (!normalizedQuery) return nodes.filter((node) => !node.hidden);

    return nodes.filter(
      (node) =>
        !node.hidden &&
        [
          node.data.title,
          node.data.prompt,
          node.data.result,
          node.data.note,
          node.data.color,
          node.data.tags?.join(' '),
          node.data.defId,
          node.type,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [nodes, query]);

  useEffect(() => {
    resetActiveIndex();
  }, [query, matches.length, resetActiveIndex]);

  return matches;
}
