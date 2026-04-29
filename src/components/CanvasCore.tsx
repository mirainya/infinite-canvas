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
import { authHeaders } from './LoginPage';
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
  } = props;

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initEdges);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => { nodesRef.current = nodes; });
  useEffect(() => { edgesRef.current = edges; });

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
    execute: async (defId: string, inputs: PortValues, controls: PortValues, sourceId?: number) => {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ defId, inputs, controls, sourceId }),
      });
      if (!res.ok) throw new Error(`执行失败: ${res.status}`);
      return res.json();
    },
  }), []);

  const { propagate, runWorkflow } = useDataFlow(edges, setNodes, setStatus, systemContext, nodes);

  const [dragOver, setDragOver] = useState(false);

  const updateNodeData = useCallback(
    (id: string, data: Partial<Omit<CanvasNodeData, 'onChange'>>) => {
      rememberRef.current();
      setNodes((cur) => cur.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));
    },
    [setNodes],
  );

  const cbRef = useRef<CanvasCallbacks>({ onChange: updateNodeData, ctx: systemContext, propagate });
  useEffect(() => { cbRef.current = { onChange: updateNodeData, ctx: systemContext, propagate }; });
  const stableCallbacks = useMemo<CanvasCallbacks>(() => ({
    onChange: (...a) => cbRef.current.onChange(...a),
    ctx: { execute: (...a) => cbRef.current.ctx.execute(...a) },
    propagate: (...a) => cbRef.current.propagate(...a),
  }), []);

  const { onNodeDrag, onNodeDragStop } = useSnapAlign(nodes);
  const { onConnect, onNodesChange, onEdgesChange } = useFlowEvents(
    setEdges, onNodesChangeBase, onEdgesChangeBase, rememberHistory, setNodes, setStatus, nodesRef,
  );

  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

  const fitView = useCallback(() => {
    reactFlowRef.current?.fitView({ padding: 0.2, duration: 300 });
    setStatus('视图已适配画布');
  }, [setStatus]);

  useImperativeHandle(ref, () => ({
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    setNodes,
    setEdges,
    undo,
    redo,
    rememberHistory,
    fitView,
    runWorkflow,
    updateNodeData,
    getReactFlow: () => reactFlowRef.current,
    subscribe,
  }), [setNodes, setEdges, undo, redo, rememberHistory, fitView, runWorkflow, updateNodeData, subscribe]);

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
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      snapToGrid={settings.snapToGrid}
      snapGrid={[settings.gridSize, settings.gridSize]}
      onInit={(instance) => { reactFlowRef.current = instance; }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const defId = e.dataTransfer.getData('application/x-def-id');
        if (!defId || !reactFlowRef.current) return;
        const position = reactFlowRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        onAddWorkflowNodeAt(defId, position);
      }}
      fitView
    >
      {settings.showGrid && (
        <Background
          color={isDark ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.12)'}
          gap={settings.gridSize}
          variant={backgroundVariant}
        />
      )}
      <Controls />
      {settings.showMiniMap && <MiniMap />}
    </ReactFlow>
    </CanvasCallbacksCtx.Provider>
  );
});

export default CanvasCore;
