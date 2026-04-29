import type { NodeDefinition } from '../types/workflow';
import './bodies';

const nodeRegistry = new Map<string, NodeDefinition>();

let _loaded = false;

function parseRawDefs(defs: Array<{
  def_id: string;
  name: string;
  category: string;
  view?: string;
  inputs: Array<{ id: string; label: string; type: string; required?: boolean }>;
  outputs: Array<{ id: string; label: string; type: string }>;
  controls: Array<Record<string, unknown>>;
}>) {
  nodeRegistry.clear();
  for (const raw of defs) {
    const def: NodeDefinition = {
      defId: raw.def_id,
      name: raw.name,
      category: raw.category,
      view: raw.view,
      inputs: raw.inputs.map((p) => ({ id: p.id, label: p.label, type: p.type as NodeDefinition['inputs'][0]['type'], required: p.required })),
      outputs: raw.outputs.map((p) => ({ id: p.id, label: p.label, type: p.type as NodeDefinition['outputs'][0]['type'] })),
      controls: raw.controls as NodeDefinition['controls'],
    };
    nodeRegistry.set(def.defId, def);
  }
}

async function fetchDefs() {
  const res = await fetch('/api/nodes');
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** 从后端加载节点定义 */
export async function loadNodeDefs(): Promise<void> {
  if (_loaded) return;
  const defs = await fetchDefs();
  parseRawDefs(defs);
  _loaded = true;
}

/** 强制重新加载（热加载用） */
export async function reloadNodeDefs(): Promise<void> {
  const defs = await fetchDefs();
  parseRawDefs(defs);
  _loaded = true;
}

let _sse: EventSource | null = null;

/** 订阅后端插件变更事件，自动刷新节点库 */
export function subscribeNodeChanges(onReload?: () => void): () => void {
  if (_sse) _sse.close();
  _sse = new EventSource('/api/nodes/events');
  _sse.addEventListener('reload', async () => {
    await reloadNodeDefs();
    onReload?.();
  });
  return () => { _sse?.close(); _sse = null; };
}

export function getNodeDef(defId: string): NodeDefinition | undefined {
  return nodeRegistry.get(defId);
}

export function getNodesByCategory(): Map<string, NodeDefinition[]> {
  const grouped = new Map<string, NodeDefinition[]>();
  for (const def of nodeRegistry.values()) {
    const list = grouped.get(def.category) ?? [];
    list.push(def);
    grouped.set(def.category, list);
  }
  return grouped;
}

export { nodeRegistry };
