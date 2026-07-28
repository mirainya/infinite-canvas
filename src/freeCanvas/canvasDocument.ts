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
  spaceId?: string;
  frameId?: string;
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
  spaceId?: string;
  frameId?: string;
};

export type CanvasImageItem = CanvasItemBase & CanvasImageData & { type: 'image' };

export type CanvasImageGroupItem = CanvasItemBase & {
  type: 'image-group';
  name: string;
  columns: number;
  gap: number;
  padding: number;
  images: CanvasImageData[];
  featuredImageId?: string;
  collapsed?: boolean;
  expandedWidth?: number;
  expandedHeight?: number;
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
  order?: number;
  brief?: string;
  aspectRatio?: string;
  role?: string;
};

export type CanvasSpaceItem = CanvasItemBase & {
  type: 'space';
  name: string;
  subtitle: string;
  accent: 'pink' | 'mint' | 'lemon' | 'blue' | 'violet';
  preset: CanvasSpacePresetId;
};

export type CanvasStrokeItem = CanvasItemBase & {
  type: 'stroke';
  points: number[];
  color: string;
  strokeWidth: number;
};

export type CanvasItem = CanvasImageItem | CanvasImageGroupItem | CanvasTextItem | CanvasFrameItem | CanvasSpaceItem | CanvasStrokeItem;

export type CanvasSpacePresetId = 'product' | 'character' | 'inspiration' | 'storyboard';

type SpaceFramePreset = {
  name: string;
  brief: string;
  role: string;
  aspectRatio: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type CanvasSpacePreset = {
  id: CanvasSpacePresetId;
  name: string;
  subtitle: string;
  accent: CanvasSpaceItem['accent'];
  width: number;
  height: number;
  frames: SpaceFramePreset[];
};

export const CANVAS_SPACE_PRESETS: CanvasSpacePreset[] = [
  {
    id: 'product', name: '商品视觉套图', subtitle: '一件商品，多种视觉任务', accent: 'pink', width: 1180, height: 1006,
    frames: [
      { name: '主视觉', brief: '明确主体与第一印象', role: 'hero', aspectRatio: '1:1', x: 28, y: 96, width: 360, height: 420, color: 'red' },
      { name: '场景表现', brief: '建立使用情境与氛围', role: 'scene', aspectRatio: '1:1', x: 410, y: 96, width: 360, height: 420, color: 'blue' },
      { name: '细节特写', brief: '突出材质、工艺与结构', role: 'detail', aspectRatio: '1:1', x: 792, y: 96, width: 360, height: 420, color: 'yellow' },
      { name: '功能叙述', brief: '用画面解释核心卖点', role: 'feature', aspectRatio: '3:2', x: 28, y: 542, width: 550, height: 436, color: 'green' },
      { name: '情绪氛围', brief: '形成完整品牌感受', role: 'mood', aspectRatio: '3:2', x: 602, y: 542, width: 550, height: 436, color: 'violet' },
    ],
  },
  {
    id: 'character', name: '角色设定集', subtitle: '从角色核心延展完整设定', accent: 'violet', width: 1260, height: 1022,
    frames: [
      { name: '角色主设', brief: '确定造型、气质与轮廓', role: 'hero', aspectRatio: '2:3', x: 28, y: 158, width: 470, height: 751, color: 'violet' },
      { name: '表情组', brief: '建立情绪与性格变化', role: 'expression', aspectRatio: '16:9', x: 522, y: 96, width: 710, height: 472, color: 'red' },
      { name: '服装变化', brief: '探索服装与配色方向', role: 'outfit', aspectRatio: '1:1', x: 522, y: 592, width: 342, height: 402, color: 'blue' },
      { name: '动作姿态', brief: '补足角色动态表现', role: 'pose', aspectRatio: '1:1', x: 890, y: 592, width: 342, height: 402, color: 'green' },
    ],
  },
  {
    id: 'inspiration', name: '视觉灵感板', subtitle: '素材、探索与结论同屏沉淀', accent: 'mint', width: 1260, height: 1182,
    frames: [
      { name: '灵感素材', brief: '收集配色、质感与构图', role: 'source', aspectRatio: '2:3', x: 28, y: 142, width: 390, height: 631, color: 'green' },
      { name: '方向探索', brief: '保留不同视觉路线', role: 'explore', aspectRatio: '16:9', x: 442, y: 96, width: 790, height: 517, color: 'blue' },
      { name: '最终方向', brief: '沉淀可继续使用的结论', role: 'final', aspectRatio: '16:9', x: 442, y: 637, width: 790, height: 517, color: 'red' },
    ],
  },
  {
    id: 'storyboard', name: '分镜叙事', subtitle: '横向展开镜头节奏与画面演变', accent: 'blue', width: 1660, height: 410,
    frames: [
      { name: '镜头 01', brief: '建立环境与人物关系', role: 'shot-1', aspectRatio: '16:9', x: 28, y: 96, width: 380, height: 286, color: 'blue' },
      { name: '镜头 02', brief: '推动动作与视觉重点', role: 'shot-2', aspectRatio: '16:9', x: 436, y: 96, width: 380, height: 286, color: 'violet' },
      { name: '镜头 03', brief: '完成情绪或信息转折', role: 'shot-3', aspectRatio: '16:9', x: 844, y: 96, width: 380, height: 286, color: 'red' },
      { name: '镜头 04', brief: '形成结尾与余韵', role: 'shot-4', aspectRatio: '16:9', x: 1252, y: 96, width: 380, height: 286, color: 'yellow' },
    ],
  },
];

export type FreeCanvasDocument = {
  version: 2;
  items: CanvasItem[];
};

type UnknownRecord = Record<string, unknown>;

export const EMPTY_CANVAS_DOCUMENT: FreeCanvasDocument = { version: 2, items: [] };

export function canvasId(prefix = 'item') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createCanvasSpace(presetId: CanvasSpacePresetId, center: CanvasPoint) {
  const preset = CANVAS_SPACE_PRESETS.find((item) => item.id === presetId) || CANVAS_SPACE_PRESETS[0];
  const spaceId = canvasId('space');
  const x = center.x - preset.width / 2;
  const y = center.y - preset.height / 2;
  const space: CanvasSpaceItem = {
    id: spaceId,
    type: 'space',
    x,
    y,
    width: preset.width,
    height: preset.height,
    rotation: 0,
    opacity: 1,
    name: preset.name,
    subtitle: preset.subtitle,
    accent: preset.accent,
    preset: preset.id,
  };
  const frames: CanvasFrameItem[] = preset.frames.map((frame, index) => ({
    id: canvasId('frame'),
    type: 'frame',
    x: x + frame.x,
    y: y + frame.y,
    width: frame.width,
    height: frame.height,
    rotation: 0,
    opacity: 1,
    spaceId,
    name: frame.name,
    order: index + 1,
    brief: frame.brief,
    role: frame.role,
    aspectRatio: frame.aspectRatio,
    color: frame.color,
  }));
  return { space, frames, items: [space, ...frames] as CanvasItem[] };
}

export function availableCanvasSpaceCenter(
  presetId: CanvasSpacePresetId,
  items: CanvasItem[],
  preferred: CanvasPoint,
): CanvasPoint {
  const preset = CANVAS_SPACE_PRESETS.find((item) => item.id === presetId) || CANVAS_SPACE_PRESETS[0];
  const gap = 180;
  const desired = {
    x: preferred.x - preset.width / 2,
    y: preferred.y - preset.height / 2,
    width: preset.width,
    height: preset.height,
  };
  const blocked = items.some((item) => {
    const bounds = itemBounds(item);
    return desired.x <= bounds.x + bounds.width + gap
      && desired.x + desired.width + gap >= bounds.x
      && desired.y <= bounds.y + bounds.height + gap
      && desired.y + desired.height + gap >= bounds.y;
  });
  if (!blocked || !items.length) return preferred;

  const right = Math.max(...items.map((item) => item.x + item.width));
  const top = Math.min(...items.map((item) => item.y));
  return {
    x: right + gap + preset.width / 2,
    y: Math.max(preferred.y, top + preset.height / 2),
  };
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
      featuredImageId: images[0]?.id,
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
    if (item.type === 'image-group') {
      const featured = item.images.find((image) => image.id === item.featuredImageId);
      return featured ? [featured, ...item.images.filter((image) => image.id !== featured.id)] : item.images;
    }
    return [];
  });
}

