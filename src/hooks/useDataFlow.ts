import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Edge, Node } from 'reactflow';
import { getNodeDef } from '../nodes';
import type { CanvasNodeData } from '../types';
import type { PortValues, SystemContext } from '../types/workflow';

const PREVIEW_SOURCE_VIEWS = new Set(['image-gen', 'image-edit', 'image-compose']);
const TEXT_SPAWN_DEFS = new Set(['llm-chat', 'prompt-enhance']);

export function hasConnectedOutputNode(
  edges: Edge[],
  nodes: Node<CanvasNodeData>[],
  sourceId: string,
  sourceHandle: string,
  targetDefId: string,
) {
  const targetIds = new Set(
    edges
      .filter((edge) => edge.source === sourceId && edge.sourceHandle === sourceHandle)
      .map((edge) => edge.target),
  );
  return nodes.some((node) => targetIds.has(node.id) && node.data.defId === targetDefId);
}

export function useDataFlow(
  edges: Edge[],
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  setStatus: (status: string) => void,
  ctx: SystemContext,
  nodes: Node<CanvasNodeData>[],
  rememberHistory: () => void,
) {
  const edgesRef = useRef(edges);
  useEffect(() => { edgesRef.current = edges; });

  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; });

  const spawnPreviewNode = useCallback(
    (sourceNodeId: string, sourcePortValues: PortValues) => {
      const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
      if (!sourceNode?.data.defId) return;

      const def = getNodeDef(sourceNode.data.defId);
      if (!def) return;

      // Image preview spawn
      if (PREVIEW_SOURCE_VIEWS.has(def.view ?? def.defId)) {
        const imageOutput = def.outputs.find((out) => out.type === 'IMAGE');
        if (imageOutput) {
          const sourceHandle = `output-${imageOutput.id}`;
          if (hasConnectedOutputNode(
            edgesRef.current, nodesRef.current, sourceNodeId, sourceHandle, 'image-preview',
          )) return;
          const imageUrl = sourcePortValues[`output-${imageOutput.id}`];
          if (typeof imageUrl === 'string' && imageUrl) {
            const previewId = crypto.randomUUID();
            const previewCount = edgesRef.current.filter((edge) => edge.source === sourceNodeId && edge.targetHandle === 'input-image').length;
            const previewNode: Node<CanvasNodeData> = {
              id: previewId,
              type: 'workflowNode',
              position: {
                x: sourceNode.position.x + 360,
                y: sourceNode.position.y + previewCount * 480,
              },
              data: {
                title: '图片预览',
                prompt: '',
                result: '',
                defId: 'image-preview',
                portValues: { 'input-image': imageUrl, 'output-image': imageUrl },
              },
            };
            const previewEdge: Edge = {
              id: `edge-${sourceNodeId}-${previewId}`,
              source: sourceNodeId,
              target: previewId,
              sourceHandle,
              targetHandle: 'input-image',
            };
            rememberHistory();
            setNodes((cur) => [...cur, previewNode]);
            setEdges((cur) => [...cur, previewEdge]);
          }
        }
        return;
      }

      // Text box spawn for LLM nodes
      if (TEXT_SPAWN_DEFS.has(def.defId)) {
        const textOutput = def.outputs.find((out) => out.type === 'STRING' || out.type === 'TEXT');
        if (!textOutput) return;
        const sourceHandle = `output-${textOutput.id}`;
        if (hasConnectedOutputNode(
          edgesRef.current, nodesRef.current, sourceNodeId, sourceHandle, 'text-box',
        )) return;
        const text = sourcePortValues[`output-${textOutput.id}`];
        if (typeof text !== 'string' || !text) return;

        const textBoxId = crypto.randomUUID();
        const existingCount = edgesRef.current.filter((edge) => edge.source === sourceNodeId && edge.sourceHandle === `output-${textOutput.id}`).length;
        const textBoxNode: Node<CanvasNodeData> = {
          id: textBoxId,
          type: 'workflowNode',
          position: {
            x: sourceNode.position.x + 360,
            y: sourceNode.position.y + existingCount * 220,
          },
          data: {
            title: '文本框',
            prompt: '',
            result: '',
            defId: 'text-box',
            portValues: { 'input-text': text, 'output-text': text, content: text },
          },
        };
        const textEdge: Edge = {
          id: `edge-${sourceNodeId}-${textBoxId}`,
          source: sourceNodeId,
          target: textBoxId,
          sourceHandle,
          targetHandle: 'input-text',
        };
        rememberHistory();
        setNodes((cur) => [...cur, textBoxNode]);
        setEdges((cur) => [...cur, textEdge]);
      }
    },
    [rememberHistory, setEdges, setNodes],
  );

  const propagate = useCallback(
    (sourceNodeId: string, sourcePortValues: PortValues) => {
      const outEdges = edgesRef.current.filter((e) => e.source === sourceNodeId);
      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          if (n.id === sourceNodeId) {
            return { ...n, data: { ...n.data, portValues: sourcePortValues } };
          }
          const incoming = outEdges.filter((e) => e.target === n.id);
          if (incoming.length === 0) return n;
          const pv = { ...(n.data.portValues ?? {}) };
          let changed = false;
          for (const edge of incoming) {
            if (!edge.sourceHandle || !edge.targetHandle) continue;
            const val = sourcePortValues[edge.sourceHandle] ?? null;
            if (pv[edge.targetHandle] !== val) {
              pv[edge.targetHandle] = val;
              changed = true;
            }
          }
          return changed ? { ...n, data: { ...n.data, portValues: pv } } : n;
        }),
      );
    },
    [setNodes],
  );

  const runWorkflow = useCallback(async () => {
    const curNodes = nodesRef.current;
    const curEdges = edgesRef.current;
    const workflowNodes = curNodes.filter((n) => n.data.defId);
    if (workflowNodes.length === 0) { setStatus('没有可执行的工作流节点'); return; }

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const n of workflowNodes) {
      adj.set(n.id, []);
      inDegree.set(n.id, 0);
    }
    for (const e of curEdges) {
      if (!adj.has(e.source) || !adj.has(e.target)) continue;
      adj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const next of adj.get(id) ?? []) {
        const newDeg = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, newDeg);
        if (newDeg === 0) queue.push(next);
      }
    }

    if (order.length !== workflowNodes.length) {
      setStatus('工作流存在循环依赖，无法执行');
      return;
    }

    setStatus('工作流执行中...');

    const pvMap = new Map<string, PortValues>();
    for (const n of curNodes) {
      if (n.data.defId) pvMap.set(n.id, { ...(n.data.portValues ?? {}) });
    }

    for (const nodeId of order) {
      const node = curNodes.find((n) => n.id === nodeId);
      if (!node?.data.defId) continue;
      const def = getNodeDef(node.data.defId);
      if (!def) continue;

      const portValues = pvMap.get(nodeId) ?? {};
      const inputValues: PortValues = {};
      for (const inp of def.inputs) {
        inputValues[inp.id] = portValues[`input-${inp.id}`] ?? null;
      }
      const controlValues: PortValues = {};
      for (const ctrl of def.controls) {
        controlValues[ctrl.id] = portValues[ctrl.id] ?? null;
        if (ctrl.kind === 'imageEdit') {
          controlValues[`${ctrl.id}_rect`] = portValues[`${ctrl.id}_rect`] ?? null;
        }
      }

      try {
        const outputs = await ctx.execute(def.defId, inputValues, controlValues);
        for (const [key, val] of Object.entries(outputs)) {
          portValues[`output-${key}`] = val;
        }
        pvMap.set(nodeId, portValues);

        const outEdges = curEdges.filter((e) => e.source === nodeId);
        for (const edge of outEdges) {
          if (!edge.sourceHandle || !edge.targetHandle) continue;
          const targetPv = pvMap.get(edge.target);
          if (targetPv) {
            targetPv[edge.targetHandle] = portValues[edge.sourceHandle] ?? null;
          }
        }

        // Sync all tracked nodes to React state
        const snapshot = new Map(pvMap);
        setNodes((cur) =>
          cur.map((n) => {
            const pv = snapshot.get(n.id);
            return pv ? { ...n, data: { ...n.data, portValues: { ...pv } } } : n;
          }),
        );
        spawnPreviewNode(nodeId, portValues);
      } catch (err) {
        setStatus(`节点 ${def.name} 执行失败: ${err instanceof Error ? err.message : '未知错误'}`);
        return;
      }
    }

    setStatus('工作流执行完成');
  }, [setNodes, setStatus, ctx, spawnPreviewNode]);

  return { propagate, runWorkflow, spawnPreviewNode };
}
