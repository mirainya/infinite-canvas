import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Node } from 'reactflow';
import { createGroupNode } from './useNodeCreation';
import {
  fitSpatialGroupToNodes,
  getSpatialFrameBounds,
  getSpatialGroupContents,
  sortSpatialNodes,
} from '../spatialGroups';
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
    const selectedItems = nodes.filter((node) => node.selected && node.type !== 'groupNode');

    if (selectedGroups.length > 1) {
      setStatus('一次只能调整一个分组');
      return;
    }

    if (selectedGroups.length === 1) {
      const group = selectedGroups[0];
      const contents = getSpatialGroupContents(nodes, group.id);
      const items = Array.from(new Map([...contents, ...selectedItems].map((node) => [node.id, node])).values());
      if (items.length === 0) {
        setStatus('分组内暂无节点');
        return;
      }
      rememberHistory();
      setNodes((current) => current.map((node) => (
        node.id === group.id ? fitSpatialGroupToNodes(node, items) : node
      )));
      setStatus(selectedItems.length > 0 ? '已扩展分组范围' : '已适配分组内容');
      return;
    }

    if (selectedItems.length === 0) {
      setStatus('请先选择需要整理的节点');
      return;
    }

    const bounds = getSpatialFrameBounds(selectedItems);
    if (!bounds) return;

    rememberHistory();
    setNodes((currentNodes) => sortSpatialNodes([
      ...currentNodes.map((node) => ({ ...node, selected: false })),
      {
        ...createGroupNode(
          { x: bounds.x, y: bounds.y },
          { width: bounds.width, height: bounds.height },
        ),
        selected: true,
      },
    ]));
    setStatus(`已为 ${selectedItems.length} 个节点创建分组`);
  }, [getNodes, rememberHistory, setNodes, setStatus]);

  const ungroupSelected = useCallback(() => {
    const nodes = getNodes();
    const selectedGroupIds = new Set(
      nodes.filter((node) => node.selected && node.type === 'groupNode').map((node) => node.id),
    );
    if (selectedGroupIds.size === 0) {
      setStatus('请选择需要移除的分组框');
      return;
    }

    rememberHistory();
    setNodes((currentNodes) => currentNodes.filter((node) => !selectedGroupIds.has(node.id)));
    setStatus(`已移除 ${selectedGroupIds.size} 个分组框，内部节点已保留`);
  }, [getNodes, rememberHistory, setNodes, setStatus]);

  return { groupSelected, ungroupSelected };
}
