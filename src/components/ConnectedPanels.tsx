import { lazy, memo, Suspense, useCallback, useMemo } from 'react';
import { type Edge, type Node } from 'reactflow';
import type { CanvasCoreHandle } from './CanvasCore';
import DetailDrawer from './DetailDrawer';
import CanvasContextMenu from './CanvasContextMenu';
import {
  InspectorPanel,
  SearchPanel,
  StatsPanel,
} from './SidebarPanels';
import { useCanvasData } from '../hooks/useCanvasData';
import { useCanvasStats } from '../hooks/useCanvasStats';
import { useNodeSearch } from '../hooks/useNodeSearch';
import type { CanvasNodeData, ContextMenuState } from '../types';

const NodeManagerPanel = lazy(() => import('./NodeManagerPanel'));

function expandGroupChildren(nodes: Node<CanvasNodeData>[], nodeIds: string[]) {
  const expanded = new Set(nodeIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentNode && expanded.has(node.parentNode) && !expanded.has(node.id)) {
        expanded.add(node.id);
        changed = true;
      }
    }
  }
  return expanded;
}

function expandParentGroups(nodes: Node<CanvasNodeData>[], nodeIds: Set<string>) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const expanded = new Set(nodeIds);
  for (const nodeId of nodeIds) {
    let parentId = nodeById.get(nodeId)?.parentNode;
    while (parentId) {
      expanded.add(parentId);
      parentId = nodeById.get(parentId)?.parentNode;
    }
  }
  return expanded;
}

export const SearchPanelConnected = memo(function SearchPanelConnected({
  coreRef, inputRef, query, activeIndex, onQueryChange, onFocusMatch, onSetActiveIndex, onFocusNode,
}: {
  coreRef: React.RefObject<CanvasCoreHandle | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  activeIndex: number;
  onQueryChange: (v: string) => void;
  onFocusMatch: (i: number) => void;
  onSetActiveIndex: (i: number) => void;
  onFocusNode: (id: string) => void;
}) {
  const { nodes } = useCanvasData(coreRef);
  const resetIdx = useCallback(() => onSetActiveIndex(0), [onSetActiveIndex]);
  const matches = useNodeSearch(nodes, query, resetIdx);
  return (
    <SearchPanel
      inputRef={inputRef}
      query={query}
      activeIndex={activeIndex}
      matches={matches}
      onQueryChange={onQueryChange}
      onFocusMatch={onFocusMatch}
      onSetActiveIndex={onSetActiveIndex}
      onFocusNode={onFocusNode}
    />
  );
});

export const StatsPanelConnected = memo(function StatsPanelConnected({
  coreRef, onSearch,
}: {
  coreRef: React.RefObject<CanvasCoreHandle | null>;
  onSearch: (v: string) => void;
}) {
  const { nodes, edges } = useCanvasData(coreRef);
  const stats = useCanvasStats(nodes, edges);
  return <StatsPanel stats={stats} onSearch={onSearch} />;
});

export const InspectorPanelConnected = memo(function InspectorPanelConnected({
  coreRef, onOpenDetail, rememberHistory, setStatus,
}: {
  coreRef: React.RefObject<CanvasCoreHandle | null>;
  onOpenDetail: (id: string) => void;
  rememberHistory: () => void;
  setStatus: (s: string) => void;
}) {
  const { nodes } = useCanvasData(coreRef);
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selectedTagsText = useMemo(() => {
    if (selectedNodes.length !== 1) return '';
    return selectedNodes[0].data.tags?.join(', ') ?? '';
  }, [selectedNodes]);
  const selectedTitleText = selectedNodes.length === 1 ? selectedNodes[0].data.title : '';
  const selectedNoteText = selectedNodes.length === 1 ? selectedNodes[0].data.note ?? '' : '';
  const setNodes = useCallback<React.Dispatch<React.SetStateAction<Node<CanvasNodeData>[]>>>(
    (v) => coreRef.current?.setNodes(v), [coreRef],
  );
  const updateSelectedNodesData = useCallback(
    (data: Partial<Omit<CanvasNodeData, 'onChange'>>) => {
      if (selectedNodes.length === 0) { setStatus('未选择节点'); return; }
      const ids = new Set(selectedNodes.map((n) => n.id));
      rememberHistory();
      setNodes((cur) => cur.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, ...data } } : n)));
      setStatus('已更新所选节点');
    },
    [rememberHistory, selectedNodes, setNodes, setStatus],
  );
  return (
    <InspectorPanel
      selectedNodes={selectedNodes}
      selectedTitleText={selectedTitleText}
      selectedTagsText={selectedTagsText}
      selectedNoteText={selectedNoteText}
      onUpdateSelected={updateSelectedNodesData}
      onOpenDetail={onOpenDetail}
    />
  );
});

