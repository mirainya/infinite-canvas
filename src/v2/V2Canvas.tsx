import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
  type XYPosition,
  type Viewport,
} from 'reactflow';
import { Copy, Maximize, Trash2 } from 'lucide-react';
import ImageEditor from '../components/ImageEditor';
import type { SystemContext } from '../types/workflow';
import { canConnect, NODE_BY_TYPE, NODE_CATALOG } from './catalog';
import { V2CanvasContext } from './CanvasContext';
import { layoutGraph } from './layout';
import V2NodeComponent from './V2Node';
import type { ModelInfo, V2Edge, V2Graph, V2Node, V2NodeData, V2NodeType } from './types';

const nodeTypes = Object.fromEntries(NODE_CATALOG.map((item) => [item.type, V2NodeComponent]));

export const V2_NODE_DRAG_MIME = 'application/x-infinite-canvas-node';

export type CanvasHandle = {
  addNode: (type: V2NodeType, data?: Partial<V2NodeData>) => void;
  autoLayout: () => Promise<void>;
  fitView: () => void;
  undo: () => void;
  redo: () => void;
};

type Props = {
  projectId: string;
  initialGraph: V2Graph;
  initialViewport: Viewport;
  outputs: Record<string, Record<string, unknown>>;
  imageModels: ModelInfo[];
  chatModels: ModelInfo[];
  onGraphChange: (graph: V2Graph) => void;
  onViewportChange: (viewport: Viewport) => void;
  onUploadImage: (file: File, kind?: string) => Promise<string>;
  onOpenImage: (url: string) => void;
  onStatus: (status: string) => void;
};

type MenuState = { x: number; y: number; nodeId: string } | null;
type MaskEditorState = { nodeId: string; imageSrc: string } | null;

const MASK_EDITOR_CONTEXT: SystemContext = {
  execute: async () => ({}),
};

export function dataUrlToImageFile(dataUrl: string, filename = 'mask.png') {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('蒙版格式无效');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], filename, { type: match[1] });
}

type HistoryEntry =
  | { kind: 'data'; nodeId: string; before: V2NodeData; after: V2NodeData; at: number }
  | { kind: 'structure'; addedNodes: V2Node[]; removedNodes: V2Node[]; addedEdges: V2Edge[]; removedEdges: V2Edge[] }
  | { kind: 'positions'; before: Record<string, { x: number; y: number }>; after: Record<string, { x: number; y: number }> };

function cleanNode(node: V2Node): V2Node {
  return { id: node.id, type: node.type, position: node.position, data: node.data } as V2Node;
}

function cleanEdge(edge: V2Edge): V2Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  } as V2Edge;
}

function cleanGraph(nodes: V2Node[], edges: V2Edge[]): V2Graph {
  return {
    nodes: nodes.map(cleanNode),
    edges: edges.map(cleanEdge),
  };
}

