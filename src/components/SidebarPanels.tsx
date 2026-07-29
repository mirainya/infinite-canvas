import { useCallback, useEffect, useState, type Dispatch, type DragEvent, type RefObject, type SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import { apiFetch } from '../api';
import { COLOR_OPTIONS, NODE_TEMPLATES } from '../constants';
import { getNodeDef, getNodesByCategory } from '../nodes';
import type { CanvasNodeData, CanvasSettings, CanvasVersion, LocalProject, NodeTemplate } from '../types';

type CanvasStats = {
  nodes: number;
  groups: number;
  edges: number;
  tags: [string, number][];
  colors: [string, number][];
};

const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );

export function TemplatePanel({ onAddTemplate, getNodes, getEdges, setNodes, setEdges }: {
  onAddTemplate: (template: NodeTemplate) => void;
  getNodes?: () => Node<CanvasNodeData>[];
  getEdges?: () => Edge[];
  setNodes?: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>;
  setEdges?: Dispatch<SetStateAction<Edge[]>>;
}) {
  const [tab, setTab] = useState<'node' | 'workflow'>('node');
  const [workflows, setWorkflows] = useState<Array<{ id: number; name: string; description: string; created_at: string }>>([]);
  const [saving, setSaving] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await apiFetch('/api/templates');
      if (res.ok) setWorkflows(await res.json());
    } catch { /* ignore */ }
  }, []);

  const saveAsTemplate = useCallback(async () => {
    if (!getNodes || !getEdges) return;
    const name = prompt('模板名称：');
    if (!name) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nodes: getNodes(), edges: getEdges() }),
      });
      if (res.ok) fetchWorkflows();
    } finally { setSaving(false); }
  }, [getNodes, getEdges, fetchWorkflows]);

  const loadTemplate = useCallback(async (id: number) => {
    if (!setNodes || !setEdges) return;
    try {
      const res = await apiFetch(`/api/templates/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch { /* ignore */ }
  }, [setNodes, setEdges]);

  const deleteTemplate = useCallback(async (id: number) => {
    if (!confirm('确定删除此模板？')) return;
    await apiFetch(`/api/templates/${id}`, { method: 'DELETE' });
    fetchWorkflows();
  }, [fetchWorkflows]);

  return (
    <div className="panel-templates">
      <div className="panel-templates__tabs">
        <button type="button" className={tab === 'node' ? 'active' : ''} onClick={() => setTab('node')}>节点模板</button>
        <button
          type="button"
          className={tab === 'workflow' ? 'active' : ''}
          onClick={() => { setTab('workflow'); void fetchWorkflows(); }}
        >工作流模板</button>
      </div>
      {tab === 'node' ? (
        NODE_TEMPLATES.map((template) => (
          <button key={template.id} className="panel-templates__item" type="button" onClick={() => onAddTemplate(template)}>
            <span className="panel-templates__dot" style={{ background: template.color }} />
            <span>{template.name}</span>
          </button>
        ))
      ) : (
        <>
          {getNodes && (
            <button type="button" className="panel-templates__save-btn" disabled={saving} onClick={saveAsTemplate}>
              {saving ? '保存中...' : '保存当前画布为模板'}
            </button>
          )}
          {workflows.length === 0 && <p className="panel-templates__empty">暂无工作流模板</p>}
          {workflows.map((w) => (
            <div key={w.id} className="panel-templates__workflow-item">
              <button type="button" className="panel-templates__item" onClick={() => loadTemplate(w.id)}>
                <span>{w.name}</span>
              </button>
              <button type="button" className="panel-templates__delete" onClick={() => deleteTemplate(w.id)} title="删除">✕</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const setNodeDragPreview = (event: DragEvent<HTMLButtonElement>) => {
  event.dataTransfer.effectAllowed = 'move';
  const ghost = event.currentTarget.cloneNode(true) as HTMLElement;
  ghost.style.position = 'absolute';
  ghost.style.top = '-1000px';
  ghost.style.width = `${event.currentTarget.offsetWidth}px`;
  ghost.classList.add('drag-ghost');
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 0, 0);
  requestAnimationFrame(() => ghost.remove());
};

export function NodeLibraryPanel({ onAddNode, onAddGroup }: {
  onAddNode: (defId: string) => void;
  onAddGroup: () => void;
}) {
  const grouped = getNodesByCategory();
  return (
    <div className="panel-templates">
      <div className="panel-node-library__category">
        <h3 className="panel-node-library__category-title">画布组织</h3>
        <button
          className="panel-templates__item panel-templates__item--group"
          type="button"
          draggable
          aria-label="添加分组区域"
          onClick={onAddGroup}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-canvas-node-kind', 'group');
            setNodeDragPreview(event);
          }}
        >
          <span className="panel-templates__group-icon" aria-hidden="true" />
          <span className="panel-templates__item-copy">
            <strong>分组区域</strong>
            <small>创作分区</small>
          </span>
        </button>
      </div>
      {Array.from(grouped.entries()).map(([category, defs]) => (
        <div key={category} className="panel-node-library__category">
          <h3 className="panel-node-library__category-title">{category}</h3>
          {defs.map((def) => (
            <button
              key={def.defId}
              className="panel-templates__item"
              type="button"
              draggable
              onClick={() => onAddNode(def.defId)}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-def-id', def.defId);
                setNodeDragPreview(e);
              }}
            >
              <span className="panel-templates__dot" style={{ background: '#34d399' }} />
              <span>{def.name}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatsPanel({
  stats,
  onSearch,
}: {
  stats: CanvasStats;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="panel-stats">
      <div className="panel-stats__grid">
        <div className="panel-stats__card">
          <strong>{stats.nodes}</strong>
          <span>节点</span>
        </div>
        <div className="panel-stats__card">
          <strong>{stats.groups}</strong>
          <span>分组</span>
        </div>
        <div className="panel-stats__card">
          <strong>{stats.edges}</strong>
          <span>连线</span>
        </div>
      </div>

      {stats.tags.length > 0 && (
        <div className="panel-stats__section">
          <h3>标签分布</h3>
          <div className="panel-stats__tags">
            {stats.tags.slice(0, 8).map(([tag, count]) => (
              <button key={tag} className="panel-stats__tag" type="button" onClick={() => onSearch(tag)}>
                #{tag}<span>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stats.colors.length > 0 && (
        <div className="panel-stats__section">
          <h3>颜色分布</h3>
          <div className="panel-stats__colors">
            {stats.colors.map(([color, count]) => (
              <div key={color}>
                <span className="panel-stats__color-dot" style={{ background: color }} />
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function VersionsPanel({
  versions,
  onCreate,
  onRestore,
  onDelete,
}: {
  versions: CanvasVersion[];
  onCreate: () => void;
  onRestore: (version: CanvasVersion) => void;
  onDelete: (versionId: string) => void;
}) {
  return (
    <div className="panel-versions">
      <button type="button" className="panel-versions__create" onClick={onCreate}>
        + 创建版本
      </button>
      {versions.length === 0 ? (
        <p className="panel-versions__empty">暂无历史版本</p>
      ) : (
        <div className="panel-versions__list">
          {versions.map((version) => (
            <div key={version.id} className="panel-versions__item">
              <div className="panel-versions__info">
                <strong>{version.name}</strong>
                <span>{new Date(version.savedAt).toLocaleString()}</span>
              </div>
              <div className="panel-versions__actions">
                <button type="button" onClick={() => onRestore(version)}>恢复</button>
                <button type="button" onClick={() => onDelete(version.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectsPanel({
  projects,
  currentProjectId,
  projectName,
  onProjectNameChange,
  onSave,
  onOpen,
  onDelete,
  cloudList,
  syncing,
  onCloudSave,
  onCloudLoad,
  onCloudDelete,
  onCloudRefresh,
}: {
  projects: LocalProject[];
  currentProjectId: string | null;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onSave: () => void;
  onOpen: (project: LocalProject) => void;
  onDelete: (projectId: string) => void;
  cloudList?: { id: string; name: string; updated_at: string }[];
  syncing?: boolean;
  onCloudSave?: () => void;
  onCloudLoad?: (id: string) => void;
  onCloudDelete?: (id: string) => void;
  onCloudRefresh?: () => void;
}) {
  const [tab, setTab] = useState<'local' | 'cloud'>('local');

  useEffect(() => { if (tab === 'cloud' && onCloudRefresh) onCloudRefresh(); }, [tab, onCloudRefresh]);

  return (
    <div className="panel-projects">
      <div className="panel-projects__tabs" style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button type="button" className={`panel-projects__tab ${tab === 'local' ? 'panel-projects__tab--active' : ''}`} onClick={() => setTab('local')}>本地</button>
        <button type="button" className={`panel-projects__tab ${tab === 'cloud' ? 'panel-projects__tab--active' : ''}`} onClick={() => setTab('cloud')}>云端</button>
      </div>

      {tab === 'local' && (
        <>
          <div className="panel-projects__save">
            <input
              className="panel-projects__name-input"
              value={projectName}
              placeholder="项目名称"
              onChange={(e) => onProjectNameChange(e.target.value)}
            />
            <button type="button" className="panel-projects__save-btn" onClick={onSave}>保存</button>
          </div>
          {projects.length === 0 ? (
            <p className="panel-projects__empty">暂无本地项目</p>
          ) : (
            <div className="panel-projects__list">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`panel-projects__item ${project.id === currentProjectId ? 'panel-projects__item--active' : ''}`}
                >
                  <div className="panel-projects__item-info">
                    <strong>{project.name}</strong>
                    <span>{new Date(project.updatedAt).toLocaleString()}</span>
                  </div>
                  <div className="panel-projects__actions">
                    <button type="button" onClick={() => onOpen(project)}>打开</button>
                    <button type="button" className="panel-projects__item-del" onClick={() => onDelete(project.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'cloud' && (
        <>
          <div className="panel-projects__save">
            <button type="button" className="panel-projects__save-btn" onClick={onCloudSave} disabled={syncing}>
              {syncing ? '同步中...' : '保存到云端'}
            </button>
          </div>
          {!cloudList?.length ? (
            <p className="panel-projects__empty">暂无云端项目</p>
          ) : (
            <div className="panel-projects__list">
              {cloudList.map((c) => (
                <div key={c.id} className={`panel-projects__item ${c.id === currentProjectId ? 'panel-projects__item--active' : ''}`}>
                  <div className="panel-projects__item-info">
                    <strong>{c.name}</strong>
                    <span>{new Date(c.updated_at).toLocaleString()}</span>
                  </div>
                  <div className="panel-projects__actions">
                    <button type="button" onClick={() => onCloudLoad?.(c.id)}>打开</button>
                    <button type="button" className="panel-projects__item-del" onClick={() => onCloudDelete?.(c.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SettingsPanel({
  settings,
  setSettings,
  onOpenShortcuts,
}: {
  settings: CanvasSettings;
  setSettings: Dispatch<SetStateAction<CanvasSettings>>;
  onOpenShortcuts: () => void;
}) {
  return (
    <div className="panel-settings">
      <div className="panel-settings__row">
        <span>主题</span>
        <select
          value={settings.theme}
          onChange={(e) => setSettings((s) => ({ ...s, theme: e.target.value as 'dark' | 'light' }))}
        >
          <option value="dark">暗色</option>
          <option value="light">亮色</option>
        </select>
      </div>
      <div className="panel-settings__row">
        <span>背景</span>
        <select
          value={settings.background}
          onChange={(e) => setSettings((s) => ({ ...s, background: e.target.value as 'dots' | 'lines' | 'cross' }))}
        >
          <option value="dots">点阵</option>
          <option value="lines">线条</option>
          <option value="cross">十字</option>
        </select>
      </div>
      <div className="panel-settings__row">
        <span>显示网格</span>
        <button
          type="button"
          className={`panel-settings__toggle ${settings.showGrid ? 'panel-settings__toggle--on' : ''}`}
          onClick={() => setSettings((s) => ({ ...s, showGrid: !s.showGrid }))}
        />
      </div>
      <div className="panel-settings__row">
        <span>吸附网格</span>
        <button
          type="button"
          className={`panel-settings__toggle ${settings.snapToGrid ? 'panel-settings__toggle--on' : ''}`}
          onClick={() => setSettings((s) => ({ ...s, snapToGrid: !s.snapToGrid }))}
        />
      </div>
      <div className="panel-settings__row">
        <span>小地图</span>
        <button
          type="button"
          className={`panel-settings__toggle ${settings.showMiniMap ? 'panel-settings__toggle--on' : ''}`}
          onClick={() => setSettings((s) => ({ ...s, showMiniMap: !s.showMiniMap }))}
        />
      </div>
      <div className="panel-settings__row">
        <span>网格大小</span>
        <input
          type="number"
          min={10}
          max={50}
          value={settings.gridSize}
          onChange={(e) => setSettings((s) => ({ ...s, gridSize: Number(e.target.value) || 20 }))}
        />
      </div>
      <button type="button" className="panel-settings__shortcuts" onClick={onOpenShortcuts}>
        快捷键说明
      </button>
    </div>
  );
}

export function SearchPanel({
  inputRef,
  query,
  activeIndex,
  matches,
  onQueryChange,
  onFocusMatch,
  onSetActiveIndex,
  onFocusNode,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  activeIndex: number;
  matches: Node<CanvasNodeData>[];
  onQueryChange: (value: string) => void;
  onFocusMatch: (index: number) => void;
  onSetActiveIndex: (index: number) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  const hasQuery = query.trim().length > 0;

  return (
    <div className="panel-search">
      <div className="panel-search__input-wrap">
        <span className="panel-search__icon">⌕</span>
        <input
          ref={inputRef}
          className="panel-search__input"
          value={query}
          placeholder="搜索节点..."
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFocusMatch(e.shiftKey ? activeIndex - 1 : activeIndex + 1);
          }}
        />
        {hasQuery && (
          <button
            type="button"
            className="panel-search__clear"
            aria-label="清空搜索"
            title="清空搜索"
            onClick={() => onQueryChange('')}
          >×</button>
        )}
      </div>

      <div className="panel-search__toolbar">
        <span className="panel-search__scope">{hasQuery ? '搜索结果' : '全部节点'}</span>
        <span className="panel-search__total">{matches.length} 个</span>
        {matches.length > 0 && (
          <div className="panel-search__nav" aria-label="切换搜索结果">
            <span className="panel-search__count">{Math.min(activeIndex + 1, matches.length)}/{matches.length}</span>
            <button type="button" aria-label="上一个节点" title="上一个节点" onClick={() => onFocusMatch(activeIndex - 1)}>↑</button>
            <button type="button" aria-label="下一个节点" title="下一个节点" onClick={() => onFocusMatch(activeIndex + 1)}>↓</button>
          </div>
        )}
      </div>

      {matches.length === 0 && (
        <div className="panel-search__empty">
          <span>⌕</span>
          <strong>没有匹配节点</strong>
          <small>可搜索标题、标签或备注</small>
        </div>
      )}

      {matches.length > 0 && (
        <div className="panel-search__results">
          {matches.map((node, i) => {
            const definition = node.data.defId ? getNodeDef(node.data.defId) : undefined;
            const kind = node.type === 'groupNode' ? '分组' : definition?.category ?? '节点';
            const tags = node.data.tags ?? [];
            const note = node.data.note?.trim();
            return (
              <button
                key={node.id}
                type="button"
                aria-current={i === activeIndex ? 'true' : undefined}
                className={`panel-search__result ${i === activeIndex ? 'panel-search__result--active' : ''}`}
                onClick={() => { onSetActiveIndex(i); onFocusNode(node.id); }}
              >
                <span className="panel-search__result-dot" style={{ background: node.data.color }} />
                <span className="panel-search__result-content">
                  <strong>{node.data.title || definition?.name || '无标题'}</strong>
                  <span className="panel-search__result-meta">
                    <span>{kind}</span>
                    {tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
                    {tags.length > 2 && <span>+{tags.length - 2}</span>}
                  </span>
                  {note && <span className="panel-search__result-note">{note}</span>}
                </span>
                <span className="panel-search__result-arrow" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function InspectorPanel({
  selectedNodes,
  selectedTitleText,
  selectedTagsText,
  selectedNoteText,
  onUpdateSelected,
  onOpenDetail,
}: {
  selectedNodes: Node<CanvasNodeData>[];
  selectedTitleText: string;
  selectedTagsText: string;
  selectedNoteText: string;
  onUpdateSelected: (data: Partial<Omit<CanvasNodeData, 'onChange'>>) => void;
  onOpenDetail: (nodeId: string) => void;
}) {
  return (
    <div className="panel-inspector">
      {selectedNodes.length === 0 ? (
        <p className="panel-inspector__empty">未选择节点</p>
      ) : (
        <>
          <p className="panel-inspector__count">已选择 {selectedNodes.length} 个节点</p>
          <div className="panel-inspector__field">
            <span className="panel-inspector__label">颜色标记</span>
            <div className="panel-inspector__colors">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`panel-inspector__color ${selectedNodes.some((n) => n.data.color === color) ? 'panel-inspector__color--active' : ''}`}
                  style={{ background: color }}
                  aria-label={`设置颜色 ${color}`}
                  onClick={() => onUpdateSelected({ color })}
                />
              ))}
            </div>
          </div>

          {selectedNodes.length === 1 && (
            <>
              <label className="panel-inspector__field" htmlFor="inspector-node-title">
                <span className="panel-inspector__label">节点标题</span>
                <input
                  id="inspector-node-title"
                  className="panel-inspector__input"
                  value={selectedTitleText}
                  placeholder="节点标题"
                  onChange={(e) => onUpdateSelected({ title: e.target.value })}
                />
              </label>
              <label className="panel-inspector__field" htmlFor="inspector-node-tags">
                <span className="panel-inspector__label">标签</span>
                <input
                  id="inspector-node-tags"
                  className="panel-inspector__input"
                  value={selectedTagsText}
                  placeholder="角色, 草稿, 待确认"
                  onChange={(e) => onUpdateSelected({ tags: parseTags(e.target.value) })}
                />
              </label>
              <label className="panel-inspector__field" htmlFor="inspector-node-note">
                <span className="panel-inspector__label">备注</span>
                <textarea
                  id="inspector-node-note"
                  className="panel-inspector__input panel-inspector__textarea"
                  value={selectedNoteText}
                  placeholder="记录用途、修改方向或待办事项..."
                  onChange={(e) => onUpdateSelected({ note: e.target.value })}
                />
              </label>
              <button type="button" className="panel-inspector__detail-btn" onClick={() => onOpenDetail(selectedNodes[0].id)}>
                打开完整信息
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
