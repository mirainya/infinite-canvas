import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Node } from 'reactflow';
import type { CanvasNodeData } from '../types';

export function useGroupActions(
  getNodes: () => Node<CanvasNodeData>[],
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  rememberHistory: () => void,
  setStatus: (status: string) => void,
) {
  const groupSelected = useCallback(() => {
    const nodes = getNodes();
    const selectedGroups = nodes.filter((node) => node.selected && node.type === 'groupNode');
    const selectedItems = nodes.filter((node) => node.selected && node.type !== 'groupNode' && !node.parentNode);

    if (selectedGroups.length !== 1 || selectedItems.length === 0) {
      setStatus('请选择 1 个分组区域和未分组节点');
      return;
    }

    const group = selectedGroups[0];
    const itemIds = new Set(selectedItems.map((node) => node.id));

    rememberHistory();
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        itemIds.has(node.id)
          ? {
              ...node,
              parentNode: group.id,
              extent: 'parent' as const,
              position: {
                x: Math.max(24, node.position.x - group.position.x),
                y: Math.max(64, node.position.y - group.position.y),
              },
              selected: false,
            }
          : node,
      ),
    );
    setStatus('已加入分组');
  }, [getNodes, rememberHistory, setNodes, setStatus]);

  const ungroupSelected = useCallback(() => {
    const nodes = getNodes();
    const selectedChildren = nodes.filter((node) => node.selected && node.parentNode);
    if (selectedChildren.length === 0) {
      setStatus('请选择已分组节点');
      return;
    }

    const selectedIds = new Set(selectedChildren.map((node) => node.id));
    const groupById = new Map(nodes.map((node) => [node.id, node]));

    rememberHistory();
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (!selectedIds.has(node.id) || !node.parentNode) return node;

        const group = groupById.get(node.parentNode);
        return {
          ...node,
          parentNode: undefined,
          extent: undefined,
          position: {
            x: (group?.position.x ?? 0) + node.position.x,
            y: (group?.position.y ?? 0) + node.position.y,
          },
        };
      }),
    );
    setStatus('已移出分组');
  }, [getNodes, rememberHistory, setNodes, setStatus]);

  return { groupSelected, ungroupSelected };
}
