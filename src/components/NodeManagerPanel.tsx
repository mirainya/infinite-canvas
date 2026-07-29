import { useMemo, useState } from 'react';
import type { Node } from 'reactflow';
import { getNodeDef } from '../nodes';
import type { CanvasNodeData } from '../types';

type ManagerFilter = 'all' | 'nodes' | 'groups' | 'hidden';

type NodeManagerPanelProps = {
  nodes: Node<CanvasNodeData>[];
  onAddGroup: () => void;
  onFocusNode: (nodeId: string) => void;
  onEditNode: (nodeId: string) => void;
  onSetHidden: (nodeIds: string[], hidden: boolean) => void;
  onSetLocked: (nodeIds: string[], locked: boolean) => void;
  onDeleteNodes: (nodeIds: string[]) => void;
};

const PAGE_SIZE = 50;

const isLocked = (node: Node<CanvasNodeData>) => node.data.locked === true || node.draggable === false;

function orderManagedNodes(nodes: Node<CanvasNodeData>[]) {
  const childMap = new Map<string, Node<CanvasNodeData>[]>();
  const roots: Node<CanvasNodeData>[] = [];

  for (const node of nodes) {
    if (node.parentNode) {
      const siblings = childMap.get(node.parentNode) ?? [];
      siblings.push(node);
      childMap.set(node.parentNode, siblings);
    } else {
      roots.push(node);
    }
  }

  const ordered: Node<CanvasNodeData>[] = [];
  for (const root of roots) {
    ordered.push(root);
    if (root.type === 'groupNode') ordered.push(...(childMap.get(root.id) ?? []));
  }

  const included = new Set(ordered.map((node) => node.id));
  ordered.push(...nodes.filter((node) => !included.has(node.id)));
  return ordered;
}

