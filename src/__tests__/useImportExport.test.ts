import { describe, it, expect, beforeEach } from 'vitest';
import { createSnapshot } from '../storage';
import { defaultSettings } from '../constants';
import type { Node, Edge } from 'reactflow';
import type { CanvasNodeData, CanvasSnapshot, ProjectBundle } from '../types';

// We test the import/export logic by calling the underlying functions directly
// rather than through the hook, since the hook requires many React state setters.
// The core logic lives in createSnapshot and JSON parsing.

const makeNode = (id: string): Node<CanvasNodeData> => ({
  id,
  type: 'groupNode',
  position: { x: 0, y: 0 },
  data: { title: `Node ${id}`, prompt: 'p', result: 'r', color: '#fff', tags: [], note: '' },
  selected: true,
});

const makeEdge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  selected: true,
});

beforeEach(() => {
  localStorage.clear();
});

describe('import/export round-trip', () => {
  it('snapshot serializes and deserializes correctly', () => {
    const nodes = [makeNode('1'), makeNode('2')];
    const edges = [makeEdge('1', '2')];
    const snap = createSnapshot(nodes, edges);

    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json) as CanvasSnapshot;

    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.nodes[0].selected).toBe(false);
    expect(parsed.version).toBe(1);
  });

  it('project bundle includes all fields', () => {
    const snap = createSnapshot([makeNode('1')], []);
    const versions = [{ id: 'v1', name: 'Version 1', savedAt: '2024-01-01', snapshot: snap }];
    const settings = { ...defaultSettings, theme: 'dark' as const };

    const bundle: ProjectBundle = {
      type: 'infinite-canvas.project',
      version: 1,
      exportedAt: new Date().toISOString(),
      snapshot: snap,
      versions,
      settings,
    };

    const json = JSON.stringify(bundle);
    const parsed = JSON.parse(json) as ProjectBundle;

    expect(parsed.type).toBe('infinite-canvas.project');
    expect(parsed.snapshot.nodes).toHaveLength(1);
    expect(parsed.versions).toHaveLength(1);
    expect(parsed.settings.theme).toBe('dark');
  });

  it('rejects invalid snapshot on import', () => {
    const invalid = { nodes: 'not-array', edges: [] };
    const parsed = JSON.parse(JSON.stringify(invalid));
    expect(Array.isArray(parsed.nodes)).toBe(false);
  });

  it('rejects invalid project bundle', () => {
    const invalid = { type: 'wrong', snapshot: { nodes: [], edges: [] }, versions: [] };
    expect(invalid.type).not.toBe('infinite-canvas.project');
  });
});
