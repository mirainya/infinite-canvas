import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { PORT_COLORS } from '../../constants';
import type { NodeBodyProps } from '../registry';

export default function ImageComposeBody({ id, def, pv, selected, running, error, handleRun, renderCtrl }: NodeBodyProps) {
  const [previewTab, setPreviewTab] = useState<'bg' | 'fg' | 'out'>('bg');

  const bgSrc = pv['input-background'] as string | undefined;
  const fgSrc = pv['input-foreground'] as string | undefined;
  const outSrc = pv['output-image'] as string | undefined;
  const maskSrc = pv['edit_area'] as string | undefined;
  const previewSrc = previewTab === 'out' && outSrc ? outSrc : previewTab === 'fg' && fgSrc ? fgSrc : bgSrc;
  const showMaskOverlay = previewTab === 'bg' && !!maskSrc;
  const maxPorts = Math.max(def.inputs.length, def.outputs.length);

  const openEditor = () => {
    if (!bgSrc) return;
    window.dispatchEvent(new CustomEvent('open-image-editor', {
      detail: { nodeId: id, imageSrc: bgSrc, maskOnly: true },
    }));
  };

  return (
    <div className={`wf wf--compose ${selected ? 'wf--selected' : ''}`}>
      <div className="wf__title">{def.name}</div>

      {maxPorts > 0 && (
        <div className="wf__ports">
          {Array.from({ length: maxPorts }, (_, i) => {
            const inp = def.inputs[i];
            const out = def.outputs[i];
            return (
              <div key={i} className="wf__port-row">
                <div className="wf__port-cell wf__port-cell--left">
                  {inp && (
                    <>
                      <Handle type="target" position={Position.Left} id={`input-${inp.id}`} className="wf__handle" style={{ background: PORT_COLORS[inp.type] }} />
                      <span className="wf__port-label">{inp.label}</span>
                    </>
                  )}
                </div>
                <div className="wf__port-cell wf__port-cell--right">
                  {out && (
                    <>
                      <span className="wf__port-label">{out.label}</span>
                      <Handle type="source" position={Position.Right} id={`output-${out.id}`} className="wf__handle" style={{ background: PORT_COLORS[out.type] }} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="wf__image-card nodrag" onClick={openEditor} style={{ position: 'relative' }}>
        {previewSrc ? (
          <>
            <img src={previewSrc} alt="preview" draggable={false} />
            {showMaskOverlay && (
              <img
                src={maskSrc}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', opacity: 0.35, mixBlendMode: 'screen',
                  pointerEvents: 'none',
                }}
              />
            )}
            {previewTab === 'bg' && <div className="wf__image-card-overlay"><span>{maskSrc ? '点击编辑区域' : '点击标记区域'}</span></div>}
          </>
        ) : (
          <div className="wf__image-card-empty">
            <span className="wf__image-card-icon">🖼</span>
            <span>连接底图后可预览</span>
          </div>
        )}
      </div>

      <div className="wf__compose-thumbs nodrag">
        <div className={`wf__compose-thumb ${previewTab === 'bg' ? 'wf__compose-thumb--active' : ''}`} onClick={() => setPreviewTab('bg')}>
          <span className="wf__compose-thumb-label">底图</span>
          {bgSrc ? <img src={bgSrc} alt="底图" draggable={false} /> : <span className="wf__compose-thumb-empty">—</span>}
        </div>
        <div className={`wf__compose-thumb ${previewTab === 'fg' ? 'wf__compose-thumb--active' : ''}`} onClick={() => setPreviewTab('fg')}>
          <span className="wf__compose-thumb-label">素材</span>
          {fgSrc ? <img src={fgSrc} alt="素材" draggable={false} /> : <span className="wf__compose-thumb-empty">—</span>}
        </div>
        {outSrc && (
          <div className={`wf__compose-thumb ${previewTab === 'out' ? 'wf__compose-thumb--active' : ''}`} onClick={() => setPreviewTab('out')}>
            <span className="wf__compose-thumb-label">结果</span>
            <img src={outSrc} alt="结果" draggable={false} />
          </div>
        )}
      </div>

      {def.controls.filter((c) => c.kind !== 'imageEdit').length > 0 && (
        <div className="wf__controls">
          {def.controls.map(renderCtrl)}
        </div>
      )}

      <div className="wf__footer">
        <button type="button" className={`wf__run ${running ? 'wf__run--spin' : ''}`} disabled={running} onClick={handleRun}>
          <span className="wf__run-icon">{running ? '⟳' : '✦'}</span>
          {running ? '运行中' : '运行'}
        </button>
      </div>

      {error && <div className="wf__error">{error}</div>}
    </div>
  );
}
