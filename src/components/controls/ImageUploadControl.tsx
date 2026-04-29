import { useCallback, useRef, type DragEvent } from 'react';

type ImageUploadControlProps = {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

export default function ImageUploadControl({ id, label, value, onChange }: ImageUploadControlProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }, [onChange]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) loadImage(file);
  }, [loadImage]);

  return (
    <div className="control image-upload-control">
      <label className="control__label">{label}</label>
      {value ? (
        <div className="image-upload-control__preview">
          <img src={value} alt={label} draggable={false} />
          <button type="button" className="image-upload-control__clear" onClick={() => onChange(null)}>✕</button>
        </div>
      ) : (
        <div
          className="image-upload-control__drop nodrag"
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => fileRef.current?.click()}
        >
          <span>拖拽或点击上传</span>
          <input
            ref={fileRef}
            id={id}
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
      )}
    </div>
  );
}
