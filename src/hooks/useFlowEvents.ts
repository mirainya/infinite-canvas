import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { addEdge, type Connection, type Edge, type Node, type NodeChange, type EdgeChange } from 'reactflow';
import { getNodeDef } from '../nodes';
import type { CanvasNodeData } from '../types';
import type { DataType } from '../types/workflow';

function canConnect(sourceType: DataType, targetType: DataType): boolean {
  if (sourceType === 'ANY' || targetType === 'ANY') return true;
  return sourceType === targetType;
}

function getPortType(node: Node<CanvasNodeData>, handleId: string, side: 'output' | 'input'): DataType | null {
  if (!node.data.defId) return null;
  const def = getNodeDef(node.data.defId);
  if (!def) return null;
  const prefix = `${side}-`;
  if (!handleId.startsWith(prefix)) return null;
  const portId = handleId.slice(prefix.length);
  const ports = side === 'output' ? def.outputs : def.inputs;
  return ports.find((p) => p.id === portId)?.type ?? null;
}

export function useFlowEvents(
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  onNodesChangeBase: (changes: NodeChange[]) => void,
  onEdgesChangeBase: (changes: EdgeChange[]) => void,
  rememberHistory: () => void,
  setNodes?: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  setStatus?: (status: string) => void,
  nodesRef?: RefObject<Node<CanvasNodeData>[]>,
) {
  const onConnect = useCallback(
    (connection: Connection) => {
      if (nodesRef?.current && connection.sourceHandle && connection.targetHandle) {
        const sourceNode = nodesRef.current.find((n) => n.id === connection.source);
        const targetNode = nodesRef.current.find((n) => n.id === connection.target);
        if (sourceNode && targetNode) {
          const srcType = getPortType(sourceNode, connection.sourceHandle, 'output');
          const tgtType = getPortType(targetNode, connection.targetHandle, 'input');
          if (srcType && tgtType && !canConnect(srcType, tgtType)) {
            setStatus?.(`类型不匹配：${srcType} → ${tgtType}`);
            return;
          }
        }

        if (setNodes) {
          const sh = connection.sourceHandle;
          const th = connection.targetHandle;
          setNodes((cur) => {
            const src = cur.find((n) => n.id === connection.source);
            const value = src?.data.portValues?.[sh] ?? null;
            if (value == null) return cur;
            return cur.map((n) => {
              if (n.id !== connection.target) return n;
              return { ...n, data: { ...n.data, portValues: { ...(n.data.portValues ?? {}), [th!]: value } } };
            });
          });
        }
      }
      rememberHistory();
      setEdges((currentEdges) => addEdge(connection, currentEdges));
    },
    [rememberHistory, setEdges, nodesRef, setNodes, setStatus],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const hasRemove = changes.some((c) => c.type === 'remove');
      const hasDragEnd = changes.some((c) => c.type === 'position' && !c.dragging && c.position);
      if (hasRemove || hasDragEnd) rememberHistory();

      onNodesChangeBase(changes);
    },
    [onNodesChangeBase, rememberHistory],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === 'remove')) {
        rememberHistory();
      }
      onEdgesChangeBase(changes);
    },
    [onEdgesChangeBase, rememberHistory],
  );

  return { onConnect, onNodesChange, onEdgesChange };
}
