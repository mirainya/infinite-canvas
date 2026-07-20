import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface ModelItem {
  code: string;
  name: string;
  type: string;
  disabled: boolean;
}

interface BillingInfo {
  billing_type: 'per_call' | 'per_token';
  credit_cost: number;
  input_cost: number;
  output_cost: number;
}

type BillingMap = Record<string, BillingInfo>;

const DEFAULT_BILLING: BillingInfo = { billing_type: 'per_call', credit_cost: 1, input_cost: 0, output_cost: 0 };
const TYPE_LABELS: Record<string, string> = { chat: '对话模型', image: '图像模型', video: '视频模型' };
const TYPE_ORDER = ['chat', 'image', 'video'];

export function ModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [billing, setBilling] = useState<BillingMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeType, setActiveType] = useState('chat');
  const [editModel, setEditModel] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [mRes, bRes] = await Promise.all([
        apiFetch('/api/models/all'),
        apiFetch('/api/models/billing'),
      ]);
      if (mRes.ok) {
        const data = await mRes.json();
        setModels(data.map((m: any) => ({ code: m.code, name: m.name, type: m.type, disabled: m.disabled })));
      }
      if (bRes.ok) setBilling(await bRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggle = (code: string) => {
    setModels((prev) => prev.map((m) => m.code === code ? { ...m, disabled: !m.disabled } : m));
  };

  const getBilling = (code: string): BillingInfo => ({ ...DEFAULT_BILLING, ...billing[code] });

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const disabled = models.filter((m) => m.disabled).map((m) => m.code);
      const billingToSave: BillingMap = {};
      for (const [code, info] of Object.entries(billing)) {
        if (info.billing_type !== 'per_call' || info.credit_cost !== 1 || info.input_cost || info.output_cost) {
          billingToSave[code] = info;
        }
      }
      const responses = await Promise.all([
        apiFetch('/api/models/disabled', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled }),
        }),
        apiFetch('/api/models/billing', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ billing: billingToSave }),
        }),
      ]);
      if (responses.some((res) => !res.ok)) throw new Error('保存失败');
      setMsg('保存成功');
    } catch {
      setMsg('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const res = await apiFetch('/api/models/sync', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setMsg(`同步成功，共 ${data.count} 个模型`);
        await fetchData();
      } else {
        setMsg(data.error || '同步失败');
      }
    } catch {
      setMsg('网络错误');
    } finally {
      setSyncing(false);
    }
  };

  const types = [...new Set(models.map((m) => m.type || 'other'))].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a), bi = TYPE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const filtered = models.filter((m) => (m.type || 'other') === activeType);

  const billingLabel = (code: string) => {
    const b = getBilling(code);
    if (b.billing_type === 'per_token') return `${b.input_cost}/${b.output_cost} 积分/千token`;
    return `${b.credit_cost} 积分/次`;
  };

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <div className="admin__header">
        <h1 className="admin__title">模型管理</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="admin__btn" onClick={handleSync} disabled={syncing}>
            {syncing ? '同步中...' : '同步模型'}
          </button>
          <button type="button" className="admin__btn admin__btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      {msg && <div className="admin__msg">{msg}</div>}
      <div className="admin__tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {types.map((t) => (
          <button key={t} type="button" className={`admin__btn admin__btn--sm ${activeType === t ? 'admin__btn--primary' : ''}`} onClick={() => setActiveType(t)}>
            {TYPE_LABELS[t] || t}（{models.filter((m) => (m.type || 'other') === t).length}）
          </button>
        ))}
      </div>
      <div className="admin__model-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
        {filtered.map((m) => (
          <div key={m.code} style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: m.disabled ? 'var(--bg-surface-2)' : 'var(--bg-surface)', border: '1px solid var(--border)', opacity: m.disabled ? 0.6 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{m.name}</div>
              <small style={{ opacity: 0.6 }}>{m.code}</small>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{billingLabel(m.code)}</div>
            </div>
            <button type="button" className="admin__btn admin__btn--sm" onClick={() => setEditModel(m.code)} title="计费设置">⚙</button>
            <label className="admin__toggle" title={m.disabled ? '已禁用' : '已启用'}>
              <input type="checkbox" checked={!m.disabled} onChange={() => toggle(m.code)} />
              <span className="admin__toggle-slider" />
            </label>
          </div>
        ))}
      </div>

      {editModel && (
        <BillingDialog
          code={editModel}
          modelType={models.find((m) => m.code === editModel)?.type || ''}
          info={getBilling(editModel)}
          onSave={(info) => { setBilling((b) => ({ ...b, [editModel]: info })); setEditModel(null); }}
          onClose={() => setEditModel(null)}
        />
      )}
    </div>
  );
}

function BillingDialog({ code, modelType, info, onSave, onClose }: {
  code: string;
  modelType: string;
  info: BillingInfo;
  onSave: (info: BillingInfo) => void;
  onClose: () => void;
}) {
  const [billingType, setBillingType] = useState(info.billing_type);
  const [creditCost, setCreditCost] = useState(info.credit_cost);
  const [inputCost, setInputCost] = useState(info.input_cost);
  const [outputCost, setOutputCost] = useState(info.output_cost);

  const isChat = modelType === 'chat';

  const handleConfirm = () => {
    onSave({
      billing_type: billingType,
      credit_cost: billingType === 'per_call' ? creditCost : 0,
      input_cost: billingType === 'per_token' ? inputCost : 0,
      output_cost: billingType === 'per_token' ? outputCost : 0,
    });
  };

  return (
    <div className="admin__overlay" onClick={onClose}>
      <div className="admin__dialog" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px' }}>计费设置</h3>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>{code}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>计费方式</label>
            <select
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as any)}
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)' }}
            >
              <option value="per_call">按次计费</option>
              {isChat && <option value="per_token">按 Token 计费</option>}
            </select>
          </div>

          {billingType === 'per_call' && (
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>每次消耗积分</label>
              <input type="number" min={0} step={0.1} value={creditCost}
                onChange={(e) => setCreditCost(parseFloat(e.target.value) || 0)}
                style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)' }}
              />
            </div>
          )}

          {billingType === 'per_token' && (
            <>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>输入积分 / 千 token</label>
                <input type="number" min={0} step={0.01} value={inputCost}
                  onChange={(e) => setInputCost(parseFloat(e.target.value) || 0)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>输出积分 / 千 token</label>
                <input type="number" min={0} step={0.01} value={outputCost}
                  onChange={(e) => setOutputCost(parseFloat(e.target.value) || 0)}
                  style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)' }}
                />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button type="button" className="admin__btn admin__btn--sm" onClick={onClose}>取消</button>
          <button type="button" className="admin__btn admin__btn--sm admin__btn--primary" onClick={handleConfirm}>确定</button>
        </div>
      </div>
    </div>
  );
}
