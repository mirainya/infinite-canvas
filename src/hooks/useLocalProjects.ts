import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import { SETTINGS_KEY, STORAGE_KEY, defaultSettings } from '../constants';
import { createSnapshot, readLocalProjects, writeCanvasVersions, writeLocalProjects } from '../storage';
import type { CanvasNodeData, CanvasSettings, CanvasVersion, LocalProject } from '../types';

export function useLocalProjects(
  getNodes: () => Node<CanvasNodeData>[],
  getEdges: () => Edge[],
  canvasVersions: CanvasVersion[],
  canvasSettings: CanvasSettings,
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  setCanvasVersions: Dispatch<SetStateAction<CanvasVersion[]>>,
  setCanvasSettings: Dispatch<SetStateAction<CanvasSettings>>,
  rememberHistory: () => void,
  setStatus: (status: string) => void,
) {
  const [localProjects, setLocalProjects] = useState<LocalProject[]>(() => readLocalProjects());
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('未命名项目');

  const saveLocalProject = useCallback(() => {
    const snapshot = createSnapshot(getNodes(), getEdges());
    const now = new Date().toISOString();
    const id = currentProjectId ?? crypto.randomUUID();
    const name = projectName.trim() || `项目 ${new Date().toLocaleString()}`;
    const project: LocalProject = {
      id,
      name,
      updatedAt: now,
      snapshot,
      versions: canvasVersions,
      settings: canvasSettings,
    };
    const nextProjects = [project, ...localProjects.filter((item) => item.id !== id)].slice(0, 24);

    writeLocalProjects(nextProjects);
    setLocalProjects(nextProjects);
    setCurrentProjectId(id);
    setProjectName(name);
    setStatus('已保存到项目列表');
  }, [canvasSettings, canvasVersions, currentProjectId, getEdges, getNodes, localProjects, projectName, setStatus]);

  const openLocalProject = useCallback(
    (project: LocalProject) => {
      rememberHistory();
      setNodes(project.snapshot.nodes);
      setEdges(project.snapshot.edges);
      setCanvasVersions(project.versions);
      setCanvasSettings({ ...defaultSettings, ...project.settings });
      setCurrentProjectId(project.id);
      setProjectName(project.name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project.snapshot));
      writeCanvasVersions(project.versions);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, ...project.settings }));
      setStatus(`已打开项目：${project.name}`);
    },
    [rememberHistory, setCanvasSettings, setCanvasVersions, setEdges, setNodes, setStatus],
  );

  const deleteLocalProject = useCallback(
    (projectId: string) => {
      const nextProjects = localProjects.filter((project) => project.id !== projectId);

      writeLocalProjects(nextProjects);
      setLocalProjects(nextProjects);
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
      }
      setStatus('已删除项目');
    },
    [currentProjectId, localProjects, setStatus],
  );

  return {
    localProjects,
    currentProjectId,
    projectName,
    setProjectName,
    saveLocalProject,
    openLocalProject,
    deleteLocalProject,
  };
}
