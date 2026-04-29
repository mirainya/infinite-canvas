import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSnapshot,
  readSavedSnapshot,
  readCanvasVersions,
  writeCanvasVersions,
  readLocalProjects,
  writeLocalProjects,
  readCanvasSettings,
} from '../storage';
import { STORAGE_KEY, HISTORY_KEY, SETTINGS_KEY, defaultSettings } from '../constants';
import type { Node, Edge } from 'reactflow';
import type { CanvasNodeData } from '../types';

const makeNode = (overrides: Partial<Node<CanvasNodeData>> = {}): Node<CanvasNodeData> => ({
  id: '1',
  type: 'groupNode',
  position: { x: 0, y: 0 },
  data: { title: 'Test', prompt: 'p', result: 'r', color: '#fff', tags: ['a'], note: 'n' },
  selected: true,
  ...overrides,
});

const makeEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: 'e1',
  source: '1',
  target: '2',
  selected: true,
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('createSnapshot', () => {
  it('strips selected flag and preserves data', () => {
    const snap = createSnapshot([makeNode()], [makeEdge()]);
    expect(snap.version).toBe(1);
    expect(snap.savedAt).toBeTruthy();
    expect(snap.nodes[0].selected).toBe(false);
    expect(snap.nodes[0].data.title).toBe('Test');
    expect(snap.nodes[0].data.tags).toEqual(['a']);
    expect(snap.edges[0].selected).toBe(false);
  });

  it('includes defId and portValues when present', () => {
    const node = makeNode({
      data: {
        title: 'WF',
        prompt: '',
        result: '',
        color: '#000',
        tags: [],
        note: '',
        defId: 'text_gen',
        portValues: { prompt: 'hello' },
      },
    });
    const snap = createSnapshot([node], []);
    expect(snap.nodes[0].data.defId).toBe('text_gen');
    expect(snap.nodes[0].data.portValues).toEqual({ prompt: 'hello' });
  });

  it('omits defId when not present', () => {
    const snap = createSnapshot([makeNode()], []);
    expect(snap.nodes[0].data.defId).toBeUndefined();
  });
});

describe('readSavedSnapshot', () => {
  it('returns null when nothing saved', () => {
    expect(readSavedSnapshot()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not json');
    expect(readSavedSnapshot()).toBeNull();
  });

  it('returns null for missing arrays', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: 'bad' }));
    expect(readSavedSnapshot()).toBeNull();
  });

  it('reads valid snapshot and filters out aiNode/imageEditNode', () => {
    const snap = createSnapshot(
      [
        makeNode({ id: '1', type: 'groupNode' }),
        makeNode({ id: '2', type: 'aiNode' }),
        makeNode({ id: '3', type: 'imageEditNode' }),
      ],
      [makeEdge()],
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    const result = readSavedSnapshot();
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(1);
    expect(result!.nodes[0].id).toBe('1');
  });
});

describe('readCanvasVersions / writeCanvasVersions', () => {
  it('returns empty array when nothing saved', () => {
    expect(readCanvasVersions()).toEqual([]);
  });

  it('round-trips versions', () => {
    const snap = createSnapshot([], []);
    const versions = [{ id: 'v1', name: 'Version 1', savedAt: '2024-01-01', snapshot: snap }];
    writeCanvasVersions(versions);
    expect(readCanvasVersions()).toEqual(versions);
  });

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem(HISTORY_KEY, '{bad}');
    expect(readCanvasVersions()).toEqual([]);
  });
});

describe('readLocalProjects / writeLocalProjects', () => {
  it('returns empty array when nothing saved', () => {
    expect(readLocalProjects()).toEqual([]);
  });

  it('round-trips projects', () => {
    const snap = createSnapshot([], []);
    const projects = [{
      id: 'p1',
      name: 'My Project',
      updatedAt: '2024-01-01',
      snapshot: snap,
      versions: [],
      settings: defaultSettings,
    }];
    writeLocalProjects(projects);
    expect(readLocalProjects()).toEqual(projects);
  });
});

describe('readCanvasSettings', () => {
  it('returns defaults when nothing saved', () => {
    expect(readCanvasSettings()).toEqual(defaultSettings);
  });

  it('merges saved settings with defaults', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark' }));
    const settings = readCanvasSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.showGrid).toBe(defaultSettings.showGrid);
  });

  it('returns defaults for invalid JSON', () => {
    localStorage.setItem(SETTINGS_KEY, 'broken');
    expect(readCanvasSettings()).toEqual(defaultSettings);
  });
});
