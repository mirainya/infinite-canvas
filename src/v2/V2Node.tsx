import { memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Download, ImagePlus, LoaderCircle, Paintbrush, X } from 'lucide-react';
import { Handle, Position, useStore, type NodeProps, type ReactFlowState } from 'reactflow';
import { downloadImage } from '../download';
import { NODE_BY_TYPE } from './catalog';
import { useV2Canvas } from './CanvasContext';
import type { ModelInfo, V2Node, V2NodeData, V2NodeType } from './types';

function ModelSelect({ value, models, onChange }: { value?: string; models: ModelInfo[]; onChange: (value: string) => void }) {
  return (
    <label className="v2-field">
      <span>模型</span>
      <select className="nodrag" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">选择模型</option>
        {models.map((model) => <option key={model.code} value={model.code}>{model.name}</option>)}
      </select>
    </label>
  );
}

function TextArea({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="v2-field">
      <span>{label}</span>
      <textarea className="nodrag nowheel" value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

function imageFileError(file: File) {
  if (!IMAGE_TYPES.has(file.type)) return '仅支持 JPG、PNG 和 WebP';
  if (file.size > MAX_IMAGE_SIZE) return '图片不能超过 20 MB';
  return '';
}

function pastedImages(event: ClipboardEvent<HTMLElement>) {
  return Array.from(event.clipboardData.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function ImagePicker({ url, label, onChange, kind = 'image' }: { url?: string; label: string; onChange: (url: string) => void; kind?: string }) {
  const { uploadImage, openImage } = useV2Canvas();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(url ?? '');
  const localPreviewRef = useRef('');

  const clearLocalPreview = useCallback(() => {
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    localPreviewRef.current = '';
  }, []);

  useEffect(() => {
    if (!localPreviewRef.current) setPreviewUrl(url ?? '');
  }, [url]);

  useEffect(() => () => clearLocalPreview(), [clearLocalPreview]);

  const upload = async (file?: File) => {
    if (!file) return;
    const validationError = imageFileError(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    clearLocalPreview();
    localPreviewRef.current = URL.createObjectURL(file);
    setPreviewUrl(localPreviewRef.current);
    setLoading(true);
    setError('');
    try {
      const uploadedUrl = await uploadImage(file, kind);
      clearLocalPreview();
      setPreviewUrl(uploadedUrl);
      onChange(uploadedUrl);
    } catch (reason) {
      clearLocalPreview();
      setPreviewUrl(url ?? '');
      setError(reason instanceof Error ? reason.message : '上传失败');
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files)[0]);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const [file] = pastedImages(event);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void upload(file);
  };

  const clear = () => {
    clearLocalPreview();
    setPreviewUrl('');
    setError('');
    onChange('');
  };

  return (
    <div
      className={`v2-image-picker nodrag nowheel ${dragging ? 'is-dragging' : ''}`}
      tabIndex={0}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
    >
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }}
      />
      {previewUrl ? (
        <div className="v2-image-picker__preview">
          <img src={previewUrl} alt={label} onClick={() => !loading && openImage(previewUrl)} />
          {loading && <span className="v2-image-picker__loading"><LoaderCircle className="spin" size={18} /></span>}
          <div className="v2-image-picker__actions">
            <button type="button" title="替换图片" disabled={loading} onClick={() => inputRef.current?.click()}><ImagePlus size={14} /></button>
            <button type="button" title="移除图片" disabled={loading} onClick={clear}><X size={14} /></button>
          </div>
        </div>
      ) : (
        <button className="v2-image-picker__empty" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={18} /> : <ImagePlus size={18} />}
          <span>{label}</span>
        </button>
      )}
      {error && <span className="v2-node__error">{error}</span>}
    </div>
  );
}

type PendingImage = { id: string; url: string };

export function ImageCollectionPicker({ urls, incomingUrls, onChange }: { urls: string[]; incomingUrls: string[]; onChange: (urls: string[]) => void }) {
  const { uploadImage, openImage } = useV2Canvas();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const max = 20;

  const uploadFiles = useCallback(async (files: File[]) => {
    const available = Math.max(0, max - urls.length - pending.length);
    const selected = files.slice(0, available);
    if (!selected.length) return;
    const invalid = selected.find((file) => imageFileError(file));
    if (invalid) {
      setError(imageFileError(invalid));
      return;
    }

    const previews = selected.map((file) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(file) }));
    setPending((current) => [...current, ...previews]);
    setError('');
    const results = await Promise.allSettled(selected.map((file) => uploadImage(file, 'image')));
    previews.forEach((item) => URL.revokeObjectURL(item.url));
    const previewIds = new Set<string>(previews.map((item) => item.id));
    setPending((current) => current.filter((item) => !previewIds.has(item.id)));
    const uploaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (uploaded.length) onChange([...urls, ...uploaded]);
    const failed = results.length - uploaded.length;
    if (failed) setError(`${failed} 张图片上传失败`);
  }, [onChange, pending.length, uploadImage, urls]);

  const dropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  };

  const pasteFiles = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = pastedImages(event);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadFiles(files);
  };

  const linked = incomingUrls.filter((url) => !urls.includes(url));
  const canAdd = urls.length + pending.length < max;

  return (
    <div
      className={`v2-image-collection nodrag nowheel ${dragging ? 'is-dragging' : ''}`}
      tabIndex={0}
      onPaste={pasteFiles}
      onDrop={dropFiles}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
    >
      <input
        ref={inputRef}
        hidden
        multiple
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => { void uploadFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }}
      />
      {(urls.length > 0 || linked.length > 0 || pending.length > 0) && (
        <div className="v2-image-collection__grid">
          {urls.map((url, index) => (
            <div className="v2-image-collection__item" key={`${url}-${index}`}>
              <img src={url} alt={`图片 ${index + 1}`} onClick={() => openImage(url)} />
              <button type="button" title="移除图片" onClick={() => onChange(urls.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button>
            </div>
          ))}
          {linked.map((url, index) => <div className="v2-image-collection__item is-linked" key={`linked-${url}-${index}`}><img src={url} alt={`连入图片 ${index + 1}`} onClick={() => openImage(url)} /></div>)}
          {pending.map((item) => <div className="v2-image-collection__item is-pending" key={item.id}><img src={item.url} alt="上传中" /><LoaderCircle className="spin" size={17} /></div>)}
        </div>
      )}
      {canAdd && <button className="v2-image-collection__add" type="button" onClick={() => inputRef.current?.click()}><ImagePlus size={17} /><span>{urls.length || linked.length ? '添加图片' : '选择、拖放或粘贴图片'}</span></button>}
      {error && <span className="v2-node__error">{error}</span>}
    </div>
  );
}

