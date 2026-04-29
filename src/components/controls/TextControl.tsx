type TextControlProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
};

export default function TextControl({ id, label, value, placeholder, multiline, onChange }: TextControlProps) {
  return (
    <div className="control text-control">
      <label className="control__label" htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          className="control__textarea nodrag nowheel"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          id={id}
          className="control__input nodrag"
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
