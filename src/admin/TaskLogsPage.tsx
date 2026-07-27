import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

type TaskLog = {
  id: number;
  def_id: string;
  action: string;
  prompt: string;
  status: string;
  result_url: string;
  error: string;
  duration_ms: number;
  created_at: string;
};

type V2Run = {
  id: string;
  owner_id: number;
  project_name: string;
  status: string;
  progress: number;
  credits_used: number;
  error: string;
  created_at: string;
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: '进行中', cls: 'admin__status--pending' },
  queued: { label: '排队中', cls: 'admin__status--pending' },
  running: { label: '执行中', cls: 'admin__status--pending' },
  success: { label: '成功', cls: 'admin__status--ok' },
  succeeded: { label: '已完成', cls: 'admin__status--ok' },
  failed: { label: '失败', cls: 'admin__status--err' },
  cancelled: { label: '已取消', cls: '' },
};

export function TaskLogsPage() {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [runs, setRuns] = useState<V2Run[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const [legacyResponse, runResponse] = await Promise.all([
        apiFetch('/api/task-logs?limit=100'),
        apiFetch('/api/v2/admin/runs'),
      ]);
      if (legacyResponse.ok) setLogs(await legacyResponse.json());
      if (runResponse.ok) setRuns(await runResponse.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    const timer = setInterval(fetchLogs, 10000);
    return () => clearInterval(timer);
  }, [fetchLogs]);

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <div className="admin__header">
        <h1 className="admin__title">任务记录</h1>
        <button type="button" className="admin__btn" onClick={fetchLogs}>刷新</button>
      </div>

      {runs.length > 0 && <div className="admin__table-wrap" style={{ marginBottom: 24 }}>
        <table className="admin__table">
          <thead><tr><th>时间</th><th>项目</th><th>账号</th><th>状态</th><th>进度</th><th>积分</th><th>错误</th></tr></thead>
          <tbody>{runs.map((run) => {
            const status = STATUS_MAP[run.status] ?? { label: run.status, cls: '' };
            return <tr key={run.id}>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(run.created_at).toLocaleString('zh-CN')}</td>
              <td>{run.project_name}</td>
              <td><code>{run.owner_id}</code></td>
              <td><span className={`admin__status ${status.cls}`}>{status.label}</span></td>
              <td>{run.progress}%</td>
              <td>{run.credits_used}</td>
              <td className="admin__prompt-cell" title={run.error}>{run.error || '-'}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}

      {logs.length === 0 && runs.length === 0 ? (
        <div className="admin__empty">暂无任务记录</div>
      ) : logs.length > 0 && (
        <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>时间</th>
              <th>插件</th>
              <th>操作</th>
              <th>提示词</th>
              <th>状态</th>
              <th>耗时</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const st = STATUS_MAP[log.status] ?? { label: log.status, cls: '' };
              return (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {new Date(log.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td><code>{log.def_id}</code></td>
                  <td>{log.action || '-'}</td>
                  <td className="admin__prompt-cell" title={log.prompt}>
                    {log.prompt || '-'}
                  </td>
                  <td><span className={`admin__status ${st.cls}`}>{st.label}</span></td>
                  <td>{log.duration_ms > 0 ? `${(log.duration_ms / 1000).toFixed(1)}s` : '-'}</td>
                  <td>
                    {log.status === 'failed' && log.error && (
                      <span className="admin__error-text" title={log.error}>
                        {log.error.length > 30 ? log.error.slice(0, 30) + '...' : log.error}
                      </span>
                    )}
                    {log.status === 'success' && log.result_url && (
                      <a href={log.result_url} target="_blank" rel="noreferrer" className="admin__link">
                        查看
                      </a>
                    )}
                    {log.status === 'pending' && '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
