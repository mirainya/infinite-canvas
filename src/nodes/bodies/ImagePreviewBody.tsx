import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { PORT_COLORS } from '../../constants';
import Lightbox from '../../components/Lightbox';
import type { NodeBodyProps } from '../registry';

export default function ImagePreviewBody({ def, pv, selected }: NodeBodyProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const imgSrc = (pv['input-image'] as string) ?? (pv['output-image'] as string) ?? null;
  const maxPorts = Math.max(def.inputs.length, def.outputs.length);

  return (
    <div className={`wf wf--preview ${selected ? 'wf--selected' : ''}`}>
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

      <div className="wf__preview-area nodrag">
        {imgSrc ? (
          <img src={imgSrc} alt="预览" draggable={false} onClick={() => setLightboxSrc(imgSrc)} />
        ) : (
          <div className="wf__preview-empty">
            <span className="wf__preview-icon">🖼</span>
            <span>连接上游图片</span>
          </div>
        )}
      </div>

      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
