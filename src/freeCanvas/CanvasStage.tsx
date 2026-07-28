import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent,
} from 'react';
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  Download,
  Eye,
  ImagePlus,
  LoaderCircle,
  Paintbrush,
  Play,
  Scissors,
  Sparkles,
  Ungroup,
  X,
} from 'lucide-react';
import { downloadImage } from '../download';
import type { Asset, ModelInfo } from '../v2/types';
import { resultGrid, type ImageReference, type ImageRunRequest } from './canvasHelpers';
import CanvasItemView from './CanvasItemView';
import {
  canvasId,
  itemBounds,
  migrateCanvasDocument,
  selectedImageData,
  visibleCanvasItems,
  type CanvasImageData,
  type CanvasImageGroupItem,
  type CanvasImageItem,
  type CanvasItem,
  type CanvasPoint,
  type FreeCanvasDocument,
} from './canvasDocument';

export const FREE_CANVAS_TOOL_MIME = 'application/x-infinite-canvas-tool';
export const FREE_CANVAS_ASSET_MIME = 'application/x-infinite-canvas-asset';

type Camera = { x: number; y: number; zoom: number };
type CanvasSnapshot = { document: FreeCanvasDocument; camera: Camera };

export type CanvasStageHandle = {
  addAsset: (asset: Asset, point?: CanvasPoint) => void;
  addAssets: (assets: Asset[], point?: CanvasPoint) => void;
  addText: (point?: CanvasPoint) => void;
  addFrames: (names: string[], point?: CanvasPoint) => void;
  setTool: (tool: string) => void;
  setImageMask: (shapeId: string, maskUrl: string) => void;
  snapshot: () => CanvasSnapshot;
  undo: () => void;
  redo: () => void;
  fit: () => void;
};

type CanvasStageProps = {
  document?: unknown;
  viewport: Camera;
  imageModels: ModelInfo[];
  running: boolean;
  onDocumentChange: () => void;
  onUploadFiles: (files: File[]) => Promise<Asset[]>;
  onGenerate: (request: ImageRunRequest) => Promise<string[]>;
  onSplit: (reference: ImageReference) => Promise<string[]>;
  onOpenImage: (url: string) => void;
  onEditMask: (reference: ImageReference) => void;
  onError: (message: string) => void;
};

type Marquee = { start: CanvasPoint; current: CanvasPoint };

function imageDisplaySize(width: number, height: number, max = 360) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(80, Math.round(width * scale)), height: Math.max(80, Math.round(height * scale)) };
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024 });
    image.onerror = () => resolve({ width: 1024, height: 1024 });
    image.src = url;
  });
}

function hostedImage(
  source: { url: string; previewUrl?: string; width: number; height: number; name: string },
  point: CanvasPoint,
  meta: Partial<CanvasImageData> = {},
): CanvasImageItem {
  const display = imageDisplaySize(source.width, source.height);
  return {
    id: canvasId('image'),
    type: 'image',
    x: point.x,
    y: point.y,
    width: display.width,
    height: display.height,
    rotation: 0,
    opacity: 1,
    url: source.url,
    previewUrl: source.previewUrl || source.url,
    naturalWidth: source.width,
    naturalHeight: source.height,
    name: source.name,
    ...meta,
  };
}

