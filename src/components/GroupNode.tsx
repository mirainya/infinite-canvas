import { memo } from 'react';
import { type NodeProps } from 'reactflow';
import { useCanvasCallbacks } from './CanvasCallbacks';

type GroupNodeData = {
  title: string;
  color?: string;
  tags?: string[];
  note?: string;
};

function GroupNode({ id, data }: NodeProps<GroupNodeData>) {
  const { onChange } = useCanvasCallbacks();
  const tags = data.tags ?? [];

  return (
    <div
      className="group-node"
      style={{
        borderColor: data.color ?? '#38bdf8',
        background: `${data.color ?? '#38bdf8'}18`,
      }}
    >
      <input
        className="group-node__title nodrag"
        value={data.title}
        placeholder="区域标题"
        onChange={(event) => onChange(id, { title: event.target.value })}
      />
      {tags.length > 0 ? (
        <div className="group-node__tags node-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      {data.note ? <div className="group-node__note node-note-badge">有备注</div> : null}
      <div className="group-node__hint">分组区域</div>
    </div>
  );
}

export default memo(GroupNode, (prev, next) => prev.data === next.data && prev.selected === next.selected);