const V2CanvasInner = forwardRef<CanvasHandle, Props>(function V2CanvasInner(props, ref) {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<V2NodeData>(props.initialGraph.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(props.initialGraph.edges);
  const [menu, setMenu] = useState<MenuState>(null);
  const [maskEditor, setMaskEditor] = useState<MaskEditorState>(null);
  const nodesRef = useRef(nodes as V2Node[]);
  const edgesRef = useRef(edges as V2Edge[]);
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const dragStartPositions = useRef<Record<string, { x: number; y: number }> | null>(null);
  const reactFlow = useReactFlow();

  useEffect(() => { nodesRef.current = nodes as V2Node[]; }, [nodes]);
  useEffect(() => { edgesRef.current = edges as V2Edge[]; }, [edges]);
  const { onGraphChange } = props;
  useEffect(() => {
    const timer = setTimeout(
      () => onGraphChange(cleanGraph(nodes as V2Node[], edges as V2Edge[])),
      120,
    );
    return () => clearTimeout(timer);
  }, [nodes, edges, onGraphChange]);

  const record = useCallback((entry: HistoryEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > 120) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const applyHistory = useCallback((entry: HistoryEntry, reverse: boolean) => {
    if (entry.kind === 'data') {
      const data = reverse ? entry.before : entry.after;
      setNodes((current) => current.map((node) => node.id === entry.nodeId ? { ...node, data } : node));
      return;
    }
    if (entry.kind === 'positions') {
      const positions = reverse ? entry.before : entry.after;
      setNodes((current) => current.map((node) => positions[node.id] ? { ...node, position: positions[node.id] } : node));
      return;
    }
    const removeNodes = reverse ? entry.addedNodes : entry.removedNodes;
    const addNodes = reverse ? entry.removedNodes : entry.addedNodes;
    const removeEdges = reverse ? entry.addedEdges : entry.removedEdges;
    const addEdges = reverse ? entry.removedEdges : entry.addedEdges;
    const removeNodeIds = new Set(removeNodes.map((node) => node.id));
    const removeEdgeIds = new Set(removeEdges.map((edge) => edge.id));
    setNodes((current) => [...current.filter((node) => !removeNodeIds.has(node.id)), ...addNodes]);
    setEdges((current) => [...current.filter((edge) => !removeEdgeIds.has(edge.id)), ...addEdges]);
  }, [setEdges, setNodes]);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    applyHistory(entry, true);
  }, [applyHistory]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    applyHistory(entry, false);
  }, [applyHistory]);

  const insertNodeAt = useCallback((type: V2NodeType, position: XYPosition, data?: Partial<V2NodeData>) => {
    const definition = NODE_BY_TYPE.get(type);
    if (!definition) return;
    const node: V2Node = {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      position,
      data: { ...definition.defaults, ...data },
    };
    record({ kind: 'structure', addedNodes: [cleanNode(node)], removedNodes: [], addedEdges: [], removedEdges: [] });
    setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), { ...node, selected: true }]);
    props.onStatus(`已添加${definition.name}`);
  }, [props, record, setNodes]);

  const addNodeByType = useCallback((type: V2NodeType, data?: Partial<V2NodeData>) => {
    const center = reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    insertNodeAt(type, { x: center.x - 143, y: center.y - 120 }, data);
  }, [insertNodeAt, reactFlow]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(V2_NODE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const type = event.dataTransfer.getData(V2_NODE_DRAG_MIME) as V2NodeType;
    if (!NODE_BY_TYPE.has(type)) return;
    event.preventDefault();
    const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    insertNodeAt(type, { x: point.x - 143, y: point.y - 24 });
  }, [insertNodeAt, reactFlow]);

  const autoLayout = useCallback(async () => {
    if (nodesRef.current.length < 2) return;
    props.onStatus('正在排列');
    const arranged = await layoutGraph(nodesRef.current, edgesRef.current);
    const before = Object.fromEntries(nodesRef.current.map((node) => [node.id, node.position]));
    const after = Object.fromEntries(arranged.map((node) => [node.id, node.position]));
    record({ kind: 'positions', before, after });
    setNodes(arranged);
    requestAnimationFrame(() => reactFlow.fitView({ padding: 0.16, duration: 320 }));
    props.onStatus('排列完成');
  }, [props, reactFlow, record, setNodes]);

  useImperativeHandle(ref, () => ({
    addNode: addNodeByType,
    autoLayout,
    fitView: () => reactFlow.fitView({ padding: 0.16, duration: 260 }),
    undo,
    redo,
  }), [addNodeByType, autoLayout, reactFlow, redo, undo]);

  const updateNode = useCallback((id: string, patch: Partial<V2NodeData>) => {
    const node = nodesRef.current.find((item) => item.id === id);
    if (!node) return;
    const before = node.data;
    const after = { ...before, ...patch };
    const last = undoStack.current[undoStack.current.length - 1];
    const now = Date.now();
    if (last?.kind === 'data' && last.nodeId === id && now - last.at < 700) {
      last.after = after;
      last.at = now;
      redoStack.current = [];
    } else {
      record({ kind: 'data', nodeId: id, before, after, at: now });
    }
    setNodes((current) => current.map((item) => item.id === id ? { ...item, data: after } : item));
  }, [record, setNodes]);

  const finishMaskEdit = useCallback(async (result?: string) => {
    const editor = maskEditor;
    setMaskEditor(null);
    if (!editor || !result) return;
    try {
      props.onStatus('正在保存蒙版');
      const file = dataUrlToImageFile(result, `mask-${editor.nodeId}.png`);
      const maskUrl = await props.onUploadImage(file, 'mask');
      updateNode(editor.nodeId, { maskUrl });
      props.onStatus('蒙版已保存');
    } catch (reason) {
      props.onStatus(reason instanceof Error ? reason.message : '蒙版保存失败');
    }
  }, [maskEditor, props, updateNode]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    const edge = {
      ...connection,
      id: `edge-${crypto.randomUUID()}`,
      type: 'default',
    } as V2Edge;
    record({ kind: 'structure', addedNodes: [], removedNodes: [], addedEdges: [cleanEdge(edge)], removedEdges: [] });
    setEdges((current) => addEdge(edge, current));
  }, [record, setEdges]);

  const validConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    const source = nodesRef.current.find((node) => node.id === connection.source);
    const target = nodesRef.current.find((node) => node.id === connection.target);
    if (!source || !target || !connection.sourceHandle || !connection.targetHandle) return false;
    return canConnect(source.type, connection.sourceHandle, target.type, connection.targetHandle);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChangeBase(changes);
  }, [onNodesChangeBase]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => onEdgesChangeBase(changes), [onEdgesChangeBase]);

  const deleteNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const connected = edgesRef.current.filter((edge) => edge.source === nodeId || edge.target === nodeId);
    record({ kind: 'structure', addedNodes: [], removedNodes: [cleanNode(node)], addedEdges: [], removedEdges: connected.map(cleanEdge) });
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setMenu(null);
  }, [record, setEdges, setNodes]);

  const duplicateNode = useCallback((nodeId: string) => {
    const source = nodesRef.current.find((node) => node.id === nodeId);
    if (!source) return;
    const copy: V2Node = {
      ...source,
      id: `${source.type}-${crypto.randomUUID()}`,
      position: { x: source.position.x + 36, y: source.position.y + 36 },
      data: { ...source.data, title: `${source.data.title || NODE_BY_TYPE.get(source.type)?.name} 副本` },
      selected: true,
    };
    record({ kind: 'structure', addedNodes: [cleanNode(copy)], removedNodes: [], addedEdges: [], removedEdges: [] });
    setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), copy]);
    setMenu(null);
  }, [record, setNodes]);

  const onNodeDragStart = useCallback((_event: React.MouseEvent, node: Node<V2NodeData>) => {
    const moving = nodesRef.current.filter((item) => item.id === node.id || item.selected);
    dragStartPositions.current = Object.fromEntries(moving.map((item) => [item.id, item.position]));
  }, []);

  const onNodeDragStop = useCallback(() => {
    const before = dragStartPositions.current;
    dragStartPositions.current = null;
    if (!before) return;
    const after = Object.fromEntries(
      nodesRef.current.filter((node) => before[node.id]).map((node) => [node.id, node.position]),
    );
    const changed = Object.keys(before).some((id) => before[id].x !== after[id]?.x || before[id].y !== after[id]?.y);
    if (changed) record({ kind: 'positions', before, after });
  }, [record]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('.v2-context-menu')) setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const removedNodes = nodesRef.current.filter((node) => node.selected);
        const selected = removedNodes.map((node) => node.id);
        const selectedSet = new Set(selected);
        const removedEdges = edgesRef.current.filter((edge) => edge.selected || selectedSet.has(edge.source) || selectedSet.has(edge.target));
        if (!removedNodes.length && !removedEdges.length) return;
        event.preventDefault();
        record({ kind: 'structure', addedNodes: [], removedNodes: removedNodes.map(cleanNode), addedEdges: [], removedEdges: removedEdges.map(cleanEdge) });
        const removedEdgeIds = new Set(removedEdges.map((edge) => edge.id));
        setNodes((current) => current.filter((node) => !selectedSet.has(node.id)));
        setEdges((current) => current.filter((edge) => !removedEdgeIds.has(edge.id)));
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [record, redo, setEdges, setNodes, undo]);

  const contextValue = useMemo(() => ({
    projectId: props.projectId,
    outputs: props.outputs,
    imageModels: props.imageModels,
    chatModels: props.chatModels,
    updateNode,
    uploadImage: props.onUploadImage,
    openImage: props.onOpenImage,
    editMask: (nodeId: string, imageSrc: string) => setMaskEditor({ nodeId, imageSrc }),
  }), [props.projectId, props.outputs, props.imageModels, props.chatModels, props.onUploadImage, props.onOpenImage, updateNode]);

  return (
    <V2CanvasContext.Provider value={contextValue}>
      <div className="v2-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={validConnection}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
          }}
          onPaneClick={() => setMenu(null)}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onMoveEnd={(_, viewport) => props.onViewportChange(viewport)}
          defaultViewport={props.initialViewport}
          fitView={window.innerWidth <= 680}
          fitViewOptions={{ padding: 0.14 }}
          minZoom={0.08}
          maxZoom={2.2}
          deleteKeyCode={null}
          selectionOnDrag
          zoomOnScroll
          onlyRenderVisibleElements={nodes.length > 80}
          elevateNodesOnSelect={false}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'default' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1.15} color="#dcd9e4" />
        </ReactFlow>
        {menu && (
          <div className="v2-context-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => duplicateNode(menu.nodeId)}><Copy size={15} />复制</button>
            <button type="button" onClick={() => { const target = nodesRef.current.find((node) => node.id === menu.nodeId); if (target) reactFlow.fitView({ nodes: [target], padding: 0.6, duration: 240 }); setMenu(null); }}><Maximize size={15} />定位</button>
            <button className="danger" type="button" onClick={() => deleteNode(menu.nodeId)}><Trash2 size={15} />删除</button>
          </div>
        )}
        {maskEditor && (
          <ImageEditor
            imageSrc={maskEditor.imageSrc}
            nodeId={maskEditor.nodeId}
            ctx={MASK_EDITOR_CONTEXT}
            maskOnly
            onClose={(result) => { void finishMaskEdit(result); }}
          />
        )}
      </div>
    </V2CanvasContext.Provider>
  );
});

const V2Canvas = forwardRef<CanvasHandle, Props>(function V2Canvas(props, ref) {
  return <ReactFlowProvider><V2CanvasInner {...props} ref={ref} /></ReactFlowProvider>;
});

export default V2Canvas;
