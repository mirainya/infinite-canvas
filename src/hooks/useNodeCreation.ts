import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Node } from 'reactflow';
import { COLOR_OPTIONS, GROUP_HEIGHT, GROUP_WIDTH, NODE_TEMPLATES } from '../constants';
import { getNodeDef } from '../nodes';
import type { CanvasNodeData, NodeTemplate } from '../types';

const createNodeFromTemplate = (template: NodeTemplate, position: { x: number; y: number }) => ({
  id: crypto.randomUUID(),
  type: 'aiNode',
  position,
  data: {
    title: template.title,
    prompt: template.prompt,
    result: '',
    color: template.color,
    tags: template.tags,
    note: '',
  },
});

const createGroupNode = (position: { x: number; y: number }) => ({
  id: crypto.randomUUID(),
  type: 'groupNode',
  position,
  style: { width: GROUP_WIDTH, height: GROUP_HEIGHT },
  data: { title: '分组区域', prompt: '', result: '', color: COLOR_OPTIONS[1], tags: [], note: '' },
});

export function useNodeCreation(
  setNodes: Dispatch<SetStateAction<Node<CanvasNodeData>[]>>,
  rememberHistory: () => void,
  setStatus: (status: string) => void,
) {
  const addPromptNode = useCallback(() => {
    if (NODE_TEMPLATES.length === 0) { setStatus('暂无可用模板'); return; }
    rememberHistory();
    const template = NODE_TEMPLATES[0];
    setNodes((currentNodes) => [
      ...currentNodes,
      createNodeFromTemplate(template, {
        x: 160 + currentNodes.length * 40,
        y: 180 + currentNodes.length * 30,
      }),
    ]);
    setStatus('已添加节点');
  }, [rememberHistory, setNodes, setStatus]);

  const addPromptNodeAt = useCallback(
    (position: { x: number; y: number }) => {
      if (NODE_TEMPLATES.length === 0) { setStatus('暂无可用模板'); return; }
      rememberHistory();
      setNodes((currentNodes) => [...currentNodes, createNodeFromTemplate(NODE_TEMPLATES[0], position)]);
      setStatus('已在当前位置添加节点');
    },
    [rememberHistory, setNodes, setStatus],
  );

  const addTemplateNode = useCallback(
    (template: NodeTemplate) => {
      rememberHistory();
      setNodes((currentNodes) => [
        ...currentNodes,
        createNodeFromTemplate(template, {
          x: 160 + currentNodes.length * 40,
          y: 180 + currentNodes.length * 30,
        }),
      ]);
      setStatus(`已添加模板：${template.name}`);
    },
    [rememberHistory, setNodes, setStatus],
  );

  const addTemplateNodeAt = useCallback(
    (template: NodeTemplate, position: { x: number; y: number }) => {
      rememberHistory();
      setNodes((currentNodes) => [...currentNodes, createNodeFromTemplate(template, position)]);
      setStatus(`已在当前位置添加模板：${template.name}`);
    },
    [rememberHistory, setNodes, setStatus],
  );

  const addGroupNode = useCallback(() => {
    rememberHistory();
    setNodes((currentNodes) => [
      ...currentNodes,
      createGroupNode({ x: 80 + currentNodes.length * 20, y: 80 + currentNodes.length * 20 }),
    ]);
    setStatus('已添加分组区域');
  }, [rememberHistory, setNodes, setStatus]);

  const addGroupNodeAt = useCallback(
    (position: { x: number; y: number }) => {
      rememberHistory();
      setNodes((currentNodes) => [...currentNodes, createGroupNode(position)]);
      setStatus('已在当前位置添加分组');
    },
    [rememberHistory, setNodes, setStatus],
  );

  const addWorkflowNode = useCallback(
    (defId: string) => {
      const def = getNodeDef(defId);
      if (!def) { setStatus(`未知节点类型: ${defId}`); return; }
      rememberHistory();
      setNodes((currentNodes) => {
        const initPortValues: Record<string, string | number | null> = {};
        for (const ctrl of def.controls) {
          if ('default' in ctrl && ctrl.default != null) {
            initPortValues[ctrl.id] = ctrl.default;
          }
        }
        return [
          ...currentNodes,
          {
            id: crypto.randomUUID(),
            type: 'workflowNode',
            position: { x: 160 + currentNodes.length * 40, y: 180 + currentNodes.length * 30 },
            data: { title: def.name, prompt: '', result: '', defId, portValues: initPortValues },
          },
        ];
      });
      setStatus(`已添加节点：${def.name}`);
    },
    [rememberHistory, setNodes, setStatus],
  );

  const addWorkflowNodeAt = useCallback(
    (defId: string, position: { x: number; y: number }) => {
      const def = getNodeDef(defId);
      if (!def) { setStatus(`未知节点类型: ${defId}`); return; }
      rememberHistory();
      setNodes((currentNodes) => {
        const initPortValues: Record<string, string | number | null> = {};
        for (const ctrl of def.controls) {
          if ('default' in ctrl && ctrl.default != null) {
            initPortValues[ctrl.id] = ctrl.default;
          }
        }
        return [
          ...currentNodes,
          {
            id: crypto.randomUUID(),
            type: 'workflowNode',
            position,
            data: { title: def.name, prompt: '', result: '', defId, portValues: initPortValues },
          },
        ];
      });
      setStatus(`已在当前位置添加节点：${def.name}`);
    },
    [rememberHistory, setNodes, setStatus],
  );

  return {
    addPromptNode,
    addPromptNodeAt,
    addTemplateNode,
    addTemplateNodeAt,
    addGroupNode,
    addGroupNodeAt,
    addWorkflowNode,
    addWorkflowNodeAt,
  };
}
