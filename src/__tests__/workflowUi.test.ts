import { createElement } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectorPanel, NodeLibraryPanel, SearchPanel } from '../components/SidebarPanels';
import NodeManagerPanel from '../components/NodeManagerPanel';
import CanvasContextMenu from '../components/CanvasContextMenu';
import TextBoxBody from '../nodes/bodies/TextBoxBody';
import { getAutoGroupPosition, getAutoNodePosition } from '../hooks/useNodeCreation';
import { hasConnectedOutputNode } from '../hooks/useDataFlow';
import { useNodeSearch } from '../hooks/useNodeSearch';
import { useGroupActions } from '../hooks/useGroupActions';
import { useSpatialGroupDrag } from '../hooks/useSpatialGroupDrag';
import { getSpatialParentGroup, normalizeSpatialNodes } from '../spatialGroups';
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

  it('places a new group beside existing canvas content', () => {
    const nodes = [
      { id: 'a', position: { x: 100, y: 60 }, width: 240, data: { title: 'A' } },
      { id: 'b', position: { x: 500, y: 180 }, width: 280, data: { title: 'B' } },
    ] as Node<CanvasNodeData>[];

    expect(getAutoGroupPosition(nodes)).toEqual({ x: 900, y: 80 });
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

  it('lays out a spatial group as one unit while preserving member offsets', () => {
    const nodes = [
      { id: 'group', type: 'groupNode', position: { x: 0, y: 0 }, style: { width: 480, height: 320 }, data: { title: '分组' } },
      { id: 'child', parentNode: 'group', position: { x: 40, y: 50 }, data: { title: '子节点' } },
      { id: 'target', position: { x: 800, y: 0 }, width: 240, height: 160, data: { title: '输出' } },
    ] as Node<CanvasNodeData>[];

    const arranged = layoutNodesByEdges(nodes, [{ id: 'edge', source: 'child', target: 'target' }]);
    const group = arranged.find((node) => node.id === 'group')!;
    const child = arranged.find((node) => node.id === 'child')!;
    const target = arranged.find((node) => node.id === 'target')!;

    expect(child.position.x - group.position.x).toBe(40);
    expect(child.position.y - group.position.y).toBe(50);
    expect(target.position.x).toBeGreaterThan(group.position.x);
  });

  it('creates a spatial frame around selected nodes without parenting them', () => {
    let nodes = [
      { id: 'first', selected: true, position: { x: 140, y: 160 }, width: 200, height: 120, data: { title: '节点一' } },
      { id: 'second', selected: true, position: { x: 440, y: 220 }, width: 200, height: 120, data: { title: '节点二' } },
    ] as Node<CanvasNodeData>[];
    const setNodes = vi.fn((update: React.SetStateAction<Node<CanvasNodeData>[]>) => {
      nodes = typeof update === 'function' ? update(nodes) : update;
    });
    const { result } = renderHook(() => useGroupActions(
      () => nodes,
      setNodes,
      vi.fn(),
      vi.fn(),
    ));

    act(() => result.current.groupSelected());

    const group = nodes.find((node) => node.type === 'groupNode')!;
    expect(nodes[0].id).toBe(group.id);
    expect(nodes.filter((node) => node.parentNode)).toHaveLength(0);
    expect(getSpatialParentGroup(nodes, nodes.find((node) => node.id === 'first')!)?.id).toBe(group.id);
    expect(getSpatialParentGroup(nodes, nodes.find((node) => node.id === 'second')!)?.id).toBe(group.id);
  });

  it('flattens legacy parent groups without changing absolute positions', () => {
    const legacy = [
      { id: 'group', type: 'groupNode', position: { x: 100, y: 80 }, style: { width: 480, height: 320 }, data: { title: '分组' } },
      { id: 'child', parentNode: 'group', extent: 'parent', position: { x: 40, y: 60 }, data: { title: '子节点' } },
    ] as Node<CanvasNodeData>[];

    const normalized = normalizeSpatialNodes(legacy);
    const child = normalized.find((node) => node.id === 'child')!;
    expect(child.position).toEqual({ x: 140, y: 140 });
    expect(child.parentNode).toBeUndefined();
    expect(child.extent).toBeUndefined();
  });

  it('moves spatial group contents with the group title bar', () => {
    let nodes = [
      { id: 'group', type: 'groupNode', position: { x: 100, y: 100 }, style: { width: 480, height: 320 }, data: { title: '分组' } },
      { id: 'inside', position: { x: 180, y: 190 }, width: 160, height: 100, data: { title: '组内' } },
      { id: 'outside', position: { x: 800, y: 200 }, width: 160, height: 100, data: { title: '组外' } },
    ] as Node<CanvasNodeData>[];
    const setNodes = vi.fn((update: React.SetStateAction<Node<CanvasNodeData>[]>) => {
      nodes = typeof update === 'function' ? update(nodes) : update;
    });
    const { result } = renderHook(() => useSpatialGroupDrag(nodes, setNodes));
    const group = nodes[0];

    act(() => result.current.onNodeDragStart({} as never, group, [group]));
    act(() => result.current.onNodeDrag(
      {} as never,
      { ...group, position: { x: 160, y: 140 } },
      [{ ...group, position: { x: 160, y: 140 } }],
    ));

    expect(nodes.find((node) => node.id === 'inside')?.position).toEqual({ x: 240, y: 230 });
    expect(nodes.find((node) => node.id === 'outside')?.position).toEqual({ x: 800, y: 200 });
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
    render(createElement(NodeLibraryPanel, { onAddNode, onAddGroup: vi.fn() }));

    fireEvent.click(screen.getByRole('button', { name: '文本框' }));

    expect(onAddNode).toHaveBeenCalledWith('text-box');
  });

  it('adds a group from the node library', () => {
    const onAddGroup = vi.fn();
    render(createElement(NodeLibraryPanel, { onAddNode: vi.fn(), onAddGroup }));

    fireEvent.click(screen.getByRole('button', { name: '添加分组区域' }));

    expect(onAddGroup).toHaveBeenCalledTimes(1);
  });

  it('filters and manages nodes in batches', () => {
    const nodes = [
      { id: 'group-1', type: 'groupNode', position: { x: 0, y: 0 }, data: { title: '角色分组', prompt: '', result: '' } },
      { id: 'node-1', position: { x: 20, y: 60 }, data: { title: '角色线稿', prompt: '', result: '' } },
    ] as Node<CanvasNodeData>[];
    const onSetHidden = vi.fn();

    render(createElement(NodeManagerPanel, {
      nodes,
      onAddGroup: vi.fn(),
      onFocusNode: vi.fn(),
      onEditNode: vi.fn(),
      onSetHidden,
      onSetLocked: vi.fn(),
      onDeleteNodes: vi.fn(),
    }));

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 角色线稿' }));
    fireEvent.click(screen.getByRole('button', { name: '批量隐藏' }));
    expect(onSetHidden).toHaveBeenCalledWith(['node-1'], true);

    fireEvent.click(screen.getByRole('button', { name: '筛选分组' }));
    expect(screen.getByText('角色分组')).toBeTruthy();
    expect(screen.queryByText('角色线稿')).toBeNull();
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
