import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { PORT_COLORS } from '../constants';
import { getNodeDef } from '../nodes';
import { getNodeBody } from '../nodes/registry';
import type { CanvasNodeData } from '../types';
import type { ControlDef } from '../types/workflow';
import { useCanvasCallbacks } from './CanvasCallbacks';
import Lightbox from './Lightbox';
import {
  ImageEditControl,
  ImageUploadControl,
  ImageUploadMultiControl,
  NumberControl,
  SelectControl,
  TextControl,
} from './controls';

function WorkflowNode({ id, data, selected }: NodeProps<CanvasNodeData>) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { onChange, ctx, propagate } = useCanvasCallbacks();
  const def = data.defId ? getNodeDef(data.defId) : null;
  const pv = useMemo(() => data.portValues ?? {}, [data.portValues]);

  useEffect(() => () => clearTimeout(successTimer.current), []);

  const updatePV = useCallback((key: string, value: string | number | null) => {
    onChange(id, { portValues: { ...pv, [key]: value } });
  }, [onChange, id, pv]);

  const handleRun = useCallback(async () => {
    if (running || !def) return;
    setRunning(true);
    setError('');
    try {
      const inputs: Record<string, string | number | null> = {};
      for (const inp of def.inputs) inputs[inp.id] = pv[`input-${inp.id}`] ?? null;
      const ctrls: Record<string, string | number | null> = {};
      for (const c of def.controls) {
        ctrls[c.id] = pv[c.id] ?? null;
        if (c.kind === 'imageEdit') ctrls[`${c.id}_rect`] = pv[`${c.id}_rect`] ?? null;
      }
      const out = await ctx.execute(def.defId, inputs, ctrls);
      const next = { ...pv };
      for (const [k, v] of Object.entries(out)) next[`output-${k}`] = v;
      propagate(id, next);
      setSuccess(true);
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(false);
    }
  }, [running, def, ctx, id, pv, propagate]);

  const CustomBody = useMemo(() => (def ? getNodeBody(def.view) : null), [def]);

  if (!def) return <div className="wf wf--error">未知节点</div>;

  const renderCtrl = (ctrl: ControlDef) => {
    if (CustomBody && ctrl.kind === 'imageEdit') return null;
    switch (ctrl.kind) {
      case 'text':
        return <TextControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as string) ?? ctrl.default ?? ''} placeholder={ctrl.placeholder} multiline={ctrl.multiline} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'number':
        return <NumberControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as number) ?? ctrl.default ?? 0} min={ctrl.min} max={ctrl.max} step={ctrl.step} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'select':
        return <SelectControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as string) ?? ctrl.default ?? ctrl.options[0] ?? ''} options={ctrl.options} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'imageUpload':
        return <ImageUploadControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as string) ?? null} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'imageUploadMulti':
        return <ImageUploadMultiControl key={ctrl.id} id={ctrl.id} label={ctrl.label} max={ctrl.max} value={(pv[ctrl.id] as string) ?? null} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'imageEdit':
        return <ImageEditControl key={ctrl.id} id={ctrl.id} label={ctrl.label} imageSrc={(pv['input-image'] as string) ?? (pv[ctrl.id] as string) ?? null} rectValue={(pv[`${ctrl.id}_rect`] as string) ?? null} onImageChange={(v) => updatePV(ctrl.id, v)} onRectChange={(v) => updatePV(`${ctrl.id}_rect`, v)} />;
      default: return null;
    }
  };

  const maxPorts = Math.max(def.inputs.length, def.outputs.length);

  const renderPorts = () => maxPorts > 0 ? (
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
  ) : null;

  const renderFooter = () => (
    <div className="wf__footer">
      <button type="button" className={`wf__run ${running ? 'wf__run--spin' : ''}`} disabled={running} onClick={handleRun}>
        <span className="wf__run-icon">{running ? '⟳' : '✦'}</span>
        {running ? '运行中' : '运行'}
      </button>
    </div>
  );

  if (CustomBody) {
    // eslint-disable-next-line react-hooks/static-components -- CustomBody is a stable reference from registry
    return <CustomBody id={id} def={def} pv={pv} selected={!!selected} running={running} error={error} updatePV={updatePV} handleRun={handleRun} renderCtrl={renderCtrl} renderPorts={renderPorts} renderFooter={renderFooter} />;
  }

  /* ── Generic workflow node ── */
  return (
    <div className={`wf ${selected ? 'wf--selected' : ''} ${running ? 'wf--running' : ''} ${success ? 'wf--success' : ''} ${error ? 'wf--error-state' : ''}`}>
      <div className="wf__title">{def.name}</div>

      {renderPorts()}

      {def.controls.length > 0 && (
        <div className="wf__controls">
          {def.controls.map(renderCtrl)}
        </div>
      )}

      {(() => {
        const imgInputs = def.inputs.filter((p) => p.type === 'IMAGE');
        const imgOutputs = def.outputs.filter((p) => p.type === 'IMAGE');
        const hasAny = imgInputs.some((p) => pv[`input-${p.id}`] != null) || imgOutputs.some((p) => pv[`output-${p.id}`] != null);
        if (!hasAny) return null;
        return (
          <div className="wf__preview">
            {imgInputs.map((p) => pv[`input-${p.id}`] != null && <img key={p.id} src={pv[`input-${p.id}`] as string} alt={p.label} draggable={false} onClick={() => setLightboxSrc(pv[`input-${p.id}`] as string)} />)}
            {imgOutputs.map((p) => pv[`output-${p.id}`] != null && <img key={p.id} src={pv[`output-${p.id}`] as string} alt={p.label} draggable={false} onClick={() => setLightboxSrc(pv[`output-${p.id}`] as string)} />)}
          </div>
        );
      })()}

      {renderFooter()}

      {error && <div className="wf__error">{error}</div>}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

export default memo(WorkflowNode, (prev, next) => prev.data === next.data && prev.selected === next.selected);
