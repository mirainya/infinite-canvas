import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';

type TemplateOption = { id: number; name: string; description: string };

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export default function TemplateControl({ id, label, value, onChange }: Props) {
  const [options, setOptions] = useState<TemplateOption[]>([]);
  const [showGen, setShowGen] = useState(false);
  const [genInput, setGenInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [saveName, setSaveName] = useState('');

  const loadTemplates = () => {
    apiFetch('/api/prompt-templates')
      .then((r) => r.ok ? r.json() : [])
      .then(setOptions)
      .catch(() => {});
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleGenerate = async () => {
    if (!genInput.trim() || generating) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const r = await apiFetch('/api/prompt-templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: genInput }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setGenResult(data);
      setSaveName(genInput.slice(0, 20));
    } catch (e: any) {
      alert('生成失败: ' + (e.message || e));
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!genResult?.steps || !saveName.trim()) return;
    try {
      const r = await apiFetch('/api/prompt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName, description: genInput, steps: genResult.steps }),
      });
      if (!r.ok) throw new Error(await r.text());
      const { id: newId } = await r.json();
      onChange(String(newId));
      loadTemplates();
      setShowGen(false);
      setGenResult(null);
      setGenInput('');
    } catch (e: any) {
      alert('保存失败: ' + (e.message || e));
    }
  };

  return (
    <div className="control template-control">
      <label className="control__label" htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          id={id}
          className="control__select nodrag"
          style={{ flex: 1 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">默认模板</option>
          {options.map((t) => (
            <option key={t.id} value={String(t.id)}>{t.name}</option>
          ))}
        </select>
        <button
          className="nodrag"
          style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer' }}
          onClick={() => setShowGen(!showGen)}
          title="生成新模板"
        >+</button>
      </div>

      {showGen && (
        <div className="template-gen-panel" style={{ marginTop: 6, padding: 8, background: 'var(--bg-surface)', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)' }}>
          <textarea
            className="nodrag"
            placeholder="描述你的需求，例如：一套电商商品图，15张，时尚女士手提包，包含不同场景和模特姿势"
            value={genInput}
            onChange={(e) => setGenInput(e.target.value)}
            rows={3}
            style={{ width: '100%', resize: 'vertical', background: 'var(--bg-base)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: 6 }}
          />
          <button
            className="nodrag"
            disabled={generating || !genInput.trim()}
            onClick={handleGenerate}
            style={{ marginTop: 4, width: '100%', padding: '4px 0', cursor: generating ? 'wait' : 'pointer' }}
          >
            {generating ? '生成中（约2-3分钟）...' : '生成模板'}
          </button>

          {genResult?.steps && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: 'var(--accent)', marginBottom: 4 }}>✓ 生成了 {genResult.steps.length} 个步骤：</div>
              {genResult.steps.map((s: any, i: number) => (
                <div key={i} style={{ color: 'var(--text-muted)', paddingLeft: 8, marginBottom: 2 }}>
                  {s.order}. {s.name}
                </div>
              ))}
              <input
                className="nodrag"
                placeholder="模板名称"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                style={{ width: '100%', marginTop: 6, background: 'var(--bg-base)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: 4 }}
              />
              <button
                className="nodrag"
                onClick={handleSave}
                style={{ marginTop: 4, width: '100%', padding: '4px 0', cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4 }}
              >
                保存并使用
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
