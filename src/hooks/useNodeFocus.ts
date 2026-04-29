import { useCallback, type RefObject } from 'react';
import type { Node, ReactFlowInstance } from 'reactflow';
import { GROUP_HEIGHT, GROUP_WIDTH } from '../constants';
import type { CanvasNodeData } from '../types';

const getNodeSize = (node: Node<CanvasNodeData>) => {
  const width =
    typeof node.style?.width === 'number'
      ? node.style.width
      : Number.parseFloat(String(node.style?.width ?? '')) || (node.type === 'groupNode' ? GROUP_WIDTH : 280);
  const height =
    typeof node.style?.height === 'number'
      ? node.style.height
      : Number.parseFloat(String(node.style?.height ?? '')) || (node.type === 'groupNode' ? GROUP_HEIGHT : 180);

  return { width, height };
};

export function useNodeFocus(
  getNodes: () => Node<CanvasNodeData>[],
  setNodes: (updater: (nodes: Node<CanvasNodeData>[]) => Node<CanvasNodeData>[]) => void,
  reactFlowRef: RefObject<ReactFlowInstance | null>,
  setStatus: (status: string) => void,
) {
  const getAbsolutePosition = useCallback(
    (node: Node<CanvasNodeData>) => {
      const nodes = getNodes();
      let x = node.position.x;
      let y = node.position.y;
      let parentId = node.parentNode;

      while (parentId) {
        const parent = nodes.find((item) => item.id === parentId);
        if (!parent) break;
        x += parent.position.x;
        y += parent.position.y;
        parentId = parent.parentNode;
      }

      return { x, y };
    },
    [getNodes],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const nodes = getNodes();
      const target = nodes.find((node) => node.id === nodeId);
      if (!target) return;

      const position = getAbsolutePosition(target);
      const size = getNodeSize(target);
      reactFlowRef.current?.setCenter(position.x + size.width / 2, position.y + size.height / 2, {
        zoom: target.type === 'groupNode' ? 0.9 : 1.25,
        duration: 300,
      });

      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === nodeId,
        })),
      );
      setStatus(`已定位：${target.data.title}`);
    },
    [getAbsolutePosition, getNodes, reactFlowRef, setNodes, setStatus],
  );

  return { focusNode, getAbsolutePosition };
}
