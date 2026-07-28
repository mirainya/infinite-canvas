import { useMemo, useState } from 'react';
import type { ControlDef } from '../../types/workflow';
import type { NodeBodyProps } from '../registry';
import { CreativeNodeHeader, CreativeNodePorts, CreativeNodeSection } from './CreativeNodeParts';

type PreviewTab = 'background' | 'foreground' | 'result';

export default function ImageComposeBody({
  id,
  def,
  pv,
  selected,
  running,
  error,
  handleRun,
  renderCtrl,
}: NodeBodyProps) {
  const [previewTab, setPreviewTab] = useState<PreviewTab>('background');
  const controls = useMemo(() => new Map(def.controls.map((control) => [control.id, control])), [def.controls]);
  const render = (controlId: string) => {
    const control = controls.get(controlId) as ControlDef | undefined;
    return control ? renderCtrl(control) : null;
  };

  const background = pv['input-background'] as string | undefined;
  const foreground = pv['input-foreground'] as string | undefined;
  const result = pv['output-image'] as string | undefined;
  const mask = pv.edit_area as string | undefined;
  const ready = !!background && !!foreground;
  const status = running ? '合成中' : result ? '已有结果' : ready ? '可以合成' : '待输入';
  const preview = previewTab === 'background' ? background : previewTab === 'foreground' ? foreground : result;
  const emptyPreviewLabel =
    previewTab === 'background' ? '暂无底图' : previewTab === 'foreground' ? '暂无素材' : '暂无结果';

  const openMaskEditor = () => {
    if (!background || previewTab !== 'background') return;
    window.dispatchEvent(
      new CustomEvent('open-image-editor', {
        detail: { nodeId: id, imageSrc: background, maskOnly: true },
      }),
    );
  };

  const tabs: Array<{ id: PreviewTab; label: string; src?: string }> = [
    { id: 'background', label: '底图', src: background },
    { id: 'foreground', label: '素材', src: foreground },
    ...(result ? [{ id: 'result' as const, label: '结果', src: result }] : []),
  ];

  return (
    <div className={`wf wf--creative wf--compose ${selected ? 'wf--selected' : ''} ${running ? 'wf--running' : ''}`}>
      <CreativeNodeHeader
        title={def.name}
        eyebrow="图像合成"
        tone="compose"
        symbol="◇"
        status={status}
        statusActive={ready || running || !!result}
      />

      <CreativeNodePorts def={def} />

      <div className="wf__creative-body">
        <div className="wf__compose-progress nodrag">
          <span className={background ? 'is-ready' : ''}>
            <i />
            底图
          </span>
          <span className={foreground ? 'is-ready' : ''}>
            <i />
            素材
          </span>
          <span className={mask ? 'is-ready' : ''}>
            <i />
            区域
          </span>
        </div>

        <CreativeNodeSection label="合成画面" className="wf__creative-media-section">
          <div
            className={`wf__creative-media nodrag ${previewTab === 'background' && background ? 'is-editable' : ''}`}
            onClick={openMaskEditor}
          >
            {preview ? (
              <>
                <img src={preview} alt={tabs.find((tab) => tab.id === previewTab)?.label ?? '预览'} draggable={false} />
                {previewTab === 'background' && mask && (
                  <img className="wf__creative-mask" src={mask} alt="" draggable={false} />
                )}
                {previewTab === 'background' && (
                  <span className="wf__creative-media-action">{mask ? '调整区域' : '标记区域'}</span>
                )}
              </>
            ) : (
              <div className="wf__creative-empty">
                <span className="wf__creative-empty-symbol" aria-hidden="true">
                  ◇
                </span>
                <span>{emptyPreviewLabel}</span>
              </div>
            )}
          </div>
        </CreativeNodeSection>

        <div
          className={`wf__compose-tabs wf__compose-tabs--${tabs.length} nodrag`}
          role="tablist"
          aria-label="合成画面"
        >
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === tab.id}
              key={tab.id}
              className={previewTab === tab.id ? 'is-active' : ''}
              onClick={() => setPreviewTab(tab.id)}
            >
              {tab.src ? <img src={tab.src} alt="" draggable={false} /> : <span className="wf__compose-tab-empty" />}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <CreativeNodeSection className="wf__creative-model">{render('model')}</CreativeNodeSection>

        <CreativeNodeSection label="合成描述" className="wf__creative-prompt">
          {render('edit_prompt')}
        </CreativeNodeSection>
      </div>

      <footer className="wf__creative-footer">
        {!ready && <span className="wf__creative-footer-note">缺少底图或素材</span>}
        <button type="button" className="wf__creative-run" disabled={running || !ready} onClick={handleRun}>
          <span aria-hidden="true">{running ? '⟳' : '✦'}</span>
          {running ? '合成中' : '开始合成'}
        </button>
      </footer>

      {error && <div className="wf__error">{error}</div>}
    </div>
  );
}
