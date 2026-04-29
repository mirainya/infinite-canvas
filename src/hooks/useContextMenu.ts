import { useCallback, useState, type Dispatch, type MouseEvent, type RefObject, type SetStateAction } from 'react';
import type { Node, ReactFlowInstance } from 'reactflow';
import type { CanvasNodeData, ContextMenuState } from '../types';

export function useContextMenu(
  canvasRef: RefObject<HTMLElement | null>,
  getReactFlow: () => ReactFlowInstance | null,
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const getFlowPositionFromEvent = useCallback(
    (event: MouseEvent) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      const point = bounds
        ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
        : { x: event.clientX, y: event.clientY };

      return getReactFlow()?.project(point) ?? point;
    },
    [canvasRef, getReactFlow],
  );

  const openPaneMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowPosition: getFlowPositionFromEvent(event),
      });
    },
    [getFlowPositionFromEvent],
  );

  const openNodeMenu = useCallback(
    (event: MouseEvent, node: Node<CanvasNodeData>) => {
      event.preventDefault();
      event.stopPropagation();
      setNodes((currentNodes) =>
        currentNodes.map((item) => ({
          ...item,
          selected: item.id === node.id,
        })),
      );
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowPosition: getFlowPositionFromEvent(event),
        nodeId: node.id,
      });
    },
    [getFlowPositionFromEvent, setNodes],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, openPaneMenu, openNodeMenu, closeContextMenu };
}
