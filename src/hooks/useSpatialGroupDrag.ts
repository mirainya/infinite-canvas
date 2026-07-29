import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Node, NodeDragHandler } from 'reactflow';
import { getSpatialGroupContents } from '../spatialGroups';
import type { CanvasNodeData } from '../types';

type GroupDragState = {
  groupId: string;
  start: { x: number; y: number };
  members: Map<string, { x: number; y: number }>;
};

export function useSpatialGroupDrag(
  nodes: Node<CanvasNodeData>[],
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
) {
  const nodesRef = useRef(nodes);
  const dragRef = useRef<GroupDragState | null>(null);

  useEffect(() => { nodesRef.current = nodes; });

  const onNodeDragStart: NodeDragHandler = useCallback((_event, node, draggedNodes) => {
    if (node.type !== 'groupNode') {
      dragRef.current = null;
      return;
    }
    const movedByReactFlow = new Set(draggedNodes.map((item) => item.id));
    const members = new Map(
      getSpatialGroupContents(nodesRef.current, node.id)
        .filter((member) => !movedByReactFlow.has(member.id))
        .map((member) => [member.id, { ...member.position }]),
    );
    dragRef.current = {
      groupId: node.id,
      start: { ...node.position },
      members,
    };
  }, []);

  const onNodeDrag: NodeDragHandler = useCallback((_event, node) => {
    const drag = dragRef.current;
    if (!drag || drag.groupId !== node.id) return;
    const deltaX = node.position.x - drag.start.x;
    const deltaY = node.position.y - drag.start.y;
    setNodes((current) => current.map((item) => {
      const start = drag.members.get(item.id);
      if (!start) return item;
      return {
        ...item,
        position: { x: start.x + deltaX, y: start.y + deltaY },
      };
    }));
  }, [setNodes]);

  const onNodeDragStop: NodeDragHandler = useCallback(() => {
    dragRef.current = null;
  }, []);

  return { onNodeDragStart, onNodeDrag, onNodeDragStop };
}
