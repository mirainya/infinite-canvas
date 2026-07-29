import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundVariant, type Node } from 'reactflow';
import { useAuth } from './AuthContext';
import CanvasCore, { type CanvasCoreHandle } from './components/CanvasCore';
import {
  ContextMenuConnected,
  DetailDrawerConnected,
  InspectorPanelConnected,
  NodeManagerPanelConnected,
  SearchPanelConnected,
  StatsPanelConnected,
} from './components/ConnectedPanels';
import FloatingToolbar from './components/FloatingToolbar';
import {
  NodeLibraryPanel,
  ProjectsPanel,
  SettingsPanel,
  TemplatePanel,
  VersionsPanel,
} from './components/SidebarPanels';
import { HistoryPanel } from './components/HistoryPanel';
import ShortcutHelp from './components/ShortcutHelp';
import Topbar from './components/Topbar';
import {
  SETTINGS_KEY,
  initialNodes,
} from './constants';
import { useCanvasVersions } from './hooks/useCanvasVersions';
import { useContextMenu } from './hooks/useContextMenu';
import { useGroupActions } from './hooks/useGroupActions';
import { useImportExport } from './hooks/useImportExport';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useLocalProjects } from './hooks/useLocalProjects';
import { useCloudSync } from './hooks/useCloudSync';
import { useNodeClipboard } from './hooks/useNodeClipboard';
import { useNodeCreation } from './hooks/useNodeCreation';
import { useNodeFocus } from './hooks/useNodeFocus';
import { loadNodeDefs, subscribeNodeChanges } from './nodes';
import { getSpatialParentGroup } from './spatialGroups';
import { createSnapshot, readCanvasSettings, readSavedSnapshot } from './storage';
import type { CanvasNodeData, CanvasSettings } from './types';
import { LoginPage, verifyToken } from './components/LoginPage';
import { isEmbedded } from './embed';
import { signalReady, signalAuthExpired, listenForOpcAuth } from './embedAuth';
import { apiFetch } from './api';
import 'reactflow/dist/style.css';

const ImageEditor = lazy(() => import('./components/ImageEditor'));
const ProfileModal = lazy(() => import('./components/ProfileModal'));
const PasswordModal = lazy(() => import('./components/PasswordModal'));

type PanelId = 'search' | 'nodeManager' | 'templates' | 'nodeLibrary' | 'stats' | 'versions' | 'projects' | 'history' | 'settings' | 'inspector' | null;

const NAV_ITEMS: { id: PanelId; icon: string; label: string }[] = [
  { id: 'search', icon: '⌕', label: '搜索' },
  { id: 'nodeManager', icon: '▦', label: '节点管理' },
  { id: 'nodeLibrary', icon: '⬡', label: '节点库' },
  { id: 'templates', icon: '✦', label: '模板' },
  { id: 'history', icon: '⏱', label: '历史' },
  { id: 'stats', icon: '◈', label: '统计' },
  { id: 'versions', icon: '⟲', label: '版本' },
  { id: 'projects', icon: '▤', label: '项目' },
  { id: 'inspector', icon: '◉', label: '属性' },
  { id: 'settings', icon: '⚙', label: '设置' },
];

function App() {
  const { authed, checking, login, logout } = useAuth();

  // 嵌入态(被 OPC iframe 嵌入)且未登录: 走 SSO, 等父窗口推送账号中心令牌, 不弹登录页。
  useEffect(() => {
    if (!isEmbedded || authed || checking) return;
    signalAuthExpired();  // 告知父窗口当前无有效令牌(兼作重推请求)
    signalReady();        // 告知父窗口 IC 已就绪, 可推送
    const stop = listenForOpcAuth(async () => {
      const ok = await verifyToken();
      if (ok) login();
    });
    return stop;
  }, [authed, checking, login]);

  if (checking) {
    return <div className="login-page"><span style={{ color: 'var(--text-secondary)' }}>验证登录中...</span></div>;
  }

  if (!authed) {
    if (isEmbedded) {
      return <div className="login-page"><span style={{ color: 'var(--text-secondary)' }}>正在连接账号…</span></div>;
    }
    return <LoginPage onSuccess={login} />;
  }

  return <Canvas onLogout={logout} />;
}

