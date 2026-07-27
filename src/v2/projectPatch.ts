import type { ProjectPatch } from './api';
import type { V2Graph } from './types';

export function graphPatch(previous: V2Graph, current: V2Graph): ProjectPatch {
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const previousEdges = new Map(previous.edges.map((edge) => [edge.id, edge]));
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]));
  const upsertNodes = current.nodes.filter((node) => {
    const before = previousNodes.get(node.id);
    return !before
      || before.type !== node.type
      || before.position.x !== node.position.x
      || before.position.y !== node.position.y
      || JSON.stringify(before.data) !== JSON.stringify(node.data);
  });
  const upsertEdges = current.edges.filter((edge) => {
    const before = previousEdges.get(edge.id);
    return !before
      || before.source !== edge.source
      || before.target !== edge.target
      || before.sourceHandle !== edge.sourceHandle
      || before.targetHandle !== edge.targetHandle;
  });
  return {
    upsertNodes,
    deleteNodeIds: previous.nodes.filter((node) => !currentNodes.has(node.id)).map((node) => node.id),
    upsertEdges,
    deleteEdgeIds: previous.edges.filter((edge) => !currentEdges.has(edge.id)).map((edge) => edge.id),
  };
}
