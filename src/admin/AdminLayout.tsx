import { useState } from 'react';
import { DashboardPage } from './DashboardPage';
import { ConfigPage } from './ConfigPage';
import { ModelsPage } from './ModelsPage';
import { PluginsPage } from './PluginsPage';
import { TaskLogsPage } from './TaskLogsPage';
import './admin.css';

type Tab = 'dashboard' | 'models' | 'plugins' | 'logs' | 'config';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: '仪表盘', icon: '◈' },
  { id: 'models', label: '模型管理', icon: '◆' },
  { id: 'plugins', label: '插件', icon: '⬡' },
  { id: 'logs', label: '任务日志', icon: '☰' },
  { id: 'config', label: '系统配置', icon: '⚙' },
];

const THEMES = [
  { id: 'sakura', color: '#e96f9f', tip: '樱花' },
  { id: 'moon',   color: '#24182f', tip: '月夜' },
  { id: 'ocean',  color: '#55c7d2', tip: '海洋' },
  { id: 'matcha', color: '#79b84c', tip: '抹茶' },
];

function getInitialTheme() {
  try { return localStorage.getItem('admin-theme') || 'sakura'; } catch { return 'sakura'; }
}

export function AdminLayout() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [theme, setTheme] = useState(getInitialTheme);

  const switchTheme = (id: string) => {
    setTheme(id);
    try { localStorage.setItem('admin-theme', id); } catch { /* noop */ }
  };

  return (
    <div className="admin" data-theme={theme}>
      <aside className="admin__sidebar">
        <div className="admin__logo">Infinite Canvas</div>
        <nav className="admin__nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin__nav-item ${tab === t.id ? 'admin__nav-item--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="admin__nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="admin__theme-switcher">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin__theme-btn ${theme === t.id ? 'admin__theme-btn--active' : ''}`}
              onClick={() => switchTheme(t.id)}
              title={t.tip}
              aria-label={t.tip}
            >
              <span className="admin__theme-swatch" style={{ background: t.color }} />
            </button>
          ))}
        </div>
        <a className="admin__back" href="/">← 返回画布</a>
      </aside>
      <main className="admin__content">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'models' && <ModelsPage />}
        {tab === 'plugins' && <PluginsPage />}
        {tab === 'logs' && <TaskLogsPage />}
        {tab === 'config' && <ConfigPage />}
      </main>
    </div>
  );
}
