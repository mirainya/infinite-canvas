import { useMemo } from 'react';
import type { ControlDef } from '../../types/workflow';
import { CreativeNodeHeader, CreativeNodePorts, CreativeNodeSection } from './CreativeNodeParts';
import type { NodeBodyProps } from '../registry';

function countUrls(value: unknown): number {
  if (!value) return 0;
  if (Array.isArray(value)) return value.filter(Boolean).length;
  if (typeof value !== 'string') return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean).length : 1;
  } catch {
    return 1;
  }
}

export default function ImageGenBody({ def, pv, selected, running, error, handleRun, renderCtrl }: NodeBodyProps) {
  const controls = useMemo(() => new Map(def.controls.map((control) => [control.id, control])), [def.controls]);
  const render = (id: string) => {
    const control = controls.get(id) as ControlDef | undefined;
    return control ? renderCtrl(control) : null;
  };

  const prompt = typeof pv.prompt === 'string' ? pv.prompt.trim() : '';
  const referenceCount = countUrls(pv['input-image']) + countUrls(pv['input-images']) + countUrls(pv.ref_images);
  const count = typeof pv.count === 'number' ? pv.count : 1;
  const ready = prompt.length > 0;
  const status = running ? '绘制中' : ready ? `${count} 张` : '待填写';

  return (
    <div className={`wf wf--creative wf--draw ${selected ? 'wf--selected' : ''} ${running ? 'wf--running' : ''}`}>
      <CreativeNodeHeader
        title={def.name}
        eyebrow="图像生成"
        tone="draw"
        symbol="✦"
        status={status}
        statusActive={ready || running}
      />

      <CreativeNodePorts def={def} />

      <div className="wf__creative-body">
        <CreativeNodeSection className="wf__creative-model">
          {render('model')}
        </CreativeNodeSection>

        <CreativeNodeSection label={`参考图 ${referenceCount > 0 ? referenceCount : ''}`}>
          {render('ref_images')}
        </CreativeNodeSection>

        <CreativeNodeSection label="创作描述" className="wf__creative-prompt">
          {render('prompt')}
        </CreativeNodeSection>

        <div className="wf__creative-grid">
          {render('aspect_ratio')}
          {render('count')}
        </div>

        <details className="wf__creative-details nodrag">
          <summary>细节设置</summary>
          {render('negative_prompt')}
        </details>
      </div>

      <footer className="wf__creative-footer">
        <button
          type="button"
          className="wf__creative-run"
          disabled={running || !ready}
          onClick={handleRun}
        >
          <span aria-hidden="true">{running ? '⟳' : '✦'}</span>
          {running ? '绘制中' : '开始绘图'}
        </button>
      </footer>

      {error && <div className="wf__error">{error}</div>}
    </div>
  );
}
