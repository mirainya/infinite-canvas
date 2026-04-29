import { useState } from 'react';
import { DashboardPage } from './DashboardPage';
import { ApiSourcesPage } from './ApiSourcesPage';
import { ConfigPage } from './ConfigPage';
import { CreditLogsPage } from './CreditLogsPage';
import { PluginsPage } from './PluginsPage';
import { TaskLogsPage } from './TaskLogsPage';
import { UsersPage } from './UsersPage';
import './admin.css';

type Tab = 'dashboard' | 'sources' | 'plugins' | 'logs' | 'credits' | 'users' | 'config';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: '仪表盘', icon: '◈' },
  { id: 'sources', label: 'API 来源', icon: '⚡' },
  { id: 'plugins', label: '插件', icon: '⬡' },
  { id: 'logs', label: '任务日志', icon: '☰' },
  { id: 'credits', label: '积分日志', icon: '◇' },
  { id: 'users', label: '用户管理', icon: '♟' },
  { id: 'config', label: '系统配置', icon: '⚙' },
];

const THEMES = [
  { id: 'sakura', icon: '🌸', tip: '樱花' },
  { id: 'moon',   icon: '🌙', tip: '月夜' },
  { id: 'ocean',  icon: '🌊', tip: '海洋' },
  { id: 'matcha', icon: '🍵', tip: '抹茶' },
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
            >
              {t.icon}
            </button>
          ))}
        </div>
        <a className="admin__back" href="/">← 返回画布</a>
      </aside>
      <main className="admin__content">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'sources' && <ApiSourcesPage />}
        {tab === 'plugins' && <PluginsPage />}
        {tab === 'logs' && <TaskLogsPage />}
        {tab === 'credits' && <CreditLogsPage />}
        {tab === 'users' && <UsersPage />}
        {tab === 'config' && <ConfigPage />}
      </main>
    </div>
  );
}
