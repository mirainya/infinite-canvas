import type { Edge, Node } from 'reactflow';
import type { PortValues } from './types/workflow';

export type CanvasNodeData = {
  title: string;
  prompt: string;
  result: string;
  color?: string;
  tags?: string[];
  note?: string;
  defId?: string;
  portValues?: PortValues;
};

export type CanvasSnapshot = {
  version: 1;
  savedAt: string;
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
};

export type CanvasVersion = {
  id: string;
  name: string;
  savedAt: string;
  snapshot: CanvasSnapshot;
};

export type CanvasSettings = {
  theme: 'dark' | 'light';
  background: 'lines' | 'dots' | 'cross';
  showGrid: boolean;
  snapToGrid: boolean;
  showMiniMap: boolean;
  gridSize: number;
};

export type ProjectBundle = {
  type: 'infinite-canvas.project';
  version: 1;
  exportedAt: string;
  snapshot: CanvasSnapshot;
  versions: CanvasVersion[];
  settings: CanvasSettings;
};

export type LocalProject = {
  id: string;
  name: string;
  updatedAt: string;
  snapshot: CanvasSnapshot;
  versions: CanvasVersion[];
  settings: CanvasSettings;
};

export type ContextMenuState = {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  nodeId?: string;
};

export type NodeTemplate = {
  id: string;
  name: string;
  title: string;
  prompt: string;
  color: string;
  tags: string[];
};
