import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '../components/LoginPage';

type ConfigMap = Record<string, string>;

const CONFIG_LABELS: Record<string, { label: string; placeholder: string; secret?: boolean }> = {
  xfs_base_url: { label: 'XFS 存储地址', placeholder: 'https://xfilestorage.example.com' },
  xfs_api_key: { label: 'XFS API Key', placeholder: 'xfs_xxx', secret: true },
  jwt_secret: { label: 'JWT 密钥', placeholder: '留空则自动生成', secret: true },
};

export function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/config', { headers: authHeaders() });
      if (res.ok) setConfigs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ configs }),
      });
      if (res.ok) setMsg('保存成功');
      else setMsg('保存失败');
    } catch {
      setMsg('网络错误');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <div className="admin__header">
        <h1 className="admin__title">系统配置</h1>
        <button type="button" className="admin__btn admin__btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
      {msg && <div className="admin__msg">{msg}</div>}
      <div className="admin__config-list">
        {Object.entries(CONFIG_LABELS).map(([key, meta]) => (
          <label key={key} className="admin__config-item">
            <span className="admin__config-label">{meta.label}</span>
            <input
              type={meta.secret ? 'password' : 'text'}
              className="admin__config-input"
              value={configs[key] ?? ''}
              placeholder={meta.placeholder}
              onChange={(e) => setConfigs({ ...configs, [key]: e.target.value })}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
