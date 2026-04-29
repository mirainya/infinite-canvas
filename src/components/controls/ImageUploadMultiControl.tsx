import { useCallback, useRef, useState, type DragEvent } from 'react';
import { authHeaders } from '../LoginPage';

type Props = {
  id: string;
  label: string;
  max?: number;
  value: string | null;
  onChange: (value: string | null) => void;
};

type ImageItem = { url: string; uploading?: boolean; error?: string };

function parseUrls(value: string | null): ImageItem[] {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr)) return arr.map((url: string) => ({ url }));
  } catch { /* ignore */ }
  return value ? [{ url: value }] : [];
}

async function uploadToXfs(dataUrl: string): Promise<string> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!res.ok) throw new Error(`上传失败: ${res.status}`);
  const data = await res.json();
  return data.url;
}

export default function ImageUploadMultiControl({ id, label, max = 5, value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImageItem[]>(() => parseUrls(value));
  const [uploading, setUploading] = useState(false);

  const syncValue = useCallback((next: ImageItem[]) => {
    const urls = next.filter((i) => !i.uploading && !i.error).map((i) => i.url);
    onChange(urls.length > 0 ? JSON.stringify(urls) : null);
  }, [onChange]);

  const addFiles = useCallback(async (files: File[]) => {
    const remaining = max - items.filter((i) => !i.error).length;
    const toAdd = files.filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, remaining));
    if (toAdd.length === 0) return;

    const placeholders: ImageItem[] = toAdd.map(() => ({ url: '', uploading: true }));
    const next = [...items, ...placeholders];
    setItems(next);
    setUploading(true);

    const results = await Promise.allSettled(
      toAdd.map((file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => uploadToXfs(reader.result as string).then(resolve, reject);
          reader.onerror = () => reject(new Error('读取失败'));
          reader.readAsDataURL(file);
        }),
      ),
    );

    setItems((prev) => {
      const updated = prev.filter((i) => !i.uploading);
      for (const r of results) {
        if (r.status === 'fulfilled') {
          updated.push({ url: r.value });
        } else {
          updated.push({ url: '', error: '上传失败' });
        }
      }
      const clean = updated.filter((i) => !i.error);
      syncValue(clean);
      return clean;
    });
    setUploading(false);
  }, [items, max, syncValue]);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      syncValue(next);
      return next;
    });
  }, [syncValue]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const canAdd = items.filter((i) => !i.error).length < max;

  return (
    <div className="control image-upload-multi nodrag">
      <label className="control__label">{label}</label>
      {items.length > 0 && (
        <div className="image-upload-multi__grid">
          {items.map((item, i) => (
            <div key={item.url || i} className="image-upload-multi__item">
              {item.uploading ? (
                <div className="image-upload-multi__loading">上传中</div>
              ) : (
                <>
                  <img src={item.url} alt="" draggable={false} />
                  <button type="button" className="image-upload-multi__remove" onClick={() => removeItem(i)}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {canAdd && (
        <div
          className="image-upload-multi__drop"
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => fileRef.current?.click()}
        >
          <span>{uploading ? '上传中...' : `拖拽或点击上传（最多${max}张）`}</span>
          <input
            ref={fileRef}
            id={id}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
