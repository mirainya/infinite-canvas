import type { V2Edge, V2Node } from './types';

export async function layoutGraph(nodes: V2Node[], edges: V2Edge[]) {
  const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<V2Node[]>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Record<string, { x: number; y: number }>>) => {
      resolve(nodes.map((node) => ({ ...node, position: event.data[node.id] ?? node.position })));
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(new Error(event.message || '自动排列失败'));
      worker.terminate();
    };
    worker.postMessage({
      nodes: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
      edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
    });
  });
}
