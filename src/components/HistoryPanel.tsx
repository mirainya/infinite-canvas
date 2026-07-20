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

export function HistoryPanel({ onUseImage }: { onUseImage?: (url: string) => void }) {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/my/task-logs?limit=50');
      if (res.ok) setLogs(await res.json());
    } finally { setLoading(false); }
  }, []);

  const cancelTask = useCallback(async (logId: number) => {
    const res = await apiFetch(`/api/my/task-logs/${logId}/cancel`, {
      method: 'POST',
    });
    if (res.ok) fetchLogs();
  }, [fetchLogs]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) return <div className="panel-history__loading">加载中...</div>;
  if (!logs.length) return <div className="panel-history__empty">暂无执行记录</div>;

  return (
    <div className="panel-history">
      <button type="button" className="panel-history__refresh" onClick={fetchLogs}>刷新</button>
      <div className="panel-history__list">
        {logs.map((log) => (
          <div key={log.id} className={`panel-history__item panel-history__item--${log.status}`}>
            <div className="panel-history__meta">
              <span className="panel-history__defid">{log.def_id}</span>
              <span className="panel-history__time">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
            </div>
            {log.prompt && <div className="panel-history__prompt" title={log.prompt}>{log.prompt.slice(0, 60)}{log.prompt.length > 60 ? '...' : ''}</div>}
            {log.status === 'success' && log.result_url && (
              <div className="panel-history__result">
                <img src={log.result_url} alt="" className="panel-history__thumb" loading="lazy" />
                <div className="panel-history__actions">
                  {onUseImage && <button type="button" onClick={() => onUseImage(log.result_url)}>使用</button>}
                  <a href={log.result_url} target="_blank" rel="noreferrer">查看</a>
                </div>
              </div>
            )}
            {log.status === 'failed' && log.error && (
              <div className="panel-history__error" title={log.error}>{log.error.slice(0, 80)}</div>
            )}
            {log.status === 'pending' && (
              <div className="panel-history__pending">
                执行中...
                <button type="button" className="panel-history__cancel" onClick={() => cancelTask(log.id)}>取消</button>
              </div>
            )}
            {log.duration_ms > 0 && <span className="panel-history__duration">{(log.duration_ms / 1000).toFixed(1)}s</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
