import { memo, useCallback, useState } from 'react';
import { isAdmin } from './LoginPage';

interface FloatingToolbarProps {
  onRun: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onSaveToProjects: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClear: () => void;
  onAutoLayout: () => void;
}

function FloatingToolbar({
  onRun, onFit, onUndo, onRedo,
  onSave, onLoad, onExportJson, onImportJson,
  onExportProject, onImportProject, onSaveToProjects,
  onGroup, onUngroup, onDuplicate, onDelete, onClear, onAutoLayout,
}: FloatingToolbarProps) {
  const [showMore, setShowMore] = useState(false);

  const wrap = useCallback((fn: () => void) => () => { fn(); setShowMore(false); }, []);

  return (
    <div className="floating-toolbar">
      <button type="button" className="floating-toolbar__btn floating-toolbar__btn--run" onClick={onRun} title="运行工作流">✦ 运行</button>
      <div className="floating-toolbar__divider" />
      <button type="button" className="floating-toolbar__btn" onClick={onFit} title="适配画布" aria-label="适配画布">⊞</button>
      <button type="button" className="floating-toolbar__btn" onClick={onUndo} title="撤销" aria-label="撤销">↩</button>
      <button type="button" className="floating-toolbar__btn" onClick={onRedo} title="重做" aria-label="重做">↪</button>
      <div className="floating-toolbar__divider" />
      {isAdmin() && <button type="button" className="floating-toolbar__btn" onClick={() => window.open('/admin', '_blank')} title="后台管理">⚙</button>}
      <div className="floating-toolbar__more">
        <button type="button" className="floating-toolbar__btn" onClick={() => setShowMore((v) => !v)} title="更多操作" aria-label="更多操作">⋯</button>
        {showMore && (
          <div className="floating-toolbar__dropdown">
            <button type="button" onClick={wrap(onSave)}>保存画布</button>
            <button type="button" onClick={wrap(onLoad)}>读取画布</button>
            <button type="button" onClick={wrap(onExportJson)}>导出 JSON</button>
            <button type="button" onClick={wrap(onImportJson)}>导入 JSON</button>
            <button type="button" onClick={wrap(onExportProject)}>导出项目包</button>
            <button type="button" onClick={wrap(onImportProject)}>导入项目包</button>
            <button type="button" onClick={wrap(onSaveToProjects)}>保存到项目列表</button>
            <button type="button" data-action="auto-layout" onClick={wrap(onAutoLayout)}>自动排列节点</button>
            <button type="button" onClick={wrap(onGroup)}>创建或适配分组</button>
            <button type="button" onClick={wrap(onUngroup)}>移除分组框</button>
            <button type="button" onClick={wrap(onDuplicate)}>复制所选</button>
            <button type="button" onClick={wrap(onDelete)}>删除所选</button>
            <button type="button" onClick={wrap(onClear)}>清空画布</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(FloatingToolbar);
