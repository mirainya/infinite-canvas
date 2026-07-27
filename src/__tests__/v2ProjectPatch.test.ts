import { describe, expect, it } from 'vitest';
import { graphPatch } from '../v2/projectPatch';
import type { V2Graph, V2Node } from '../v2/types';

function node(id: string, x = 0): V2Node {
  return { id, type: 'text-input', position: { x, y: 0 }, data: { text: id } };
}

describe('V2 incremental project patch', () => {
  it('contains only changed and deleted graph records', () => {
    const before: V2Graph = { nodes: [node('a'), node('b')], edges: [] };
    const after: V2Graph = { nodes: [node('a', 40), node('c')], edges: [] };

    const patch = graphPatch(before, after);

    expect(patch.upsertNodes.map((item) => item.id)).toEqual(['a', 'c']);
    expect(patch.deleteNodeIds).toEqual(['b']);
    expect(patch.upsertEdges).toEqual([]);
  });

  it('stays empty when a large graph is unchanged', () => {
    const graph: V2Graph = {
      nodes: Array.from({ length: 500 }, (_, index) => node(`node-${index}`, index * 20)),
      edges: [],
    };
    const patch = graphPatch(graph, graph);
    expect(patch.upsertNodes).toHaveLength(0);
    expect(patch.deleteNodeIds).toHaveLength(0);
  });
});
