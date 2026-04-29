import { memo } from 'react';

interface TopbarProps {
  projectName: string;
  onProjectNameChange: (v: string) => void;
  status: string;
  credits: number;
  onShowShortcuts: () => void;
  onLogout: () => void;
}

function Topbar({ projectName, onProjectNameChange, status, credits, onShowShortcuts, onLogout }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <span className="topbar__logo">✦</span>
        <span className="topbar__title">Infinite Canvas</span>
      </div>
      <div className="topbar__center">
        <input
          className="topbar__project-input"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="项目名称"
        />
        <span className="topbar__status">{status}</span>
      </div>
      <div className="topbar__right">
        <span className="topbar__credits" title="积分余额">✦ {credits.toFixed(1)}</span>
        <button type="button" className="topbar__btn" onClick={onShowShortcuts} title="快捷键">?</button>
        <button type="button" className="topbar__btn" onClick={onLogout} title="退出登录">⏻</button>
      </div>
    </header>
  );
}

export default memo(Topbar);
