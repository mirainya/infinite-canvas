import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import type { CanvasNodeData } from '../types';

export function useNodeClipboard(
  getNodes: () => Node<CanvasNodeData>[],
  getEdges: () => Edge[],
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  rememberHistory: () => void,
  setStatus: (status: string) => void,
) {
  const deleteSelected = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const selectedNodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    const selectedEdgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id));

    nodes.forEach((node) => {
      if (node.parentNode && selectedNodeIds.has(node.parentNode)) {
        selectedNodeIds.add(node.id);
      }
    });

    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) {
      setStatus('未选择内容');
      return;
    }

    rememberHistory();
    setNodes((currentNodes) => currentNodes.filter((node) => !selectedNodeIds.has(node.id)));
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) =>
          !selectedEdgeIds.has(edge.id) &&
          !selectedNodeIds.has(edge.source) &&
          !selectedNodeIds.has(edge.target),
      ),
    );
    setStatus('已删除所选内容');
  }, [getNodes, getEdges, rememberHistory, setEdges, setNodes, setStatus]);

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      const nodes = getNodes();
      const deletingIds = new Set([nodeId]);
      nodes.forEach((node) => {
        if (node.parentNode && deletingIds.has(node.parentNode)) {
          deletingIds.add(node.id);
        }
      });

      rememberHistory();
      setNodes((currentNodes) => currentNodes.filter((node) => !deletingIds.has(node.id)));
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => !deletingIds.has(edge.source) && !deletingIds.has(edge.target)),
      );
      setStatus('已删除节点');
    },
    [getNodes, rememberHistory, setEdges, setNodes, setStatus],
  );

  const duplicateNodes = useCallback(
    (copySource: Node<CanvasNodeData>[], status: string) => {
      const edges = getEdges();
      rememberHistory();
      const idMap = new Map<string, string>();
      copySource.forEach((node) => idMap.set(node.id, crypto.randomUUID()));

      const copiedNodes = copySource.map((node) => {
        const copiedParentId = node.parentNode ? idMap.get(node.parentNode) : undefined;

        return {
          ...node,
          id: idMap.get(node.id) ?? crypto.randomUUID(),
          parentNode: copiedParentId,
          extent: copiedParentId ? ('parent' as const) : undefined,
          position: copiedParentId
            ? node.position
            : {
                x: node.position.x + 40,
                y: node.position.y + 40,
              },
          selected: true,
          data: {
            title: `${node.data.title} 副本`,
            prompt: node.data.prompt,
            result: node.data.result,
            color: node.data.color,
            tags: node.data.tags ?? [],
            note: node.data.note ?? '',
            defId: node.data.defId,
            portValues: node.data.portValues ? { ...node.data.portValues } : undefined,
          },
        };
      });

      const copiedEdges = edges
        .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: crypto.randomUUID(),
          source: idMap.get(edge.source) ?? edge.source,
          target: idMap.get(edge.target) ?? edge.target,
          selected: false,
        }));

      setNodes((currentNodes) => [
        ...currentNodes.map((node) => ({ ...node, selected: false })),
        ...copiedNodes,
      ]);
      setEdges((currentEdges) => [...currentEdges, ...copiedEdges]);
      setStatus(status);
    },
    [getEdges, rememberHistory, setEdges, setNodes, setStatus],
  );

  const duplicateSelected = useCallback(() => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    if (selectedNodes.length === 0) {
      setStatus('未选择节点');
      return;
    }

    duplicateNodes(selectedNodes, '已复制所选节点');
  }, [duplicateNodes, getNodes, setStatus]);

  const duplicateNodeById = useCallback(
    (nodeId: string) => {
      const nodes = getNodes();
      const root = nodes.find((node) => node.id === nodeId);
      if (!root) return;

      const copySource =
        root.type === 'groupNode'
          ? nodes.filter((node) => node.id === root.id || node.parentNode === root.id)
          : [root];

      duplicateNodes(copySource, '已复制节点');
    },
    [duplicateNodes, getNodes],
  );

  return {
    deleteSelected,
    deleteNodeById,
    duplicateSelected,
    duplicateNodeById,
  };
}
