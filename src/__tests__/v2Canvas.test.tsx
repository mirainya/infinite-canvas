import React from 'react';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type FlowNode = {
  id: string;
  position: { x: number; y: number };
};

type FlowProps = {
  children?: React.ReactNode;
  nodes: FlowNode[];
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  panOnScroll?: boolean;
  zoomOnScroll?: boolean;
};

vi.mock('reactflow', async () => {
  const ReactModule = await import('react');
  return {
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    MiniMap: () => null,
    ReactFlow: ({ children, nodes, onDragOver, onDrop, panOnScroll, zoomOnScroll }: FlowProps) => (
      <div
        data-testid="react-flow"
        data-nodes={JSON.stringify(nodes)}
        data-pan-on-scroll={String(Boolean(panOnScroll))}
        data-zoom-on-scroll={String(Boolean(zoomOnScroll))}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {children}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = ReactModule.useState(initial);
      return [edges, setEdges, vi.fn()];
    },
    useNodesState: (initial: FlowNode[]) => {
      const [nodes, setNodes] = ReactModule.useState(initial);
      return [nodes, setNodes, vi.fn()];
    },
    useReactFlow: () => ({
      fitView: vi.fn(),
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    }),
  };
});

vi.mock('../v2/V2Node', () => ({ default: () => null }));

import V2Canvas, { V2_NODE_DRAG_MIME } from '../v2/V2Canvas';

afterEach(cleanup);

describe('V2Canvas', () => {
  it('支持滚轮缩放并在释放位置创建节点', async () => {
    render(
      <V2Canvas
        projectId="canvas-1"
        initialGraph={{ nodes: [], edges: [] }}
        initialViewport={{ x: 0, y: 0, zoom: 1 }}
        outputs={{}}
        imageModels={[]}
        chatModels={[]}
        onGraphChange={vi.fn()}
        onViewportChange={vi.fn()}
        onUploadImage={vi.fn(async () => '')}
        onOpenImage={vi.fn()}
        onStatus={vi.fn()}
      />,
    );

    const flow = screen.getByTestId('react-flow');
    expect(flow.getAttribute('data-zoom-on-scroll')).toBe('true');
    expect(flow.getAttribute('data-pan-on-scroll')).toBe('false');

    const dataTransfer = {
      dropEffect: 'none',
      getData: vi.fn(() => 'image-input'),
      types: [V2_NODE_DRAG_MIME],
    };
    fireEvent.dragOver(flow, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');

    const dropEvent = createEvent.drop(flow, { dataTransfer });
    Object.defineProperties(dropEvent, {
      clientX: { value: 800 },
      clientY: { value: 400 },
    });
    fireEvent(flow, dropEvent);
    await waitFor(() => expect(JSON.parse(flow.getAttribute('data-nodes') || '[]')).toHaveLength(1));

    const [node] = JSON.parse(flow.getAttribute('data-nodes') || '[]') as FlowNode[];
    expect(node.position).toEqual({ x: 657, y: 376 });
  });
});
