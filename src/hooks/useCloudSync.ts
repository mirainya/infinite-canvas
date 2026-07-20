import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import type { CanvasSnapshot, CanvasSettings, CanvasVersion } from '../types';

export type CloudCanvas = {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
};

export function useCloudSync(
  currentProjectId: string | null,
  projectName: string,
  getSnapshot: () => CanvasSnapshot,
  canvasVersions: CanvasVersion[],
  canvasSettings: CanvasSettings,
) {
  const [cloudList, setCloudList] = useState<CloudCanvas[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncTimerRef = useRef<number>(0);

  const fetchCloudList = useCallback(async () => {
    try {
      const res = await apiFetch('/api/canvases');
      if (!res.ok) throw new Error(`云端项目加载失败: ${res.status}`);
      setCloudList(await res.json());
    } catch { /* ignore */ }
  }, []);

  const saveToCloud = useCallback(async (id?: string, name?: string) => {
    const canvasId = id || currentProjectId || crypto.randomUUID();
    const canvasName = name || projectName || '未命名项目';
    setSyncing(true);
    try {
      const res = await apiFetch(`/api/canvases/${canvasId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: canvasId,
          name: canvasName,
          snapshot: getSnapshot(),
          versions: canvasVersions,
          settings: canvasSettings,
        }),
      });
      if (!res.ok) throw new Error(`云端保存失败: ${res.status}`);
      await fetchCloudList();
      return canvasId;
    } finally { setSyncing(false); }
  }, [currentProjectId, projectName, getSnapshot, canvasVersions, canvasSettings, fetchCloudList]);

  const loadFromCloud = useCallback(async (canvasId: string) => {
    const res = await apiFetch(`/api/canvases/${canvasId}`);
    if (!res.ok) throw new Error('加载失败');
    return res.json();
  }, []);

  const deleteFromCloud = useCallback(async (canvasId: string) => {
    const res = await apiFetch(`/api/canvases/${canvasId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`云端删除失败: ${res.status}`);
    await fetchCloudList();
  }, [fetchCloudList]);

  // Auto-sync every 30s if there's a current project
  useEffect(() => {
    if (!currentProjectId) return;
    window.clearInterval(syncTimerRef.current);
    syncTimerRef.current = window.setInterval(() => { saveToCloud(); }, 30000);
    return () => { window.clearInterval(syncTimerRef.current); };
  }, [currentProjectId, saveToCloud]);

  return { cloudList, syncing, fetchCloudList, saveToCloud, loadFromCloud, deleteFromCloud };
}
