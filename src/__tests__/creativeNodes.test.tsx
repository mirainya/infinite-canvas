import { createElement, type ComponentType } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageComposeBody from '../nodes/bodies/ImageComposeBody';
import ImageEditBody from '../nodes/bodies/ImageEditBody';
import ImageGenBody from '../nodes/bodies/ImageGenBody';
import type { NodeBodyProps } from '../nodes/registry';
import type { NodeDefinition } from '../types/workflow';

const imageGenDefinition: NodeDefinition = {
  defId: 'image-gen',
  name: 'AI 绘图',
  category: '生成',
  view: 'image-gen',
  inputs: [
    { id: 'image', label: '单张参考', type: 'IMAGE' },
    { id: 'images', label: '多张参考', type: 'IMAGE_LIST' },
  ],
  outputs: [
    { id: 'image', label: '图片', type: 'IMAGE' },
    { id: 'images', label: '多图', type: 'IMAGE_LIST' },
  ],
  controls: [
    { kind: 'model', id: 'model', label: '模型' },
    { kind: 'imageUploadMulti', id: 'ref_images', label: '参考图' },
    { kind: 'text', id: 'prompt', label: '提示词' },
    { kind: 'text', id: 'negative_prompt', label: '反向提示词' },
    { kind: 'select', id: 'aspect_ratio', label: '比例', options: ['1:1'] },
    { kind: 'number', id: 'count', label: '生成数量' },
  ],
};

const imageComposeDefinition: NodeDefinition = {
  defId: 'image-compose',
  name: 'AI 合成',
  category: '生成',
  view: 'image-compose',
  inputs: [
    { id: 'foreground', label: '素材图', type: 'IMAGE' },
    { id: 'background', label: '底图', type: 'IMAGE' },
  ],
  outputs: [{ id: 'image', label: '图片', type: 'IMAGE' }],
  controls: [
    { kind: 'model', id: 'model', label: '模型' },
    { kind: 'imageEdit', id: 'edit_area', label: '放置区域' },
    { kind: 'text', id: 'edit_prompt', label: '合成提示词' },
  ],
};

const imageEditDefinition: NodeDefinition = {
  defId: 'image-edit',
  name: 'AI 改图',
  category: '生成',
  view: 'image-edit',
  inputs: [{ id: 'image', label: '原图', type: 'IMAGE' }],
  outputs: [{ id: 'image', label: '图片', type: 'IMAGE' }],
  controls: [
    { kind: 'model', id: 'model', label: '模型' },
    { kind: 'imageEdit', id: 'edit_area', label: '编辑区域' },
    { kind: 'select', id: 'action', label: '操作', options: ['替换', '擦除', '添加', '扣图'] },
    { kind: 'text', id: 'edit_prompt', label: '修改提示词' },
  ],
};

function renderBody(
  component: ComponentType<NodeBodyProps>,
  props: Partial<NodeBodyProps> & Pick<NodeBodyProps, 'def'>,
) {
  const fullProps: NodeBodyProps = {
    id: 'node-1',
    pv: {},
    selected: false,
    running: false,
    error: '',
    updatePV: vi.fn(),
    updatePVs: vi.fn(),
    handleRun: vi.fn(),
    renderCtrl: (control) => createElement('div', { key: control.id }, control.label),
    renderPorts: () => null,
    renderFooter: () => null,
    ...props,
  };
  return render(createElement(ReactFlowProvider, null, createElement(component, fullProps)));
}

afterEach(cleanup);

describe('creative nodes', () => {
  it('requires a prompt before drawing', () => {
    renderBody(ImageGenBody, { def: imageGenDefinition, pv: { prompt: '' } });

    expect((screen.getByRole('button', { name: '开始绘图' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables drawing when a prompt exists', () => {
    renderBody(ImageGenBody, { def: imageGenDefinition, pv: { prompt: '糖果色角色立绘', count: 2 } });

    expect((screen.getByRole('button', { name: '开始绘图' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('requires both source images before compositing', () => {
    renderBody(ImageComposeBody, {
      def: imageComposeDefinition,
      pv: { 'input-background': 'https://img/background.png' },
    });

    expect((screen.getByRole('button', { name: '开始合成' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables compositing when both source images exist', () => {
    renderBody(ImageComposeBody, {
      def: imageComposeDefinition,
      pv: {
        'input-background': 'https://img/background.png',
        'input-foreground': 'https://img/foreground.png',
      },
    });

    expect((screen.getByRole('button', { name: '开始合成' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not reuse the background when the foreground tab is empty', () => {
    renderBody(ImageComposeBody, {
      def: imageComposeDefinition,
      pv: { 'input-background': 'https://img/background.png' },
    });

    fireEvent.click(screen.getByRole('tab', { name: '素材' }));
    expect(screen.getByText('暂无素材')).toBeTruthy();
  });

  it('requires a description for replacement edits', () => {
    renderBody(ImageEditBody, {
      def: imageEditDefinition,
      pv: { 'input-image': 'https://img/source.png', action: '替换', edit_prompt: '' },
    });

    expect((screen.getByRole('button', { name: '开始替换' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('allows erase edits without a description', () => {
    renderBody(ImageEditBody, {
      def: imageEditDefinition,
      pv: { 'input-image': 'https://img/source.png', action: '擦除', edit_prompt: '' },
    });

    expect((screen.getByRole('button', { name: '开始擦除' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
