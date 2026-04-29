import { memo, useCallback, useEffect, useRef, useState } from 'react';

interface TopbarProps {
  projectName: string;
  onProjectNameChange: (v: string) => void;
  status: string;
  credits: number;
  username: string;
  nickname: string;
  avatar: string;
  onShowShortcuts: () => void;
  onLogout: () => void;
  onEditProfile: () => void;
  onEditPassword: () => void;
}

function Topbar({
  projectName, onProjectNameChange, status, credits,
  username, nickname, avatar,
  onShowShortcuts, onLogout, onEditProfile, onEditPassword,
}: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || username || '用户';

  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

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

        <div className="topbar__user" ref={menuRef}>
          <button type="button" className="topbar__user-btn" onClick={toggleMenu} title={displayName}>
            {avatar ? (
              <img className="topbar__user-avatar" src={avatar} alt="" />
            ) : (
              <span className="topbar__user-avatar topbar__user-avatar--placeholder">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </button>

          {menuOpen && (
            <div className="topbar__user-menu">
              <div className="topbar__user-menu-header">
                <span className="topbar__user-menu-name">{displayName}</span>
                {nickname && <span className="topbar__user-menu-username">@{username}</span>}
              </div>
              <div className="topbar__user-menu-divider" />
              <button type="button" className="topbar__user-menu-item" onClick={() => { setMenuOpen(false); onEditProfile(); }}>
                修改资料
              </button>
              <button type="button" className="topbar__user-menu-item" onClick={() => { setMenuOpen(false); onEditPassword(); }}>
                修改密码
              </button>
              <div className="topbar__user-menu-divider" />
              <button type="button" className="topbar__user-menu-item topbar__user-menu-item--danger" onClick={() => { setMenuOpen(false); onLogout(); }}>
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default memo(Topbar);