export type CanvasRelationship = {
  id: string;
  from: CanvasPoint;
  to: CanvasPoint;
};

function imageCenter(document: FreeCanvasDocument, imageId: string): CanvasPoint | null {
  for (const item of document.items) {
    if (item.type === 'image' && item.id === imageId) {
      return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    }
    if (item.type === 'image-group') {
      const image = item.images.find((entry) => entry.id === imageId);
      if (image) return { x: item.x + image.x + image.width / 2, y: item.y + image.y + image.height / 2 };
    }
  }
  return null;
}

function itemReferenceIds(item: CanvasItem) {
  if (item.type === 'image') return item.referenceIds || [];
  if (item.type === 'image-group') return item.images.find((image) => image.id === item.featuredImageId)?.referenceIds
    || item.images[0]?.referenceIds
    || [];
  return [];
}

export function canvasRelationships(document: FreeCanvasDocument, selectedIds: string[]): CanvasRelationship[] {
  if (!selectedIds.length) return [];
  const selected = new Set(selectedIds);
  for (const item of document.items) {
    if (item.type === 'image-group' && selected.has(item.id)) item.images.forEach((image) => selected.add(image.id));
  }
  const relationships: CanvasRelationship[] = [];
  for (const item of document.items) {
    if (item.type !== 'image' && item.type !== 'image-group') continue;
    const references = itemReferenceIds(item);
    if (!references.length) continue;
    const resultSelected = selected.has(item.id);
    const resultPoint = { x: item.x, y: item.y + item.height / 2 };
    for (const referenceId of references) {
      if (!resultSelected && !selected.has(referenceId)) continue;
      const sourcePoint = imageCenter(document, referenceId);
      if (sourcePoint) relationships.push({ id: `${referenceId}-${item.id}`, from: sourcePoint, to: resultPoint });
    }
  }
  return relationships;
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
