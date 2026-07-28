import { describe, expect, it } from 'vitest';
import { buildImageRunGraph, imageUrlsFromRun, resultGrid } from '../freeCanvas/canvasHelpers';

describe('free canvas helpers', () => {
  it('把多张参考图组成一次 AI 绘图任务', () => {
    const graph = buildImageRunGraph({
      prompt: '糖果色夏日插画',
      model: 'image-model',
      aspectRatio: '3:2',
      count: 4,
      references: [
        { shapeId: 'shape-1', url: 'https://xfs/1.png', previewUrl: 'https://xfs/1.webp', name: '参考图 1' },
        { shapeId: 'shape-2', url: 'https://xfs/2.png', previewUrl: 'https://xfs/2.webp', name: '参考图 2' },
      ],
    });
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes[graph.nodes.length - 1]?.data).toMatchObject({ prompt: '糖果色夏日插画', count: 4 });
  });

  it('读取生成结果并计算横纵混合网格', () => {
    const urls = imageUrlsFromRun({
      id: 'run-1', project_id: 'project-1', status: 'succeeded', progress: 100,
      credits_used: 4, error: '', created_at: '', output_snapshot: {
        'ai-draw': { images: ['one.png', 'two.png', 'three.png', 'four.png'] },
      },
    });
    expect(urls).toEqual(['one.png', 'two.png', 'three.png', 'four.png']);
    expect(resultGrid(urls.length)).toEqual({ columns: 2, rows: 2 });
  });
});
