import { Handle, Position } from 'reactflow';
import { PORT_COLORS } from '../../constants';
import type { NodeBodyProps } from '../registry';

export default function ImageEditBody({ id, def, pv, selected, running, error, updatePV, handleRun, renderCtrl }: NodeBodyProps) {
  const imgSrc = (pv['output-image'] as string) ?? (pv['input-image'] as string) ?? null;
  const maxPorts = Math.max(def.inputs.length, def.outputs.length);

  const openEditor = () => {
    if (!imgSrc) return;
    window.dispatchEvent(new CustomEvent('open-image-editor', {
      detail: { nodeId: id, imageSrc: imgSrc },
    }));
  };

  return (
    <div className={`wf wf--image-edit ${selected ? 'wf--selected' : ''}`}>
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

      <div className="wf__image-card nodrag" onClick={openEditor}>
        {imgSrc ? (
          <>
            <img src={imgSrc} alt="preview" draggable={false} />
            <div className="wf__image-card-overlay"><span>点击编辑</span></div>
          </>
        ) : (
          <div className="wf__image-card-empty">
            <span className="wf__image-card-icon">🖼</span>
            <span>连接上游图片或上传</span>
            <input
              type="file"
              accept="image/*"
              hidden
              id={`upload-${id}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => updatePV('input-image', reader.result as string);
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="wf__image-card-upload"
              onClick={(e) => { e.stopPropagation(); document.getElementById(`upload-${id}`)?.click(); }}
            >
              上传图片
            </button>
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
