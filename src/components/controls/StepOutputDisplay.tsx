import { useState, useMemo } from 'react';

type StepInfo = { name: string; output: string };

type Props = {
  stepsJson: string | null;
  stepNames: string | null;
};

export default function StepOutputDisplay({ stepsJson, stepNames }: Props) {
  const steps: StepInfo[] = useMemo(() => {
    if (!stepsJson) return [];
    try {
      const outputs: string[] = JSON.parse(stepsJson);
      const names: string[] = stepNames ? JSON.parse(stepNames) : [];
      return outputs.map((output, i) => ({
        name: names[i] || `步骤${i + 1}`,
        output,
      }));
    } catch {
      return [];
    }
  }, [stepsJson, stepNames]);

  if (steps.length === 0) return null;

  return (
    <div className="step-outputs">
      {steps.map((step, i) => (
        <StepItem key={i} index={i} name={step.name} output={step.output} />
      ))}
    </div>
  );
}

function StepItem({ index, name, output }: { index: number; name: string; output: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = output.length > 120 ? output.slice(0, 120) + '...' : output;

  return (
    <div className="step-outputs__item">
      <button
        type="button"
        className="step-outputs__header nodrag"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="step-outputs__index">{index + 1}</span>
        <span className="step-outputs__name">{name}</span>
        <span className="step-outputs__toggle">{expanded ? '▾' : '▸'}</span>
      </button>
      <div className={`step-outputs__content nodrag nowheel ${expanded ? 'step-outputs__content--expanded' : ''}`}>
        {expanded ? output : preview}
      </div>
    </div>
  );
}
