import { useMemo, useRef, useState } from 'react';
import type { ControlDef } from '../../types/workflow';
import { uploadImageFile } from '../uploadImage';
import type { NodeBodyProps } from '../registry';
import { CreativeNodeHeader, CreativeNodePorts, CreativeNodeSection } from './CreativeNodeParts';

const PROMPT_OPTIONAL_ACTIONS = new Set(['擦除', '扣图']);

export default function ImageEditBody({ id, def, pv, selected, running, error, updatePV, handleRun, renderCtrl }: NodeBodyProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const controls = useMemo(() => new Map(def.controls.map((control) => [control.id, control])), [def.controls]);
  const render = (controlId: string) => {
    const control = controls.get(controlId) as ControlDef | undefined;
    return control ? renderCtrl(control) : null;
  };

  const imgSrc = (pv['input-image'] as string) ?? null;
  const maskSrc = pv.edit_area as string | undefined;
  const action = typeof pv.action === 'string' ? pv.action : '替换';
  const prompt = typeof pv.edit_prompt === 'string' ? pv.edit_prompt.trim() : '';
  const ready = !!imgSrc && (PROMPT_OPTIONAL_ACTIONS.has(action) || prompt.length > 0);
  const status = running ? '处理中' : imgSrc ? (maskSrc ? '区域已标记' : '全图编辑') : '待输入';

  const openEditor = () => {
    if (!imgSrc) return;
    window.dispatchEvent(new CustomEvent('open-image-editor', {
      detail: { nodeId: id, imageSrc: imgSrc, maskOnly: true },
    }));
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/') || uploading) return;
    setUploading(true);
    setUploadError('');
    try {
      updatePV('input-image', await uploadImageFile(file));
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`wf wf--creative wf--edit ${selected ? 'wf--selected' : ''} ${running || uploading ? 'wf--running' : ''}`}>
      <CreativeNodeHeader
        title={def.name}
        eyebrow="局部编辑"
        tone="edit"
        symbol="◐"
        status={uploading ? '上传中' : status}
        statusActive={!!imgSrc || running || uploading}
      />

      <CreativeNodePorts def={def} />

      <div className="wf__creative-body">
        <CreativeNodeSection label="编辑画面" className="wf__creative-media-section">
          <div
            className={`wf__creative-media nodrag ${imgSrc ? 'is-editable' : ''}`}
            onClick={openEditor}
          >
            {imgSrc ? (
              <>
                <img src={imgSrc} alt="原图" draggable={false} />
                {maskSrc && <img className="wf__creative-mask" src={maskSrc} alt="" draggable={false} />}
                <span className="wf__creative-media-badge">{maskSrc ? '已标记区域' : '全图'}</span>
                <span className="wf__creative-media-action">{maskSrc ? '调整区域' : '标记区域'}</span>
              </>
            ) : (
              <div className="wf__creative-empty">
                <span className="wf__creative-empty-symbol" aria-hidden="true">▧</span>
                <span>暂无原图</span>
                <button type="button" onClick={(event) => { event.stopPropagation(); fileRef.current?.click(); }}>
                  {uploading ? '上传中' : '选择图片'}
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
              event.target.value = '';
            }}
          />
        </CreativeNodeSection>

        <div className="wf__creative-grid">
          {render('model')}
          {render('action')}
        </div>

        <CreativeNodeSection label="修改描述" className="wf__creative-prompt">
          {render('edit_prompt')}
        </CreativeNodeSection>
      </div>

      <footer className="wf__creative-footer">
        {!ready && imgSrc && !PROMPT_OPTIONAL_ACTIONS.has(action) && (
          <span className="wf__creative-footer-note">填写修改描述</span>
        )}
        <button type="button" className="wf__creative-run" disabled={running || uploading || !ready} onClick={handleRun}>
          <span aria-hidden="true">{running ? '⟳' : '✦'}</span>
          {running ? '处理中' : `开始${action}`}
        </button>
      </footer>

      {(error || uploadError) && <div className="wf__error">{error || uploadError}</div>}
    </div>
  );
}
