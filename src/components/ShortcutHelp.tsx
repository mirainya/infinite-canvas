type ShortcutHelpProps = {
  visible: boolean;
  onClose: () => void;
};

const shortcuts = [
  ['?', '打开/关闭快捷键说明'],
  ['Ctrl / Cmd + S', '保存画布并创建历史版本'],
  ['Ctrl / Cmd + F', '聚焦节点搜索'],
  ['Ctrl / Cmd + D', '复制所选节点'],
  ['Ctrl / Cmd + Z', '撤销'],
  ['Ctrl / Cmd + Y', '重做'],
  ['Delete / Backspace', '删除所选节点或连线'],
  ['Esc', '关闭菜单、详情和说明'],
  ['右键画布', '新建节点、模板或分组'],
  ['右键节点', '定位、详情、复制或删除'],
] as const;

function ShortcutHelp({ visible, onClose }: ShortcutHelpProps) {
  if (!visible) return null;

  return (
    <div className="shortcut-help" role="dialog" aria-modal="true" aria-label="快捷键说明">
      <div className="shortcut-help__panel">
        <div className="shortcut-help__header">
          <h2>快捷键说明</h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="shortcut-help__grid">
          {shortcuts.map(([key, description]) => (
            <>
              <span key={`${key}-key`}>{key}</span>
              <p key={`${key}-description`}>{description}</p>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ShortcutHelp;
