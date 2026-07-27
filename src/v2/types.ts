import type { Edge, Node, Viewport } from 'reactflow';

export type V2NodeType =
  | 'image-input'
  | 'text-input'
  | 'image-collection'
  | 'text-collection'
  | 'ai-image'
  | 'text-generation'
  | 'prompt-enhance'
  | 'image-split'
  | 'image-output'
  | 'text-output';

export type V2NodeData = {
  title?: string;
  text?: string;
  brief?: string;
  prompt?: string;
  instruction?: string;
  content?: string;
  url?: string;
  maskUrl?: string;
  items?: string[];
  model?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  count?: number;
  rows?: number;
  columns?: number;
};

export type V2Node = Node<V2NodeData> & { type: V2NodeType };
export type V2Edge = Edge & { sourceHandle: string; targetHandle: string };

export type V2Graph = {
  nodes: V2Node[];
  edges: V2Edge[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  revision: number;
  updated_at: string;
  created_at: string;
};

export type Project = ProjectSummary & {
  graph: V2Graph;
  viewport: Viewport;
  settings: Record<string, unknown>;
};

export type ProjectVersion = {
  id: number;
  revision: number;
  reason: string;
  created_at: string;
};

export type SystemTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  accent?: string;
  graph: V2Graph;
  current_version?: number;
  is_system?: boolean;
  is_published?: boolean;
  owned?: boolean;
};

export type Asset = {
  id: string;
  filename: string;
  original_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  created_at: string;
};

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type WorkflowRun = {
  id: string;
  project_id: string;
  status: RunStatus;
  progress: number;
  credits_used: number;
  error: string;
  output_snapshot?: Record<string, Record<string, unknown>>;
  created_at: string;
  finished_at?: string;
};

export type ModelInfo = {
  code: string;
  name: string;
  type: string;
};
