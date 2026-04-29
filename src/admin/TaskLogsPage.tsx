import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '../components/LoginPage';

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

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: '进行中', cls: 'admin__status--pending' },
  success: { label: '成功', cls: 'admin__status--ok' },
  failed: { label: '失败', cls: 'admin__status--err' },
};

export function TaskLogsPage() {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/task-logs?limit=100', { headers: authHeaders() });
      if (res.ok) setLogs(await res.json());
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
        <h1 className="admin__title">任务日志</h1>
        <button type="button" className="admin__btn" onClick={fetchLogs}>刷新</button>
      </div>

      {logs.length === 0 ? (
        <div className="admin__empty">暂无任务记录</div>
      ) : (
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
