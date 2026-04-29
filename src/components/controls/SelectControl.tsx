type SelectControlProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

export default function SelectControl({ id, label, value, options, onChange }: SelectControlProps) {
  return (
    <div className="control select-control">
      <label className="control__label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="control__select nodrag"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
