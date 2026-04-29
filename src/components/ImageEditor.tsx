import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { SystemContext } from '../types/workflow';

/* ── Types ── */
export type ImageEditorProps = {
  imageSrc: string;
  nodeId: string;
  ctx: SystemContext;
  maskOnly?: boolean;
  onClose: (resultUrl?: string) => void;
};

type Tool = 'rect' | 'lasso' | 'brush';
type Action = 'erase' | 'replace' | 'add' | 'extract';
type Point = { x: number; y: number };

type HistoryStep = {
  id: string;
  label: string;
  imageUrl: string;
  timestamp: number;
};

/* ── Component ── */
export default function ImageEditor({ imageSrc, nodeId: _nodeId, ctx, maskOnly, onClose }: ImageEditorProps) {
  /* state */
  const [currentImage, setCurrentImage] = useState(imageSrc);
  const [tool, setTool] = useState<Tool>('rect');
  const [action, setAction] = useState<Action>('replace');
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [brushSize, setBrushSize] = useState(30);
  const [maskPreview, setMaskPreview] = useState<string | null>(null);

  /* selection state */
  const [rectSel, setRectSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [brushStrokes, setBrushStrokes] = useState<Point[][]>([]);

  /* history */
  const [history, setHistory] = useState<HistoryStep[]>(() => [{
    id: 'initial',
    label: '原图',
    imageUrl: imageSrc,
    timestamp: Date.now(),
  }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  /* refs */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const startPos = useRef<Point>({ x: 0, y: 0 });
  const currentLasso = useRef<Point[]>([]);
  const currentBrush = useRef<Point[]>([]);

  /* image dimensions for canvas */
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [canvasRect, setCanvasRect] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  /* load image */
  useEffect(() => {
    const img = new Image();
    // only set crossOrigin for remote URLs, not data URIs
    if (!currentImage.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      // retry without crossOrigin if it failed
      const retry = new Image();
      retry.onload = () => {
        imgRef.current = retry;
        setImgSize({ w: retry.naturalWidth, h: retry.naturalHeight });
      };
      retry.src = currentImage;
    };
    img.src = currentImage;
  }, [currentImage]);

  /* fit canvas to container */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setCanvasRect({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* compute display scale */
  const display = useMemo(() => {
    if (!imgSize.w || !imgSize.h) return { scale: 1, ox: 0, oy: 0, dw: 0, dh: 0 };
    const scale = Math.min(canvasRect.w / imgSize.w, canvasRect.h / imgSize.h, 1);
    const dw = imgSize.w * scale;
    const dh = imgSize.h * scale;
    const ox = (canvasRect.w - dw) / 2;
    const oy = (canvasRect.h - dh) / 2;
    return { scale, ox, oy, dw, dh };
  }, [imgSize, canvasRect]);

  /* draw main canvas */
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgSize.w) return;
    canvas.width = canvasRect.w;
    canvas.height = canvasRect.h;
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, display.ox, display.oy, display.dw, display.dh);
  }, [imgSize, canvasRect, display, currentImage]);

  /* has selection */
  const hasSelection = (rectSel && rectSel.w > 4 && rectSel.h > 4) || lassoPoints.length > 2 || brushStrokes.length > 0;

  /* draw overlay (selection) */
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.width = canvasRect.w;
    canvas.height = canvasRect.h;
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, canvas.width, canvas.height);

    // only draw dim mask when there IS a selection
    if (!hasSelection) return;

    // dim outside selection
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 0, canvas.width, canvas.height);

    c.globalCompositeOperation = 'destination-out';

    if (rectSel && rectSel.w > 2 && rectSel.h > 2) {
      c.fillStyle = 'white';
      c.fillRect(rectSel.x, rectSel.y, rectSel.w, rectSel.h);
    }

    if (lassoPoints.length > 2) {
      c.fillStyle = 'white';
      c.beginPath();
      c.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) c.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      c.closePath();
      c.fill();
    }

    if (brushStrokes.length > 0) {
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = 'white';
      c.lineWidth = brushSize;
      for (const stroke of brushStrokes) {
        if (stroke.length < 2) continue;
        c.beginPath();
        c.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) c.lineTo(stroke[i].x, stroke[i].y);
        c.stroke();
      }
    }

    c.globalCompositeOperation = 'source-over';

    // draw selection border
    if (rectSel && rectSel.w > 2 && rectSel.h > 2) {
      c.strokeStyle = '#8b5cf6';
      c.lineWidth = 2;
      c.setLineDash([6, 4]);
      c.strokeRect(rectSel.x, rectSel.y, rectSel.w, rectSel.h);
      c.setLineDash([]);
    }

    if (lassoPoints.length > 2) {
      c.strokeStyle = '#8b5cf6';
      c.lineWidth = 2;
      c.setLineDash([6, 4]);
      c.beginPath();
      c.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) c.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      c.closePath();
      c.stroke();
      c.setLineDash([]);
    }
  }, [hasSelection, rectSel, lassoPoints, brushStrokes, brushSize, canvasRect]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  /* clear selection */
  const clearSelection = useCallback(() => {
    setRectSel(null);
    setLassoPoints([]);
    setBrushStrokes([]);
    currentLasso.current = [];
    currentBrush.current = [];
  }, []);

  /* mouse handlers */
  const getPos = useCallback((e: MouseEvent): Point => {
    const canvas = overlayRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const onMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    drawing.current = true;
    const p = getPos(e);
    startPos.current = p;

    if (tool === 'rect') {
      setRectSel(null);
      setLassoPoints([]);
      setBrushStrokes([]);
    } else if (tool === 'lasso') {
      currentLasso.current = [p];
      setLassoPoints([p]);
      setRectSel(null);
      setBrushStrokes([]);
    } else if (tool === 'brush') {
      currentBrush.current = [p];
      setBrushStrokes((prev) => [...prev, [p]]);
      setRectSel(null);
      setLassoPoints([]);
    }
  }, [tool, getPos]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drawing.current) return;
    const p = getPos(e);

    if (tool === 'rect') {
      const sx = startPos.current.x;
      const sy = startPos.current.y;
      setRectSel({ x: Math.min(sx, p.x), y: Math.min(sy, p.y), w: Math.abs(p.x - sx), h: Math.abs(p.y - sy) });
    } else if (tool === 'lasso') {
      currentLasso.current.push(p);
      setLassoPoints([...currentLasso.current]);
    } else if (tool === 'brush') {
      currentBrush.current.push(p);
      setBrushStrokes((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = [...currentBrush.current];
        return copy;
      });
    }
  }, [tool, getPos]);

  const onMouseUp = useCallback(() => {
    drawing.current = false;
    if (tool === 'lasso' && currentLasso.current.length > 2) {
      setLassoPoints([...currentLasso.current]);
    }
    if (tool === 'brush') {
      currentBrush.current = [];
    }
  }, [tool]);

  /* generate mask from selection */
  const generateMask = useCallback((): string | null => {
    if (!hasSelection || !imgSize.w) return null;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = imgSize.w;
    maskCanvas.height = imgSize.h;
    const c = maskCanvas.getContext('2d')!;
    // black background (keep), white = edit area
    c.fillStyle = 'black';
    c.fillRect(0, 0, imgSize.w, imgSize.h);
    c.fillStyle = 'white';

    const { scale, ox, oy } = display;
    const toImg = (p: Point) => ({ x: (p.x - ox) / scale, y: (p.y - oy) / scale });

    if (rectSel && rectSel.w > 4 && rectSel.h > 4) {
      const tl = toImg({ x: rectSel.x, y: rectSel.y });
      const br = toImg({ x: rectSel.x + rectSel.w, y: rectSel.y + rectSel.h });
      c.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }

    if (lassoPoints.length > 2) {
      c.beginPath();
      const p0 = toImg(lassoPoints[0]);
      c.moveTo(p0.x, p0.y);
      for (let i = 1; i < lassoPoints.length; i++) {
        const pi = toImg(lassoPoints[i]);
        c.lineTo(pi.x, pi.y);
      }
      c.closePath();
      c.fill();
    }

    if (brushStrokes.length > 0) {
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = 'white';
      c.lineWidth = brushSize / scale;
      for (const stroke of brushStrokes) {
        if (stroke.length < 2) continue;
        c.beginPath();
        const s0 = toImg(stroke[0]);
        c.moveTo(s0.x, s0.y);
        for (let i = 1; i < stroke.length; i++) {
          const si = toImg(stroke[i]);
          c.lineTo(si.x, si.y);
        }
        c.stroke();
      }
    }

    return maskCanvas.toDataURL('image/png');
  }, [hasSelection, imgSize, display, rectSel, lassoPoints, brushStrokes, brushSize]);

  /* execute AI action */
  const executeAction = useCallback(async () => {
    setRunning(true);
    setError('');

    const mask = generateMask();
    const actionLabels: Record<Action, string> = { erase: '擦除', replace: '替换', add: '添加', extract: '扣图' };

    try {
      const controls: Record<string, string | number | null> = {
        action,
        edit_prompt: action === 'erase'
          ? '移除选中区域的内容，用周围背景自然填充'
          : prompt || '',   // 空提示词交给后端 meta-prompt 自动生成
      };
      if (mask) controls.mask = mask;

      const result = await ctx.execute('image-edit', { image: currentImage }, controls);
      const newUrl = (result as Record<string, string>).image;
      if (!newUrl) throw new Error('未返回图片');

      setCurrentImage(newUrl);
      clearSelection();
      setPrompt('');

      const step: HistoryStep = {
        id: `${Date.now()}`,
        label: actionLabels[action],
        imageUrl: newUrl,
        timestamp: Date.now(),
      };
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        return [...trimmed, step];
      });
      setHistoryIndex((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setRunning(false);
    }
  }, [action, prompt, currentImage, ctx, generateMask, clearSelection, historyIndex]);

  /* history navigation */
  const goToHistory = useCallback((index: number) => {
    if (index < 0 || index >= history.length) return;
    setHistoryIndex(index);
    setCurrentImage(history[index].imageUrl);
    clearSelection();
  }, [history, clearSelection]);

  /* keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z') { e.preventDefault(); goToHistory(historyIndex - 1); }
      if (mod && e.key === 'y') { e.preventDefault(); goToHistory(historyIndex + 1); }
      if (e.key === '1') setTool('rect');
      if (e.key === '2') setTool('lasso');
      if (e.key === '3') setTool('brush');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, currentImage, goToHistory, historyIndex]);

  /* close & return result */
  const handleClose = useCallback(() => {
    onClose(currentImage);
  }, [onClose, currentImage]);

  const confirmMask = useCallback(() => {
    const mask = generateMask();
    onClose(mask ?? undefined);
  }, [generateMask, onClose]);

  const actionNeedsPrompt = action !== 'erase';

  return createPortal(
    <div className="image-editor">
      {/* Top bar */}
      <div className="image-editor__topbar">
        <button type="button" className="image-editor__back" onClick={handleClose}>← 返回</button>
        <span className="image-editor__topbar-title">{maskOnly ? '标记区域' : 'AI 改图'}</span>
        <button type="button" className="image-editor__close" onClick={handleClose}>✕</button>
      </div>

      <div className="image-editor__body">
        {/* Left toolbar */}
        <div className="image-editor__toolbar">
          <button
            type="button"
            className={`image-editor__tool ${tool === 'rect' ? 'image-editor__tool--active' : ''}`}
            onClick={() => setTool('rect')}
            title="框选 (1)"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/></svg>
          </button>
          <button
            type="button"
            className={`image-editor__tool ${tool === 'lasso' ? 'image-editor__tool--active' : ''}`}
            onClick={() => setTool('lasso')}
            title="套索 (2)"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 15 Q2 10 5 5 Q8 2 12 4 Q16 6 15 11 Q14 15 10 16 Q7 17 5 15Z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
          </button>
          <button
            type="button"
            className={`image-editor__tool ${tool === 'brush' ? 'image-editor__tool--active' : ''}`}
            onClick={() => setTool('brush')}
            title="画笔 (3)"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg>
          </button>

          {tool === 'brush' && (
            <div className="image-editor__brush-size">
              <input
                type="range"
                min="5"
                max="80"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="image-editor__brush-slider"
              />
              <span className="image-editor__brush-label">{brushSize}</span>
            </div>
          )}

          <div className="image-editor__tool-divider" />
          <button type="button" className="image-editor__tool" onClick={clearSelection} title="清除选区">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Canvas area */}
        <div className="image-editor__canvas-wrap" ref={containerRef}>
          <canvas ref={canvasRef} className="image-editor__canvas" />
          <canvas
            ref={overlayRef}
            className="image-editor__overlay"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          {running && (
            <div className="image-editor__loading">
              <div className="image-editor__spinner" />
              <span>AI 处理中...</span>
            </div>
          )}
        </div>

        {/* History panel */}
        {!maskOnly && (
        <div className="image-editor__history">
          <div className="image-editor__history-title">历史记录</div>
          <div className="image-editor__history-list">
            {history.map((step, i) => (
              <button
                key={step.id}
                type="button"
                className={`image-editor__history-item ${i === historyIndex ? 'image-editor__history-item--active' : ''}`}
                onClick={() => goToHistory(i)}
              >
                <img src={step.imageUrl} alt={step.label} className="image-editor__history-thumb" />
                <div className="image-editor__history-info">
                  <span className="image-editor__history-label">{step.label}</span>
                  <span className="image-editor__history-time">
                    {new Date(step.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="image-editor__actions">
        {maskOnly ? (
          <div className="image-editor__prompt-area">
            <span style={{ color: '#aaa', fontSize: 12 }}>在底图上标记素材放置区域（白色=放置区域）</span>
            <button
              type="button"
              className="image-editor__execute"
              disabled={!hasSelection}
              onClick={confirmMask}
            >
              确认区域
            </button>
            <button
              type="button"
              className="image-editor__execute"
              style={{ marginLeft: 4, background: '#555', fontSize: 12 }}
              disabled={!hasSelection}
              onClick={() => { const m = generateMask(); setMaskPreview(m); }}
            >
              预览
            </button>
          </div>
        ) : (
          <>
            <div className="image-editor__action-btns">
              {(['erase', 'replace', 'add', 'extract'] as Action[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`image-editor__action-btn ${action === a ? 'image-editor__action-btn--active' : ''}`}
                  onClick={() => setAction(a)}
                >
                  {{ erase: '擦除', replace: '替换', add: '添加', extract: '扣图' }[a]}
                </button>
              ))}
            </div>

            <div className="image-editor__prompt-area">
              {actionNeedsPrompt && (
                <input
                  type="text"
                  className="image-editor__prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    action === 'replace' ? '替换为...' :
                    action === 'add' ? '添加什么...' :
                    action === 'extract' ? '提取描述...' : ''
                  }
                  onKeyDown={(e) => { if (e.key === 'Enter' && !running) executeAction(); }}
                />
              )}
              <button
                type="button"
                className="image-editor__execute"
                disabled={running || (!hasSelection && action !== 'add')}
                onClick={executeAction}
              >
                {running ? '处理中...' : (actionNeedsPrompt && !prompt.trim() ? '智能生成' : '执行')}
              </button>
              <button
                type="button"
                className="image-editor__execute"
                style={{ marginLeft: 4, background: '#555', fontSize: 12 }}
                disabled={!hasSelection}
                onClick={() => { const m = generateMask(); setMaskPreview(m); }}
              >
                预览Mask
              </button>
            </div>
          </>
        )}

        {maskPreview && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0,0,0,0.7)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
            }}
            onClick={() => setMaskPreview(null)}
          >
            <div style={{ color: '#fff', fontSize: 14 }}>
              Mask 预览（黑=保留 白=编辑区域）— 点击关闭
            </div>
            <img
              src={maskPreview}
              alt="mask preview"
              style={{ maxWidth: '80vw', maxHeight: '70vh', border: '2px solid #fff', imageRendering: 'pixelated' }}
            />
            <div style={{ color: '#aaa', fontSize: 12 }}>
              原图尺寸: {imgSize.w}×{imgSize.h} | Canvas: {canvasRect.w}×{canvasRect.h} | Scale: {display.scale.toFixed(3)} | Offset: ({display.ox.toFixed(1)}, {display.oy.toFixed(1)})
            </div>
          </div>
        )}

        {error && <div className="image-editor__error">{error}</div>}
      </div>
    </div>,
    document.body,
  );
}
