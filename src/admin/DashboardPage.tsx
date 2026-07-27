import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

type HealthData = { status: string; name: string };
type PluginSummary = { def_id: string; name: string };
type V2Overview = { projects: number; assets: number; runs: number; running: number; credits_used: number };

export function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const asJson = async (r: Response) => (r.ok ? r.json() : null);
    const asArr = async (r: Response) => (r.ok ? r.json() : []);
    Promise.all([
      fetch('/api/health').then(asJson),
      apiFetch('/api/plugins').then(asArr),
      apiFetch('/api/v2/admin/overview').then(asJson),
    ])
      .then(([hd, p, v2]) => {
        setHealth(hd);
        setPlugins(Array.isArray(p) ? p : []);
        setOverview(v2);
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
          <div className="admin__card-value">{overview?.projects ?? 0}</div>
          <div className="admin__card-label">V2 项目</div>
        </div>
        <div className="admin__card">
          <div className="admin__card-value">{overview?.runs ?? 0}</div>
          <div className="admin__card-label">V2 任务</div>
        </div>
        <div className="admin__card">
          <div className="admin__card-value">{overview?.running ?? 0}</div>
          <div className="admin__card-label">执行中</div>
        </div>
        <div className="admin__card">
          <div className="admin__card-value">{overview?.credits_used ?? 0}</div>
          <div className="admin__card-label">已用积分</div>
        </div>
      </div>
    </div>
  );
}
