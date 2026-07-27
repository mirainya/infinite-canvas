import { memo, useMemo, useRef, useState } from 'react';
import { Download, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { downloadImage } from '../download';
import { NODE_BY_TYPE } from './catalog';
import { useV2Canvas } from './CanvasContext';
import type { ModelInfo, V2NodeData, V2NodeType } from './types';

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

function ImagePicker({ url, label, onChange, kind = 'image' }: { url?: string; label: string; onChange: (url: string) => void; kind?: string }) {
  const { uploadImage, openImage } = useV2Canvas();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      onChange(await uploadImage(file, kind));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '上传失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="v2-image-picker nodrag">
      <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event.target.files?.[0])} />
      {url ? (
        <div className="v2-image-picker__preview">
          <img src={url} alt={label} onClick={() => openImage(url)} />
          <button type="button" title="移除图片" onClick={() => onChange('')}><X size={14} /></button>
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

function NodeBody({ id, type, data }: { id: string; type: V2NodeType; data: V2NodeData }) {
  const { updateNode, outputs, imageModels, chatModels } = useV2Canvas();
  const output = outputs[id] ?? {};
  const update = (patch: Partial<V2NodeData>) => updateNode(id, patch);

  switch (type) {
    case 'image-input':
      return <ImagePicker url={data.url} label="选择图片" onChange={(url) => update({ url })} />;
    case 'text-input':
      return <TextArea label="内容" value={data.text} placeholder="输入文本" onChange={(text) => update({ text })} />;
    case 'image-collection':
      return <ResultImages values={output.images ?? data.items} />;
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
          <ImagePicker url={data.maskUrl} label="添加蒙版" kind="mask" onChange={(maskUrl) => update({ maskUrl })} />
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
