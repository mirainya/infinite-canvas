import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <img className="lightbox__img" src={src} alt={alt} onClick={(e) => e.stopPropagation()} draggable={false} />
    </div>,
    document.body,
  );
}
