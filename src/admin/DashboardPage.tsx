import { useEffect, useState } from 'react';
import { authHeaders } from '../components/LoginPage';

type HealthData = { status: string; name: string };
type PluginSummary = { def_id: string; name: string };
type SourceSummary = { id: number; name: string };

export function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const h = { headers: authHeaders() };
    Promise.all([
      fetch('/api/health').then((r) => r.json()),
      fetch('/api/plugins', h).then((r) => r.json()),
      fetch('/api/sources', h).then((r) => r.json()),
    ])
      .then(([h, p, s]) => { setHealth(h); setPlugins(p); setSources(s); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <h1 className="admin__title">仪表盘</h1>
      <div className="admin__cards">
        <div className={`admin__card ${health?.status === 'ok' ? 'admin__card--ok' : 'admin__card--err'}`}>
          <div className="admin__card-value">{health?.status === 'ok' ? '正常' : '异常'}</div>
          <div className="admin__card-label">后端状态</div>
        </div>
        <div className="admin__card">
          <div className="admin__card-value">{plugins.length}</div>
          <div className="admin__card-label">已加载插件</div>
        </div>
        <div className="admin__card">
          <div className="admin__card-value">{sources.length}</div>
          <div className="admin__card-label">API 来源</div>
        </div>
      </div>
    </div>
  );
}
