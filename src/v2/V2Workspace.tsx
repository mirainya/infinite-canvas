import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ChevronLeft,
  FolderOpen,
  Images,
  LayoutDashboard,
  LogOut,
  Maximize,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Redo2,
  RefreshCw,
  Save,
  Sparkles,
  Undo2,
  WandSparkles,
  Workflow,
  X,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import Lightbox from '../components/Lightbox';
import { NODE_CATALOG } from './catalog';
import * as v2Api from './api';
import ProjectHub from './ProjectHub';
import { graphPatch } from './projectPatch';
import V2Canvas, { type CanvasHandle } from './V2Canvas';
import type { Asset, ModelInfo, Project, ProjectSummary, ProjectVersion, SystemTemplate, V2Graph, WorkflowRun } from './types';

type PanelId = 'nodes' | 'templates' | 'assets' | 'runs' | 'projects';

const PANEL_NAV = [
  { id: 'nodes' as const, label: '节点', icon: Workflow },
  { id: 'templates' as const, label: '模板', icon: WandSparkles },
  { id: 'assets' as const, label: '素材', icon: Images },
  { id: 'runs' as const, label: '任务', icon: Archive },
  { id: 'projects' as const, label: '项目', icon: FolderOpen },
];

const GROUPED_NODES = ['输入', '整理', '创作', '输出'].map((category) => ({
  category,
  items: NODE_CATALOG.filter((node) => node.category === category),
}));

function NodeLibrary({ onAdd }: { onAdd: CanvasHandle['addNode'] }) {
  return GROUPED_NODES.map((group) => (
    <section className="v2-library-group" key={group.category}>
      <h3>{group.category}</h3>
      <div>
        {group.items.map((item) => {
          const Icon = item.icon;
          return <button type="button" key={item.type} className={`tone-${item.tone}`} onClick={() => onAdd(item.type)}><span><Icon size={16} /></span>{item.name}</button>;
        })}
      </div>
    </section>
  ));
}

function AssetLibrary({ assets, onAdd }: { assets: Asset[]; onAdd: (asset: Asset) => void }) {
  return (
    <div className="v2-assets-grid">
      {assets.map((asset) => <button type="button" key={asset.id} title={asset.filename} onClick={() => onAdd(asset)}><img src={asset.thumbnail_url || asset.original_url} alt={asset.filename} /></button>)}
    </div>
  );
}

