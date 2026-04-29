import { useCallback, useRef, useState, type DragEvent, type MouseEvent } from 'react';

type SelectionRect = { x: number; y: number; w: number; h: number };

type ImageEditControlProps = {
  id: string;
  label: string;
  imageSrc: string | null;
  rectValue: string | null;
  onImageChange: (value: string | null) => void;
  onRectChange: (value: string | null) => void;
};

export default function ImageEditControl({ id, label, imageSrc, rectValue, onImageChange, onRectChange }: ImageEditControlProps) {
  const [selection, setSelection] = useState<SelectionRect | null>(() => {
    if (!rectValue) return null;
    try { return JSON.parse(rectValue); } catch { return null; }
  });

  const imgRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onImageChange(reader.result as string);
    reader.readAsDataURL(file);
  }, [onImageChange]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) loadImage(file);
  }, [loadImage]);

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (!imgRef.current) return;
    e.stopPropagation();
    const rect = imgRef.current.getBoundingClientRect();
    dragging.current = true;
    startPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setSelection(null);
    onRectChange(null);
  }, [onRectChange]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current || !imgRef.current) return;
    e.stopPropagation();
    const rect = imgRef.current.getBoundingClientRect();
    const cx = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const cy = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    const sx = startPos.current.x;
    const sy = startPos.current.y;
    const sel = { x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) };
    setSelection(sel);
  }, []);

  const onMouseUp = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    dragging.current = false;
    if (selection && selection.w > 2 && selection.h > 2) {
      onRectChange(JSON.stringify(selection));
    }
  }, [onRectChange, selection]);

  if (!imageSrc) {
    return (
      <div className="control image-edit-control">
        <label className="control__label">{label}</label>
        <div
          className="image-upload-control__drop nodrag"
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => fileRef.current?.click()}
        >
          <span>拖拽或点击上传图片</span>
          <input ref={fileRef} id={id} type="file" accept="image/*" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadImage(file);
            e.target.value = '';
          }} />
        </div>
      </div>
    );
  }

  return (
    <div className="control image-edit-control">
      <label className="control__label">{label}</label>
      <div
        ref={imgRef}
        className="image-edit-control__canvas nodrag"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img src={imageSrc} alt="编辑图片" draggable={false} />
        {selection && selection.w > 2 && selection.h > 2 && (
          <div
            className="image-edit-control__selection"
            style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
          />
        )}
        {!selection && <div className="image-edit-control__hint">拖拽框选编辑区域</div>}
      </div>
      <button type="button" className="image-edit-control__reset" onClick={() => { onImageChange(null); setSelection(null); onRectChange(null); }}>
        重新上传
      </button>
    </div>
  );
}
