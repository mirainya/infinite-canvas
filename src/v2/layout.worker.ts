import { Graph, layout } from '@dagrejs/dagre';

type LayoutRequest = {
  nodes: { id: string; width?: number; height?: number }[];
  edges: { source: string; target: string }[];
};

const scope = self as unknown as {
  onmessage: (event: MessageEvent<LayoutRequest>) => void;
  postMessage: (value: unknown) => void;
};

scope.onmessage = ({ data }) => {
  const graph = new Graph({ multigraph: true });
  graph.setGraph({
    rankdir: 'LR',
    ranker: 'network-simplex',
    acyclicer: 'greedy',
    ranksep: 150,
    nodesep: 70,
    edgesep: 32,
    marginx: 80,
    marginy: 80,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  data.nodes.forEach((node) => graph.setNode(node.id, {
    width: node.width || 286,
    height: node.height || 260,
  }));
  data.edges.forEach((edge, index) => graph.setEdge(edge.source, edge.target, { weight: 2 }, `edge-${index}`));
  layout(graph);

  const positions: Record<string, { x: number; y: number }> = {};
  data.nodes.forEach((node) => {
    const point = graph.node(node.id);
    positions[node.id] = {
      x: Math.round(point.x - (node.width || 286) / 2),
      y: Math.round(point.y - (node.height || 260) / 2),
    };
  });
  scope.postMessage(positions);
};
