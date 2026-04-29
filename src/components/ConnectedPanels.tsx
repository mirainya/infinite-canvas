import { memo, useCallback, useMemo } from 'react';
import { type Node } from 'reactflow';
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
      selectedTagsText={selectedTagsText}
      onUpdateSelected={updateSelectedNodesData}
      onOpenDetail={onOpenDetail}
    />
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
