import { useCallback, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import { SETTINGS_KEY, STORAGE_KEY, defaultSettings } from '../constants';
import { createSnapshot, readSavedSnapshot, writeCanvasVersions } from '../storage';
import type { CanvasNodeData, CanvasSettings, CanvasSnapshot, CanvasVersion, ProjectBundle } from '../types';

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export function useImportExport(
  getNodes: () => Node<CanvasNodeData>[],
  getEdges: () => Edge[],
  canvasVersions: CanvasVersion[],
  canvasSettings: CanvasSettings,
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  setCanvasVersions: Dispatch<SetStateAction<CanvasVersion[]>>,
  setCanvasSettings: Dispatch<SetStateAction<CanvasSettings>>,
  rememberHistory: () => void,
  addCanvasVersion: () => void,
  setStatus: (status: string) => void,
) {
  const saveCanvas = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createSnapshot(getNodes(), getEdges())));
    addCanvasVersion();
    setStatus('已保存画布');
  }, [addCanvasVersion, getEdges, getNodes, setStatus]);

  const loadCanvas = useCallback(() => {
    const snapshot = readSavedSnapshot();
    if (!snapshot) {
      setStatus('没有可读取的画布');
      return;
    }

    rememberHistory();
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setStatus('已读取画布');
  }, [rememberHistory, setEdges, setNodes, setStatus]);

  const exportCanvas = useCallback(() => {
    downloadJson(`infinite-canvas-${new Date().toISOString().slice(0, 10)}.json`, createSnapshot(getNodes(), getEdges()));
    setStatus('已导出 JSON');
  }, [getEdges, getNodes, setStatus]);

  const importCanvas = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const snapshot = JSON.parse(await file.text()) as CanvasSnapshot;
        if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
          throw new Error('invalid canvas');
        }

        rememberHistory();
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        setStatus('已导入 JSON');
      } catch {
        setStatus('导入失败，文件格式不正确');
      }
    },
    [rememberHistory, setEdges, setNodes, setStatus],
  );

  const exportProject = useCallback(() => {
    const snapshot = createSnapshot(getNodes(), getEdges());
    const bundle: ProjectBundle = {
      type: 'infinite-canvas.project',
      version: 1,
      exportedAt: new Date().toISOString(),
      snapshot,
      versions: canvasVersions,
      settings: canvasSettings,
    };

    downloadJson(`infinite-canvas-project-${new Date().toISOString().slice(0, 10)}.json`, bundle);
    setStatus('已导出项目包');
  }, [canvasSettings, canvasVersions, getEdges, getNodes, setStatus]);

  const importProject = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const bundle = JSON.parse(await file.text()) as ProjectBundle;
        if (
          bundle.type !== 'infinite-canvas.project' ||
          !Array.isArray(bundle.snapshot?.nodes) ||
          !Array.isArray(bundle.snapshot?.edges) ||
          !Array.isArray(bundle.versions)
        ) {
          throw new Error('invalid project');
        }

        const settings = { ...defaultSettings, ...bundle.settings };

        rememberHistory();
        setNodes(bundle.snapshot.nodes);
        setEdges(bundle.snapshot.edges);
        setCanvasVersions(bundle.versions);
        setCanvasSettings(settings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle.snapshot));
        writeCanvasVersions(bundle.versions);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        setStatus('已导入项目包');
      } catch {
        setStatus('项目包导入失败');
      }
    },
    [rememberHistory, setCanvasSettings, setCanvasVersions, setEdges, setNodes, setStatus],
  );

  return {
    saveCanvas,
    loadCanvas,
    exportCanvas,
    importCanvas,
    exportProject,
    importProject,
  };
}
