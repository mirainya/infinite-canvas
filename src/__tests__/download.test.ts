import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImage } from '../download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadImage', () => {
  it('downloads remote images through the authenticated proxy', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(new Blob(['image']), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': "attachment; filename=image; filename*=UTF-8''result.png",
      },
    })));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadImage('https://cdn.example.com/result.png');

    expect(fetchMock).toHaveBeenCalledWith('/api/download-image', expect.objectContaining({ method: 'POST' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
