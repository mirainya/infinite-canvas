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
    const asJson = async (r: Response) => (r.ok ? r.json() : null);
    const asArr = async (r: Response) => (r.ok ? r.json() : []);
    Promise.all([
      fetch('/api/health').then(asJson),
      fetch('/api/plugins', h).then(asArr),
      fetch('/api/sources', h).then(asArr),
    ])
      .then(([hd, p, s]) => {
        setHealth(hd);
        setPlugins(Array.isArray(p) ? p : []);
        setSources(Array.isArray(s) ? s : []);
      })
      .catch(() => { /* ignore */ })
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
