import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';

type ModelOption = { code: string; name: string };

type Props = {
  id: string;
  label: string;
  value: string;
  modelType?: string;
  onChange: (value: string) => void;
};

const modelCache: Record<string, ModelOption[]> = {};
let preloadDone = false;

export function preloadModels() {
  if (preloadDone) return;
  preloadDone = true;
  for (const t of ['image', 'chat', 'video']) {
    apiFetch(`/api/models?type=${t}`)
      .then((r) => r.ok ? r.json() : [])
      .then((list: ModelOption[]) => { modelCache[t] = list; })
      .catch(() => {});
  }
}

export default function ModelControl({ id, label, value, modelType = 'image', onChange }: Props) {
  const [loadedOptions, setLoadedOptions] = useState<Record<string, ModelOption[]>>({});
  const options = loadedOptions[modelType] ?? modelCache[modelType] ?? [];

  useEffect(() => {
    if (modelCache[modelType]?.length) return;
    let cancelled = false;
    apiFetch(`/api/models?type=${modelType}`)
      .then((r) => r.ok ? r.json() : [])
      .then((list: ModelOption[]) => {
        modelCache[modelType] = list;
        if (!cancelled) setLoadedOptions((current) => ({ ...current, [modelType]: list }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [modelType]);

  return (
    <div className="control select-control">
      <label className="control__label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="control__select nodrag"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">默认</option>
        {options.map((m) => (
          <option key={m.code} value={m.code}>{m.name}</option>
        ))}
      </select>
    </div>
  );
}