function Canvas({ onLogout }: { onLogout: () => void }) {
  const { credits, username, nickname, avatar, refreshCredits, updateProfile } = useAuth();
  const savedSnapshot = readSavedSnapshot();
  const [status, setStatus] = useState(savedSnapshot ? '已读取上次画布' : '新画布已就绪');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [imageEditorState, setImageEditorState] = useState<{ nodeId: string; imageSrc: string; maskOnly?: boolean } | null>(null);
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>(() => readCanvasSettings());
  const [activePanel, setActivePanel] = useState<PanelId>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const coreRef = useRef<CanvasCoreHandle>(null);

  const togglePanel = useCallback((id: PanelId) => {
    setActivePanel((current) => (current === id ? null : id));
  }, []);

  const getNodes = useCallback(() => coreRef.current?.getNodes() ?? [], []);
  const getEdges = useCallback(() => coreRef.current?.getEdges() ?? [], []);
  const getReactFlow = useCallback(() => coreRef.current?.getReactFlow() ?? null, []);
  const setNodes = useCallback<React.Dispatch<React.SetStateAction<Node<CanvasNodeData>[]>>>(
    (v) => coreRef.current?.setNodes(v), [],
  );
  const setEdges = useCallback<React.Dispatch<React.SetStateAction<import('reactflow').Edge[]>>>(
    (v) => coreRef.current?.setEdges(v), [],
  );
  const rememberHistory = useCallback(() => coreRef.current?.rememberHistory(), []);

  const { contextMenu, openPaneMenu, openNodeMenu, closeContextMenu } = useContextMenu(
    canvasRef, getReactFlow, setNodes,
  );
  const {
    canvasVersions,
    setCanvasVersions,
    addCanvasVersion,
    restoreCanvasVersion,
    deleteCanvasVersion,
  } = useCanvasVersions(getNodes, getEdges, setNodes, setEdges, rememberHistory, setStatus);
  const {
    localProjects,
    currentProjectId,
    projectName,
    setProjectName,
    saveLocalProject,
    openLocalProject,
    deleteLocalProject,
  } = useLocalProjects(
    getNodes, getEdges, canvasVersions, canvasSettings,
    setNodes, setEdges, setCanvasVersions, setCanvasSettings,
    rememberHistory, setStatus,
  );

  const getSnapshot = useCallback(() => createSnapshot(getNodes(), getEdges()), [getNodes, getEdges]);

  const { cloudList, syncing, fetchCloudList, saveToCloud, loadFromCloud, deleteFromCloud } = useCloudSync(
    currentProjectId, projectName, getSnapshot, canvasVersions, canvasSettings,
  );

  const handleCloudLoad = useCallback(async (canvasId: string) => {
    try {
      const data = await loadFromCloud(canvasId);
      rememberHistory();
      setNodes(data.snapshot.nodes);
      setEdges(data.snapshot.edges);
      if (data.versions) setCanvasVersions(data.versions);
      if (data.settings) setCanvasSettings((s: CanvasSettings) => ({ ...s, ...data.settings }));
      setStatus(`已加载云端项目：${data.name}`);
    } catch { setStatus('加载云端项目失败'); }
  }, [loadFromCloud, rememberHistory, setNodes, setEdges, setCanvasVersions, setCanvasSettings, setStatus]);
  const { saveCanvas, loadCanvas, exportCanvas, importCanvas, exportProject, importProject } = useImportExport(
    getNodes, getEdges, canvasVersions, canvasSettings,
    setNodes, setEdges, setCanvasVersions, setCanvasSettings,
    rememberHistory, addCanvasVersion, setStatus,
  );
  const clearCanvas = useCallback(() => {
    rememberHistory();
    setNodes([]);
    setEdges([]);
    setStatus('画布已清空');
  }, [rememberHistory, setEdges, setNodes]);

  const autoLayoutNodes = useCallback(async () => {
    const currentNodes = getNodes();
    if (currentNodes.filter((node) => !getSpatialParentGroup(currentNodes, node)).length < 2) {
      setStatus('至少需要两个节点才能自动排列');
      return;
    }
    setStatus('正在按连线排列节点...');
    try {
      const { layoutNodesByEdges } = await import('./graphLayout');
      rememberHistory();
      setNodes(layoutNodesByEdges(currentNodes, getEdges()));
      window.requestAnimationFrame(() => {
        coreRef.current?.fitView();
        setStatus('已按连线自动排列节点');
      });
    } catch {
      setStatus('自动排列失败');
    }
  }, [getEdges, getNodes, rememberHistory, setNodes, setStatus]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(canvasSettings));
  }, [canvasSettings]);

  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [, setNodeVer] = useState(0);
  useEffect(() => {
    loadNodeDefs().then(() => setNodesLoaded(true));
    const unsub = subscribeNodeChanges(() => setNodeVer((v) => v + 1));
    return unsub;
  }, []);

  const backgroundVariant = useMemo(() => {
    if (canvasSettings.background === 'lines') return BackgroundVariant.Lines;
    if (canvasSettings.background === 'cross') return BackgroundVariant.Cross;
    return BackgroundVariant.Dots;
  }, [canvasSettings.background]);

  const { deleteSelected, deleteNodeById, duplicateSelected, duplicateNodeById } = useNodeClipboard(
    getNodes, getEdges, setNodes, setEdges, rememberHistory, setStatus,
  );
  const {
    addTemplateNode,
    addGroupNode,
    addGroupNodeAt,
    addWorkflowNode,
    addWorkflowNodeAt,
  } = useNodeCreation(setNodes, rememberHistory, setStatus);
  const { groupSelected, ungroupSelected } = useGroupActions(getNodes, setNodes, rememberHistory, setStatus);
  useNodeFocus(getNodes, setNodes, { current: null } as React.RefObject<import('reactflow').ReactFlowInstance | null>, setStatus);

  const focusNodeBound = useCallback((nodeId: string) => {
    const rf = coreRef.current?.getReactFlow();
    if (!rf) return;
    const nodes = getNodes();
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;
    let x = target.position.x;
    let y = target.position.y;
    let parentId = target.parentNode;
    while (parentId) {
      const parent = nodes.find((item) => item.id === parentId);
      if (!parent) break;
      x += parent.position.x;
      y += parent.position.y;
      parentId = parent.parentNode;
    }
    const w = typeof target.style?.width === 'number' ? target.style.width : (target.type === 'groupNode' ? 600 : 280);
    const h = typeof target.style?.height === 'number' ? target.style.height : (target.type === 'groupNode' ? 400 : 180);
    rf.setCenter(x + w / 2, y + h / 2, {
      zoom: target.type === 'groupNode' ? 0.9 : 1.25,
      duration: 300,
    });
    setNodes((cur) => cur.map((n) => ({ ...n, selected: n.id === nodeId })));
    setStatus(`已定位：${target.data.title}`);
  }, [getNodes, setNodes, setStatus]);

  const focusSearchMatch = useCallback(
    (index: number) => {
      const matches = getNodes().filter((n) => {
        const q = searchQuery.trim().toLowerCase();
        if (n.hidden) return false;
        if (!q) return true;
        return [n.data.title, n.data.prompt, n.data.result, n.data.note, n.data.color, n.data.tags?.join(' '), n.data.defId, n.type]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      });
      if (matches.length === 0) { setStatus('没有匹配节点'); return; }
      const next = (index + matches.length) % matches.length;
      setActiveSearchIndex(next);
      focusNodeBound(matches[next].id);
    },
    [focusNodeBound, getNodes, searchQuery],
  );

  const fitCanvas = useCallback(() => {
    coreRef.current?.fitView();
  }, []);

  const runWorkflow = useCallback(() => {
    coreRef.current?.runWorkflow();
    setTimeout(refreshCredits, 3000);
  }, [refreshCredits]);

  const undo = useCallback(() => coreRef.current?.undo(), []);
  const redo = useCallback(() => coreRef.current?.redo(), []);

  const updateNodeData = useCallback(
    (id: string, data: Partial<Omit<CanvasNodeData, 'onChange'>>) => {
      coreRef.current?.updateNodeData(id, data);
    }, [],
  );

  const openDetail = useCallback((nodeId: string) => { setDetailNodeId(nodeId); }, []);
  const closeDetail = useCallback(() => { setDetailNodeId(null); }, []);
  const closeShortcutHelp = useCallback(() => { setShowShortcutHelp(false); }, []);

  const shortcutActions = useMemo(() => ({
    undo,
    redo,
    duplicateSelected,
    deleteSelected,
    saveCanvas,
    openSearch: () => { setActivePanel('search'); searchInputRef.current?.focus(); },
    toggleShortcutHelp: () => setShowShortcutHelp((v) => !v),
    closeAll: () => { closeContextMenu(); closeDetail(); closeShortcutHelp(); setActivePanel(null); },
  }), [undo, redo, duplicateSelected, deleteSelected, saveCanvas, closeContextMenu, closeDetail, closeShortcutHelp]);
  useKeyboardShortcuts(shortcutActions);

  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, imageSrc, maskOnly } = (e as CustomEvent).detail;
      setImageEditorState({ nodeId, imageSrc, maskOnly });
    };
    window.addEventListener('open-image-editor', handler);
    return () => window.removeEventListener('open-image-editor', handler);
  }, []);

  const handleImageEditorClose = useCallback((resultUrl?: string) => {
    if (resultUrl && imageEditorState) {
      const nid = imageEditorState.nodeId;
      const key = imageEditorState.maskOnly ? 'edit_area' : 'output-image';
      setNodes((cur) => cur.map((n) => {
        if (n.id !== nid) return n;
        return { ...n, data: { ...n.data, portValues: { ...(n.data.portValues ?? {}), [key]: resultUrl } } };
      }));
    }
    setImageEditorState(null);
  }, [imageEditorState, setNodes]);

  const isDark = canvasSettings.theme === 'dark';

  const savedSnapshotRef = useRef(savedSnapshot);

  return (
    <main className={`app ${isDark ? 'app--dark' : ''} ${isEmbedded ? 'app--embed' : ''}`}>
      {!isEmbedded && (
        <Topbar
          projectName={projectName}
          onProjectNameChange={setProjectName}
          status={status}
          credits={credits}
          username={username}
          nickname={nickname}
          avatar={avatar}
          onShowShortcuts={() => setShowShortcutHelp(true)}
          onLogout={onLogout}
          onEditProfile={() => setShowProfileModal(true)}
          onEditPassword={() => setShowPasswordModal(true)}
        />
      )}

      <div className="app__body">
        <nav className="icon-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`icon-nav__item ${activePanel === item.id ? 'icon-nav__item--active' : ''}`}
              onClick={() => togglePanel(item.id)}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </nav>

        {activePanel && (
          <div className="floating-panel">
            <div className="floating-panel__header">
              <span>{NAV_ITEMS.find((i) => i.id === activePanel)?.label}</span>
              <button type="button" className="floating-panel__close" onClick={() => setActivePanel(null)}>✕</button>
            </div>
            <div className="floating-panel__body">
              {activePanel === 'search' && (
                <SearchPanelConnected
                  coreRef={coreRef}
                  inputRef={searchInputRef}
                  query={searchQuery}
                  activeIndex={activeSearchIndex}
                  onQueryChange={setSearchQuery}
                  onFocusMatch={focusSearchMatch}
                  onSetActiveIndex={setActiveSearchIndex}
                  onFocusNode={focusNodeBound}
                />
              )}
              {activePanel === 'templates' && <TemplatePanel onAddTemplate={addTemplateNode} getNodes={getNodes} getEdges={getEdges} setNodes={setNodes} setEdges={setEdges} />}
              {activePanel === 'nodeManager' && (
                <NodeManagerPanelConnected
                  coreRef={coreRef}
                  onAddGroup={addGroupNode}
                  onFocusNode={focusNodeBound}
                  onEditNode={openDetail}
                  rememberHistory={rememberHistory}
                  setStatus={setStatus}
                />
              )}
              {activePanel === 'nodeLibrary' && <NodeLibraryPanel onAddNode={addWorkflowNode} onAddGroup={addGroupNode} />}
              {activePanel === 'history' && <HistoryPanel />}
              {activePanel === 'stats' && (
                <StatsPanelConnected
                  coreRef={coreRef}
                  onSearch={(v) => { setSearchQuery(v); setActivePanel('search'); searchInputRef.current?.focus(); }}
                />
              )}
              {activePanel === 'versions' && (
                <VersionsPanel
                  versions={canvasVersions}
                  onCreate={addCanvasVersion}
                  onRestore={restoreCanvasVersion}
                  onDelete={deleteCanvasVersion}
                />
              )}
              {activePanel === 'projects' && (
                <ProjectsPanel
                  projects={localProjects}
                  currentProjectId={currentProjectId}
                  projectName={projectName}
                  onProjectNameChange={setProjectName}
                  onSave={saveLocalProject}
                  onOpen={openLocalProject}
                  onDelete={deleteLocalProject}
                  cloudList={cloudList}
                  syncing={syncing}
                  onCloudSave={() => saveToCloud()}
                  onCloudLoad={handleCloudLoad}
                  onCloudDelete={deleteFromCloud}
                  onCloudRefresh={fetchCloudList}
                />
              )}
              {activePanel === 'settings' && (
                <SettingsPanel settings={canvasSettings} setSettings={setCanvasSettings} onOpenShortcuts={() => setShowShortcutHelp(true)} />
              )}
              {activePanel === 'inspector' && (
                <InspectorPanelConnected
                  coreRef={coreRef}
                  onOpenDetail={openDetail}
                  rememberHistory={rememberHistory}
                  setStatus={setStatus}
                />
              )}
            </div>
          </div>
        )}

        <section className="canvas-area" ref={canvasRef}>
          {nodesLoaded && (
            <CanvasCore
              ref={coreRef}
              /* eslint-disable-next-line react-hooks/refs -- reading savedSnapshotRef once for initial props */
              initialNodes={savedSnapshotRef.current?.nodes ?? initialNodes}
              /* eslint-disable-next-line react-hooks/refs -- reading savedSnapshotRef once for initial props */
              initialEdges={savedSnapshotRef.current?.edges ?? []}
              settings={canvasSettings}
              backgroundVariant={backgroundVariant}
              isDark={isDark}
              nodesLoaded={nodesLoaded}
              setStatus={setStatus}
              onPaneClick={() => setActivePanel(null)}
              onPaneContextMenu={openPaneMenu}
              onNodeContextMenu={openNodeMenu}
              onAddWorkflowNodeAt={addWorkflowNodeAt}
              onAddGroupNodeAt={addGroupNodeAt}
            />
          )}

          <ContextMenuConnected
            coreRef={coreRef}
            contextMenu={contextMenu}
            onClose={closeContextMenu}
            onFocusNode={focusNodeBound}
            onOpenDetail={openDetail}
            onDuplicateNode={duplicateNodeById}
            onDeleteNode={deleteNodeById}
            onAddGroup={addGroupNodeAt}
            onAddWorkflowNode={addWorkflowNodeAt}
          />

          <DetailDrawerConnected
            coreRef={coreRef}
            detailNodeId={detailNodeId}
            onClose={closeDetail}
            onUpdate={updateNodeData}
          />
          <ShortcutHelp visible={showShortcutHelp} onClose={closeShortcutHelp} />
        </section>
      </div>

      <FloatingToolbar
        onRun={runWorkflow}
        onFit={fitCanvas}
        onUndo={undo}
        onRedo={redo}
        onSave={saveCanvas}
        onLoad={loadCanvas}
        onExportJson={exportCanvas}
        onImportJson={() => fileInputRef.current?.click()}
        onExportProject={exportProject}
        onImportProject={() => projectInputRef.current?.click()}
        onSaveToProjects={saveLocalProject}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        onClear={clearCanvas}
        onAutoLayout={autoLayoutNodes}
      />

      <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={importCanvas} />
      <input ref={projectInputRef} type="file" accept="application/json" hidden onChange={importProject} />

      {imageEditorState && (
        <Suspense fallback={null}>
          <ImageEditor
            imageSrc={imageEditorState.imageSrc}
            nodeId={imageEditorState.nodeId}
            maskOnly={imageEditorState.maskOnly}
            ctx={{ execute: async (defId, inputs, controls) => {
              const res = await apiFetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defId, inputs, controls }),
              });
              if (!res.ok) throw new Error(`执行失败: ${res.status}`);
              return res.json();
            }}}
            onClose={handleImageEditorClose}
          />
        </Suspense>
      )}

      {showProfileModal && (
        <Suspense fallback={null}>
          <ProfileModal
            nickname={nickname}
            avatar={avatar}
            onClose={() => setShowProfileModal(false)}
            onSaved={(info) => {
              updateProfile(info);
              setShowProfileModal(false);
            }}
          />
        </Suspense>
      )}

      {showPasswordModal && (
        <Suspense fallback={null}>
          <PasswordModal onClose={() => setShowPasswordModal(false)} />
        </Suspense>
      )}
    </main>
  );
}

export default App;
