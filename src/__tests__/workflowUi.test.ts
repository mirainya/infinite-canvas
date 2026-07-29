import { createElement } from 'react';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectorPanel, NodeLibraryPanel, SearchPanel } from '../components/SidebarPanels';
import CanvasContextMenu from '../components/CanvasContextMenu';
import TextBoxBody from '../nodes/bodies/TextBoxBody';
import { getAutoNodePosition } from '../hooks/useNodeCreation';
import { hasConnectedOutputNode } from '../hooks/useDataFlow';
import { useNodeSearch } from '../hooks/useNodeSearch';
import { layoutNodesByEdges } from '../graphLayout';
import { nodeRegistry } from '../nodes';
import type { CanvasNodeData } from '../types';
import type { Node } from 'reactflow';
import type { NodeDefinition } from '../types/workflow';

const textBoxDefinition: NodeDefinition = {
  defId: 'text-box',
  name: '文本框',
  category: '工具',
  view: 'text-box',
  inputs: [{ id: 'text', label: '文本', type: 'STRING' }],
  outputs: [{ id: 'text', label: '文本', type: 'STRING' }],
  controls: [{ kind: 'text', id: 'content', label: '内容' }],
};

afterEach(() => {
  cleanup();
  nodeRegistry.clear();
});

describe('workflow UI', () => {
  it('places automatically added nodes on a non-overlapping grid', () => {
    expect(getAutoNodePosition(0)).toEqual({ x: 120, y: 120 });
    expect(getAutoNodePosition(3)).toEqual({ x: 120, y: 740 });
  });

  it('lays out connected nodes by graph direction without crossing paired edges', () => {
    const nodes = ['source-a', 'source-b', 'target-a', 'target-b', 'final'].map((id) => ({
      id,
      position: { x: 0, y: 0 },
      width: 240,
      height: 160,
      data: { title: id },
    })) as Node<CanvasNodeData>[];
    const edges = [
      { id: 'edge-a', source: 'source-a', target: 'target-b' },
      { id: 'edge-b', source: 'source-b', target: 'target-a' },
      { id: 'edge-c', source: 'target-a', target: 'final' },
      { id: 'edge-d', source: 'target-b', target: 'final' },
    ];

    const arranged = layoutNodesByEdges(nodes, edges);
    const positions = new Map(arranged.map((node) => [node.id, node.position]));
    const sourceOrder = positions.get('source-a')!.y - positions.get('source-b')!.y;
    const targetOrder = positions.get('target-b')!.y - positions.get('target-a')!.y;

    expect(positions.get('target-a')!.x).toBeGreaterThan(positions.get('source-a')!.x);
    expect(sourceOrder * targetOrder).toBeGreaterThan(0);
  });

  it('moves a group as one unit while preserving child positions', () => {
    const nodes = [
      { id: 'group', type: 'groupNode', position: { x: 0, y: 0 }, style: { width: 480, height: 320 }, data: { title: '分组' } },
      { id: 'child', parentNode: 'group', position: { x: 40, y: 50 }, data: { title: '子节点' } },
      { id: 'target', position: { x: 0, y: 0 }, width: 240, height: 160, data: { title: '输出' } },
    ] as Node<CanvasNodeData>[];

    const arranged = layoutNodesByEdges(nodes, [{ id: 'edge', source: 'child', target: 'target' }]);
    const group = arranged.find((node) => node.id === 'group')!;
    const child = arranged.find((node) => node.id === 'child')!;
    const target = arranged.find((node) => node.id === 'target')!;

    expect(child.position).toEqual({ x: 40, y: 50 });
    expect(target.position.x).toBeGreaterThan(group.position.x);
  });

  it('packs disconnected nodes into horizontal and vertical rows', () => {
    const nodes = Array.from({ length: 6 }, (_, index) => ({
      id: `node-${index}`,
      position: { x: 0, y: 0 },
      width: 240,
      height: 160,
      data: { title: `节点 ${index}` },
    })) as Node<CanvasNodeData>[];

    const arranged = layoutNodesByEdges(nodes, []);
    const xValues = new Set(arranged.map((node) => node.position.x));
    const yValues = new Set(arranged.map((node) => node.position.y));

    expect(xValues.size).toBe(3);
    expect(yValues.size).toBe(2);
  });

  it('reuses an existing connected preview node', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: { title: '生图', defId: 'image-gen' } },
      { id: 'preview', position: { x: 400, y: 0 }, data: { title: '预览', defId: 'image-preview' } },
    ] as Node<CanvasNodeData>[];
    const edges = [{
      id: 'edge-1', source: 'source', target: 'preview',
      sourceHandle: 'output-image', targetHandle: 'input-image',
    }];

    expect(hasConnectedOutputNode(edges, nodes, 'source', 'output-image', 'image-preview')).toBe(true);
  });

  it('adds a node when its library button is clicked', () => {
    nodeRegistry.set(textBoxDefinition.defId, textBoxDefinition);
    const onAddNode = vi.fn();
    render(createElement(NodeLibraryPanel, { onAddNode }));

    fireEvent.click(screen.getByRole('button', { name: '文本框' }));

    expect(onAddNode).toHaveBeenCalledWith('text-box');
  });

  it('loads the full node list before a search is entered', () => {
    const nodes = [
      { id: 'node-1', position: { x: 0, y: 0 }, data: { title: '角色草图', prompt: '', result: '', note: '待补背景' } },
      { id: 'node-2', position: { x: 0, y: 0 }, data: { title: '背景图', prompt: '', result: '', note: '' } },
    ] as Node<CanvasNodeData>[];
    const resetIndex = vi.fn();

    const { result } = renderHook(() => useNodeSearch(nodes, '', resetIndex));

    expect(result.current.map((node) => node.id)).toEqual(['node-1', 'node-2']);
  });

  it('shows node metadata and notes in search results', () => {
    const node = {
      id: 'node-1',
      position: { x: 0, y: 0 },
      data: { title: '角色草图', prompt: '', result: '', note: '等待确认服装', tags: ['角色'] },
    } as Node<CanvasNodeData>;

    render(createElement(SearchPanel, {
      inputRef: { current: null },
      query: '',
      activeIndex: 0,
      matches: [node],
      onQueryChange: vi.fn(),
      onFocusMatch: vi.fn(),
      onSetActiveIndex: vi.fn(),
      onFocusNode: vi.fn(),
    }));

    expect(screen.getByText('全部节点')).toBeTruthy();
    expect(screen.getByText('#角色')).toBeTruthy();
    expect(screen.getByText('等待确认服装')).toBeTruthy();
  });

  it('clears an active node search', () => {
    const onQueryChange = vi.fn();

    render(createElement(SearchPanel, {
      inputRef: { current: null },
      query: '角色',
      activeIndex: 0,
      matches: [],
      onQueryChange,
      onFocusMatch: vi.fn(),
      onSetActiveIndex: vi.fn(),
      onFocusNode: vi.fn(),
    }));

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    expect(onQueryChange).toHaveBeenCalledWith('');
  });

  it('edits a selected node note from the inspector', () => {
    const node = {
      id: 'node-1',
      position: { x: 0, y: 0 },
      data: { title: '角色草图', prompt: '', result: '', note: '', tags: [] },
    } as Node<CanvasNodeData>;
    const onUpdateSelected = vi.fn();

    render(createElement(InspectorPanel, {
      selectedNodes: [node],
      selectedTitleText: '角色草图',
      selectedTagsText: '',
      selectedNoteText: '',
      onUpdateSelected,
      onOpenDetail: vi.fn(),
    }));

    fireEvent.change(screen.getByLabelText('备注'), { target: { value: '调整眼睛颜色' } });

    expect(onUpdateSelected).toHaveBeenCalledWith({ note: '调整眼睛颜色' });
  });

  it('updates text content and output in one history operation', () => {
    const updatePVs = vi.fn();
    render(createElement(
      ReactFlowProvider,
      null,
      createElement(TextBoxBody, {
        id: 'node-1',
        def: textBoxDefinition,
        pv: {},
        selected: false,
        running: false,
        error: '',
        updatePV: vi.fn(),
        updatePVs,
        handleRun: vi.fn(),
        renderCtrl: () => null,
        renderPorts: () => null,
        renderFooter: () => null,
      }),
    ));

    fireEvent.change(screen.getByPlaceholderText('输入或接收文本...'), {
      target: { value: 'hello' },
    });

    expect(updatePVs).toHaveBeenCalledTimes(1);
    expect(updatePVs).toHaveBeenCalledWith({ content: 'hello', 'output-text': 'hello' });
  });

  it('closes the context menu when clicking outside it', () => {
    const onClose = vi.fn();
    const node = {
      id: 'node-1',
      position: { x: 0, y: 0 },
      data: { title: '测试节点', defId: 'text-box', portValues: {} },
    } as Node<CanvasNodeData>;

    render(createElement(CanvasContextMenu, {
      menu: { x: 20, y: 20, flowPosition: { x: 0, y: 0 }, nodeId: node.id },
      node,
      onClose,
      onFocusNode: vi.fn(),
      onOpenDetail: vi.fn(),
      onDuplicateNode: vi.fn(),
      onDeleteNode: vi.fn(),
      onAddGroup: vi.fn(),
      onAddWorkflowNode: vi.fn(),
    }));

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