export default function V2Workspace() {
  const { credits, username, avatar, logout, refreshCredits } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<SystemTemplate[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<PanelId>('nodes');
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 680);
  const [status, setStatus] = useState('已同步');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [outputs, setOutputs] = useState<Record<string, Record<string, unknown>>>({});
  const [imageModels, setImageModels] = useState<ModelInfo[]>([]);
  const [chatModels, setChatModels] = useState<ModelInfo[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const canvasRef = useRef<CanvasHandle>(null);
  const graphRef = useRef<V2Graph>({ nodes: [], edges: [] });
  const persistedGraphRef = useRef<V2Graph>({ nodes: [], edges: [] });
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const projectRef = useRef<Project | null>(null);
  const initializedGraph = useRef(false);
  const dirtyVersion = useRef(0);
  const persistedDirtyVersion = useRef(0);
  const saving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRef = useRef<() => Promise<void>>(async () => undefined);

  const refreshHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projectItems, templateItems] = await Promise.all([v2Api.listProjects(), v2Api.listTemplates()]);
      setProjects(projectItems);
      setTemplates(templateItems);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([v2Api.listProjects(), v2Api.listTemplates()])
      .then(([projectItems, templateItems]) => {
        if (!active) return;
        setProjects(projectItems);
        setTemplates(templateItems);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : '读取失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    Promise.all([v2Api.listModels('image'), v2Api.listModels('chat')])
      .then(([images, chats]) => { setImageModels(images); setChatModels(chats); })
      .catch(() => undefined);
  }, []);

  const openProject = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const item = await v2Api.getProject(id);
      projectRef.current = item;
      graphRef.current = item.graph;
      persistedGraphRef.current = item.graph;
      viewportRef.current = item.viewport;
      initializedGraph.current = false;
      persistedDirtyVersion.current = dirtyVersion.current;
      setProject(item);
      setOutputs({});
      const [assetItems, runItems, versionItems] = await Promise.all([
        v2Api.listAssets(id),
        v2Api.listRuns(id),
        v2Api.listProjectVersions(id),
      ]);
      setAssets(assetItems);
      setRuns(runItems);
      setVersions(versionItems);
      const latestSuccess = runItems.find((run) => run.status === 'succeeded');
      if (latestSuccess) {
        const detail = await v2Api.getRun(latestSuccess.id);
        setOutputs(detail.output_snapshot ?? {});
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目打开失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const createBlank = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const item = await v2Api.createProject(name);
      setProjects((current) => [item, ...current]);
      await openProject(item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建失败');
      setLoading(false);
    }
  }, [openProject]);

  const createFromTemplate = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const item = await v2Api.instantiateTemplate(id);
      setProjects((current) => [item, ...current]);
      await openProject(item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模板创建失败');
      setLoading(false);
    }
  }, [openProject]);

  const persist = useCallback(async () => {
    const current = projectRef.current;
    if (!current || saving.current || dirtyVersion.current === persistedDirtyVersion.current) return;
    const version = dirtyVersion.current;
    const graph = graphRef.current;
    const patch = graphPatch(persistedGraphRef.current, graph);
    saving.current = true;
    setStatus('正在保存');
    try {
      const saved = await v2Api.patchProject(current, patch, viewportRef.current);
      persistedGraphRef.current = graph;
      const next = { ...current, ...saved, graph: graphRef.current, viewport: viewportRef.current };
      projectRef.current = next;
      setProject(next);
      persistedDirtyVersion.current = version;
      setStatus('已同步');
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      saving.current = false;
      if (dirtyVersion.current !== version) {
        saveTimer.current = setTimeout(() => void persistRef.current(), 500);
      }
    }
  }, []);

  useEffect(() => { persistRef.current = persist; }, [persist]);

  const scheduleSave = useCallback(() => {
    dirtyVersion.current += 1;
    setStatus('有未保存更改');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), 900);
  }, [persist]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleGraphChange = useCallback((graph: V2Graph) => {
    graphRef.current = graph;
    if (!initializedGraph.current) {
      initializedGraph.current = true;
      return;
    }
    scheduleSave();
  }, [scheduleSave]);

  const handleViewportChange = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    viewportRef.current = viewport;
    scheduleSave();
  }, [scheduleSave]);

  const renameProject = useCallback((name: string) => {
    if (!projectRef.current) return;
    const next = { ...projectRef.current, name };
    projectRef.current = next;
    setProject(next);
    scheduleSave();
  }, [scheduleSave]);

  const uploadImage = useCallback(async (file: File, kind = 'image') => {
    if (!projectRef.current) throw new Error('项目未打开');
    const asset = await v2Api.uploadAsset(file, projectRef.current.id, kind);
    setAssets((current) => [asset, ...current]);
    return asset.original_url;
  }, []);

  const saveAsTemplate = useCallback(async () => {
    if (!projectRef.current || templateSaving) return;
    setTemplateSaving(true);
    setError('');
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await persist();
      const current = projectRef.current;
      if (!current) return;
      const template = await v2Api.createTemplate(current, graphRef.current);
      setTemplates((items) => [...items, template]);
      setStatus('模板已保存');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模板保存失败');
    } finally {
      setTemplateSaving(false);
    }
  }, [persist, templateSaving]);

  const updateTemplate = useCallback(async (template: SystemTemplate) => {
    setTemplateSaving(true);
    setError('');
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await persist();
      const updated = await v2Api.updateTemplate(template, graphRef.current);
      setTemplates((items) => items.map((item) => item.id === updated.id ? updated : item));
      setStatus(`模板已更新至版本 ${updated.current_version ?? 1}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模板更新失败');
    } finally {
      setTemplateSaving(false);
    }
  }, [persist]);

  const createVersion = useCallback(async () => {
    const current = projectRef.current;
    if (!current) return;
    setError('');
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await persist();
      const version = await v2Api.createProjectVersion(current.id);
      setVersions((items) => [version, ...items.filter((item) => item.id !== version.id)]);
      setStatus('版本已保存');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '版本保存失败');
    }
  }, [persist]);

  const restoreVersion = useCallback(async (versionId: number) => {
    const current = projectRef.current;
    if (!current) return;
    setError('');
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const restored = await v2Api.restoreProjectVersion(current.id, versionId);
      projectRef.current = restored;
      graphRef.current = restored.graph;
      persistedGraphRef.current = restored.graph;
      viewportRef.current = restored.viewport;
      initializedGraph.current = false;
      persistedDirtyVersion.current = dirtyVersion.current;
      setProject(restored);
      setProjects((items) => items.map((item) => item.id === restored.id ? {
        ...item,
        name: restored.name,
        description: restored.description,
        revision: restored.revision,
        updated_at: restored.updated_at,
      } : item));
      setCanvasEpoch((value) => value + 1);
      setVersions(await v2Api.listProjectVersions(restored.id));
      setStatus('版本已恢复');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '版本恢复失败');
    }
  }, []);

  const startRun = useCallback(async () => {
    const current = projectRef.current;
    if (!current || running) return;
    setRunning(true);
    setError('');
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await persist();
      const run = await v2Api.createRun(current.id);
      setRuns((items) => [run, ...items]);
      setPanel('runs');
      setPanelOpen(true);
      let detail = run;
      while (detail.status === 'queued' || detail.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        detail = await v2Api.getRun(run.id);
        setRuns((items) => items.map((item) => item.id === detail.id ? detail : item));
      }
      if (detail.status === 'succeeded') {
        setOutputs(detail.output_snapshot ?? {});
        setStatus('任务完成');
      } else {
        setError(detail.error || '任务未完成');
      }
      await refreshCredits();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '任务启动失败');
    } finally {
      setRunning(false);
    }
  }, [persist, refreshCredits, running]);

  const addNode = useCallback((type: Parameters<CanvasHandle['addNode']>[0]) => {
    canvasRef.current?.addNode(type);
  }, []);

  const addAssetNode = useCallback((asset: Asset) => {
    canvasRef.current?.addNode('image-input', { url: asset.original_url, title: asset.filename });
  }, []);

  const undo = useCallback(() => canvasRef.current?.undo(), []);
  const redo = useCallback(() => canvasRef.current?.redo(), []);
  const fitView = useCallback(() => canvasRef.current?.fitView(), []);
  const autoLayout = useCallback(() => void canvasRef.current?.autoLayout(), []);

  if (!project) {
    return <ProjectHub projects={projects} templates={templates} loading={loading} error={error} username={username} avatar={avatar} onOpen={(id) => void openProject(id)} onCreate={(name) => void createBlank(name)} onTemplate={(id) => void createFromTemplate(id)} onLogout={logout} />;
  }

  return (
    <main className="v2-workspace">
      <header className="v2-topbar">
        <button className="v2-brand-button" type="button" title="返回项目" onClick={() => { setProject(null); projectRef.current = null; void refreshHome(); }}><ChevronLeft size={18} /><Sparkles size={16} /></button>
        <input className="v2-project-name" value={project.name} maxLength={120} onChange={(event) => renameProject(event.target.value)} />
        <span className={`v2-save-status ${status === '已同步' ? 'is-saved' : ''}`}>{status}</span>
        <div className="v2-topbar__tools">
          <button type="button" title="撤销" onClick={undo}><Undo2 size={17} /></button>
          <button type="button" title="重做" onClick={redo}><Redo2 size={17} /></button>
          <button type="button" title="自动排列" onClick={autoLayout}><LayoutDashboard size={17} /></button>
          <button type="button" title="适应画布" onClick={fitView}><Maximize size={17} /></button>
        </div>
        <span className="v2-credit"><Sparkles size={14} />{credits}</span>
        <button className="v2-run-button" type="button" disabled={running} onClick={() => void startRun()}><Play size={16} fill="currentColor" />{running ? '执行中' : '运行'}</button>
        <button className="v2-account-button" type="button" title="退出登录" onClick={logout}>{avatar ? <img src={avatar} alt="" /> : username.slice(0, 1).toUpperCase()}<LogOut size={15} /></button>
      </header>

      <div className="v2-workspace__body">
        <nav className="v2-rail">
          {PANEL_NAV.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" title={item.label} className={panel === item.id && panelOpen ? 'active' : ''} onClick={() => { setPanel(item.id); setPanelOpen(panel === item.id ? !panelOpen : true); }}><Icon size={19} /><span>{item.label}</span></button>;
          })}
          <button className="v2-rail__collapse" type="button" title={panelOpen ? '收起面板' : '展开面板'} onClick={() => setPanelOpen((open) => !open)}>{panelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
        </nav>

        {panelOpen && (
          <aside className="v2-sidebar">
            <header><strong>{PANEL_NAV.find((item) => item.id === panel)?.label}</strong><button type="button" title="关闭面板" onClick={() => setPanelOpen(false)}><X size={17} /></button></header>
            <div className="v2-sidebar__content">
              {panel === 'nodes' && <NodeLibrary onAdd={addNode} />}
              {panel === 'templates' && <>
                <button className="v2-sidebar-action" type="button" disabled={templateSaving} onClick={() => void saveAsTemplate()}><Save size={15} />保存当前画布为模板</button>
                {templates.map((template) => <div className="v2-sidebar-card-row" key={template.id}>
                  <button className="v2-sidebar-card" type="button" onClick={() => void createFromTemplate(template.id)}><small>{template.category}{template.current_version ? ` · v${template.current_version}` : ''}</small><strong>{template.name}</strong><span>{template.description}</span></button>
                  {template.owned && <button className="v2-sidebar-card-update" type="button" title="用当前画布更新模板" disabled={templateSaving} onClick={() => void updateTemplate(template)}><RefreshCw size={14} /></button>}
                </div>)}
              </>}
              {panel === 'assets' && <AssetLibrary assets={assets} onAdd={addAssetNode} />}
              {panel === 'runs' && runs.map((run) => <div className={`v2-run-row status-${run.status}`} key={run.id}><div><strong>{{ queued: '排队中', running: '执行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' }[run.status]}</strong><span>{run.progress}% · {run.credits_used} 积分</span></div>{(run.status === 'queued' || run.status === 'running') && <button type="button" onClick={() => void v2Api.cancelRun(run.id)}>取消</button>}{run.error && <small>{run.error}</small>}</div>)}
              {panel === 'projects' && <>
                {projects.map((item) => <button className={`v2-project-mini ${item.id === project.id ? 'active' : ''}`} type="button" key={item.id} onClick={() => void openProject(item.id)}><FolderOpen size={16} /><span><strong>{item.name}</strong><small>版本 {item.revision}</small></span></button>)}
                <div className="v2-sidebar-section-heading"><strong>版本记录</strong><button type="button" title="保存当前版本" onClick={() => void createVersion()}><Save size={14} /></button></div>
                {versions.length === 0 && <div className="v2-sidebar-empty">暂无手动版本</div>}
                {versions.map((version) => <div className="v2-version-row" key={version.id}><span><strong>版本 {version.revision}</strong><small>{version.reason} · {new Date(version.created_at).toLocaleString('zh-CN')}</small></span><button type="button" title="恢复此版本" onClick={() => void restoreVersion(version.id)}><RefreshCw size={14} /></button></div>)}
              </>}
            </div>
          </aside>
        )}

        <section className="v2-canvas-wrap">
          <V2Canvas
            key={`${project.id}-${canvasEpoch}`}
            ref={canvasRef}
            projectId={project.id}
            initialGraph={project.graph}
            initialViewport={project.viewport}
            outputs={outputs}
            imageModels={imageModels}
            chatModels={chatModels}
            onGraphChange={handleGraphChange}
            onViewportChange={handleViewportChange}
            onUploadImage={uploadImage}
            onOpenImage={setLightbox}
            onStatus={setStatus}
          />
          {error && <div className="v2-toast"><span>{error}</span><button type="button" title="关闭" onClick={() => setError('')}><X size={16} /></button></div>}
        </section>
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </main>
  );
}
