import type { CanvasSettings, CanvasSnapshot, CanvasVersion, LocalProject } from './types';
import { HISTORY_KEY, PROJECTS_KEY, SETTINGS_KEY, STORAGE_KEY, defaultSettings } from './constants';
import type { Edge, Node } from 'reactflow';
import type { CanvasNodeData } from './types';

export const createSnapshot = (nodes: Node<CanvasNodeData>[], edges: Edge[]): CanvasSnapshot => ({
  version: 1,
  savedAt: new Date().toISOString(),
  nodes: nodes.map((node) => ({
    ...node,
    data: {
      title: node.data.title,
      prompt: node.data.prompt,
      result: node.data.result,
      color: node.data.color,
      tags: node.data.tags ?? [],
      note: node.data.note ?? '',
      ...(node.data.locked ? { locked: true } : {}),
      ...(node.data.defId ? { defId: node.data.defId } : {}),
      ...(node.data.portValues ? { portValues: node.data.portValues } : {}),
    },
    selected: false,
  })),
  edges: edges.map((edge) => ({ ...edge, selected: false })),
});

export const readSavedSnapshot = () => {
  try {
    const rawSnapshot = localStorage.getItem(STORAGE_KEY);
    if (!rawSnapshot) return null;

    const snapshot = JSON.parse(rawSnapshot) as CanvasSnapshot;
    if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) return null;

    snapshot.nodes = snapshot.nodes.filter((n) => n.type !== 'imageEditNode' && n.type !== 'aiNode');
    return snapshot;
  } catch {
    return null;
  }
};

export const readCanvasVersions = () => {
  try {
    const rawVersions = localStorage.getItem(HISTORY_KEY);
    if (!rawVersions) return [];

    const versions = JSON.parse(rawVersions) as CanvasVersion[];
    return Array.isArray(versions) ? versions : [];
  } catch {
    return [];
  }
};

const isQuotaError = (err: unknown) =>
  err instanceof DOMException &&
  (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);

export const writeCanvasVersions = (versions: CanvasVersion[]): { saved: CanvasVersion[]; trimmed: number } => {
  let current = versions;
  while (current.length > 0) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(current));
      return { saved: current, trimmed: versions.length - current.length };
    } catch (err) {
      if (!isQuotaError(err)) throw err;
      current = current.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
  return { saved: [], trimmed: versions.length };
};

export const readLocalProjects = () => {
  try {
    const rawProjects = localStorage.getItem(PROJECTS_KEY);
    if (!rawProjects) return [];

    const projects = JSON.parse(rawProjects) as LocalProject[];
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
};

export const writeLocalProjects = (projects: LocalProject[]) => {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
};

export const readCanvasSettings = () => {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_KEY);
    if (!rawSettings) return defaultSettings;

    return {
      ...defaultSettings,
      ...(JSON.parse(rawSettings) as Partial<CanvasSettings>),
    };
  } catch {
    return defaultSettings;
  }
};
