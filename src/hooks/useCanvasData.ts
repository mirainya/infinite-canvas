import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Edge, Node } from 'reactflow';
import type { CanvasCoreHandle } from '../components/CanvasCore';
import type { CanvasNodeData } from '../types';

export function useCanvasData(coreRef: React.RefObject<CanvasCoreHandle | null>) {
  const nodesSnap = useRef<Node<CanvasNodeData>[]>([]);
  const edgesSnap = useRef<Edge[]>([]);

  const subscribe = useCallback((cb: () => void) => {
    const core = coreRef.current;
    if (!core) return () => {};
    nodesSnap.current = core.getNodes();
    edgesSnap.current = core.getEdges();
    return core.subscribe(() => {
      nodesSnap.current = core.getNodes();
      edgesSnap.current = core.getEdges();
      cb();
    });
  }, [coreRef]);

  const getNodes = useCallback(() => nodesSnap.current, []);
  const getEdges = useCallback(() => edgesSnap.current, []);

  const nodes = useSyncExternalStore(subscribe, getNodes);
  const edges = useSyncExternalStore(subscribe, getEdges);

  return { nodes, edges };
}