export default function NodeManagerPanel({
  nodes,
  onAddGroup,
  onFocusNode,
  onEditNode,
  onSetHidden,
  onSetLocked,
  onDeleteNodes,
}: NodeManagerPanelProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ManagerFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const filteredNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orderManagedNodes(nodes).filter((node) => {
      if (filter === 'nodes' && node.type === 'groupNode') return false;
      if (filter === 'groups' && node.type !== 'groupNode') return false;
      if (filter === 'hidden' && !node.hidden) return false;
      if (!normalized) return true;

      const definition = node.data.defId ? getNodeDef(node.data.defId) : undefined;
      return [node.data.title, definition?.name, definition?.category, node.data.note, node.data.tags?.join(' ')]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [filter, nodes, query]);

  const displayedNodes = filteredNodes.slice(0, limit);
  const selected = Array.from(selectedIds).filter((id) => nodeById.has(id));
  const allDisplayedSelected = displayedNodes.length > 0 && displayedNodes.every((node) => selectedIds.has(node.id));
  const groups = nodes.filter((node) => node.type === 'groupNode').length;
  const hidden = nodes.filter((node) => node.hidden).length;

  const toggleSelected = (nodeId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const toggleDisplayed = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const node of displayedNodes) {
        if (allDisplayedSelected) next.delete(node.id);
        else next.add(node.id);
      }
      return next;
    });
  };

  const runSelected = (action: (ids: string[]) => void) => {
    if (selected.length === 0) return;
    action(selected);
  };

  return (
    <div className="panel-node-manager">
      <div className="panel-node-manager__summary">
        <div>
          <strong>{nodes.length}</strong>
          <span>全部节点</span>
        </div>
        <div>
          <strong>{groups}</strong>
          <span>分组</span>
        </div>
        <div>
          <strong>{hidden}</strong>
          <span>已隐藏</span>
        </div>
        <button type="button" className="panel-node-manager__add" onClick={onAddGroup}>
          <span aria-hidden="true">＋</span>分组
        </button>
      </div>

      <div className="panel-node-manager__search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          placeholder="搜索节点、标签或备注"
          onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
        />
        {query && (
          <button type="button" aria-label="清空管理搜索" title="清空" onClick={() => setQuery('')}>×</button>
        )}
      </div>

      <div className="panel-node-manager__filters" aria-label="节点分类">
        {([
          ['all', '全部'],
          ['nodes', '节点'],
          ['groups', '分组'],
          ['hidden', '隐藏'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-label={`筛选${label}`}
            aria-pressed={filter === value}
            className={filter === value ? 'active' : ''}
            onClick={() => { setFilter(value); setLimit(PAGE_SIZE); }}
          >{label}</button>
        ))}
      </div>

      <div className="panel-node-manager__selection">
        <label>
          <input type="checkbox" checked={allDisplayedSelected} onChange={toggleDisplayed} />
          <span>{selected.length > 0 ? `已选 ${selected.length}` : `当前 ${filteredNodes.length}`}</span>
        </label>
        {selected.length > 0 && (
          <div className="panel-node-manager__bulk">
            <button type="button" aria-label="批量隐藏" onClick={() => runSelected((ids) => onSetHidden(ids, true))}>隐藏</button>
            <button type="button" aria-label="批量显示" onClick={() => runSelected((ids) => onSetHidden(ids, false))}>显示</button>
            <button type="button" aria-label="批量锁定" onClick={() => runSelected((ids) => onSetLocked(ids, true))}>锁定</button>
            <button type="button" aria-label="批量解锁" onClick={() => runSelected((ids) => onSetLocked(ids, false))}>解锁</button>
            <button type="button" aria-label="批量删除" className="danger" onClick={() => { runSelected(onDeleteNodes); setSelectedIds(new Set()); }}>删除</button>
          </div>
        )}
      </div>

      {displayedNodes.length === 0 ? (
        <div className="panel-node-manager__empty">
          <span>⌕</span>
          <strong>没有匹配节点</strong>
        </div>
      ) : (
        <div className="panel-node-manager__list">
          {displayedNodes.map((node) => {
            const definition = node.data.defId ? getNodeDef(node.data.defId) : undefined;
            const parent = node.parentNode ? nodeById.get(node.parentNode) : undefined;
            const locked = isLocked(node);
            const title = node.data.title || definition?.name || '未命名节点';
            const type = node.type === 'groupNode' ? '分组' : definition?.category ?? '节点';
            return (
              <div
                key={node.id}
                className={`panel-node-manager__item ${node.parentNode ? 'panel-node-manager__item--child' : ''} ${node.hidden ? 'panel-node-manager__item--hidden' : ''}`}
              >
                <input
                  type="checkbox"
                  aria-label={`选择 ${title}`}
                  checked={selectedIds.has(node.id)}
                  onChange={() => toggleSelected(node.id)}
                />
                <span className="panel-node-manager__dot" style={{ background: node.data.color ?? (node.type === 'groupNode' ? '#38bdf8' : '#a78bfa') }} />
                <button type="button" className="panel-node-manager__identity" onClick={() => onFocusNode(node.id)}>
                  <strong>{title}</strong>
                  <span>{parent ? `${parent.data.title || '分组'} / ${type}` : type}</span>
                  {node.data.note?.trim() && <small>{node.data.note}</small>}
                </button>
                <div className="panel-node-manager__actions">
                  <button type="button" aria-label={`定位 ${title}`} title="定位" onClick={() => onFocusNode(node.id)}>⌖</button>
                  <button type="button" aria-label={`编辑 ${title}`} title="编辑信息" onClick={() => onEditNode(node.id)}>✎</button>
                  <button
                    type="button"
                    aria-label={`${node.hidden ? '显示' : '隐藏'} ${title}`}
                    title={node.hidden ? '显示' : '隐藏'}
                    onClick={() => onSetHidden([node.id], !node.hidden)}
                  >{node.hidden ? '○' : '◉'}</button>
                  <button
                    type="button"
                    aria-label={`${locked ? '解锁' : '锁定'} ${title}`}
                    title={locked ? '解锁位置' : '锁定位置'}
                    onClick={() => onSetLocked([node.id], !locked)}
                  >{locked ? '解' : '锁'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {displayedNodes.length < filteredNodes.length && (
        <button type="button" className="panel-node-manager__more" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
          继续显示（{displayedNodes.length}/{filteredNodes.length}）
        </button>
      )}
    </div>
  );
}
