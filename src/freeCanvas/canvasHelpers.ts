import type { V2Graph, WorkflowRun } from '../v2/types';

export type ImageReference = {
  shapeId: string;
  url: string;
  previewUrl: string;
  name: string;
  maskUrl?: string;
};

export type ImageRunRequest = {
  prompt: string;
  model: string;
  aspectRatio: string;
  count: number;
  references: ImageReference[];
  maskUrl?: string;
};

export function buildImageRunGraph(request: ImageRunRequest): V2Graph {
  const referenceNodes = request.references.map((reference, index) => ({
    id: `reference-${index + 1}`,
    type: 'image-input' as const,
    position: { x: 0, y: index * 120 },
    data: { title: reference.name, url: reference.url },
  }));
  const generationNode = {
    id: 'ai-draw',
    type: 'ai-image' as const,
    position: { x: 320, y: 0 },
    data: {
      title: 'AI 绘图',
      prompt: request.prompt,
      model: request.model,
      aspectRatio: request.aspectRatio,
      count: request.count,
      ...(request.maskUrl ? { maskUrl: request.maskUrl } : {}),
    },
  };
  return {
    nodes: [...referenceNodes, generationNode],
    edges: referenceNodes.map((node, index) => ({
      id: `reference-edge-${index + 1}`,
      source: node.id,
      target: generationNode.id,
      sourceHandle: 'image',
      targetHandle: 'images',
    })),
  };
}

export function imageUrlsFromRun(run: WorkflowRun): string[] {
  const output = run.output_snapshot?.['ai-draw'];
  if (!output) return [];
  const images = output.images;
  if (Array.isArray(images)) return images.filter((item): item is string => typeof item === 'string' && Boolean(item));
  return typeof output.image === 'string' && output.image ? [output.image] : [];
}

export function resultGrid(count: number) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return { columns, rows };
}
