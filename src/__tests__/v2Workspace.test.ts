import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  cancelRun: vi.fn(),
  createProject: vi.fn(),
  createProjectVersion: vi.fn(),
  createRun: vi.fn(),
  createTemplate: vi.fn(),
  getProject: vi.fn(),
  getRun: vi.fn(),
  instantiateTemplate: vi.fn(),
  listAssets: vi.fn(),
  listModels: vi.fn(),
  listProjects: vi.fn(),
  listProjectVersions: vi.fn(),
  listRuns: vi.fn(),
  listTemplates: vi.fn(),
  patchProject: vi.fn(),
  restoreProjectVersion: vi.fn(),
  updateTemplate: vi.fn(),
  uploadAsset: vi.fn(),
}));

vi.mock('../v2/api', () => api);
vi.mock('../AuthContext', () => ({
  useAuth: () => ({
    avatar: '',
    credits: 100,
    logout: vi.fn(),
    refreshCredits: vi.fn(),
    username: 'tester',
  }),
}));
vi.mock('../components/Lightbox', () => ({ default: () => null }));
vi.mock('../v2/V2Canvas', () => ({
  V2_NODE_DRAG_MIME: 'application/x-infinite-canvas-node',
  default: React.forwardRef<HTMLDivElement, { projectId: string }>((props, ref) => (
    React.createElement('div', { ref, 'data-testid': 'v2-canvas' }, props.projectId)
  )),
}));

import V2Workspace from '../v2/V2Workspace';

const emptyProject = {
  id: 'canvas-1',
  name: '未命名画布',
  description: '',
  revision: 1,
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
  graph: { nodes: [], edges: [] },
  viewport: { x: 0, y: 0, zoom: 1 },
  settings: {},
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('V2Workspace', () => {
  it('空账号登录后自动创建并打开画布', async () => {
    api.listProjects.mockResolvedValue([]);
    api.listTemplates.mockResolvedValue([]);
    api.listModels.mockResolvedValue([]);
    api.createProject.mockResolvedValue(emptyProject);
    api.getProject.mockResolvedValue(emptyProject);
    api.listAssets.mockResolvedValue([]);
    api.listRuns.mockResolvedValue([]);
    api.listProjectVersions.mockResolvedValue([]);

    render(React.createElement(V2Workspace));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith('未命名画布'));
    expect((await screen.findByTestId('v2-canvas')).textContent).toContain('canvas-1');
    expect(screen.queryByText('新建项目')).toBeNull();

    const imageInput = screen.getByRole('button', { name: '图像输入' });
    const setData = vi.fn();
    fireEvent.dragStart(imageInput, { dataTransfer: { effectAllowed: 'none', setData } });
    expect(imageInput.getAttribute('draggable')).toBe('true');
    expect(setData).toHaveBeenCalledWith('application/x-infinite-canvas-node', 'image-input');
  });
});
