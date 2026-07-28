import { describe, expect, it } from 'vitest';
import {
  createImageGroupOutputs,
  normalizeImageGroupItems,
  parseImageGroupItems,
  type ImageGroupItem,
} from '../nodes/imageGroup';

describe('image group', () => {
  const items: ImageGroupItem[] = [
    { id: 'bg', url: 'https://img/bg.png', role: 'background' },
    { id: 'fg', url: 'https://img/fg.png', role: 'foreground' },
    { id: 'ref', url: 'https://img/ref.png', role: 'reference' },
  ];

  it('parses persisted items and ignores invalid entries', () => {
    expect(parseImageGroupItems(JSON.stringify([...items, { id: 'bad' }]))).toEqual(items);
  });

  it('keeps one background and one foreground', () => {
    const normalized = normalizeImageGroupItems([
      ...items,
      { id: 'bg-2', url: 'https://img/bg-2.png', role: 'background' },
      { id: 'fg-2', url: 'https://img/fg-2.png', role: 'foreground' },
    ]);

    expect(normalized.filter((item) => item.role === 'background')).toHaveLength(1);
    expect(normalized.filter((item) => item.role === 'foreground')).toHaveLength(1);
  });

  it('creates role outputs and follows the selected image', () => {
    expect(createImageGroupOutputs(items, 'ref')).toEqual({
      'output-image': 'https://img/ref.png',
      'output-background': 'https://img/bg.png',
      'output-foreground': 'https://img/fg.png',
      'output-references': ['https://img/ref.png'],
      'output-images': ['https://img/bg.png', 'https://img/fg.png', 'https://img/ref.png'],
    });
  });
});