export const NodeManagerPanelConnected = memo(function NodeManagerPanelConnected({
  coreRef,
  onAddGroup,
  onFocusNode,
  onEditNode,
  rememberHistory,
  setStatus,
}: {
  coreRef: React.RefObject<CanvasCoreHandle | null>;
  onAddGroup: () => void;
  onFocusNode: (id: string) => void;
  onEditNode: (id: string) => void;
  rememberHistory: () => void;
  setStatus: (status: string) => void;
}) {
  const { nodes } = useCanvasData(coreRef);
  const setNodes = useCallback<React.Dispatch<React.SetStateAction<Node<CanvasNodeData>[]>>>(
    (value) => coreRef.current?.setNodes(value), [coreRef],
  );
  const setEdges = useCallback<React.Dispatch<React.SetStateAction<Edge[]>>>(
    (value) => coreRef.current?.setEdges(value), [coreRef],
  );

  const setHidden = useCallback((nodeIds: string[], hidden: boolean) => {
    const descendants = expandGroupChildren(nodes, nodeIds);
    const affected = hidden ? descendants : expandParentGroups(nodes, descendants);
    rememberHistory();
    setNodes((current) => current.map((node) => (affected.has(node.id) ? { ...node, hidden } : node)));
    setStatus(hidden ? `已隐藏 ${affected.size} 个节点` : `已显示 ${affected.size} 个节点`);
  }, [nodes, rememberHistory, setNodes, setStatus]);

  const setLocked = useCallback((nodeIds: string[], locked: boolean) => {
    const affected = expandGroupChildren(nodes, nodeIds);
    rememberHistory();
    setNodes((current) => current.map((node) => (
      affected.has(node.id)
        ? { ...node, draggable: !locked, data: { ...node.data, locked } }
        : node
    )));
    setStatus(locked ? `已锁定 ${affected.size} 个节点的位置` : `已解锁 ${affected.size} 个节点的位置`);
  }, [nodes, rememberHistory, setNodes, setStatus]);

  const deleteNodes = useCallback((nodeIds: string[]) => {
    const deleting = expandGroupChildren(nodes, nodeIds);
    if (!window.confirm(`确定删除选中的 ${deleting.size} 个节点吗？`)) return;
    rememberHistory();
    setNodes((current) => current.filter((node) => !deleting.has(node.id)));
    setEdges((current) => current.filter((edge) => !deleting.has(edge.source) && !deleting.has(edge.target)));
    setStatus(`已删除 ${deleting.size} 个节点`);
  }, [nodes, rememberHistory, setEdges, setNodes, setStatus]);

  return (
    <Suspense fallback={<div className="panel-node-manager__loading">正在读取节点...</div>}>
      <NodeManagerPanel
        nodes={nodes}
        onAddGroup={onAddGroup}
        onFocusNode={onFocusNode}
        onEditNode={onEditNode}
        onSetHidden={setHidden}
        onSetLocked={setLocked}
        onDeleteNodes={deleteNodes}
      />
    </Suspense>
  );
});

export function ContextMenuConnected({
  coreRef, contextMenu, onClose, onFocusNode, onOpenDetail, onDuplicateNode, onDeleteNode, onAddGroup, onAddWorkflowNode,
}: {
  coreRef: React.RefObject<CanvasCoreHandle | null>;
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onFocusNode: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onAddGroup: (pos: { x: number; y: number }) => void;
  onAddWorkflowNode: (defId: string, pos: { x: number; y: number }) => void;
}) {
  /* eslint-disable react-hooks/refs -- coreRef is an imperative handle, safe to read */
  const node = contextMenu?.nodeId
    ? (coreRef.current?.getNodes().find((n) => n.id === contextMenu.nodeId) ?? null)
    : null;
  /* eslint-enable react-hooks/refs */
  return (
    <CanvasContextMenu
      menu={contextMenu}
      node={node}
      onClose={onClose}
      onFocusNode={onFocusNode}
      onOpenDetail={onOpenDetail}
      onDuplicateNode={onDuplicateNode}
      onDeleteNode={onDeleteNode}
      onAddGroup={onAddGroup}
      onAddWorkflowNode={onAddWorkflowNode}
    />
  );
}

export function DetailDrawerConnected({
  coreRef, detailNodeId, onClose, onUpdate,
}: {
  coreRef: React.RefObject<CanvasCoreHandle | null>;
  detailNodeId: string | null;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Omit<CanvasNodeData, 'onChange'>>) => void;
}) {
  const { nodes } = useCanvasData(coreRef);
  const node = useMemo(() => nodes.find((n) => n.id === detailNodeId) ?? null, [detailNodeId, nodes]);
  return <DetailDrawer node={node} onClose={onClose} onChange={onUpdate} />;
}
