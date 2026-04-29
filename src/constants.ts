import type { CanvasNodeData, CanvasSettings, NodeTemplate } from './types';
import type { Node } from 'reactflow';

export const STORAGE_KEY = 'infinite-canvas.snapshot';
export const HISTORY_KEY = 'infinite-canvas.versions';
export const SETTINGS_KEY = 'infinite-canvas.settings';
export const PROJECTS_KEY = 'infinite-canvas.projects';

export const GROUP_WIDTH = 480;
export const GROUP_HEIGHT = 320;

export const COLOR_OPTIONS = ['#6366f1', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

export const PORT_COLORS: Record<string, string> = {
  STRING: '#a78bfa', IMAGE: '#34d399', NUMBER: '#60a5fa', MASK: '#fbbf24', ANY: '#9ca3af',
};

export const NODE_TEMPLATES: NodeTemplate[] = [];

export const initialNodes: Node<CanvasNodeData>[] = [];

export const defaultSettings: CanvasSettings = {
  theme: 'light',
  background: 'dots',
  showGrid: true,
  snapToGrid: false,
  showMiniMap: true,
  gridSize: 20,
};
