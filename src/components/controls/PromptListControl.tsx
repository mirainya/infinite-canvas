import { useCallback, useMemo } from 'react';

type Props = {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string) => void;
};

export default function PromptListControl({ id, label, value, onChange }: Props) {
  const prompts: string[] = useMemo(() => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [value]);

  const update = useCallback(
    (next: string[]) => onChange(JSON.stringify(next)),
    [onChange],
  );

  const handleChange = useCallback(
    (index: number, text: string) => {
      const next = [...prompts];
      next[index] = text;
      update(next);
    },
    [prompts, update],
  );

  const handleRemove = useCallback(
    (index: number) => update(prompts.filter((_, i) => i !== index)),
    [prompts, update],
  );

  const handleAdd = useCallback(
    () => update([...prompts, '']),
    [prompts, update],
  );

  if (prompts.length === 0) return null;

  return (
    <div className="control prompt-list-control" id={id}>
      <div className="prompt-list-control__header">
        <label className="control__label">{label}</label>
        <span className="prompt-list-control__count">{prompts.length} 条</span>
      </div>
      <div className="prompt-list-control__list nodrag nowheel">
        {prompts.map((p, i) => (
          <div key={i} className="prompt-list-control__item">
            <span className="prompt-list-control__index">{i + 1}</span>
            <textarea
              className="prompt-list-control__textarea nodrag nowheel"
              value={p}
              onChange={(e) => handleChange(i, e.target.value)}
              rows={2}
            />
            <button
              type="button"
              className="prompt-list-control__remove"
              onClick={() => handleRemove(i)}
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="prompt-list-control__add" onClick={handleAdd}>
        + 添加提示词
      </button>
    </div>
  );
}
