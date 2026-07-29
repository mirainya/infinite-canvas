import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactFlow, {
  Background,
  type BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeDragHandler,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import type { Dispatch, SetStateAction } from 'react';
import { CanvasCallbacksCtx, type CanvasCallbacks } from './CanvasCallbacks';
import GroupNode from './GroupNode';
import WorkflowNode from './WorkflowNode';
import { STORAGE_KEY } from '../constants';
import { createSnapshot } from '../storage';
import { useCanvasHistory } from '../hooks/useCanvasHistory';
import { useDataFlow } from '../hooks/useDataFlow';
import { useFlowEvents } from '../hooks/useFlowEvents';
import { useSnapAlign } from '../hooks/useSnapAlign';
import { useSpatialGroupDrag } from '../hooks/useSpatialGroupDrag';
import { apiFetch } from '../api';
import { normalizeSpatialNodes } from '../spatialGroups';
import type { CanvasNodeData, CanvasSettings } from '../types';
import type { PortValues, SystemContext } from '../types/workflow';

const nodeTypes = {
  groupNode: GroupNode,
  workflowNode: WorkflowNode,
};

export interface CanvasCoreHandle {
  getNodes(): Node<CanvasNodeData>[];
  getEdges(): Edge[];
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  undo(): void;
  redo(): void;
  rememberHistory(): void;
  fitView(): void;
  runWorkflow(): void;
  updateNodeData(id: string, data: Partial<CanvasNodeData>): void;
  getReactFlow(): ReactFlowInstance | null;
  subscribe(cb: () => void): () => void;
}

interface CanvasCoreProps {
  initialNodes: Node<CanvasNodeData>[];
  initialEdges: Edge[];
  settings: CanvasSettings;
  backgroundVariant: BackgroundVariant;
  isDark: boolean;
  nodesLoaded: boolean;
  setStatus: (s: string) => void;
  onPaneClick: () => void;
  onPaneContextMenu: (e: React.MouseEvent) => void;
  onNodeContextMenu: (e: React.MouseEvent, node: Node<CanvasNodeData>) => void;
  onAddWorkflowNodeAt: (defId: string, pos: { x: number; y: number }) => void;
  onAddGroupNodeAt: (pos: { x: number; y: number }) => void;
}

const CanvasCore = forwardRef<CanvasCoreHandle, CanvasCoreProps>(function CanvasCore(props, ref) {
  const {
    initialNodes: initNodes,
    initialEdges: initEdges,
    settings,
    backgroundVariant,
    isDark,
    nodesLoaded,
    setStatus,
    onPaneClick,
    onPaneContextMenu,
    onNodeContextMenu,
    onAddWorkflowNodeAt,
    onAddGroupNodeAt,
  } = props;

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(normalizeSpatialNodes(initNodes));
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initEdges);
  const [compactViewport, setCompactViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches,
  );
  const stableNodeTypes = useMemo(() => nodeTypes, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const update = () => setCompactViewport(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const initialFitViewOptions = useMemo(() => ({
    padding: 0.18,
    minZoom: compactViewport ? 0.72 : 0.35,
    maxZoom: 1,
  }), [compactViewport]);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => { nodesRef.current = nodes; });
  useEffect(() => { edgesRef.current = edges; });

  const setSpatialNodes = useCallback<Dispatch<SetStateAction<Node<CanvasNodeData>[]>>>(
    (value) => setNodes((current) => normalizeSpatialNodes(
      typeof value === 'function' ? value(current) : value,
    )),
    [setNodes],
  );

  const listenersRef = useRef(new Set<() => void>());
  const notifyTimerRef = useRef<number>(0);
  useEffect(() => {
    if (notifyTimerRef.current) return;
    notifyTimerRef.current = window.setTimeout(() => {
      notifyTimerRef.current = 0;
      listenersRef.current.forEach((cb) => cb());
    }, 100);
    return () => { window.clearTimeout(notifyTimerRef.current); notifyTimerRef.current = 0; };
  }, [nodes, edges]);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  // Auto-save (debounced 5s to avoid thrashing during drag)
  const autoSaveRef = useRef<number>(0);
  useEffect(() => {
    window.clearTimeout(autoSaveRef.current);
    autoSaveRef.current = window.setTimeout(() => {
      autoSaveRef.current = 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(createSnapshot(nodesRef.current, edgesRef.current)));
    }, 5000);
    return () => { window.clearTimeout(autoSaveRef.current); autoSaveRef.current = 0; };
  }, [nodes, edges]);

  const { rememberHistory, undo, redo } = useCanvasHistory(nodes, edges, setNodes, setEdges, setStatus);
  const rememberRef = useRef(rememberHistory);
  useEffect(() => { rememberRef.current = rememberHistory; });

  const systemContext = useMemo<SystemContext>(() => ({
    execute: async (defId: string, inputs: PortValues, controls: PortValues) => {
      const res = await apiFetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defId, inputs, controls }),
      });
      if (!res.ok) throw new Error(`执行失败: ${res.status}`);
      return res.json();
    },
    executeStream: (defId, inputs, controls, onStatus) => {
      return new Promise((resolve, reject) => {
        const body = JSON.stringify({ defId, inputs, controls });
        apiFetch('/api/execute/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }).then((res) => {
          if (!res.ok) { reject(new Error(`执行失败: ${res.status}`)); return; }
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          function read(): Promise<void> {
            return reader.read().then(({ done, value }) => {
              if (done) { reject(new Error('流意外结束')); return; }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop()!;
              for (const line of lines) {
                if (line.startsWith('data:')) {
                  const raw = line.slice(5).trim();
                  if (!raw) continue;
                  try {
                    const msg = JSON.parse(raw);
                    onStatus(msg.status);
                    if (msg.status === 'done') { resolve(msg.result); return; }
                    if (msg.status === 'failed') { reject(new Error(msg.error || '执行失败')); return; }
                  } catch { /* ignore parse errors */ }
                }
              }
              return read();
            });
          }
          read();
        }).catch(reject);
      });
    },
  }), []);

  const { propagate, runWorkflow, spawnPreviewNode } = useDataFlow(
    edges,
    setEdges,
    setNodes,
    setStatus,
    systemContext,
    nodes,
    rememberHistory,
  );

  const [dragOver, setDragOver] = useState(false);

  const updateNodeData = useCallback(
    (id: string, data: Partial<Omit<CanvasNodeData, 'onChange'>>) => {
      rememberRef.current();
      setNodes((cur) => cur.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));
    },
    [setNodes],
  );

  const cbRef = useRef<CanvasCallbacks>({ onChange: updateNodeData, ctx: systemContext, propagate, spawnPreviewNode });
  useEffect(() => { cbRef.current = { onChange: updateNodeData, ctx: systemContext, propagate, spawnPreviewNode }; });
  const stableCallbacks = useMemo<CanvasCallbacks>(() => ({
    onChange: (...a) => cbRef.current.onChange(...a),
    ctx: { execute: (...a) => cbRef.current.ctx.execute(...a), executeStream: (...a) => cbRef.current.ctx.executeStream!(...a) },
    propagate: (...a) => cbRef.current.propagate(...a),
    spawnPreviewNode: (...a) => cbRef.current.spawnPreviewNode(...a),
  }), []);

  const snapAlign = useSnapAlign(nodes);
  const spatialGroupDrag = useSpatialGroupDrag(nodes, setNodes);
  const onNodeDragStart = useCallback<NodeDragHandler>((event, node, draggedNodes) => {
    rememberHistory();
    spatialGroupDrag.onNodeDragStart(event, node, draggedNodes);
  }, [rememberHistory, spatialGroupDrag]);
  const onNodeDrag = useCallback<NodeDragHandler>((event, node, draggedNodes) => {
    snapAlign.onNodeDrag(event, node, draggedNodes);
    spatialGroupDrag.onNodeDrag(event, node, draggedNodes);
  }, [snapAlign, spatialGroupDrag]);
  const onNodeDragStop = useCallback<NodeDragHandler>((event, node, draggedNodes) => {
    snapAlign.onNodeDragStop(event, node, draggedNodes);
    spatialGroupDrag.onNodeDragStop(event, node, draggedNodes);
  }, [snapAlign, spatialGroupDrag]);
  const { onConnect, onNodesChange, onEdgesChange } = useFlowEvents(
    setEdges, onNodesChangeBase, onEdgesChangeBase, rememberHistory, setNodes, setStatus, nodesRef,
  );

  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowRef.current = instance;
    if (!compactViewport) return;
    const firstNode = nodesRef.current.find((node) => !node.parentNode) ?? nodesRef.current[0];
    if (!firstNode) return;
    window.requestAnimationFrame(() => {
      void instance.setCenter(
        firstNode.position.x + 140,
        firstNode.position.y + 180,
        { zoom: 0.75 },
      );
    });
  }, [compactViewport]);

  const fitView = useCallback(() => {
    reactFlowRef.current?.fitView({ padding: compactViewport ? 0.28 : 0.32, duration: 300, minZoom: compactViewport ? 0.55 : 0.2 });
    setStatus('视图已适配画布');
  }, [compactViewport, setStatus]);

  useImperativeHandle(ref, () => ({
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    setNodes: setSpatialNodes,
    setEdges,
    undo,
    redo,
    rememberHistory,
    fitView,
    runWorkflow,
    updateNodeData,
    getReactFlow: () => reactFlowRef.current,
    subscribe,
  }), [setSpatialNodes, setEdges, undo, redo, rememberHistory, fitView, runWorkflow, updateNodeData, subscribe]);

  if (!nodesLoaded) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>加载节点定义中...</div>;
  }

  return (
    <CanvasCallbacksCtx.Provider value={stableCallbacks}>
    <ReactFlow
      className={dragOver ? 'canvas-drop-active' : ''}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onNodeContextMenu={onNodeContextMenu}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={stableNodeTypes}
      snapToGrid={settings.snapToGrid}
      snapGrid={[settings.gridSize, settings.gridSize]}
      multiSelectionKeyCode="Control"
      selectionKeyCode="Shift"
      onInit={handleInit}
      elevateNodesOnSelect={false}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!reactFlowRef.current) return;
        const position = reactFlowRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const nodeKind = e.dataTransfer.getData('application/x-canvas-node-kind');
        if (nodeKind === 'group') {
          onAddGroupNodeAt(position);
          return;
        }
        const defId = e.dataTransfer.getData('application/x-def-id');
        if (!defId) return;
        onAddWorkflowNodeAt(defId, position);
      }}
      fitView={!compactViewport}
      fitViewOptions={initialFitViewOptions}
    >
      {settings.showGrid && (
        <Background
          color={isDark ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.12)'}
          gap={settings.gridSize}
          variant={backgroundVariant}
        />
      )}
      <Controls showInteractive={!compactViewport} />
      {settings.showMiniMap && !compactViewport && <MiniMap pannable zoomable />}
    </ReactFlow>
    </CanvasCallbacksCtx.Provider>
  );
});

export default CanvasCore;