function unionBounds(items: CanvasItem[]) {
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function overlap(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return left.x <= right.x + right.width && left.x + left.width >= right.x && left.y <= right.y + right.height && left.y + left.height >= right.y;
}

const CanvasStage = forwardRef<CanvasStageHandle, CanvasStageProps>(function CanvasStage(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const documentRef = useRef(migrateCanvasDocument(props.document));
  const cameraRef = useRef<Camera>({ ...props.viewport });
  const pastRef = useRef<FreeCanvasDocument[]>([]);
  const futureRef = useRef<FreeCanvasDocument[]>([]);
  const panningRef = useRef<{ x: number; y: number; camera: Camera } | null>(null);
  const drawingRef = useRef<number[]>([]);
  const spaceRef = useRef(false);
  const [document, setDocument] = useState(documentRef.current);
  const notifiedDocumentRef = useRef(documentRef.current);
  const [camera, setCameraState] = useState(cameraRef.current);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setToolState] = useState('select');
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<number[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [count, setCount] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setSize({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const changed = props.onDocumentChange;
  useEffect(() => {
    if (document === notifiedDocumentRef.current) return;
    notifiedDocumentRef.current = document;
    changed();
  }, [changed, document]);

  const setCamera = useCallback((next: Camera, notify = false) => {
    const normalized = { ...next, zoom: Math.max(0.08, Math.min(5, next.zoom)) };
    cameraRef.current = normalized;
    setCameraState(normalized);
    if (notify) changed();
  }, [changed]);

  const commit = useCallback((update: (current: FreeCanvasDocument) => FreeCanvasDocument) => {
    const current = documentRef.current;
    const next = update(current);
    if (next === current) return;
    pastRef.current = [...pastRef.current.slice(-79), current];
    futureRef.current = [];
    documentRef.current = next;
    setDocument(next);
  }, []);

  const undo = useCallback(() => {
    const previous = pastRef.current[pastRef.current.length - 1];
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [documentRef.current, ...futureRef.current.slice(0, 79)];
    documentRef.current = previous;
    setDocument(previous);
    setSelectedIds([]);
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current.slice(-79), documentRef.current];
    documentRef.current = next;
    setDocument(next);
    setSelectedIds([]);
  }, []);

  const pageCenter = useCallback(() => ({
    x: (size.width / 2 - cameraRef.current.x) / cameraRef.current.zoom,
    y: (size.height / 2 - cameraRef.current.y) / cameraRef.current.zoom,
  }), [size]);

  const clientToPage = useCallback((clientX: number, clientY: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    const current = cameraRef.current;
    return {
      x: (clientX - (rect?.left || 0) - current.x) / current.zoom,
      y: (clientY - (rect?.top || 0) - current.y) / current.zoom,
    };
  }, []);

  const selectedItems = useMemo(() => document.items.filter((item) => selectedIds.includes(item.id)), [document, selectedIds]);
  const renderedItems = useMemo(() => {
    if (document.items.length <= 300) return document.items;
    const overscan = 600 / camera.zoom;
    const viewport = {
      x: -camera.x / camera.zoom - overscan,
      y: -camera.y / camera.zoom - overscan,
      width: size.width / camera.zoom + overscan * 2,
      height: size.height / camera.zoom + overscan * 2,
    };
    return visibleCanvasItems(document.items, viewport, selectedIds);
  }, [camera, document, selectedIds, size]);
  const references = useMemo<ImageReference[]>(() => selectedImageData(document, selectedIds).map((image, index) => ({
    shapeId: image.id,
    url: image.url,
    previewUrl: image.previewUrl,
    name: image.name || `参考图 ${index + 1}`,
    maskUrl: image.maskUrl,
  })), [document, selectedIds]);
  const primary = references[0];
  const selectedModel = model || props.imageModels[0]?.code || '';

  const anchor = useCallback(() => {
    const bounds = unionBounds(selectedItems);
    return bounds ? { x: bounds.x + bounds.width + 80, y: bounds.y } : pageCenter();
  }, [pageCenter, selectedItems]);

  const addItem = useCallback((item: CanvasItem) => {
    commit((current) => ({ ...current, items: [...current.items, item] }));
    setSelectedIds([item.id]);
  }, [commit]);

  const addAsset = useCallback((asset: Asset, point = pageCenter()) => {
    const display = imageDisplaySize(asset.width, asset.height);
    addItem(hostedImage({
      url: asset.original_url,
      previewUrl: asset.thumbnail_url || asset.original_url,
      width: asset.width,
      height: asset.height,
      name: asset.filename,
    }, { x: point.x - display.width / 2, y: point.y - display.height / 2 }, { libraryAssetId: asset.id }));
  }, [addItem, pageCenter]);

  const addAssets = useCallback((assets: Asset[], point = pageCenter()) => {
    if (!assets.length) return;
    const { columns } = resultGrid(assets.length);
    const created = assets.map((asset, index) => {
      const display = imageDisplaySize(asset.width, asset.height, 260);
      const column = index % columns;
      const row = Math.floor(index / columns);
      return hostedImage({
        url: asset.original_url,
        previewUrl: asset.thumbnail_url || asset.original_url,
        width: asset.width,
        height: asset.height,
        name: asset.filename,
      }, { x: point.x + column * 290, y: point.y + row * 290 }, { libraryAssetId: asset.id, width: display.width, height: display.height });
    });
    commit((current) => ({ ...current, items: [...current.items, ...created] }));
    setSelectedIds(created.map((item) => item.id));
  }, [commit, pageCenter]);

  const addText = useCallback((point = pageCenter()) => {
    const item: CanvasItem = {
      id: canvasId('text'), type: 'text', x: point.x, y: point.y, width: 240, height: 58,
      rotation: 0, opacity: 1, text: '输入文字', fontSize: 24, color: '#302d36', align: 'left',
    };
    addItem(item);
    setEditingTextId(item.id);
    setEditingText(item.text);
  }, [addItem, pageCenter]);

  const addFrames = useCallback((names: string[], point = pageCenter()) => {
    const colors = ['red', 'blue', 'green', 'yellow', 'violet'];
    const created: CanvasItem[] = names.map((name, index) => ({
      id: canvasId('frame'), type: 'frame', x: point.x + (index % 3) * 440, y: point.y + Math.floor(index / 3) * 570,
      width: 400, height: 520, rotation: 0, opacity: 1, name, color: colors[index % colors.length],
    }));
    commit((current) => ({ ...current, items: [...created, ...current.items] }));
    setSelectedIds(created.map((item) => item.id));
  }, [commit, pageCenter]);

  const setImageMask = useCallback((shapeId: string, maskUrl: string) => {
    commit((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.type === 'image' && item.id === shapeId) return { ...item, maskUrl };
        if (item.type === 'image-group') return { ...item, images: item.images.map((image) => image.id === shapeId ? { ...image, maskUrl } : image) };
        return item;
      }),
    }));
  }, [commit]);

  const fit = useCallback(() => {
    const bounds = unionBounds(documentRef.current.items);
    if (!bounds) return setCamera({ x: size.width / 2, y: size.height / 2, zoom: 1 }, true);
    const zoom = Math.max(0.08, Math.min(1.4, Math.min((size.width - 120) / Math.max(bounds.width, 1), (size.height - 120) / Math.max(bounds.height, 1))));
    setCamera({ x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom, y: size.height / 2 - (bounds.y + bounds.height / 2) * zoom, zoom }, true);
  }, [setCamera, size]);

  useImperativeHandle(ref, () => ({
    addAsset,
    addAssets,
    addText,
    addFrames,
    setTool: (next) => { setToolState(next === 'draw' ? 'draw' : 'select'); hostRef.current?.focus(); },
    setImageMask,
    snapshot: () => ({ document: documentRef.current, camera: cameraRef.current }),
    undo,
    redo,
    fit,
  }), [addAsset, addAssets, addFrames, addText, fit, redo, setImageMask, undo]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const nodes = selectedIds.flatMap((id) => {
      const node = stage.findOne((candidate: Konva.Node) => candidate.id() === id);
      return node ? [node] : [];
    });
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [document, selectedIds]);

  const transformSelection = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !selectedIds.length) return;
    commit((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (!selectedIds.includes(item.id)) return item;
        const node = stage.findOne((candidate: Konva.Node) => candidate.id() === item.id);
        if (!node) return item;
        const scaleX = Math.max(0.05, Math.abs(node.scaleX()));
        const scaleY = Math.max(0.05, Math.abs(node.scaleY()));
        node.scale({ x: 1, y: 1 });
        const base = { ...item, x: node.x(), y: node.y(), rotation: node.rotation(), width: Math.max(24, item.width * scaleX), height: Math.max(24, item.height * scaleY) };
        if (item.type === 'image-group') {
          return { ...base, images: item.images.map((image) => ({ ...image, x: image.x * scaleX, y: image.y * scaleY, width: image.width * scaleX, height: image.height * scaleY })) };
        }
        if (item.type === 'stroke') return { ...base, points: item.points.flatMap((value, index) => [value * (index % 2 ? scaleY : scaleX)]) };
        return base;
      }),
    }));
  }, [commit, selectedIds]);

  const moveItem = useCallback((id: string, x: number, y: number) => {
    commit((current) => {
      const source = current.items.find((item) => item.id === id);
      if (!source) return current;
      const dx = x - source.x;
      const dy = y - source.y;
      const moving = selectedIds.includes(id) ? new Set(selectedIds) : new Set([id]);
      return { ...current, items: current.items.map((item) => moving.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item) };
    });
  }, [commit, selectedIds]);

  const selectItem = useCallback((id: string, additive: boolean) => {
    setSelectedIds((current) => additive ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]);
    hostRef.current?.focus();
  }, []);

  const beginTextEdit = useCallback((id: string) => {
    const item = documentRef.current.items.find((entry) => entry.id === id);
    if (!item || item.type !== 'text') return;
    setEditingTextId(id);
    setEditingText(item.text);
  }, []);

  const finishTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const nextText = editingText.trim() || '输入文字';
    commit((current) => ({ ...current, items: current.items.map((item) => item.id === editingTextId && item.type === 'text' ? { ...item, text: nextText } : item) }));
    setEditingTextId(null);
  }, [commit, editingText, editingTextId]);

  const ungroupSelected = useCallback(() => {
    const selected = new Set(selectedIds);
    const images: CanvasImageItem[] = [];
    commit((current) => {
      const kept = current.items.filter((item) => {
        if (item.type !== 'image-group' || !selected.has(item.id)) return true;
        for (const image of item.images) images.push({
          ...image, type: 'image', x: item.x + image.x, y: item.y + image.y,
          rotation: item.rotation, opacity: item.opacity,
        });
        return false;
      });
      return images.length ? { ...current, items: [...kept, ...images] } : current;
    });
    if (images.length) setSelectedIds(images.map((item) => item.id));
  }, [commit, selectedIds]);

  const insertResults = useCallback(async (urls: string[], point: CanvasPoint, request?: ImageRunRequest) => {
    if (!urls.length) return;
    const sizes = await Promise.all(urls.map(imageSize));
    const meta = request ? {
      generationPrompt: request.prompt,
      generationModel: request.model,
      referenceIds: request.references.map((item) => item.shapeId),
    } : {};
    if (urls.length === 1) {
      const item = hostedImage({ url: urls[0], width: sizes[0].width, height: sizes[0].height, name: 'AI 绘图结果' }, point, meta);
      addItem(item);
      return;
    }
    const { columns, rows } = resultGrid(urls.length);
    const cell = 238;
    const gap = 10;
    const padding = 14;
    const header = 38;
    const images = urls.map((url, index): CanvasImageData => {
      const source = sizes[index];
      const scale = Math.min((cell - 12) / source.width, (cell - 12) / source.height);
      const width = Math.max(60, source.width * scale);
      const height = Math.max(60, source.height * scale);
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        id: canvasId('image'), url, previewUrl: url, name: `生成结果 ${index + 1}`,
        naturalWidth: source.width, naturalHeight: source.height,
        x: padding + column * (cell + gap) + (cell - width) / 2,
        y: header + padding + row * (cell + gap) + (cell - height) / 2,
        width, height, ...meta,
      };
    });
    const group: CanvasImageGroupItem = {
      id: canvasId('group'), type: 'image-group', x: point.x, y: point.y,
      width: padding * 2 + columns * cell + (columns - 1) * gap,
      height: header + padding * 2 + rows * cell + (rows - 1) * gap,
      rotation: 0, opacity: 1, name: `AI 绘图 · ${urls.length} 张`, columns, gap, padding, images,
    };
    addItem(group);
  }, [addItem]);

  const generate = async () => {
    if (!prompt.trim() || !selectedModel || props.running) return;
    const request = { prompt: prompt.trim(), model: selectedModel, aspectRatio, count, references, maskUrl: primary?.maskUrl };
    try {
      const urls = await props.onGenerate(request);
      await insertResults(urls, anchor(), request);
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : '生成失败');
    }
  };

  const split = async () => {
    if (!primary || props.running) return;
    try {
      const urls = await props.onSplit(primary);
      await insertResults(urls, anchor());
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : '切分失败');
    }
  };

  const pointerPage = () => {
    const pointer = stageRef.current?.getPointerPosition();
    const current = cameraRef.current;
    return pointer ? { x: (pointer.x - current.x) / current.zoom, y: (pointer.y - current.y) / current.zoom } : null;
  };

  const handlePointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current;
    const point = pointerPage();
    if (!stage || !point) return;
    const mouse = event.evt as MouseEvent;
    if ('button' in mouse && (mouse.button === 1 || mouse.button === 2 || spaceRef.current)) {
      const pointer = stage.getPointerPosition();
      if (pointer) panningRef.current = { x: pointer.x, y: pointer.y, camera: cameraRef.current };
      event.evt.preventDefault();
      return;
    }
    if (tool === 'draw') {
      drawingRef.current = [point.x, point.y];
      setDrawingPoints(drawingRef.current);
      return;
    }
    if (event.target === stage) {
      setMarquee({ start: point, current: point });
      if (!(event.evt as MouseEvent).shiftKey) setSelectedIds([]);
    }
  };

  const handlePointerMove = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    if (panningRef.current) {
      const start = panningRef.current;
      setCamera({ x: start.camera.x + pointer.x - start.x, y: start.camera.y + pointer.y - start.y, zoom: start.camera.zoom });
      return;
    }
    const point = pointerPage();
    if (!point) return;
    if (drawingRef.current.length) {
      drawingRef.current = [...drawingRef.current, point.x, point.y];
      setDrawingPoints(drawingRef.current);
    } else if (marquee) setMarquee({ ...marquee, current: point });
  };

  const handlePointerUp = () => {
    if (panningRef.current) {
      panningRef.current = null;
      changed();
      return;
    }
    if (drawingRef.current.length >= 4) {
      const points = drawingRef.current;
      const xs = points.filter((_, index) => index % 2 === 0);
      const ys = points.filter((_, index) => index % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      addItem({
        id: canvasId('stroke'), type: 'stroke', x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y),
        rotation: 0, opacity: 1, points: points.map((value, index) => value - (index % 2 ? y : x)), color: '#f06f9e', strokeWidth: 3,
      });
    }
    drawingRef.current = [];
    setDrawingPoints([]);
    if (marquee) {
      const box = {
        x: Math.min(marquee.start.x, marquee.current.x), y: Math.min(marquee.start.y, marquee.current.y),
        width: Math.abs(marquee.current.x - marquee.start.x), height: Math.abs(marquee.current.y - marquee.start.y),
      };
      if (box.width > 3 || box.height > 3) setSelectedIds(documentRef.current.items.filter((item) => overlap(box, itemBounds(item))).map((item) => item.id));
      setMarquee(null);
    }
  };

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const current = cameraRef.current;
    const page = { x: (pointer.x - current.x) / current.zoom, y: (pointer.y - current.y) / current.zoom };
    const zoom = Math.max(0.08, Math.min(5, current.zoom * Math.exp(-event.evt.deltaY * 0.0014)));
    setCamera({ x: pointer.x - page.x * zoom, y: pointer.y - page.y * zoom, zoom }, true);
  };

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const selected = new Set(selectedIds);
    commit((current) => ({ ...current, items: current.items.filter((item) => !selected.has(item.id)) }));
    setSelectedIds([]);
  }, [commit, selectedIds]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Space') { spaceRef.current = true; event.preventDefault(); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) { event.preventDefault(); deleteSelected(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelectedIds(document.items.map((item) => item.id)); }
    if (event.key === 'Escape') { setSelectedIds([]); setToolState('select'); setEditingTextId(null); }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const point = clientToPage(event.clientX, event.clientY);
    const droppedTool = event.dataTransfer.getData(FREE_CANVAS_TOOL_MIME);
    const assetData = event.dataTransfer.getData(FREE_CANVAS_ASSET_MIME);
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
    if (droppedTool || assetData || files.length) { event.preventDefault(); event.stopPropagation(); }
    if (droppedTool === 'text') addText(point);
    if (droppedTool === 'frame') addFrames(['新画板'], point);
    if (assetData) {
      try { addAsset(JSON.parse(assetData) as Asset, point); } catch { props.onError('素材数据无效'); }
    }
    if (files.length) void props.onUploadFiles(files).then((assets) => addAssets(assets, point)).catch((reason) => props.onError(reason.message));
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    void props.onUploadFiles(files).then((assets) => addAssets(assets, pageCenter())).catch((reason) => props.onError(reason.message));
  };

  const selectionBounds = unionBounds(selectedItems);
  const toolbar = selectionBounds ? {
    left: Math.max(138, Math.min(size.width - 138, camera.x + (selectionBounds.x + selectionBounds.width / 2) * camera.zoom)),
    top: Math.max(54, camera.y + selectionBounds.y * camera.zoom - 50),
  } : null;
  const marqueeRect = marquee ? {
    x: Math.min(marquee.start.x, marquee.current.x), y: Math.min(marquee.start.y, marquee.current.y),
    width: Math.abs(marquee.current.x - marquee.start.x), height: Math.abs(marquee.current.y - marquee.start.y),
  } : null;
  const editingItem = editingTextId ? document.items.find((item) => item.id === editingTextId && item.type === 'text') : null;

  return (
    <div
      ref={hostRef}
      className={`fc-stage fc-tool-${tool}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => { if (event.code === 'Space') spaceRef.current = false; }}
      onContextMenu={(event) => event.preventDefault()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={camera.x}
        y={camera.y}
        scaleX={camera.zoom}
        scaleY={camera.zoom}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onMouseMove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
        onWheel={handleWheel}
      >
        <Layer>
          {renderedItems.filter((item) => item.type === 'frame').map((item) => (
            <CanvasItemView key={item.id} item={item} selected={selectedIds.includes(item.id)} onSelect={selectItem} onMove={moveItem} onEditText={beginTextEdit} />
          ))}
          {renderedItems.filter((item) => item.type !== 'frame').map((item) => (
            <CanvasItemView key={item.id} item={item} selected={selectedIds.includes(item.id)} onSelect={selectItem} onMove={moveItem} onEditText={beginTextEdit} />
          ))}
          {drawingPoints.length >= 4 && <Line points={drawingPoints} stroke="#f06f9e" strokeWidth={3 / camera.zoom} lineCap="round" lineJoin="round" tension={0.35} listening={false} />}
          {marqueeRect && <Rect {...marqueeRect} fill="rgba(132,102,200,0.08)" stroke="#8466c8" strokeWidth={1 / camera.zoom} dash={[5 / camera.zoom, 4 / camera.zoom]} listening={false} />}
          <Transformer
            ref={transformerRef}
            rotateEnabled={selectedIds.length === 1}
            flipEnabled={false}
            keepRatio={selectedItems.every((item) => item.type === 'image' || item.type === 'image-group')}
            borderStroke="#8466c8"
            anchorFill="#ffffff"
            anchorStroke="#8466c8"
            anchorSize={9}
            onTransformEnd={transformSelection}
          />
        </Layer>
      </Stage>

      {!document.items.length && (
        <div className="fc-empty-state"><span><ImagePlus size={24} /></span><strong>把图片放到画布上</strong><small>拖放、粘贴或从左侧素材中添加</small></div>
      )}

      {toolbar && references.length > 0 && (
        <div className="fc-selection-toolbar" style={{ left: toolbar.left, top: toolbar.top }}>
          <button type="button" title="查看原图" onClick={() => props.onOpenImage(primary.url)}><Eye size={16} /></button>
          <button type="button" title="标记修改区域" onClick={() => props.onEditMask(primary)} className={primary.maskUrl ? 'active' : ''}><Paintbrush size={16} /></button>
          <button type="button" title="切分为四张" disabled={props.running} onClick={() => void split()}><Scissors size={16} /></button>
          <button type="button" title="下载原图" onClick={() => void downloadImage(primary.url).catch((reason) => props.onError(reason.message))}><Download size={16} /></button>
          {selectedItems.some((item) => item.type === 'image-group') && <button type="button" title="拆开图片组" onClick={ungroupSelected}><Ungroup size={16} /></button>}
          <span>{references.length > 1 ? `${references.length} 张参考图` : primary.maskUrl ? '已标记区域' : '图片'}</span>
        </div>
      )}

      {editingItem && editingItem.type === 'text' && (
        <textarea
          className="fc-text-editor"
          autoFocus
          value={editingText}
          onChange={(event) => setEditingText(event.target.value)}
          onBlur={finishTextEdit}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') finishTextEdit();
            if (event.key === 'Escape') setEditingTextId(null);
          }}
          style={{
            left: camera.x + editingItem.x * camera.zoom,
            top: camera.y + editingItem.y * camera.zoom,
            width: editingItem.width * camera.zoom,
            height: editingItem.height * camera.zoom,
            fontSize: Math.max(12, editingItem.fontSize * camera.zoom),
          }}
        />
      )}

      <div className="fc-composer" data-canvas-overlay>
        {references.length > 0 && (
          <div className="fc-reference-strip">
            {references.map((reference, index) => (
              <span key={reference.shapeId} title={reference.name}><img src={reference.previewUrl} alt="" />{index === 0 && <b>主图</b>}</span>
            ))}
            <small>{references.length} 张参考</small>
          </div>
        )}
        <div className="fc-composer-main">
          <Sparkles size={18} />
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void generate(); }
            }}
            placeholder={references.length ? '描述怎样修改或融合这些图片' : '描述准备创作的画面'}
            rows={1}
          />
          <button className="fc-generate" type="button" disabled={!prompt.trim() || !selectedModel || props.running} onClick={() => void generate()}>
            {props.running ? <LoaderCircle className="spin" size={17} /> : <Play size={16} fill="currentColor" />}
            {props.running ? '生成中' : '生成'}
          </button>
        </div>
        <div className="fc-composer-options">
          <select aria-label="图像模型" value={selectedModel} onChange={(event) => setModel(event.target.value)}>
            <option value="">选择模型</option>
            {props.imageModels.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
          <select aria-label="画面比例" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
            {['1:1', '3:2', '2:3', '16:9', '9:16'].map((ratio) => <option key={ratio}>{ratio}</option>)}
          </select>
          <label>数量<input aria-label="生成数量" type="number" min={1} max={8} value={count} onChange={(event) => setCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></label>
          {primary?.maskUrl && <span className="fc-mask-badge"><Paintbrush size={13} />局部修改<button type="button" title="清除蒙版" onClick={() => setImageMask(primary.shapeId, '')}><X size={12} /></button></span>}
        </div>
      </div>
    </div>
  );
});

export default CanvasStage;
