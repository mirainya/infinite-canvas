import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Handle, Position } from 'reactflow';
import { PORT_COLORS } from '../../constants';
import Lightbox from '../../components/Lightbox';
import { useCanvasCallbacks } from '../../components/CanvasCallbacks';
import type { NodeBodyProps } from '../registry';

export default function ImageUploadBody({ id, def, pv, selected, updatePV }: NodeBodyProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { ctx, propagate } = useCanvasCallbacks();

  const outputUrl = pv['output-image'] as string | null;
  const localPreview = pv['upload'] as string | null;
  const imgSrc = outputUrl || localPreview || null;

  const uploadToXfs = useCallback(async (dataUrl: string) => {
    setUploading(true);
    setError('');
    try {
      const result = await ctx.execute(def.defId, {}, { upload: dataUrl });
      const url = (result as Record<string, string>).image;
      if (!url) throw new Error('上传未返回 URL');
      updatePV('upload', dataUrl);
      updatePV('output-image', url);
      propagate(id, { ...pv, upload: dataUrl, 'output-image': url });
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }, [ctx, def.defId, id, pv, propagate, updatePV]);

  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updatePV('upload', dataUrl);
      uploadToXfs(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [updatePV, uploadToXfs]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) loadImage(file);
  }, [loadImage]);

  const clearImage = useCallback(() => {
    updatePV('upload', null);
    updatePV('output-image', null);
    setError('');
  }, [updatePV]);

  return (
    <div className={`wf wf--upload ${selected ? 'wf--selected' : ''} ${uploading ? 'wf--running' : ''} ${error ? 'wf--error-state' : ''}`}>
      <div className="wf__title">{def.name}</div>

      {def.outputs.length > 0 && (
        <div className="wf__ports">
          {def.outputs.map((out) => (
            <div key={out.id} className="wf__port-row">
              <div className="wf__port-cell wf__port-cell--left" />
              <div className="wf__port-cell wf__port-cell--right">
                <span className="wf__port-label">{out.label}</span>
                <Handle type="source" position={Position.Right} id={`output-${out.id}`} className="wf__handle" style={{ background: PORT_COLORS[out.type] }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="wf__upload-area nodrag">
        {imgSrc ? (
          <div className="wf__upload-preview">
            <img src={imgSrc} alt="已上传" draggable={false} onClick={() => setLightboxSrc(imgSrc)} />
            <button type="button" className="wf__upload-clear" onClick={clearImage} title="清除图片">✕</button>
            {uploading && <div className="wf__upload-status">上传中...</div>}
          </div>
        ) : (
          <div
            className="wf__upload-drop"
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => fileRef.current?.click()}
          >
            <span className="wf__upload-icon">📁</span>
            <span className="wf__upload-hint">拖拽或点击上传图片</span>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadImage(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <div className="wf__error">{error}</div>}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
