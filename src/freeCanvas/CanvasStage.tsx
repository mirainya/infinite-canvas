import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent,
} from 'react';
import {
  AssetRecordType,
  Tldraw,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type TLShapeId,
  type TLStoreSnapshot,
} from 'tldraw';
import {
  Crop,
  Download,
  Eye,
  ImagePlus,
  LoaderCircle,
  Paintbrush,
  Play,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import { downloadImage } from '../download';
import type { Asset, ModelInfo } from '../v2/types';
import { resultGrid, type ImageReference, type ImageRunRequest } from './canvasHelpers';

export const FREE_CANVAS_TOOL_MIME = 'application/x-infinite-canvas-tool';
export const FREE_CANVAS_ASSET_MIME = 'application/x-infinite-canvas-asset';

type Point = { x: number; y: number };
type CanvasSnapshot = { document: TLStoreSnapshot; camera: { x: number; y: number; z: number } };

export type CanvasStageHandle = {
  addAsset: (asset: Asset, point?: Point) => void;
  addAssets: (assets: Asset[], point?: Point) => void;
  addText: (point?: Point) => void;
  addFrames: (names: string[], point?: Point) => void;
  setTool: (tool: string) => void;
  setImageMask: (shapeId: string, maskUrl: string) => void;
  snapshot: () => CanvasSnapshot | null;
  undo: () => void;
  redo: () => void;
  fit: () => void;
};

type CanvasStageProps = {
  document?: TLStoreSnapshot;
  viewport: { x: number; y: number; zoom: number };
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

function createHostedImage(
  editor: Editor,
  source: { url: string; previewUrl?: string; width: number; height: number; name: string },
  point: Point,
  meta: Record<string, string> = {},
) {
  const display = imageDisplaySize(source.width, source.height);
  const asset = AssetRecordType.create({
    id: AssetRecordType.createId(),
    type: 'image',
    props: {
      src: source.previewUrl || source.url,
      w: source.width,
      h: source.height,
      mimeType: 'image/png',
      name: source.name,
      isAnimated: false,
    },
  });
  const shapeId = createShapeId();
  editor.createAssets([asset]);
  editor.createShape({
    id: shapeId,
    type: 'image',
    x: point.x,
    y: point.y,
    props: { assetId: asset.id, w: display.width, h: display.height, altText: source.name },
    meta: { originalUrl: source.url, previewUrl: source.previewUrl || source.url, name: source.name, ...meta },
  });
  return { shapeId, width: display.width, height: display.height };
}

function selectedReferences(editor: Editor): ImageReference[] {
  return editor.getSelectedShapes().flatMap((shape, index) => {
    if (shape.type !== 'image') return [];
    const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null;
    const assetUrl = asset?.type === 'image' ? asset.props.src : '';
    const originalUrl = typeof shape.meta.originalUrl === 'string' ? shape.meta.originalUrl : assetUrl;
    if (!originalUrl) return [];
    return [{
      shapeId: shape.id,
      url: originalUrl,
      previewUrl: typeof shape.meta.previewUrl === 'string' ? shape.meta.previewUrl : assetUrl || originalUrl,
      name: typeof shape.meta.name === 'string' ? shape.meta.name : `参考图 ${index + 1}`,
      maskUrl: typeof shape.meta.maskUrl === 'string' ? shape.meta.maskUrl : undefined,
    }];
  });
}

async function insertResults(editor: Editor, urls: string[], anchor: Point, request?: ImageRunRequest) {
  if (!urls.length) return;
  const sizes = await Promise.all(urls.map(imageSize));
  const meta: Record<string, string> = request ? {
    generationPrompt: request.prompt,
    generationModel: request.model,
    referenceIds: request.references.map((item) => item.shapeId).join(','),
  } : {};
  if (urls.length === 1) {
    const created = createHostedImage(editor, {
      url: urls[0], width: sizes[0].width, height: sizes[0].height, name: 'AI 绘图结果',
    }, anchor, meta);
    editor.select(created.shapeId);
    return;
  }

  const { columns, rows } = resultGrid(urls.length);
  const cell = 280;
  const frameId = createShapeId();
  editor.createShape({
    id: frameId,
    type: 'frame',
    x: anchor.x,
    y: anchor.y,
    props: { w: columns * cell + 28, h: rows * cell + 48, name: `AI 绘图 · ${urls.length} 张`, color: 'violet' },
    meta: { kind: 'result-group' },
  });
  const childIds: TLShapeId[] = [];
  urls.forEach((url, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const created = createHostedImage(editor, {
      url, width: sizes[index].width, height: sizes[index].height, name: `生成结果 ${index + 1}`,
    }, { x: anchor.x + 18 + column * cell, y: anchor.y + 34 + row * cell }, meta);
    childIds.push(created.shapeId);
  });
  editor.reparentShapes(childIds, frameId);
  editor.select(frameId);
}

function CanvasOverlay({ imageModels, running, onGenerate, onSplit, onOpenImage, onEditMask, onError }: Pick<CanvasStageProps,
  'imageModels' | 'running' | 'onGenerate' | 'onSplit' | 'onOpenImage' | 'onEditMask' | 'onError'>) {
  const editor = useEditor();
  const references = useValue('selected image references', () => selectedReferences(editor), [editor]);
  const shapeCount = useValue('shape count', () => editor.getCurrentPageShapes().length, [editor]);
  const toolbar = useValue('selection toolbar position', () => {
    editor.getCamera();
    const bounds = editor.getSelectionPageBounds();
    if (!bounds) return null;
    const point = editor.pageToScreen({ x: bounds.x + bounds.w / 2, y: bounds.y });
    const viewport = editor.getViewportScreenBounds();
    const halfWidth = 126;
    return {
      left: Math.max(halfWidth, Math.min(viewport.w - halfWidth, point.x)),
      top: Math.max(54, point.y - 48),
    };
  }, [editor]);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [count, setCount] = useState(1);

  const primary = references[0];
  const selectedModel = model || imageModels[0]?.code || '';
  const anchor = () => {
    const bounds = editor.getSelectionPageBounds();
    if (bounds) return { x: bounds.x + bounds.w + 80, y: bounds.y };
    return editor.getViewportPageBounds().center;
  };

  const generate = async () => {
    if (!prompt.trim() || !selectedModel || running) return;
    const request = { prompt: prompt.trim(), model: selectedModel, aspectRatio, count, references, maskUrl: primary?.maskUrl };
    try {
      const urls = await onGenerate(request);
      await insertResults(editor, urls, anchor(), request);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '生成失败');
    }
  };

  const split = async () => {
    if (!primary || running) return;
    try {
      const urls = await onSplit(primary);
      await insertResults(editor, urls, anchor());
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '切分失败');
    }
  };

  return (
    <>
      {shapeCount === 0 && (
        <div className="fc-empty-state">
          <span><ImagePlus size={24} /></span>
          <strong>把图片放到画布上</strong>
          <small>拖放、粘贴或从左侧素材中添加</small>
        </div>
      )}

      {toolbar && references.length > 0 && (
        <div className="fc-selection-toolbar" style={{ left: toolbar.left, top: toolbar.top }}>
          <button type="button" title="查看原图" onClick={() => onOpenImage(primary.url)}><Eye size={16} /></button>
          <button type="button" title="标记修改区域" onClick={() => onEditMask(primary)} className={primary.maskUrl ? 'active' : ''}><Paintbrush size={16} /></button>
          <button type="button" title="裁剪" onClick={() => editor.setCurrentTool('select.crop')}><Crop size={16} /></button>
          <button type="button" title="切分为四张" disabled={running} onClick={() => void split()}><Scissors size={16} /></button>
          <button type="button" title="下载" onClick={() => void downloadImage(primary.url).catch((reason) => onError(reason.message))}><Download size={16} /></button>
          <span>{references.length > 1 ? `${references.length} 张参考图` : primary.maskUrl ? '已标记区域' : '图片'}</span>
        </div>
      )}

      <div className="fc-composer" data-canvas-overlay>
        {references.length > 0 && (
          <div className="fc-reference-strip">
            {references.map((reference, index) => (
              <span key={reference.shapeId} title={reference.name}>
                <img src={reference.previewUrl} alt="" />
                {index === 0 && <b>主图</b>}
              </span>
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
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void generate();
              }
            }}
            placeholder={references.length ? '描述怎样修改或融合这些图片' : '描述准备创作的画面'}
            rows={1}
          />
          <button className="fc-generate" type="button" disabled={!prompt.trim() || !selectedModel || running} onClick={() => void generate()}>
            {running ? <LoaderCircle className="spin" size={17} /> : <Play size={16} fill="currentColor" />}
            {running ? '生成中' : '生成'}
          </button>
        </div>
        <div className="fc-composer-options">
          <select aria-label="图像模型" value={selectedModel} onChange={(event) => setModel(event.target.value)}>
            <option value="">选择模型</option>
            {imageModels.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
          <select aria-label="画面比例" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
            {['1:1', '3:2', '2:3', '16:9', '9:16'].map((ratio) => <option key={ratio}>{ratio}</option>)}
          </select>
          <label>数量<input aria-label="生成数量" type="number" min={1} max={8} value={count} onChange={(event) => setCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></label>
          {primary?.maskUrl && <span className="fc-mask-badge"><Paintbrush size={13} />局部修改<button type="button" title="清除蒙版" onClick={() => editor.updateShape({ id: primary.shapeId as TLShapeId, type: 'image', meta: { ...editor.getShape(primary.shapeId as TLShapeId)?.meta, maskUrl: '' } })}><X size={12} /></button></span>}
        </div>
      </div>
    </>
  );
}

const CanvasStage = forwardRef<CanvasStageHandle, CanvasStageProps>(function CanvasStage(props, ref) {
  const editorRef = useRef<Editor | null>(null);

  const center = () => editorRef.current?.getViewportPageBounds().center ?? { x: 0, y: 0 };
  const addAsset = (asset: Asset, point = center()) => {
    const editor = editorRef.current;
    if (!editor) return;
    const display = imageDisplaySize(asset.width, asset.height);
    const created = createHostedImage(editor, {
      url: asset.original_url,
      previewUrl: asset.thumbnail_url || asset.original_url,
      width: asset.width,
      height: asset.height,
      name: asset.filename,
    }, { x: point.x - display.width / 2, y: point.y - display.height / 2 }, { libraryAssetId: asset.id });
    editor.select(created.shapeId);
  };

  const addText = (point = center()) => {
    const editor = editorRef.current;
    if (!editor) return;
    const id = createShapeId();
    editor.createShape({ id, type: 'text', x: point.x, y: point.y, props: { richText: toRichText('输入文字'), size: 'm' } });
    editor.select(id);
  };

  const addFrames = (names: string[], point = center()) => {
    const editor = editorRef.current;
    if (!editor) return;
    const ids = names.map((name, index) => {
      const id = createShapeId();
      const colors = ['red', 'blue', 'green', 'yellow', 'violet'] as const;
      editor.createShape({ id, type: 'frame', x: point.x + index * 460, y: point.y, props: { w: 400, h: 520, name, color: colors[index % colors.length] } });
      return id;
    });
    editor.select(...ids);
    editor.zoomToSelection({ animation: { duration: 220 } });
  };

  useImperativeHandle(ref, () => ({
    addAsset,
    addAssets: (assets, point = center()) => assets.forEach((asset, index) => addAsset(asset, { x: point.x + index * 48, y: point.y + index * 48 })),
    addText,
    addFrames,
    setTool: (tool) => editorRef.current?.setCurrentTool(tool),
    setImageMask: (shapeId, maskUrl) => {
      const editor = editorRef.current;
      const shape = editor?.getShape(shapeId as TLShapeId);
      if (!editor || !shape || shape.type !== 'image') return;
      editor.updateShape({ id: shape.id, type: 'image', meta: { ...shape.meta, maskUrl } });
    },
    snapshot: () => {
      const editor = editorRef.current;
      if (!editor) return null;
      return { document: getSnapshot(editor.store).document, camera: editor.getCamera() };
    },
    undo: () => editorRef.current?.undo(),
    redo: () => editorRef.current?.redo(),
    fit: () => editorRef.current?.zoomToFit({ animation: { duration: 220 } }),
  }));

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    const point = editor.screenToPage({ x: event.clientX, y: event.clientY });
    const tool = event.dataTransfer.getData(FREE_CANVAS_TOOL_MIME);
    const assetData = event.dataTransfer.getData(FREE_CANVAS_ASSET_MIME);
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
    if (tool || assetData || files.length) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (tool === 'text') addText(point);
    if (tool === 'frame') addFrames(['新画板'], point);
    if (assetData) {
      try { addAsset(JSON.parse(assetData) as Asset, point); } catch { props.onError('素材数据无效'); }
    }
    if (files.length) {
      void props.onUploadFiles(files).then((assets) => assets.forEach((asset, index) => addAsset(asset, { x: point.x + index * 40, y: point.y + index * 40 }))).catch((reason) => props.onError(reason.message));
    }
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    void props.onUploadFiles(files).then((assets) => {
      const point = center();
      assets.forEach((asset, index) => addAsset(asset, { x: point.x + index * 40, y: point.y + index * 40 }));
    }).catch((reason) => props.onError(reason.message));
  };

  return (
    <div className="fc-stage" onDragOver={(event) => event.preventDefault()} onDropCapture={handleDrop} onPasteCapture={handlePaste}>
      <Tldraw
        hideUi
        licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY || undefined}
        onMount={(editor) => {
          editorRef.current = editor;
          if (props.document) loadSnapshot(editor.store, { document: props.document });
          editor.setCamera({ x: props.viewport.x, y: props.viewport.y, z: props.viewport.zoom });
          editor.setCameraOptions({ wheelBehavior: 'zoom', zoomSpeed: 0.75 });
          editor.setCurrentTool('select');
          const stopDocument = editor.store.listen(props.onDocumentChange, { source: 'user', scope: 'document' });
          return () => {
            stopDocument();
            editorRef.current = null;
          };
        }}
      >
        <CanvasOverlay {...props} />
      </Tldraw>
    </div>
  );
});

export default CanvasStage;
