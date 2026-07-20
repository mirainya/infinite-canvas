import { Handle, Position } from 'reactflow';
import { PORT_COLORS } from '../../constants';
import type { NodeBodyProps } from '../registry';

export default function TextBoxBody({ def, pv, selected, updatePVs }: NodeBodyProps) {
  const inputText = pv['input-text'] as string | undefined;
  const content = inputText || (pv['content'] as string) || '';

  const handleChange = (val: string) => {
    updatePVs({ content: val, 'output-text': val });
  };

  return (
    <div className={`wf wf--textbox ${selected ? 'wf--selected' : ''}`}>
      <div className="wf__title">{def.name}</div>
      <div className="wf__ports">
        <div className="wf__port-row">
          <div className="wf__port-cell wf__port-cell--left">
            <Handle type="target" position={Position.Left} id="input-text" className="wf__handle" style={{ background: PORT_COLORS.STRING }} />
            <span className="wf__port-label">文本</span>
          </div>
          <div className="wf__port-cell wf__port-cell--right">
            <span className="wf__port-label">文本</span>
            <Handle type="source" position={Position.Right} id="output-text" className="wf__handle" style={{ background: PORT_COLORS.STRING }} />
          </div>
        </div>
      </div>
      <textarea
        className="wf__textbox-area nodrag nowheel"
        value={content}
        readOnly={!!inputText}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="输入或接收文本..."
      />
    </div>
  );
}