function ResultImages({ values }: { values: unknown }) {
  const { openImage } = useV2Canvas();
  const images = useMemo(() => {
    if (Array.isArray(values)) return values.filter((value): value is string => typeof value === 'string');
    return typeof values === 'string' && values ? [values] : [];
  }, [values]);
  if (!images.length) return <div className="v2-result-empty">暂无图像</div>;
  return (
    <div className={`v2-result-grid ${images.length === 1 ? 'v2-result-grid--single' : ''}`}>
      {images.slice(0, 12).map((url, index) => (
        <div className="v2-result-image" key={`${url}-${index}`}>
          <img src={url} alt={`结果 ${index + 1}`} onClick={() => openImage(url)} />
          <button type="button" title="下载图片" onClick={() => void downloadImage(url)}><Download size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function imageUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item));
  return typeof value === 'string' && value ? [value] : [];
}

function sourceImages(
  state: ReactFlowState,
  sourceId: string,
  sourceHandle: string | null | undefined,
  outputs: Record<string, Record<string, unknown>>,
  visited: Set<string>,
): string[] {
  if (visited.has(sourceId)) return [];
  const nextVisited = new Set(visited).add(sourceId);
  const source = state.nodeInternals.get(sourceId) as V2Node | undefined;
  if (!source) return [];

  const direct = imageUrls(outputs[sourceId]?.[sourceHandle ?? 'images']);
  if (direct.length) return sourceHandle === 'image' ? direct.slice(0, 1) : direct;
  if (source.type === 'image-input') return imageUrls(source.data.url);
  if (source.type !== 'image-collection') return [];

  const connected = state.edges
    .filter((edge) => edge.target === sourceId && edge.targetHandle === 'images')
    .flatMap((edge) => sourceImages(state, edge.source, edge.sourceHandle, outputs, nextVisited));
  const combined = Array.from(new Set([...connected, ...imageUrls(source.data.items)]));
  return sourceHandle === 'image' ? combined.slice(0, 1) : combined;
}

function useConnectedImages(nodeId: string, outputs: Record<string, Record<string, unknown>>) {
  const selector = useCallback((state: ReactFlowState) => JSON.stringify(Array.from(new Set(
    state.edges
      .filter((edge) => edge.target === nodeId && edge.targetHandle === 'images')
      .flatMap((edge) => sourceImages(state, edge.source, edge.sourceHandle, outputs, new Set())),
  ))), [nodeId, outputs]);
  const serialized = useStore(selector);
  return useMemo(() => JSON.parse(serialized) as string[], [serialized]);
}

function MaskControl({ nodeId, imageSrc, maskUrl, onChange }: { nodeId: string; imageSrc?: string; maskUrl?: string; onChange: (url: string) => void }) {
  const { editMask, openImage } = useV2Canvas();
  return (
    <div className="v2-mask-control nodrag">
      {(imageSrc || maskUrl) && (
        <div className="v2-mask-control__preview" onClick={() => imageSrc && openImage(imageSrc)}>
          {imageSrc && <img src={imageSrc} alt="原图" />}
          {maskUrl && imageSrc && <img className="v2-mask-control__overlay" src={maskUrl} alt="已标记区域" />}
          {!imageSrc && maskUrl && <img src={maskUrl} alt="蒙版" />}
        </div>
      )}
      <div className="v2-mask-control__actions">
        <button type="button" disabled={!imageSrc} onClick={() => imageSrc && editMask(nodeId, imageSrc)}><Paintbrush size={15} />{maskUrl ? '修改区域' : '标记区域'}</button>
        {maskUrl && <button className="v2-mask-control__clear" type="button" title="清除蒙版" onClick={() => onChange('')}><X size={14} /></button>}
      </div>
      {!imageSrc && <span className="v2-mask-control__hint">连接原图后可标记区域</span>}
    </div>
  );
}

function NodeBody({ id, type, data }: { id: string; type: V2NodeType; data: V2NodeData }) {
  const { updateNode, outputs, imageModels, chatModels } = useV2Canvas();
  const output = outputs[id] ?? {};
  const update = (patch: Partial<V2NodeData>) => updateNode(id, patch);
  const connectedImages = useConnectedImages(id, outputs);

  switch (type) {
    case 'image-input':
      return <ImagePicker url={data.url} label="选择图片" onChange={(url) => update({ url })} />;
    case 'text-input':
      return <TextArea label="内容" value={data.text} placeholder="输入文本" onChange={(text) => update({ text })} />;
    case 'image-collection':
      return <ImageCollectionPicker urls={data.items ?? []} incomingUrls={connectedImages} onChange={(items) => update({ items })} />;
    case 'text-collection':
      return <TextArea label="每行一条" value={(data.items ?? []).join('\n')} onChange={(text) => update({ items: text.split('\n').map((item) => item.trim()).filter(Boolean) })} />;
    case 'ai-image':
      return (
        <>
          <ModelSelect value={data.model} models={imageModels} onChange={(model) => update({ model })} />
          <TextArea label="提示词" value={data.prompt} placeholder="描述画面" onChange={(prompt) => update({ prompt })} />
          <div className="v2-field-row">
            <label className="v2-field"><span>比例</span><select className="nodrag" value={data.aspectRatio ?? '1:1'} onChange={(event) => update({ aspectRatio: event.target.value })}>{['1:1', '2:3', '3:2', '9:16', '16:9'].map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label>
            <label className="v2-field"><span>数量</span><input className="nodrag" type="number" min={1} max={20} value={data.count ?? 1} onChange={(event) => update({ count: Number(event.target.value) })} /></label>
          </div>
          <MaskControl nodeId={id} imageSrc={connectedImages[0]} maskUrl={data.maskUrl} onChange={(maskUrl) => update({ maskUrl })} />
          {output.images && <ResultImages values={output.images} />}
        </>
      );
    case 'text-generation':
      return (
        <>
          <ModelSelect value={data.model} models={chatModels} onChange={(model) => update({ model })} />
          <TextArea label="系统指令" value={data.instruction} onChange={(instruction) => update({ instruction })} />
          <TextArea label="内容" value={data.content} onChange={(content) => update({ content })} />
          {output.text && <div className="v2-text-result">{String(output.text)}</div>}
        </>
      );
    case 'prompt-enhance':
      return (
        <>
          <ModelSelect value={data.model} models={chatModels} onChange={(model) => update({ model })} />
          <TextArea label="原始描述" value={data.brief} onChange={(brief) => update({ brief })} />
          {output.prompt && <div className="v2-text-result">{String(output.prompt)}</div>}
        </>
      );
    case 'image-split':
      return (
        <div className="v2-field-row">
          <label className="v2-field"><span>行</span><input className="nodrag" type="number" min={1} max={20} value={data.rows ?? 2} onChange={(event) => update({ rows: Number(event.target.value) })} /></label>
          <label className="v2-field"><span>列</span><input className="nodrag" type="number" min={1} max={20} value={data.columns ?? 2} onChange={(event) => update({ columns: Number(event.target.value) })} /></label>
        </div>
      );
    case 'image-output':
      return <ResultImages values={output.images} />;
    case 'text-output': {
      const texts = Array.isArray(output.texts) ? output.texts.join('\n\n') : output.texts;
      return <div className="v2-text-result">{String(texts || '暂无文本')}</div>;
    }
  }
}

function V2NodeComponent({ id, data, type, selected }: NodeProps<V2NodeData>) {
  const nodeType = type as V2NodeType;
  const definition = NODE_BY_TYPE.get(nodeType);
  if (!definition) return null;
  const Icon = definition.icon;
  const rows = Math.max(definition.inputs.length, definition.outputs.length);
  return (
    <article className={`v2-node v2-node--${definition.tone} ${selected ? 'v2-node--selected' : ''}`}>
      <header className="v2-node__header">
        <span className="v2-node__icon"><Icon size={16} /></span>
        <strong>{data.title || definition.name}</strong>
      </header>
      {rows > 0 && (
        <div className="v2-node__ports">
          {Array.from({ length: rows }, (_, index) => {
            const input = definition.inputs[index];
            const output = definition.outputs[index];
            return (
              <div className="v2-node__port-row" key={index}>
                <div className="v2-node__port v2-node__port--input">
                  {input && <><Handle type="target" position={Position.Left} id={input.id} /><span>{input.label}</span></>}
                </div>
                <div className="v2-node__port v2-node__port--output">
                  {output && <><span>{output.label}</span><Handle type="source" position={Position.Right} id={output.id} /></>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="v2-node__body"><NodeBody id={id} type={nodeType} data={data} /></div>
    </article>
  );
}

export default memo(V2NodeComponent);
