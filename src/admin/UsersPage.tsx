import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '../components/LoginPage';

type User = { id: number; username: string; is_admin: boolean; credits: number; created_at: string };

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [rechargeTarget, setRechargeTarget] = useState<User | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders() });
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleAdmin = async (u: User) => {
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ is_admin: !u.is_admin }),
    });
    fetchUsers();
  };

  const deleteUser = async (u: User) => {
    if (!confirm(`确定删除用户 "${u.username}"？`)) return;
    await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE', headers: authHeaders() });
    fetchUsers();
  };

  const doRecharge = async () => {
    if (!rechargeTarget || !rechargeAmount) return;
    await fetch(`/api/admin/users/${rechargeTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ credits_delta: Number(rechargeAmount) }),
    });
    setRechargeTarget(null);
    setRechargeAmount('');
    fetchUsers();
  };

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <h1 className="admin__title">用户管理</h1>
      {users.length === 0 ? (
        <div className="admin__empty">暂无用户</div>
      ) : (
        <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>ID</th><th>用户名</th><th>角色</th><th>积分</th><th>注册时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>
                  <span className={`admin__status ${u.is_admin ? 'admin__status--ok' : ''}`}>
                    {u.is_admin ? '管理员' : '普通用户'}
                  </span>
                </td>
                <td>{u.credits}</td>
                <td>{new Date(u.created_at).toLocaleString()}</td>
                <td className="admin__actions">
                  <button type="button" className="admin__btn admin__btn--sm" onClick={() => { setRechargeTarget(u); setRechargeAmount(''); }}>
                    充值
                  </button>
                  <button type="button" className="admin__btn admin__btn--sm" onClick={() => toggleAdmin(u)}>
                    {u.is_admin ? '取消管理员' : '设为管理员'}
                  </button>
                  <button type="button" className="admin__btn admin__btn--sm admin__btn--danger" onClick={() => deleteUser(u)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {rechargeTarget && (
        <div className="admin__modal-overlay" onClick={() => setRechargeTarget(null)}>
          <div className="admin__modal" onClick={(e) => e.stopPropagation()}>
            <h2>充值积分 — {rechargeTarget.username}</h2>
            <p>当前积分：{rechargeTarget.credits}</p>
            <label>充值数量（负数为扣除）<input type="number" step="0.1" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} autoFocus /></label>
            <div className="admin__modal-actions">
              <button type="button" className="admin__btn admin__btn--primary" onClick={doRecharge} disabled={!rechargeAmount || Number(rechargeAmount) === 0}>确认</button>
              <button type="button" className="admin__btn" onClick={() => setRechargeTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
