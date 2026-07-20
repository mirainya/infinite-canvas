import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { PORT_COLORS } from '../constants';
import { getNodeDef } from '../nodes';
import { getNodeBody } from '../nodes/registry';
import type { CanvasNodeData } from '../types';
import type { ControlDef, ExecuteStatus, PortValues } from '../types/workflow';
import { useCanvasCallbacks } from './CanvasCallbacks';
import Lightbox from './Lightbox';
import {
  ImageEditControl,
  ImageUploadControl,
  ImageUploadMultiControl,
  ModelControl,
  NumberControl,
  PromptListControl,
  SelectControl,
  TemplateControl,
  TextControl,
} from './controls';
import StepOutputDisplay from './controls/StepOutputDisplay';

const AUTO_PREVIEW_SOURCE_IDS = new Set(['image-gen', 'image-edit', 'image-compose']);

/* ── Product-photos 逐步执行辅助 ── */

function ppStepIndex(pv: PortValues): number {
  return typeof pv['_step_index'] === 'number' ? pv['_step_index'] : 0;
}
function ppTotalSteps(pv: PortValues): number {
  return typeof pv['_total_steps'] === 'number' ? pv['_total_steps'] : 0;
}
function ppStepNames(pv: PortValues): string[] {
  try {
    const raw = pv['_step_names'];
    return raw ? JSON.parse(raw as string) : [];
  } catch { return []; }
}
function ppHasPromptsList(pv: PortValues): boolean {
  const raw = pv['prompts_list'];
  if (!raw) return false;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) && arr.length > 0;
  } catch { return false; }
}
function ppStepOutputs(pv: PortValues): string[] {
  try {
    const raw = pv['_step_outputs'];
    return raw ? JSON.parse(raw as string) : [];
  } catch { return []; }
}

