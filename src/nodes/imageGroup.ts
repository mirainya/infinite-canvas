import type { PortValues } from '../types/workflow';

export type ImageGroupRole = 'background' | 'foreground' | 'reference';

export type ImageGroupItem = {
  id: string;
  url: string;
  role: ImageGroupRole;
  name?: string;
};

const VALID_ROLES = new Set<ImageGroupRole>(['background', 'foreground', 'reference']);

export const IMAGE_GROUP_ROLE_LABELS: Record<ImageGroupRole, string> = {
  background: '底图',
  foreground: '素材',
  reference: '参考',
};

export function parseImageGroupItems(value: unknown): ImageGroupItem[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): ImageGroupItem[] => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as Partial<ImageGroupItem>;
      if (typeof candidate.url !== 'string' || !candidate.url) return [];
      return [{
        id: typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID(),
        url: candidate.url,
        role: VALID_ROLES.has(candidate.role as ImageGroupRole) ? candidate.role as ImageGroupRole : 'reference',
        name: typeof candidate.name === 'string' ? candidate.name : undefined,
      }];
    });
  } catch {
    return [];
  }
}

export function normalizeImageGroupItems(items: ImageGroupItem[]): ImageGroupItem[] {
  let hasBackground = false;
  let hasForeground = false;
  return items.map((item) => {
    if (item.role === 'background') {
      if (hasBackground) return { ...item, role: 'reference' };
      hasBackground = true;
    }
    if (item.role === 'foreground') {
      if (hasForeground) return { ...item, role: 'reference' };
      hasForeground = true;
    }
    return item;
  });
}

export function createImageGroupOutputs(items: ImageGroupItem[], selectedId?: string | null): PortValues {
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  return {
    'output-image': selected?.url ?? null,
    'output-background': items.find((item) => item.role === 'background')?.url ?? null,
    'output-foreground': items.find((item) => item.role === 'foreground')?.url ?? null,
    'output-references': items.filter((item) => item.role === 'reference').map((item) => item.url),
    'output-images': items.map((item) => item.url),
  };
}
