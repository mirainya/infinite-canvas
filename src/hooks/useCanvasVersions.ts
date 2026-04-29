import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import { STORAGE_KEY } from '../constants';
import { createSnapshot, readCanvasVersions, writeCanvasVersions } from '../storage';
import type { CanvasNodeData, CanvasVersion } from '../types';

export function useCanvasVersions(
  getNodes: () => Node<CanvasNodeData>[],
  getEdges: () => Edge[],
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  rememberHistory: () => void,
  setStatus: (status: string) => void,
) {
  const [canvasVersions, setCanvasVersions] = useState<CanvasVersion[]>(() => readCanvasVersions());

  const addCanvasVersion = useCallback(
    (name?: string) => {
      const snapshot = createSnapshot(getNodes(), getEdges());
      const version: CanvasVersion = {
        id: crypto.randomUUID(),
        name: name || `版本 ${new Date().toLocaleString()}`,
        savedAt: snapshot.savedAt,
        snapshot,
      };
      setCanvasVersions((prev) => {
        const nextVersions = [version, ...prev].slice(0, 12);
        writeCanvasVersions(nextVersions);
        return nextVersions;
      });
      setStatus('已创建历史版本');
    },
    [getNodes, getEdges, setStatus],
  );

  const restoreCanvasVersion = useCallback(
    (version: CanvasVersion) => {
      rememberHistory();
      setNodes(version.snapshot.nodes);
      setEdges(version.snapshot.edges);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(version.snapshot));
      setStatus(`已恢复：${version.name}`);
    },
    [rememberHistory, setEdges, setNodes, setStatus],
  );

  const deleteCanvasVersion = useCallback(
    (versionId: string) => {
      setCanvasVersions((prev) => {
        const nextVersions = prev.filter((version) => version.id !== versionId);
        writeCanvasVersions(nextVersions);
        return nextVersions;
      });
      setStatus('已删除历史版本');
    },
    [setStatus],
  );

  return {
    canvasVersions,
    setCanvasVersions,
    addCanvasVersion,
    restoreCanvasVersion,
    deleteCanvasVersion,
  };
}
