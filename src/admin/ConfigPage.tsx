import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

type ConfigMap = Record<string, string>;

type ConfigField = { key: string; label: string; placeholder: string; secret?: boolean; dynamic?: string };
type ConfigGroup = { title: string; fields: ConfigField[] };

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    title: '棱镜连接',
    fields: [
      { key: 'prism_base_url', label: '棱镜地址', placeholder: '未配置' },
      { key: 'prism_token', label: '棱镜 Token', placeholder: '未配置', secret: true },
    ],
  },
  {
    title: '文件存储',
    fields: [
      { key: 'xfs_base_url', label: 'XFS 存储地址', placeholder: '未配置' },
      { key: 'xfs_api_key', label: 'XFS API Key', placeholder: '未配置', secret: true },
    ],
  },
  {
    title: '安全与密钥',
    fields: [
      { key: 'metaprompt_api_key', label: 'Meta-Prompt API Key', placeholder: '未配置', secret: true },
      { key: 'metaprompt_model', label: 'Meta-Prompt 模型', placeholder: 'claude-sonnet-4-6', dynamic: '/api/prompt-enhance/models' },
    ],
  },
];

export function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigMap>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/config');
      if (res.ok) setConfigs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // 动态加载模型列表
  useEffect(() => {
    const dynamicFields = CONFIG_GROUPS.flatMap(g => g.fields).filter(f => f.dynamic);
    dynamicFields.forEach(async (f) => {
      try {
        const res = await apiFetch(f.dynamic!);
        if (res.ok) {
          const data = await res.json();
          const codes = Array.isArray(data) ? data.map((m: any) => m.code || m) : [];
          setDynamicOptions(prev => ({ ...prev, [f.key]: codes }));
        }
      } catch { /* ignore */ }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs }),
      });
      if (res.ok) {
        setMsg('保存成功');
        setShowSecret({});
        await fetchConfig();
      } else setMsg('保存失败');
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
      {CONFIG_GROUPS.map((group) => (
        <div key={group.title} className="admin__config-group">
          <h3 className="admin__config-group-title">{group.title}</h3>
          <div className="admin__config-list">
            {group.fields.map((f) => {
              const hasValue = !!configs[f.key];
              const visible = !f.secret || showSecret[f.key];
              const options = dynamicOptions[f.key];
              return (
                <label key={f.key} className="admin__config-item">
                  <span className="admin__config-label">
                    {f.label}
                    {f.secret && hasValue && <span className="admin__config-badge">已配置</span>}
                  </span>
                  <div className="admin__config-input-wrap">
                    {f.dynamic && options ? (
                      <select
                        className="admin__config-input"
                        value={configs[f.key] ?? ''}
                        onChange={(e) => setConfigs({ ...configs, [f.key]: e.target.value })}
                      >
                        <option value="">{f.placeholder || '请选择'}</option>
                        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input
                        type={visible ? 'text' : 'password'}
                        className="admin__config-input"
                        value={configs[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setConfigs({ ...configs, [f.key]: e.target.value })}
                        autoComplete="off"
                      />
                    )}
                    {f.secret && (
                      <button
                        type="button"
                        className="admin__config-eye"
                        onClick={() => setShowSecret((s) => ({ ...s, [f.key]: !s[f.key] }))}
                        title={visible ? '隐藏' : '显示'}
                      >
                        {visible ? '◉' : '○'}
                      </button>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
