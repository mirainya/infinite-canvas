import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Node } from 'reactflow';
import { COLOR_OPTIONS, NODE_TEMPLATES } from '../constants';
import { getNodesByCategory } from '../nodes';
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

export function TemplatePanel({ onAddTemplate }: { onAddTemplate: (template: NodeTemplate) => void }) {
  return (
    <div className="panel-templates">
      {NODE_TEMPLATES.map((template) => (
        <button key={template.id} className="panel-templates__item" type="button" onClick={() => onAddTemplate(template)}>
          <span className="panel-templates__dot" style={{ background: template.color }} />
          <span>{template.name}</span>
        </button>
      ))}
    </div>
  );
}

export function NodeLibraryPanel() {
  const grouped = getNodesByCategory();
  return (
    <div className="panel-templates">
      {Array.from(grouped.entries()).map(([category, defs]) => (
        <div key={category} className="panel-node-library__category">
          <h3 className="panel-node-library__category-title">{category}</h3>
          {defs.map((def) => (
            <button
              key={def.defId}
              className="panel-templates__item"
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-def-id', def.defId);
                e.dataTransfer.effectAllowed = 'move';
                const ghost = e.currentTarget.cloneNode(true) as HTMLElement;
                ghost.style.position = 'absolute';
                ghost.style.top = '-1000px';
                ghost.style.width = `${e.currentTarget.offsetWidth}px`;
                ghost.classList.add('drag-ghost');
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());
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
}: {
  projects: LocalProject[];
  currentProjectId: string | null;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onSave: () => void;
  onOpen: (project: LocalProject) => void;
  onDelete: (projectId: string) => void;
}) {
  return (
    <div className="panel-projects">
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
      </div>
      {matches.length > 0 && (
        <div className="panel-search__nav">
          <span className="panel-search__count">{activeIndex + 1}/{matches.length}</span>
          <button type="button" onClick={() => onFocusMatch(activeIndex - 1)}>▲</button>
          <button type="button" onClick={() => onFocusMatch(activeIndex + 1)}>▼</button>
        </div>
      )}
      {matches.length > 0 && (
        <div className="panel-search__results">
          {matches.map((node, i) => (
            <button
              key={node.id}
              type="button"
              className={`panel-search__result ${i === activeIndex ? 'panel-search__result--active' : ''}`}
              onClick={() => { onSetActiveIndex(i); onFocusNode(node.id); }}
            >
              <span className="panel-search__result-dot" style={{ background: node.data.color }} />
              {node.data.title || '无标题'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InspectorPanel({
  selectedNodes,
  selectedTagsText,
  onUpdateSelected,
  onOpenDetail,
}: {
  selectedNodes: Node<CanvasNodeData>[];
  selectedTagsText: string;
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
          <input
            className="panel-inspector__input"
            value={selectedTagsText}
            placeholder={selectedNodes.length === 1 ? '标签，用逗号分隔' : '多选时不可编辑标签'}
            disabled={selectedNodes.length !== 1}
            onChange={(e) => onUpdateSelected({ tags: parseTags(e.target.value) })}
          />
          {selectedNodes.length === 1 && (
            <button type="button" className="panel-inspector__detail-btn" onClick={() => onOpenDetail(selectedNodes[0].id)}>
              打开详情
            </button>
          )}
        </>
      )}
    </div>
  );
}

