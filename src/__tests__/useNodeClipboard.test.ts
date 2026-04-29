import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodeClipboard } from '../hooks/useNodeClipboard';
import type { Node, Edge } from 'reactflow';
import type { CanvasNodeData } from '../types';

// Polyfill crypto.randomUUID for jsdom
if (!globalThis.crypto?.randomUUID) {
  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `uuid-${++counter}`,
    },
    configurable: true,
  });
}

const makeNode = (id: string, selected = false, parentNode?: string): Node<CanvasNodeData> => ({
  id,
  type: 'aiNode',
  position: { x: 100, y: 100 },
  data: { title: `Node ${id}`, prompt: '', result: '', color: '#fff', tags: [], note: '' },
  selected,
  ...(parentNode ? { parentNode } : {}),
});

const makeEdge = (id: string, source: string, target: string, selected = false): Edge => ({
  id,
  source,
  target,
  selected,
});

function setup(initialNodes: Node<CanvasNodeData>[], initialEdges: Edge[]) {
  let nodes = [...initialNodes];
  let edges = [...initialEdges];

  const getNodes = vi.fn(() => nodes);
  const getEdges = vi.fn(() => edges);
  const setNodes = vi.fn((updater: any) => {
    nodes = typeof updater === 'function' ? updater(nodes) : updater;
  });
  const setEdges = vi.fn((updater: any) => {
    edges = typeof updater === 'function' ? updater(edges) : updater;
  });
  const rememberHistory = vi.fn();
  const setStatus = vi.fn();

  const { result } = renderHook(() =>
    useNodeClipboard(getNodes, getEdges, setNodes, setEdges, rememberHistory, setStatus),
  );

  return { result, getNodes, getEdges, setNodes, setEdges, rememberHistory, setStatus, getState: () => ({ nodes, edges }) };
}

describe('useNodeClipboard', () => {
  describe('deleteSelected', () => {
    it('deletes selected nodes and connected edges', () => {
      const n1 = makeNode('1', true);
      const n2 = makeNode('2', false);
      const e1 = makeEdge('e1', '1', '2');
      const h = setup([n1, n2], [e1]);

      act(() => h.result.current.deleteSelected());

      expect(h.rememberHistory).toHaveBeenCalled();
      expect(h.setNodes).toHaveBeenCalled();
      expect(h.setEdges).toHaveBeenCalled();

      const state = h.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].id).toBe('2');
      expect(state.edges).toHaveLength(0); // edge connected to deleted node
    });

    it('also deletes children of selected group', () => {
      const group = { ...makeNode('g1', true), type: 'groupNode' };
      const child = makeNode('c1', false, 'g1');
      const h = setup([group, child], []);

      act(() => h.result.current.deleteSelected());

      expect(h.getState().nodes).toHaveLength(0);
    });

    it('reports status when nothing selected', () => {
      const h = setup([makeNode('1', false)], []);

      act(() => h.result.current.deleteSelected());

      expect(h.rememberHistory).not.toHaveBeenCalled();
      expect(h.setStatus).toHaveBeenCalledWith('未选择内容');
    });
  });

  describe('deleteNodeById', () => {
    it('deletes a specific node and its edges', () => {
      const n1 = makeNode('1');
      const n2 = makeNode('2');
      const e1 = makeEdge('e1', '1', '2');
      const h = setup([n1, n2], [e1]);

      act(() => h.result.current.deleteNodeById('1'));

      const state = h.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.edges).toHaveLength(0);
    });
  });

  describe('duplicateSelected', () => {
    it('duplicates selected nodes with offset', () => {
      const n1 = makeNode('1', true);
      const h = setup([n1], []);

      act(() => h.result.current.duplicateSelected());

      const state = h.getState();
      expect(state.nodes).toHaveLength(2);
      // Original deselected, copy selected
      expect(state.nodes[0].selected).toBe(false);
      expect(state.nodes[1].selected).toBe(true);
      expect(state.nodes[1].data.title).toContain('副本');
    });

    it('reports status when nothing selected', () => {
      const h = setup([makeNode('1', false)], []);

      act(() => h.result.current.duplicateSelected());

      expect(h.setStatus).toHaveBeenCalledWith('未选择节点');
    });
  });

  describe('duplicateNodeById', () => {
    it('duplicates a group and its children', () => {
      const group = { ...makeNode('g1'), type: 'groupNode' };
      const child = makeNode('c1', false, 'g1');
      const h = setup([group, child], []);

      act(() => h.result.current.duplicateNodeById('g1'));

      const state = h.getState();
      expect(state.nodes).toHaveLength(4); // original 2 + copied 2
    });
  });
});
