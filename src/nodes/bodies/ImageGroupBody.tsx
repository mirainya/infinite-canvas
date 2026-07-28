import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { Handle, Position } from 'reactflow';
import { apiFetch } from '../../api';
import { useCanvasCallbacks } from '../../components/CanvasCallbacks';
import Lightbox from '../../components/Lightbox';
import { PORT_COLORS } from '../../constants';
import {
  createImageGroupOutputs,
  IMAGE_GROUP_ROLE_LABELS,
  normalizeImageGroupItems,
  parseImageGroupItems,
  type ImageGroupItem,
  type ImageGroupRole,
} from '../imageGroup';
import type { NodeBodyProps } from '../registry';

const MAX_IMAGES = 12;
const ROLES: ImageGroupRole[] = ['background', 'foreground', 'reference'];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file: File): Promise<string> {
  const image = await readAsDataUrl(file);
  const response = await apiFetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  if (!response.ok) throw new Error(`上传失败: ${response.status}`);
  const result = await response.json();
  if (!result.url) throw new Error('上传未返回图片地址');
  return result.url;
}

export default function ImageGroupBody({ id, def, pv, selected, updatePVs }: NodeBodyProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const { propagate } = useCanvasCallbacks();
  const items = useMemo(() => parseImageGroupItems(pv.items), [pv.items]);
  const selectedId = typeof pv.selected_id === 'string' ? pv.selected_id : items[0]?.id ?? null;
  const activeItem = items.find((item) => item.id === selectedId) ?? items[0];

  const syncItems = useCallback((nextItems: ImageGroupItem[], nextSelectedId?: string | null) => {
    const normalized = normalizeImageGroupItems(nextItems);
    const requestedSelectedId = nextSelectedId ?? null;
    const resolvedSelectedId = requestedSelectedId && normalized.some((item) => item.id === requestedSelectedId)
      ? requestedSelectedId
      : normalized[0]?.id ?? null;
    const values = {
      items: JSON.stringify(normalized),
      selected_id: resolvedSelectedId,
      ...createImageGroupOutputs(normalized, resolvedSelectedId),
    };
    updatePVs(values);
    propagate(id, { ...pv, ...values });
  }, [id, propagate, pv, updatePVs]);

  const addFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith('image/')).slice(0, MAX_IMAGES - items.length);
    if (accepted.length === 0 || uploading) return;
    setUploading(true);
    setError('');
    try {
      const results = await Promise.allSettled(accepted.map(uploadImage));
      const uploaded: ImageGroupItem[] = [];
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const combined = [...items, ...uploaded];
        const role: ImageGroupRole = !combined.some((item) => item.role === 'background')
          ? 'background'
          : !combined.some((item) => item.role === 'foreground')
            ? 'foreground'
            : 'reference';
        uploaded.push({ id: crypto.randomUUID(), url: result.value, role, name: accepted[index].name });
      });
      if (uploaded.length === 0) throw new Error('图片上传失败');
      syncItems([...items, ...uploaded], uploaded[0].id);
      if (uploaded.length !== accepted.length) setError('部分图片上传失败');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '图片上传失败');
    } finally {
      setUploading(false);
    }
  }, [items, syncItems, uploading]);

  const assignRole = useCallback((role: ImageGroupRole) => {
    if (!activeItem) return;
    const next = items.map((item) => {
      if (item.id === activeItem.id) return { ...item, role };
      if (role !== 'reference' && item.role === role) return { ...item, role: 'reference' as const };
      return item;
    });
    syncItems(next, activeItem.id);
  }, [activeItem, items, syncItems]);

  const removeItem = useCallback((itemId: string) => {
    const next = items.filter((item) => item.id !== itemId);
    syncItems(next, itemId === selectedId ? next[0]?.id : selectedId);
  }, [items, selectedId, syncItems]);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void addFiles(Array.from(event.dataTransfer.files));
  }, [addFiles]);

  return (
    <div className={`wf wf--image-group ${selected ? 'wf--selected' : ''} ${uploading ? 'wf--running' : ''}`}>
      <div className="wf__title wf__image-group-title">
        <span>{def.name}</span>
        <span className="wf__image-group-count">{items.length}/{MAX_IMAGES}</span>
      </div>

      <div className="wf__ports wf__image-group-ports">
        {def.outputs.map((output) => (
          <div className="wf__port-row" key={output.id}>
            <span className="wf__image-group-port-dot" style={{ background: PORT_COLORS[output.type] }} />
            <span className="wf__port-label">{output.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={`output-${output.id}`}
              className="wf__handle"
              style={{ background: PORT_COLORS[output.type] }}
            />
          </div>
        ))}
      </div>

      <div className="wf__image-group-content nodrag">
        {items.length > 0 ? (
          <div className="wf__image-group-grid">
            {items.map((item) => (
              <div
                key={item.id}
                className={`wf__image-group-item wf__image-group-item--${item.role} ${item.id === activeItem?.id ? 'wf__image-group-item--active' : ''}`}
              >
                <button
                  type="button"
                  className="wf__image-group-select"
                  onClick={() => syncItems(items, item.id)}
                  onDoubleClick={() => setLightboxSrc(item.url)}
                  title={`${item.name ?? '图片'} · ${IMAGE_GROUP_ROLE_LABELS[item.role]} · 双击查看`}
                >
                  <img src={item.url} alt={item.name ?? IMAGE_GROUP_ROLE_LABELS[item.role]} draggable={false} />
                  <span className="wf__image-group-role">{IMAGE_GROUP_ROLE_LABELS[item.role]}</span>
                </button>
                <button
                  type="button"
                  className="wf__image-group-remove"
                  title="移除图片"
                  onClick={() => removeItem(item.id)}
                >×</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="wf__image-group-empty">
            <span className="wf__image-group-empty-icon">▧</span>
            <span>放入底图、素材或参考图</span>
          </div>
        )}

        {activeItem && (
          <div className="wf__image-group-roles" aria-label="图片用途">
            {ROLES.map((role) => (
              <button
                type="button"
                key={role}
                className={`wf__image-group-role-btn wf__image-group-role-btn--${role} ${activeItem.role === role ? 'is-active' : ''}`}
                onClick={() => assignRole(role)}
              >
                {IMAGE_GROUP_ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        )}

        {items.length < MAX_IMAGES && (
          <button
            type="button"
            className="wf__image-group-add"
            disabled={uploading}
            onDrop={onDrop}
            onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onClick={() => fileRef.current?.click()}
          >
            <span>{uploading ? '上传中...' : items.length ? '添加图片' : '拖拽或点击上传'}</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void addFiles(Array.from(event.target.files));
            event.target.value = '';
          }}
        />
      </div>

      {error && <div className="wf__error">{error}</div>}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
