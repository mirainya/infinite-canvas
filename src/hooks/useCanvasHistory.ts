import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import { createSnapshot } from '../storage';
import type { CanvasNodeData, CanvasSnapshot } from '../types';

export function useCanvasHistory(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  setStatus: (status: string) => void,
) {
  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => { nodesRef.current = nodes; });
  useEffect(() => { edgesRef.current = edges; });

  const rememberHistory = useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-29), createSnapshot(nodesRef.current, edgesRef.current)];
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      setStatus('没有可撤销的操作');
      return;
    }

    redoStackRef.current.push(createSnapshot(nodesRef.current, edgesRef.current));
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setStatus('已撤销');
  }, [setEdges, setNodes, setStatus]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) {
      setStatus('没有可重做的操作');
      return;
    }

    undoStackRef.current.push(createSnapshot(nodesRef.current, edgesRef.current));
    setNodes(next.nodes);
    setEdges(next.edges);
    setStatus('已重做');
  }, [setEdges, setNodes, setStatus]);

  return { rememberHistory, undo, redo };
}
