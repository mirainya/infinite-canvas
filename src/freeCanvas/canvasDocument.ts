export type CanvasPoint = { x: number; y: number };

type CanvasItemBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
};

export type CanvasImageData = {
  id: string;
  url: string;
  previewUrl: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  maskUrl?: string;
  libraryAssetId?: string;
  generationPrompt?: string;
  generationModel?: string;
  referenceIds?: string[];
};

export type CanvasImageItem = CanvasItemBase & CanvasImageData & { type: 'image' };

export type CanvasImageGroupItem = CanvasItemBase & {
  type: 'image-group';
  name: string;
  columns: number;
  gap: number;
  padding: number;
  images: CanvasImageData[];
};

export type CanvasTextItem = CanvasItemBase & {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
};

export type CanvasFrameItem = CanvasItemBase & {
  type: 'frame';
  name: string;
  color: string;
};

export type CanvasStrokeItem = CanvasItemBase & {
  type: 'stroke';
  points: number[];
  color: string;
  strokeWidth: number;
};

export type CanvasItem = CanvasImageItem | CanvasImageGroupItem | CanvasTextItem | CanvasFrameItem | CanvasStrokeItem;

export type FreeCanvasDocument = {
  version: 2;
  items: CanvasItem[];
};

type UnknownRecord = Record<string, unknown>;

export const EMPTY_CANVAS_DOCUMENT: FreeCanvasDocument = { version: 2, items: [] };

export function canvasId(prefix = 'item') {
  return `${prefix}-${crypto.randomUUID()}`;
}

