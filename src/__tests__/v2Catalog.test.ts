import { describe, expect, it } from 'vitest';
import { canConnect, NODE_CATALOG } from '../v2/catalog';

describe('V2 node catalog', () => {
  it('contains exactly the ten formal nodes', () => {
    expect(NODE_CATALOG.map((node) => node.type)).toEqual([
      'image-input',
      'text-input',
      'image-collection',
      'text-collection',
      'ai-image',
      'text-generation',
      'prompt-enhance',
      'image-split',
      'image-output',
      'text-output',
    ]);
  });

  it('accepts compatible ports and rejects incompatible ports', () => {
    expect(canConnect('text-input', 'text', 'ai-image', 'prompt')).toBe(true);
    expect(canConnect('image-input', 'image', 'ai-image', 'images')).toBe(true);
    expect(canConnect('text-input', 'text', 'image-output', 'images')).toBe(false);
  });
});
