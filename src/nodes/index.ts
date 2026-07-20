import type { NodeDefinition } from '../types/workflow';
import { apiFetch } from '../api';
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
  const res = await apiFetch('/api/nodes');
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

let _sseAbort: AbortController | null = null;

async function waitForReconnect(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 2000);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function watchNodeChanges(signal: AbortSignal, onReload?: () => void) {
  while (!signal.aborted) {
    try {
      const res = await apiFetch('/api/nodes/events', {
        headers: { Accept: 'text/event-stream' },
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`插件事件连接失败: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const event of events) {
          if (!event.split(/\r?\n/).some((line) => line.trim() === 'event: reload')) continue;
          await reloadNodeDefs();
          onReload?.();
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      console.warn('插件事件连接中断，准备重连', error);
    }
    await waitForReconnect(signal);
  }
}

/** 订阅后端插件变更事件，自动刷新节点库 */
export function subscribeNodeChanges(onReload?: () => void): () => void {
  _sseAbort?.abort();
  const controller = new AbortController();
  _sseAbort = controller;
  void watchNodeChanges(controller.signal, onReload);
  return () => {
    controller.abort();
    if (_sseAbort === controller) _sseAbort = null;
  };
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