function objectValue(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function metaStrings(value: unknown) {
  const source = objectValue(value);
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function richTextValue(value: unknown) {
  const record = objectValue(value);
  const content = Array.isArray(record.content) ? record.content : [];
  return content.map((block) => {
    const children = Array.isArray(objectValue(block).content) ? objectValue(block).content as unknown[] : [];
    return children.map((child) => stringValue(objectValue(child).text)).join('');
  }).filter(Boolean).join('\n');
}

function normalizeDocument(value: unknown): FreeCanvasDocument | null {
  const source = objectValue(value);
  if (source.version !== 2 || !Array.isArray(source.items)) return null;
  return { version: 2, items: source.items as CanvasItem[] };
}

export function migrateCanvasDocument(value: unknown): FreeCanvasDocument {
  const current = normalizeDocument(value);
  if (current) return current;

  const store = objectValue(objectValue(value).store);
  const records = Object.values(store).map(objectValue);
  const shapes = records.filter((record) => record.typeName === 'shape');
  if (!shapes.length) return EMPTY_CANVAS_DOCUMENT;

  const byId = new Map(shapes.map((shape) => [stringValue(shape.id), shape]));
  const assets = new Map(records.filter((record) => record.typeName === 'asset').map((asset) => [stringValue(asset.id), asset]));
  const order = [...shapes].sort((left, right) => stringValue(left.index).localeCompare(stringValue(right.index)));
  const absoluteCache = new Map<string, CanvasPoint>();

  const absolutePosition = (shape: UnknownRecord, seen = new Set<string>()): CanvasPoint => {
    const id = stringValue(shape.id);
    const cached = absoluteCache.get(id);
    if (cached) return cached;
    if (seen.has(id)) return { x: numberValue(shape.x, 0), y: numberValue(shape.y, 0) };
    seen.add(id);
    const parent = byId.get(stringValue(shape.parentId));
    const parentPoint = parent ? absolutePosition(parent, seen) : { x: 0, y: 0 };
    const point = { x: parentPoint.x + numberValue(shape.x, 0), y: parentPoint.y + numberValue(shape.y, 0) };
    absoluteCache.set(id, point);
    return point;
  };

  const imageData = (shape: UnknownRecord, local = false): CanvasImageData | null => {
    const props = objectValue(shape.props);
    const asset = assets.get(stringValue(props.assetId));
    const assetProps = objectValue(asset?.props);
    const meta = metaStrings(shape.meta);
    const url = meta.originalUrl || stringValue(assetProps.src);
    if (!url) return null;
    const point = local ? { x: numberValue(shape.x, 0), y: numberValue(shape.y, 0) } : absolutePosition(shape);
    return {
      id: stringValue(shape.id, canvasId('image')),
      url,
      previewUrl: meta.previewUrl || stringValue(assetProps.src, url),
      name: meta.name || stringValue(props.altText) || stringValue(assetProps.name, '图片'),
      naturalWidth: numberValue(assetProps.w, numberValue(props.w, 1024)),
      naturalHeight: numberValue(assetProps.h, numberValue(props.h, 1024)),
      x: point.x,
      y: point.y,
      width: numberValue(props.w, 360),
      height: numberValue(props.h, 360),
      ...(meta.maskUrl ? { maskUrl: meta.maskUrl } : {}),
      ...(meta.libraryAssetId ? { libraryAssetId: meta.libraryAssetId } : {}),
      ...(meta.generationPrompt ? { generationPrompt: meta.generationPrompt } : {}),
      ...(meta.generationModel ? { generationModel: meta.generationModel } : {}),
      ...(meta.referenceIds ? { referenceIds: meta.referenceIds.split(',').filter(Boolean) } : {}),
    };
  };

  const consumedImages = new Set<string>();
  const consumedFrames = new Set<string>();
  const items: CanvasItem[] = [];

  for (const frame of order.filter((shape) => shape.type === 'frame' && metaStrings(shape.meta).kind === 'result-group')) {
    const frameId = stringValue(frame.id);
    consumedFrames.add(frameId);
    const children = order.filter((shape) => shape.type === 'image' && shape.parentId === frameId);
    if (!children.length) continue;
    const props = objectValue(frame.props);
    const point = absolutePosition(frame);
    const images = children.flatMap((shape) => {
      const image = imageData(shape, true);
      if (!image) return [];
      consumedImages.add(stringValue(shape.id));
      return [image];
    });
    if (!images.length) continue;
    items.push({
      id: frameId || canvasId('group'),
      type: 'image-group',
      x: point.x,
      y: point.y,
      width: numberValue(props.w, 588),
      height: numberValue(props.h, 608),
      rotation: numberValue(frame.rotation, 0),
      opacity: numberValue(frame.opacity, 1),
      locked: Boolean(frame.isLocked),
      name: stringValue(props.name, `图片组 · ${images.length} 张`),
      columns: Math.max(1, Math.ceil(Math.sqrt(images.length))),
      gap: 12,
      padding: 18,
      images,
    });
  }

  for (const shape of order) {
    const id = stringValue(shape.id);
    const props = objectValue(shape.props);
    const point = absolutePosition(shape);
    if (shape.type === 'image' && !consumedImages.has(id)) {
      const image = imageData(shape);
      if (image) items.push({ ...image, type: 'image', rotation: numberValue(shape.rotation, 0), opacity: numberValue(shape.opacity, 1), locked: Boolean(shape.isLocked) });
    } else if (shape.type === 'frame' && !consumedFrames.has(id)) {
      items.push({
        id: id || canvasId('frame'), type: 'frame', x: point.x, y: point.y,
        width: numberValue(props.w, 400), height: numberValue(props.h, 520),
        rotation: numberValue(shape.rotation, 0), opacity: numberValue(shape.opacity, 1), locked: Boolean(shape.isLocked),
        name: stringValue(props.name, '画板'), color: stringValue(props.color, 'violet'),
      });
    } else if (shape.type === 'text') {
      const text = richTextValue(props.richText) || stringValue(props.text, '输入文字');
      items.push({
        id: id || canvasId('text'), type: 'text', x: point.x, y: point.y,
        width: Math.max(120, numberValue(props.w, 180)), height: 48,
        rotation: numberValue(shape.rotation, 0), opacity: numberValue(shape.opacity, 1), locked: Boolean(shape.isLocked),
        text, fontSize: props.size === 's' ? 18 : props.size === 'l' ? 32 : 24,
        color: '#302d36', align: props.textAlign === 'middle' ? 'center' : props.textAlign === 'end' ? 'right' : 'left',
      });
    } else if (shape.type === 'draw') {
      const segments = Array.isArray(props.segments) ? props.segments : [];
      const points = segments.flatMap((segment) => {
        const segmentPoints = Array.isArray(objectValue(segment).points) ? objectValue(segment).points as unknown[] : [];
        return segmentPoints.flatMap((entry) => {
          const item = objectValue(entry);
          return [numberValue(item.x, 0), numberValue(item.y, 0)];
        });
      });
      if (points.length >= 4) items.push({
        id: id || canvasId('stroke'), type: 'stroke', x: point.x, y: point.y,
        width: numberValue(props.w, 1), height: numberValue(props.h, 1), rotation: numberValue(shape.rotation, 0),
        opacity: numberValue(shape.opacity, 1), locked: Boolean(shape.isLocked), points, color: '#f06f9e', strokeWidth: 3,
      });
    }
  }

  return { version: 2, items };
}

export function itemBounds(item: CanvasItem) {
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}

export function selectedImageData(document: FreeCanvasDocument, ids: string[]) {
  const selected = new Set(ids);
  return document.items.flatMap((item) => {
    if (!selected.has(item.id)) return [];
    if (item.type === 'image') return [item];
    if (item.type === 'image-group') return item.images;
    return [];
  });
}

export function visibleCanvasItems(
  items: CanvasItem[],
  viewport: { x: number; y: number; width: number; height: number },
  selectedIds: string[],
  threshold = 300,
) {
  if (items.length <= threshold) return items;
  const selected = new Set(selectedIds);
  return items.filter((item) => {
    if (selected.has(item.id)) return true;
    const bounds = itemBounds(item);
    return bounds.x <= viewport.x + viewport.width
      && bounds.x + bounds.width >= viewport.x
      && bounds.y <= viewport.y + viewport.height
      && bounds.y + bounds.height >= viewport.y;
  });
}

export function mergeCanvasDocuments(baseValue: unknown, localValue: unknown, remoteValue: unknown): FreeCanvasDocument {
  const base = migrateCanvasDocument(baseValue);
  const local = migrateCanvasDocument(localValue);
  const remote = migrateCanvasDocument(remoteValue);
  const baseById = new Map(base.items.map((item) => [item.id, item]));
  const localById = new Map(local.items.map((item) => [item.id, item]));
  const mergedById = new Map(remote.items.map((item) => [item.id, item]));

  for (const [id, item] of localById) {
    const original = baseById.get(id);
    if (!original || JSON.stringify(original) !== JSON.stringify(item)) mergedById.set(id, item);
  }
  for (const id of baseById.keys()) {
    if (!localById.has(id)) mergedById.delete(id);
  }

  const remoteOrder = remote.items.map((item) => item.id);
  const localAdditions = local.items.map((item) => item.id).filter((id) => !baseById.has(id) && !remoteOrder.includes(id));
  const order = [...remoteOrder, ...localAdditions];
  return { version: 2, items: order.flatMap((id) => {
    const item = mergedById.get(id);
    return item ? [item] : [];
  }) };
}
