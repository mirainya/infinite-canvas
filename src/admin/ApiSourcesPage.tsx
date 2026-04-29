import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '../components/LoginPage';

type ApiSource = {
  id: number;
  name: string;
  base_url: string;
  token: string;
  capability: string;
  chat_model: string;
  poll_interval_ms: number;
  max_polls: number;
  is_default: boolean;
  billing_type: string;
  credit_cost: number;
};

const EMPTY: Partial<ApiSource> = {
  name: '', base_url: '', token: '', capability: '', chat_model: 'gemini-3-pro-preview',
  poll_interval_ms: 5000, max_polls: 60, is_default: false, billing_type: 'per_call', credit_cost: 1,
};

export function ApiSourcesPage() {
  const [sources, setSources] = useState<ApiSource[]>([]);
  const [editing, setEditing] = useState<Partial<ApiSource> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/sources', { headers: authHeaders() });
      if (res.ok) setSources(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    const isNew = !editing.id;
    const url = isNew ? '/api/sources' : `/api/sources/${editing.id}`;
    const method = isNew ? 'POST' : 'PUT';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      setEditing(null);
      fetchSources();
    }
  }, [editing, fetchSources]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('确定删除？')) return;
    await fetch(`/api/sources/${id}`, { method: 'DELETE', headers: authHeaders() });
    fetchSources();
  }, [fetchSources]);

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <div className="admin__header">
        <h1 className="admin__title">API 来源</h1>
        <button type="button" className="admin__btn admin__btn--primary" onClick={() => setEditing({ ...EMPTY })}>
          + 添加来源
        </button>
      </div>

      {editing && (
        <div className="admin__modal-overlay" onClick={() => setEditing(null)}>
          <div className="admin__modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? '编辑来源' : '添加来源'}</h2>
            <label>名称<input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label>地址<input value={editing.base_url ?? ''} onChange={(e) => setEditing({ ...editing, base_url: e.target.value })} placeholder="https://..." /></label>
            <label>Token<input value={editing.token ?? ''} onChange={(e) => setEditing({ ...editing, token: e.target.value })} /></label>
            <label>能力<input value={editing.capability ?? ''} onChange={(e) => setEditing({ ...editing, capability: e.target.value })} placeholder="doubao_img" /></label>
            <label>聊天模型<input value={editing.chat_model ?? ''} onChange={(e) => setEditing({ ...editing, chat_model: e.target.value })} placeholder="gemini-3-pro-preview" /></label>
            <div className="admin__modal-row">
              <label>轮询间隔(ms)<input type="number" value={editing.poll_interval_ms ?? 5000} onChange={(e) => setEditing({ ...editing, poll_interval_ms: Number(e.target.value) })} /></label>
              <label>最大轮询<input type="number" value={editing.max_polls ?? 60} onChange={(e) => setEditing({ ...editing, max_polls: Number(e.target.value) })} /></label>
            </div>
            <label className="admin__checkbox">
              <input type="checkbox" checked={editing.is_default ?? false} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
              设为默认
            </label>
            <div className="admin__modal-row">
              <label>计费方式
                <select value={editing.billing_type ?? 'per_call'} onChange={(e) => setEditing({ ...editing, billing_type: e.target.value })}>
                  <option value="per_call">按次</option>
                  <option value="per_token">按Token</option>
                </select>
              </label>
              <label>积分单价<input type="number" step="0.01" value={editing.credit_cost ?? 1} onChange={(e) => setEditing({ ...editing, credit_cost: Number(e.target.value) })} /></label>
            </div>
            <div className="admin__modal-actions">
              <button type="button" className="admin__btn admin__btn--primary" onClick={handleSave}>保存</button>
              <button type="button" className="admin__btn" onClick={() => setEditing(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {sources.length === 0 ? (
        <div className="admin__empty">暂无 API 来源，点击上方按钮添加</div>
      ) : (
        <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>名称</th>
              <th>地址</th>
              <th>能力</th>
              <th>聊天模型</th>
              <th>轮询</th>
              <th>默认</th>
              <th>计费</th>
              <th>单价</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="admin__url">{s.base_url}</td>
                <td>{s.capability}</td>
                <td>{s.chat_model}</td>
                <td>{s.poll_interval_ms}ms / {s.max_polls}</td>
                <td>{s.is_default ? '✓' : ''}</td>
                <td>{s.billing_type === 'per_token' ? '按Token' : '按次'}</td>
                <td>{s.credit_cost}</td>
                <td>
                  <button type="button" className="admin__btn admin__btn--sm" onClick={() => setEditing(s)}>编辑</button>
                  <button type="button" className="admin__btn admin__btn--sm admin__btn--danger" onClick={() => handleDelete(s.id)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
