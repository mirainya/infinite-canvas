import { apiFetch } from './api';

function contentDispositionFilename(header: string | null): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* use fallback */ }
  }
  return 'infinite-canvas-image';
}

function directFilename(src: string): string {
  const mime = src.match(/^data:image\/([a-z0-9.+-]+);/i)?.[1]?.replace('jpeg', 'jpg');
  return `infinite-canvas-${Date.now()}${mime ? `.${mime}` : ''}`;
}

function saveHref(href: string, filename: string, revoke = false) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (revoke) URL.revokeObjectURL(href);
}

export async function downloadImage(src: string): Promise<void> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    saveHref(src, directFilename(src));
    return;
  }

  const response = await apiFetch('/api/download-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: src }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || `下载失败: ${response.status}`);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  saveHref(blobUrl, contentDispositionFilename(response.headers.get('Content-Disposition')), true);
}
