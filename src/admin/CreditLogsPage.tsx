import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '../components/LoginPage';

type CreditLog = {
  id: number;
  user_id: number;
  username: string;
  amount: number;
  balance_after: number;
  reason: string;
  created_at: string;
};

export function CreditLogsPage() {
  const [logs, setLogs] = useState<CreditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/credit-logs?limit=200', { headers: authHeaders() });
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <div className="admin__header">
        <h1 className="admin__title">积分日志</h1>
        <button type="button" className="admin__btn" onClick={fetchLogs}>刷新</button>
      </div>

      {logs.length === 0 ? (
        <div className="admin__empty">暂无积分记录</div>
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>时间</th>
                <th>用户</th>
                <th>变动</th>
                <th>余额</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {new Date(log.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td>{log.username}</td>
                  <td>
                    <span className={`admin__status ${log.amount > 0 ? 'admin__status--ok' : 'admin__status--err'}`}>
                      {log.amount > 0 ? '+' : ''}{log.amount}
                    </span>
                  </td>
                  <td>{log.balance_after}</td>
                  <td>{log.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
