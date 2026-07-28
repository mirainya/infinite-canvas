import { describe, expect, it } from 'vitest';
import {
  availableCanvasSpaceCenter,
  canvasRelationships,
  createCanvasSpace,
  mergeCanvasDocuments,
  migrateCanvasDocument,
  selectedImageData,
  visibleCanvasItems,
  type CanvasItem,
} from '../freeCanvas/canvasDocument';

describe('free canvas document', () => {
  it('keeps the current document format unchanged', () => {
    const document = { version: 2 as const, items: [] };
    expect(migrateCanvasDocument(document)).toEqual(document);
  });

  it('migrates nested tldraw result frames into independent image groups', () => {
    const legacy = {
      store: {
        frame: {
          id: 'shape:frame', typeName: 'shape', type: 'frame', parentId: 'page:page', x: 100, y: 80, index: 'a1',
          opacity: 1, rotation: 0, meta: { kind: 'result-group' }, props: { w: 500, h: 300, name: 'AI 绘图 · 2 张' },
        },
        nested: {
          id: 'shape:nested', typeName: 'shape', type: 'frame', parentId: 'shape:frame', x: 40, y: 20, index: 'a2',
          opacity: 1, rotation: 0, meta: { kind: 'result-group' }, props: { w: 240, h: 240, name: 'AI 绘图 · 1 张' },
        },
        image: {
          id: 'shape:image', typeName: 'shape', type: 'image', parentId: 'shape:nested', x: 12, y: 34, index: 'a3',
          opacity: 1, rotation: 0, meta: { originalUrl: 'https://xfs/result.png', name: '结果图' },
          props: { w: 180, h: 180, assetId: 'asset:image' },
        },
        asset: {
          id: 'asset:image', typeName: 'asset', type: 'image', props: { src: 'https://xfs/result.png', w: 1024, h: 1024 },
        },
      },
    };

    const document = migrateCanvasDocument(legacy);
    expect(document.items).toHaveLength(1);
    expect(document.items[0]).toMatchObject({ type: 'image-group', x: 140, y: 100 });
    expect(document.items[0].type === 'image-group' && document.items[0].images[0]).toMatchObject({ x: 12, y: 34, url: 'https://xfs/result.png' });
  });

  it('uses every image in a selected image group as AI references', () => {
    const document = migrateCanvasDocument({
      version: 2,
      items: [{
        id: 'group-1', type: 'image-group', x: 0, y: 0, width: 500, height: 300, rotation: 0, opacity: 1,
        name: '图片组', columns: 2, gap: 10, padding: 10,
        images: [
          { id: 'one', url: 'one.png', previewUrl: 'one.png', name: 'one', naturalWidth: 100, naturalHeight: 100, x: 0, y: 0, width: 100, height: 100 },
          { id: 'two', url: 'two.png', previewUrl: 'two.png', name: 'two', naturalWidth: 100, naturalHeight: 100, x: 110, y: 0, width: 100, height: 100 },
        ],
      }],
    });
    expect(selectedImageData(document, ['group-1']).map((image) => image.url)).toEqual(['one.png', 'two.png']);
  });

  it('limits a 500-object document to the visible area while retaining selected objects', () => {
    const items: CanvasItem[] = Array.from({ length: 500 }, (_, index) => ({
      id: `text-${index}`, type: 'text', x: index * 100, y: 0, width: 80, height: 40,
      rotation: 0, opacity: 1, text: String(index), fontSize: 16, color: '#333333', align: 'left',
    }));
    const visible = visibleCanvasItems(items, { x: 0, y: 0, width: 1000, height: 600 }, ['text-499']);
    expect(visible.length).toBeLessThan(20);
    expect(visible.some((item) => item.id === 'text-499')).toBe(true);
  });

  it('merges concurrent canvas additions without discarding either page', () => {
    const item = (id: string, text: string): CanvasItem => ({
      id, type: 'text', x: 0, y: 0, width: 100, height: 40, rotation: 0, opacity: 1,
      text, fontSize: 16, color: '#333333', align: 'left',
    });
    const base = { version: 2 as const, items: [item('shared', '初始')] };
    const local = { version: 2 as const, items: [item('shared', '本页修改'), item('local', '本页新增')] };
    const remote = { version: 2 as const, items: [item('shared', '其他页修改'), item('remote', '其他页新增')] };
    const merged = mergeCanvasDocuments(base, local, remote);
    expect(merged.items.map((entry) => entry.id)).toEqual(['shared', 'remote', 'local']);
    expect(merged.items.find((entry) => entry.id === 'shared')).toMatchObject({ text: '本页修改' });
  });

  it('creates a mixed-layout product space with linked target frames', () => {
    const created = createCanvasSpace('product', { x: 1000, y: 800 });
    expect(created.frames).toHaveLength(5);
    expect(created.frames.every((frame) => frame.spaceId === created.space.id)).toBe(true);
    expect(new Set(created.frames.map((frame) => frame.width))).toEqual(new Set([360, 550]));
    expect(new Set(created.frames.map((frame) => frame.y)).size).toBe(2);
  });

  it('moves a new creation space away from existing artwork', () => {
    const existing: CanvasItem = {
      id: 'existing', type: 'image', x: 0, y: 0, width: 800, height: 800, rotation: 0, opacity: 1,
      url: 'image.png', previewUrl: 'image.png', name: 'existing', naturalWidth: 800, naturalHeight: 800,
    };
    const center = availableCanvasSpaceCenter('product', [existing], { x: 400, y: 400 });
    expect(center.x).toBeGreaterThan(800);
  });

  it('places the featured candidate first and reveals only local generation relationships', () => {
    const source: CanvasItem = {
      id: 'source', type: 'image', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1,
      url: 'source.png', previewUrl: 'source.png', name: 'source', naturalWidth: 100, naturalHeight: 100,
    };
    const group: CanvasItem = {
      id: 'result', type: 'image-group', x: 300, y: 0, width: 220, height: 180, rotation: 0, opacity: 1,
      name: '候选', columns: 2, gap: 8, padding: 10, featuredImageId: 'two', images: [
        { id: 'one', url: 'one.png', previewUrl: 'one.png', name: 'one', naturalWidth: 100, naturalHeight: 100, x: 10, y: 40, width: 80, height: 80, referenceIds: ['source'] },
        { id: 'two', url: 'two.png', previewUrl: 'two.png', name: 'two', naturalWidth: 100, naturalHeight: 100, x: 100, y: 40, width: 80, height: 80, referenceIds: ['source'] },
      ],
    };
    const document = { version: 2 as const, items: [source, group] };
    expect(selectedImageData(document, ['result']).map((image) => image.id)).toEqual(['two', 'one']);
    expect(canvasRelationships(document, ['result'])).toHaveLength(1);
  });
});
