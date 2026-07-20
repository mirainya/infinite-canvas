import { useEffect, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { downloadImage } from '../download';

export default function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleDownload = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    setError('');
    try {
      await downloadImage(src);
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox__toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox__tool" title="下载图片" aria-label="下载图片" disabled={downloading} onClick={handleDownload}>
          {downloading ? '…' : '↓'}
        </button>
        <button type="button" className="lightbox__tool" title="关闭" aria-label="关闭" onClick={onClose}>×</button>
      </div>
      <img className="lightbox__img" src={src} alt={alt} onClick={(e) => e.stopPropagation()} draggable={false} />
      {error && <div className="lightbox__error" role="alert" onClick={(e) => e.stopPropagation()}>{error}</div>}
    </div>,
    document.body,
  );
}
