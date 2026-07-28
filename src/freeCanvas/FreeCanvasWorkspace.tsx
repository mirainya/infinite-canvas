import { useCallback, useEffect, useRef, useState } from 'react';
import './freeCanvas.css';
import {
  Archive,
  Brush,
  ChevronLeft,
  FolderOpen,
  Frame,
  ImagePlus,
  Images,
  LayoutTemplate,
  LogOut,
  Maximize,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Sparkles,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import ImageEditor from '../components/ImageEditor';
import Lightbox from '../components/Lightbox';
import * as v2Api from '../v2/api';
import type { Asset, ModelInfo, Project, ProjectSummary, ProjectVersion, V2Graph, WorkflowRun } from '../v2/types';
import CanvasStage, {
  FREE_CANVAS_ASSET_MIME,
  FREE_CANVAS_TOOL_MIME,
  type CanvasStageHandle,
} from './CanvasStage';
import { buildImageRunGraph, imageUrlsFromRun, type ImageReference, type ImageRunRequest } from './canvasHelpers';
import { mergeCanvasDocuments } from './canvasDocument';

type PanelId = 'add' | 'assets' | 'plans' | 'runs' | 'projects';

const PANELS = [
  { id: 'add' as const, label: '添加', icon: Plus },
  { id: 'assets' as const, label: '素材', icon: Images },
  { id: 'plans' as const, label: '创作方案', icon: LayoutTemplate },
  { id: 'runs' as const, label: '任务', icon: Archive },
  { id: 'projects' as const, label: '画布', icon: FolderOpen },
];

const PLAN_ITEMS = [
  { id: 'product', name: '商品套图', detail: '主图、场景、细节、功能与氛围图', frames: ['主图', '场景图', '细节图', '功能图', '氛围图'] },
  { id: 'inspiration', name: '灵感板', detail: '集中整理风格、配色与构图参考', frames: ['灵感素材', '候选方案', '最终方向'] },
  { id: 'storyboard', name: '分镜画板', detail: '按镜头顺序组织横向画面', frames: ['镜头 01', '镜头 02', '镜头 03', '镜头 04'] },
];

function dataUrlFile(dataUrl: string, name: string) {
  const [header, encoded] = dataUrl.split(',', 2);
  const mime = header.match(/^data:([^;]+)/)?.[1] || 'image/png';
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

function splitGraph(reference: ImageReference): V2Graph {
  return {
    nodes: [
      { id: 'split-source', type: 'image-input', position: { x: 0, y: 0 }, data: { url: reference.url } },
      { id: 'split', type: 'image-split', position: { x: 300, y: 0 }, data: { rows: 2, columns: 2 } },
    ],
    edges: [{
      id: 'split-edge', source: 'split-source', target: 'split', sourceHandle: 'image', targetHandle: 'image',
    }],
  };
}

export default function FreeCanvasWorkspace() {
  const { avatar, credits, nickname, username, logout, refreshCredits } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [imageModels, setImageModels] = useState<ModelInfo[]>([]);
  const [panel, setPanel] = useState<PanelId>('add');
  const [panelOpen, setPanelOpen] = useState(true);
  const [status, setStatus] = useState('已保存');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [maskTarget, setMaskTarget] = useState<ImageReference | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<CanvasStageHandle>(null);
  const projectRef = useRef<Project | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyVersion = useRef(0);
  const savedVersion = useRef(0);
  const saving = useRef(false);
  const persistRef = useRef<() => Promise<void>>(async () => undefined);

  const openProject = useCallback(async (projectId: string) => {
    setLoading(true);
    setError('');
    try {
      const item = await v2Api.getProject(projectId);
      projectRef.current = item;
      setProject(item);
      savedVersion.current = dirtyVersion.current;
      const [assetItems, runItems, versionItems] = await Promise.all([
        v2Api.listAssets(item.id),
        v2Api.listRuns(item.id),
        v2Api.listProjectVersions(item.id),
      ]);
      setAssets(assetItems);
      setRuns(runItems);
      setVersions(versionItems);
      setCanvasKey((value) => value + 1);
      setStatus('已保存');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布打开失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const createBlank = useCallback(async () => {
    setLoading(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await persistRef.current();
      const item = await v2Api.createProject('未命名画布');
      setProjects((current) => [item, ...current]);
      await openProject(item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布创建失败');
      setLoading(false);
    }
  }, [openProject]);

  useEffect(() => {
    let active = true;
    Promise.all([v2Api.listProjects(), v2Api.listModels('image')])
      .then(async ([projectItems, models]) => {
        if (!active) return;
        setProjects(projectItems);
        setImageModels(models);
        if (projectItems[0]) await openProject(projectItems[0].id);
        else await createBlank();
      })
      .catch((reason) => { if (active) { setError(reason.message || '画布读取失败'); setLoading(false); } });
    return () => { active = false; };
  }, [createBlank, openProject]);

  const persist = useCallback(async () => {
    const current = projectRef.current;
    const snapshot = stageRef.current?.snapshot();
    if (!current || !snapshot || saving.current || dirtyVersion.current === savedVersion.current) return;
    const version = dirtyVersion.current;
    saving.current = true;
    setStatus('保存中');
    const next: Project = {
      ...current,
      viewport: { x: snapshot.camera.x, y: snapshot.camera.y, zoom: snapshot.camera.zoom },
      settings: { ...current.settings, free_canvas_v2: snapshot.document, canvas_mode: 'free-konva' },
    };
    try {
      let saved: Project;
      try {
        saved = await v2Api.saveProject(next, next.graph, next.viewport);
      } catch (reason) {
        if (!(reason instanceof v2Api.V2ApiError) || reason.status !== 409) throw reason;
        const latest = await v2Api.getProject(next.id);
        const baseDocument = current.settings.free_canvas_v2 ?? current.settings.free_canvas_document;
        const remoteDocument = latest.settings.free_canvas_v2 ?? latest.settings.free_canvas_document;
        const rebased: Project = {
          ...latest,
          name: next.name,
          description: next.description,
          viewport: next.viewport,
          settings: {
            ...latest.settings,
            ...next.settings,
            free_canvas_v2: mergeCanvasDocuments(baseDocument, snapshot.document, remoteDocument),
          },
        };
        saved = await v2Api.saveProject(rebased, latest.graph, rebased.viewport);
      }
      projectRef.current = saved;
      setProject(saved);
      setProjects((items) => items.map((item) => item.id === saved.id ? { ...item, ...saved } : item));
      savedVersion.current = version;
      setStatus('已保存');
    } catch (reason) {
      setStatus('保存失败');
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      saving.current = false;
      if (dirtyVersion.current !== version) {
        saveTimer.current = setTimeout(() => void persistRef.current(), 600);
      }
    }
  }, []);

  useEffect(() => { persistRef.current = persist; }, [persist]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const markDirty = useCallback(() => {
    dirtyVersion.current += 1;
    setStatus('未保存');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persistRef.current(), 900);
  }, []);

  const uploadFiles = useCallback(async (files: File[]) => {
    const current = projectRef.current;
    if (!current) throw new Error('画布尚未打开');
    const uploaded = await Promise.all(files.map((file) => v2Api.uploadAsset(file, current.id, 'image')));
    setAssets((items) => [...uploaded, ...items]);
    return uploaded;
  }, []);

  const waitForRun = useCallback(async (graph: V2Graph) => {
    const current = projectRef.current;
    if (!current) throw new Error('画布尚未打开');
    setRunning(true);
    setError('');
    try {
      let run = await v2Api.createRun(current.id, graph);
      setRuns((items) => [run, ...items]);
      while (run.status === 'queued' || run.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        run = await v2Api.getRun(run.id);
        setRuns((items) => items.map((item) => item.id === run.id ? run : item));
      }
      if (run.status !== 'succeeded') throw new Error(run.error || '任务未完成');
      const [assetItems] = await Promise.all([v2Api.listAssets(current.id), refreshCredits()]);
      setAssets(assetItems);
      return run;
    } finally {
      setRunning(false);
    }
  }, [refreshCredits]);

  const generate = useCallback(async (request: ImageRunRequest) => {
    const run = await waitForRun(buildImageRunGraph(request));
    const urls = imageUrlsFromRun(run);
    if (!urls.length) throw new Error('任务完成但没有图片结果');
    return urls;
  }, [waitForRun]);

  const split = useCallback(async (reference: ImageReference) => {
    const run = await waitForRun(splitGraph(reference));
    const output = run.output_snapshot?.split;
    const urls = Array.isArray(output?.images) ? output.images.filter((item): item is string => typeof item === 'string') : [];
    if (!urls.length) throw new Error('切分完成但没有图片结果');
    return urls;
  }, [waitForRun]);

  const renameProject = (name: string) => {
    const current = projectRef.current;
    if (!current) return;
    const next = { ...current, name };
    projectRef.current = next;
    setProject(next);
    markDirty();
  };

  const switchProject = async (id: string) => {
    if (id === projectRef.current?.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist();
    await openProject(id);
  };

  const saveVersion = async () => {
    const current = projectRef.current;
    if (!current) return;
    await persist();
    const version = await v2Api.createProjectVersion(current.id);
    setVersions((items) => [version, ...items.filter((item) => item.id !== version.id)]);
  };

  const restoreVersion = async (versionId: number) => {
    const current = projectRef.current;
    if (!current) return;
    const restored = await v2Api.restoreProjectVersion(current.id, versionId);
    projectRef.current = restored;
    setProject(restored);
    setCanvasKey((value) => value + 1);
    setVersions(await v2Api.listProjectVersions(restored.id));
  };

  const finishMask = async (maskDataUrl?: string) => {
    const target = maskTarget;
    setMaskTarget(null);
    if (!target || !maskDataUrl) return;
    try {
      const current = projectRef.current;
      if (!current) return;
      const asset = await v2Api.uploadAsset(dataUrlFile(maskDataUrl, `mask-${Date.now()}.png`), current.id, 'mask');
      stageRef.current?.setImageMask(target.shapeId, asset.original_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '蒙版上传失败');
    }
  };

  const currentDocument = project?.settings.free_canvas_v2 ?? project?.settings.free_canvas_document;

  return (
    <main className="fc-workspace">
      <nav className="fc-rail" aria-label="画布菜单">
        <button className="fc-logo" type="button" title="Infinite Canvas" onClick={() => setPanelOpen(false)}>
          <Sparkles size={19} />
          <i className={status === '已保存' ? 'saved' : ''} />
        </button>
        {PANELS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" title={item.label} className={panelOpen && panel === item.id ? 'active' : ''} onClick={() => {
              if (panel === item.id) setPanelOpen((open) => !open);
              else { setPanel(item.id); setPanelOpen(true); }
            }}>
              <Icon size={19} /><span>{item.label}</span>
            </button>
          );
        })}
        <button className="fc-account" type="button" title="退出登录" onClick={logout}>
          {avatar ? <img src={avatar} alt="" /> : (nickname || username).slice(0, 1).toUpperCase()}
          <LogOut size={13} />
        </button>
      </nav>

      {panelOpen && (
        <aside className="fc-drawer">
          <header><strong>{PANELS.find((item) => item.id === panel)?.label}</strong><button type="button" title="关闭" onClick={() => setPanelOpen(false)}><ChevronLeft size={18} /></button></header>
          <div className="fc-drawer-body">
            {panel === 'add' && (
              <div className="fc-add-grid">
                <button type="button" onClick={() => fileInputRef.current?.click()}><span className="pink"><ImagePlus size={20} /></span><strong>图片</strong><small>上传到画布</small></button>
                <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData(FREE_CANVAS_TOOL_MIME, 'text')} onClick={() => stageRef.current?.addText()}><span className="lemon"><Type size={20} /></span><strong>文字</strong><small>直接编辑</small></button>
                <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData(FREE_CANVAS_TOOL_MIME, 'frame')} onClick={() => stageRef.current?.addFrames(['新画板'])}><span className="blue"><Frame size={20} /></span><strong>画板</strong><small>整理一组作品</small></button>
                <button type="button" onClick={() => stageRef.current?.setTool('draw')}><span className="mint"><Brush size={20} /></span><strong>画笔</strong><small>批注与草图</small></button>
                <button type="button" onClick={() => stageRef.current?.setTool('select')}><span className="violet"><MousePointer2 size={20} /></span><strong>选择</strong><small>移动与多选</small></button>
              </div>
            )}

            {panel === 'assets' && (
              <>
                <button className="fc-primary-action" type="button" onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} />上传图片</button>
                <div className="fc-asset-grid">
                  {assets.map((asset) => (
                    <button key={asset.id} type="button" title={asset.filename} draggable onDragStart={(event) => event.dataTransfer.setData(FREE_CANVAS_ASSET_MIME, JSON.stringify(asset))} onClick={() => stageRef.current?.addAsset(asset)}>
                      <img src={asset.thumbnail_url || asset.original_url} alt={asset.filename} />
                    </button>
                  ))}
                </div>
                {!assets.length && <p className="fc-empty-copy">暂无素材</p>}
              </>
            )}

            {panel === 'plans' && PLAN_ITEMS.map((item) => (
              <button className="fc-plan" type="button" key={item.id} onClick={() => stageRef.current?.addFrames(item.frames)}>
                <span><LayoutTemplate size={18} /></span><strong>{item.name}</strong><small>{item.detail}</small>
              </button>
            ))}

            {panel === 'runs' && (
              <div className="fc-run-list">
                {runs.map((run) => (
                  <div key={run.id} className={`status-${run.status}`}>
                    <span>{run.status === 'succeeded' ? '已完成' : run.status === 'failed' ? '失败' : run.status === 'cancelled' ? '已取消' : `进行中 ${run.progress}%`}</span>
                    <small>{new Date(run.created_at).toLocaleString('zh-CN')} · {run.credits_used || 0} 积分</small>
                    {(run.status === 'queued' || run.status === 'running') && <button type="button" onClick={() => void v2Api.cancelRun(run.id)}>取消</button>}
                    {run.error && <em>{run.error}</em>}
                  </div>
                ))}
                {!runs.length && <p className="fc-empty-copy">暂无任务</p>}
              </div>
            )}

            {panel === 'projects' && project && (
              <>
                <label className="fc-project-name">画布名称<input value={project.name} maxLength={120} onChange={(event) => renameProject(event.target.value)} /></label>
                <div className="fc-project-actions">
                  <button type="button" onClick={() => void createBlank()}><Plus size={15} />新画布</button>
                  <button type="button" onClick={() => void saveVersion()}><Save size={15} />保存版本</button>
                </div>
                <h3>全部画布</h3>
                {projects.map((item) => <button className={`fc-project-row ${item.id === project.id ? 'active' : ''}`} type="button" key={item.id} onClick={() => void switchProject(item.id)}><strong>{item.name}</strong><small>{new Date(item.updated_at).toLocaleDateString('zh-CN')}</small></button>)}
                <h3>历史版本</h3>
                {versions.map((version) => <button className="fc-version-row" type="button" key={version.id} onClick={() => void restoreVersion(version.id)}><span>版本 {version.revision}</span><small>{new Date(version.created_at).toLocaleString('zh-CN')}</small></button>)}
              </>
            )}
          </div>
        </aside>
      )}

      <section className="fc-canvas-shell">
        {project && !loading ? (
          <CanvasStage
            key={`${project.id}-${canvasKey}`}
            ref={stageRef}
            document={currentDocument}
            viewport={project.viewport}
            imageModels={imageModels}
            running={running}
            onDocumentChange={markDirty}
            onUploadFiles={uploadFiles}
            onGenerate={generate}
            onSplit={split}
            onOpenImage={setLightbox}
            onEditMask={setMaskTarget}
            onError={setError}
          />
        ) : (
          <div className="fc-loading"><RefreshCw className="spin" size={22} /><span>正在准备画布</span></div>
        )}

        <div className="fc-user-status">
          <span title="积分"><Sparkles size={14} />{credits}</span>
          <button type="button" title={nickname || username} onClick={() => { setPanel('projects'); setPanelOpen(true); }}>
            {avatar ? <img src={avatar} alt="" /> : (nickname || username).slice(0, 1).toUpperCase()}
          </button>
        </div>
        <div className="fc-canvas-controls">
          <button type="button" title="撤销" onClick={() => stageRef.current?.undo()}><Undo2 size={17} /></button>
          <button type="button" title="重做" onClick={() => stageRef.current?.redo()}><Redo2 size={17} /></button>
          <button type="button" title="显示全部" onClick={() => stageRef.current?.fit()}><Maximize size={17} /></button>
          <span>{status}</span>
        </div>
        {error && <div className="fc-toast"><span>{error}</span><button type="button" title="关闭" onClick={() => setError('')}><X size={15} /></button></div>}
      </section>

      <input ref={fileInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) return;
        void uploadFiles(files).then((items) => stageRef.current?.addAssets(items)).catch((reason) => setError(reason.message));
      }} />
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {maskTarget && <ImageEditor imageSrc={maskTarget.url} nodeId={maskTarget.shapeId} maskOnly ctx={{ execute: async () => { throw new Error('该模式不直接执行'); } }} onClose={(mask) => void finishMask(mask as string | undefined)} />}
    </main>
  );
}