function WorkflowNode({ id, data, selected }: NodeProps<CanvasNodeData>) {
  const [running, setRunning] = useState(false);
  const [execStatus, setExecStatus] = useState<ExecuteStatus | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { onChange, ctx, propagate, spawnPreviewNode } = useCanvasCallbacks();
  const def = data.defId ? getNodeDef(data.defId) : null;
  const pv = useMemo(() => data.portValues ?? {}, [data.portValues]);

  useEffect(() => () => clearTimeout(successTimer.current), []);

  const updatePV = useCallback((key: string, value: string | number | null) => {
    onChange(id, { portValues: { ...pv, [key]: value } });
  }, [onChange, id, pv]);

  const updatePVs = useCallback((values: PortValues) => {
    onChange(id, { portValues: { ...pv, ...values } });
  }, [onChange, id, pv]);

  const isProductPhotos = def?.defId === 'product-photos';

  const handleRun = useCallback(async () => {
    if (running || !def) return;
    setRunning(true);
    setError('');
    setExecStatus('queued');
    try {
      const inputs: PortValues = {};
      for (const inp of def.inputs) inputs[inp.id] = pv[`input-${inp.id}`] ?? null;
      const ctrls: PortValues = {};
      for (const c of def.controls) {
        ctrls[c.id] = pv[c.id] ?? null;
        if (c.kind === 'imageEdit') ctrls[`${c.id}_rect`] = pv[`${c.id}_rect`] ?? null;
      }

      if (isProductPhotos) {
        const stepIdx = ppStepIndex(pv);
        const total = ppTotalSteps(pv);
        const hasPrompts = ppHasPromptsList(pv);

        if (hasPrompts && stepIdx >= total && total > 0) {
          // 最终阶段：生成图片
          ctrls['phase'] = 'images';
          ctrls['prompts_list'] = pv['prompts_list'] as string;
        } else if (total === 0) {
          // 首次：加载步骤信息 + 执行第一步
          ctrls['phase'] = 'load_steps';
        } else {
          // 执行当前步骤
          ctrls['phase'] = 'step';
          ctrls['step_index'] = stepIdx;
          const outputs = ppStepOutputs(pv);
          ctrls['prev_output'] = stepIdx > 0 ? (outputs[stepIdx - 1] || '') : '';
        }
      }

      const exec = ctx.executeStream
        ? (d: string, i: PortValues, c: PortValues) => ctx.executeStream!(d, i, c, setExecStatus)
        : ctx.execute;

      let out = await exec(def.defId, inputs, ctrls);
      const next = { ...pv };

      if (isProductPhotos) {
        const phase = ctrls['phase'] as string;

        if (phase === 'load_steps') {
          // 收到步骤信息，存下来，然后自动执行第一步
          const total = (out as Record<string, unknown>)['total'] as number;
          const stepsInfo = (out as Record<string, unknown>)['steps'] as { name: string }[];
          next['_total_steps'] = total;
          next['_step_names'] = JSON.stringify(stepsInfo.map((s) => s.name));
          next['_step_index'] = 0;
          next['_step_outputs'] = '[]';
          next['prompts_list'] = null;

          // 自动执行 step 0
          const stepCtrls = { ...ctrls };
          stepCtrls['phase'] = 'step';
          stepCtrls['step_index'] = 0;
          stepCtrls['prev_output'] = '';
          out = await exec(def.defId, inputs, stepCtrls);

          const stepOutput = (out as Record<string, unknown>)['step_output'] as string;
          next['_step_outputs'] = JSON.stringify([stepOutput]);
          next['_step_index'] = 1;

          if ((out as Record<string, unknown>)['prompts_list']) {
            const list = (out as Record<string, unknown>)['prompts_list'];
            next['prompts_list'] = typeof list === 'string' ? list : JSON.stringify(list);
          }
        } else if (phase === 'step') {
          const stepOutput = (out as Record<string, unknown>)['step_output'] as string;
          const outputs = ppStepOutputs(pv);
          outputs.push(stepOutput);
          next['_step_outputs'] = JSON.stringify(outputs);
          next['_step_index'] = ppStepIndex(pv) + 1;

          if ((out as Record<string, unknown>)['prompts_list']) {
            const list = (out as Record<string, unknown>)['prompts_list'];
            next['prompts_list'] = typeof list === 'string' ? list : JSON.stringify(list);
          }
        } else if (phase === 'images') {
          for (const [k, v] of Object.entries(out)) next[`output-${k}`] = v;
        }
      } else {
        for (const [k, v] of Object.entries(out)) next[`output-${k}`] = v;
      }

      propagate(id, next);
      if (!isProductPhotos || ctrls['phase'] === 'images') {
        spawnPreviewNode(id, next);
      }
      setSuccess(true);
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(false);
      setExecStatus(null);
      window.dispatchEvent(new Event('credits-changed'));
    }
  }, [running, def, ctx, id, pv, propagate, spawnPreviewNode, isProductPhotos]);

  const handleReset = useCallback(() => {
    const next = { ...pv };
    next['_step_index'] = 0;
    next['_total_steps'] = 0;
    next['_step_outputs'] = '[]';
    next['_step_names'] = '[]';
    next['prompts_list'] = null;
    delete next['output-images'];
    delete next['output-prompts'];
    propagate(id, next);
    setError('');
  }, [pv, propagate, id]);

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
      case 'model':
        return <ModelControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as string) ?? ''} modelType={ctrl.modelType} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'template':
        return <TemplateControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as string) ?? ''} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'imageUpload':
        return <ImageUploadControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as string) ?? null} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'imageUploadMulti':
        return <ImageUploadMultiControl key={ctrl.id} id={ctrl.id} label={ctrl.label} max={ctrl.max} value={(pv[ctrl.id] as string) ?? null} onChange={(v) => updatePV(ctrl.id, v)} />;
      case 'imageEdit':
        return <ImageEditControl key={ctrl.id} id={ctrl.id} label={ctrl.label} imageSrc={(pv['input-image'] as string) ?? (pv[ctrl.id] as string) ?? null} rectValue={(pv[`${ctrl.id}_rect`] as string) ?? null} onImageChange={(v) => updatePV(ctrl.id, v)} onRectChange={(v) => updatePV(`${ctrl.id}_rect`, v)} />;
      case 'promptList':
        return <PromptListControl key={ctrl.id} id={ctrl.id} label={ctrl.label} value={(pv[ctrl.id] as string) ?? null} onChange={(v) => updatePV(ctrl.id, v)} />;
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

  const statusLabel = execStatus === 'queued' ? '排队中' : execStatus === 'running' ? '执行中' : null;

  const renderFooter = () => {
    let buttonLabel = statusLabel || '运行';
    if (!statusLabel && isProductPhotos) {
      const stepIdx = ppStepIndex(pv);
      const total = ppTotalSteps(pv);
      const hasPrompts = ppHasPromptsList(pv);
      const names = ppStepNames(pv);

      if (hasPrompts && stepIdx >= total && total > 0) {
        buttonLabel = '生成图片';
      } else if (total === 0) {
        buttonLabel = '开始';
      } else {
        const name = names[stepIdx] || `步骤${stepIdx + 1}`;
        buttonLabel = `${stepIdx + 1}/${total}: ${name}`;
      }
    }

    const showReset = isProductPhotos && ppTotalSteps(pv) > 0;

    return (
      <div className="wf__footer">
        {showReset && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
            <button type="button" className="wf__reset-btn" onClick={handleReset} disabled={running}>重置</button>
          </div>
        )}
        <button type="button" className={`wf__run ${running ? 'wf__run--spin' : ''}`} disabled={running} onClick={handleRun}>
          <span className="wf__run-icon">{running ? '⟳' : '✦'}</span>
          {buttonLabel}
        </button>
      </div>
    );
  };

  if (CustomBody) {
    return <CustomBody id={id} def={def} pv={pv} selected={!!selected} running={running} error={error} updatePV={updatePV} updatePVs={updatePVs} handleRun={handleRun} renderCtrl={renderCtrl} renderPorts={renderPorts} renderFooter={renderFooter} />;
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

      {/* Product-photos: 步骤输出展示 */}
      {isProductPhotos && (
        <StepOutputDisplay
          stepsJson={(pv['_step_outputs'] as string) ?? null}
          stepNames={(pv['_step_names'] as string) ?? null}
        />
      )}

      {/* Product-photos: 提示词列表编辑 */}
      {isProductPhotos && ppHasPromptsList(pv) && (
        <div className="wf__controls">
          <PromptListControl
            id="prompts_list"
            label="提示词列表"
            value={(pv['prompts_list'] as string) ?? null}
            onChange={(v) => updatePV('prompts_list', v)}
          />
        </div>
      )}

      {(() => {
        const imgInputs = def.inputs.filter((p) => p.type === 'IMAGE');
        const imgOutputs = def.outputs.filter((p) => p.type === 'IMAGE');
        const visibleImgOutputs = AUTO_PREVIEW_SOURCE_IDS.has(def.defId) ? [] : imgOutputs;
        const hasAny = imgInputs.some((p) => pv[`input-${p.id}`] != null) || visibleImgOutputs.some((p) => pv[`output-${p.id}`] != null);
        if (!hasAny) return null;
        return (
          <div className="wf__preview">
            {imgInputs.map((p) => pv[`input-${p.id}`] != null && <img key={p.id} src={pv[`input-${p.id}`] as string} alt={p.label} draggable={false} onClick={() => setLightboxSrc(pv[`input-${p.id}`] as string)} />)}
            {visibleImgOutputs.map((p) => pv[`output-${p.id}`] != null && <img key={p.id} src={pv[`output-${p.id}`] as string} alt={p.label} draggable={false} onClick={() => setLightboxSrc(pv[`output-${p.id}`] as string)} />)}
          </div>
        );
      })()}

      {(() => {
        const listOutputs = def.outputs.filter((p) => p.type === 'IMAGE_LIST');
        for (const p of listOutputs) {
          const raw = pv[`output-${p.id}`];
          if (!raw) continue;
          let urls: string[] = [];
          try {
            urls = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : [];
          } catch { /* ignore */ }
          if (!urls.length) continue;
          return (
            <div className="wf__preview wf__preview--grid">
              {urls.slice(0, 20).map((url, i) => <img key={i} src={url} alt={`${i + 1}`} draggable={false} onClick={() => setLightboxSrc(url)} />)}
              {urls.length > 20 && <span className="wf__preview-more">+{urls.length - 20}</span>}
            </div>
          );
        }
        return null;
      })()}

      {(() => {
        if (isProductPhotos) return null;
        const textOutputs = def.outputs.filter((p) => p.type === 'STRING' || p.type === 'TEXT');
        const texts = textOutputs.map((p) => ({ label: p.label, value: pv[`output-${p.id}`] })).filter((t) => t.value);
        if (!texts.length) return null;
        return (
          <div className="wf__text-preview">
            {texts.map((t, i) => <div key={i} className="wf__text-preview-item" title={String(t.value)}>{String(t.value).slice(0, 200)}{String(t.value).length > 200 ? '...' : ''}</div>)}
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
