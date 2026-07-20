import { useCallback, useRef, useState, type DragEvent } from 'react';
import { apiFetch } from '../../api';

type ImageUploadControlProps = {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

export default function ImageUploadControl({ id, label, value, onChange }: ImageUploadControlProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      if (!res.ok) throw new Error(`上传失败: ${res.status}`);
      const { url } = await res.json();
      onChange(url);
    } catch (e) {
      console.error('图片上传失败', e);
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) uploadImage(file);
  }, [uploadImage]);

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
          onClick={() => !uploading && fileRef.current?.click()}
        >
          <span>{uploading ? '上传中...' : '拖拽或点击上传'}</span>
          <input
            ref={fileRef}
            id={id}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadImage(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
