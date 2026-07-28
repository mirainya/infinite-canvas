import { Handle, Position } from 'reactflow';
import type { ReactNode } from 'react';
import { PORT_COLORS } from '../../constants';
import type { NodeDefinition } from '../../types/workflow';

export type CreativeNodeTone = 'assets' | 'draw' | 'edit' | 'compose';

type HeaderProps = {
  title: string;
  eyebrow: string;
  tone: CreativeNodeTone;
  symbol: string;
  status: string;
  statusActive?: boolean;
};

export function CreativeNodeHeader({ title, eyebrow, tone, symbol, status, statusActive }: HeaderProps) {
  return (
    <header className={`wf__creative-header wf__creative-header--${tone}`}>
      <span className="wf__creative-symbol" aria-hidden="true">{symbol}</span>
      <span className="wf__creative-identity">
        <span className="wf__creative-eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </span>
      <span className={`wf__creative-status ${statusActive ? 'is-active' : ''}`}>{status}</span>
    </header>
  );
}

export function CreativeNodePorts({ def, outputOnly = false }: { def: NodeDefinition; outputOnly?: boolean }) {
  const maxPorts = outputOnly ? def.outputs.length : Math.max(def.inputs.length, def.outputs.length);
  if (maxPorts === 0) return null;

  return (
    <section className={`wf__creative-ports ${outputOnly ? 'wf__creative-ports--output' : ''}`}>
      <div className="wf__creative-section-label">{outputOnly ? '输出' : '连接'}</div>
      {Array.from({ length: maxPorts }, (_, index) => {
        const input = outputOnly ? undefined : def.inputs[index];
        const output = def.outputs[index];
        return (
          <div className="wf__creative-port-row" key={`${input?.id ?? ''}-${output?.id ?? ''}-${index}`}>
            <div className="wf__creative-port-cell wf__creative-port-cell--input">
              {input && (
                <>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`input-${input.id}`}
                    className="wf__handle"
                    style={{ background: PORT_COLORS[input.type] }}
                  />
                  <span className="wf__creative-port-kind">输入</span>
                  <span>{input.label}</span>
                </>
              )}
            </div>
            <div className="wf__creative-port-cell wf__creative-port-cell--output">
              {output && (
                <>
                  <span>{output.label}</span>
                  <span className="wf__creative-port-kind">输出</span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`output-${output.id}`}
                    className="wf__handle"
                    style={{ background: PORT_COLORS[output.type] }}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function CreativeNodeSection({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`wf__creative-section ${className}`}>
      {label && <div className="wf__creative-section-label">{label}</div>}
      {children}
    </section>
  );
}
