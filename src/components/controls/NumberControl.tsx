type NumberControlProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
};

export default function NumberControl({ id, label, value, min, max, step, onChange }: NumberControlProps) {
  return (
    <div className="control number-control">
      <label className="control__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="control__input nodrag"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
