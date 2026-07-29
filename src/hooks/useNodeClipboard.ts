import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import { getSpatialGroupContents, sortSpatialNodes } from '../spatialGroups';
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
      const deletingIds = new Set([nodeId]);

      rememberHistory();
      setNodes((currentNodes) => currentNodes.filter((node) => !deletingIds.has(node.id)));
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => !deletingIds.has(edge.source) && !deletingIds.has(edge.target)),
      );
      setStatus('已删除节点');
    },
    [rememberHistory, setEdges, setNodes, setStatus],
  );

  const duplicateNodes = useCallback(
    (copySource: Node<CanvasNodeData>[], status: string) => {
      const edges = getEdges();
      rememberHistory();
      const idMap = new Map<string, string>();
      copySource.forEach((node) => idMap.set(node.id, crypto.randomUUID()));

      const copiedNodes = copySource.map((node) => {
        return {
          ...node,
          id: idMap.get(node.id) ?? crypto.randomUUID(),
          parentNode: undefined,
          extent: undefined,
          position: {
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
            locked: node.data.locked,
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

      setNodes((currentNodes) => sortSpatialNodes([
        ...currentNodes.map((node) => ({ ...node, selected: false })),
        ...copiedNodes,
      ]));
      setEdges((currentEdges) => [...currentEdges, ...copiedEdges]);
      setStatus(status);
    },
    [getEdges, rememberHistory, setEdges, setNodes, setStatus],
  );

  const duplicateSelected = useCallback(() => {
    const nodes = getNodes();
    const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    for (const node of nodes) {
      if (node.selected && node.type === 'groupNode') {
        getSpatialGroupContents(nodes, node.id).forEach((member) => selectedIds.add(member.id));
      }
    }
    const selectedNodes = nodes.filter((node) => selectedIds.has(node.id));
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
          ? [root, ...getSpatialGroupContents(nodes, root.id)]
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
