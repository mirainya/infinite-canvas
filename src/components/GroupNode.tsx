import { memo, type CSSProperties } from 'react';
import { NodeResizer, type NodeProps } from 'reactflow';
import { useCanvasCallbacks } from './CanvasCallbacks';
import type { CanvasNodeData } from '../types';

function GroupNode({ id, data, selected }: NodeProps<CanvasNodeData>) {
  const { onChange } = useCanvasCallbacks();
  const tags = data.tags ?? [];
  const color = data.color ?? '#38bdf8';

  return (
    <div
      className={`group-node ${selected ? 'group-node--selected' : ''} ${data.locked ? 'group-node--locked' : ''}`}
      style={{ '--group-color': color } as CSSProperties}
    >
      <NodeResizer
        isVisible={!!selected && !data.locked}
        minWidth={360}
        minHeight={240}
        lineClassName="group-node__resize-line"
        handleClassName="group-node__resize-handle"
      />
      <div className="group-node__header">
        <span className="group-node__kind">分组</span>
        <input
          className="group-node__title nodrag"
          value={data.title}
          maxLength={60}
          aria-label="分组标题"
          placeholder="未命名分组"
          onChange={(event) => onChange(id, { title: event.target.value })}
        />
        {data.locked && <span className="group-node__locked">位置已锁</span>}
      </div>
      <div className="group-node__meta">
        {tags.length > 0 && (
          <div className="group-node__tags">
            {tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
            {tags.length > 4 && <span>+{tags.length - 4}</span>}
          </div>
        )}
        {data.note?.trim() && (
          <p className="group-node__note" title={data.note}>{data.note}</p>
        )}
      </div>
      <div className="group-node__corner" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default memo(GroupNode, (prev, next) => prev.data === next.data && prev.selected === next.selected);
