import type { Node } from 'reactflow';
import type { CanvasNodeData } from '../types';

type DetailDrawerProps = {
  node: Node<CanvasNodeData> | null;
  onClose: () => void;
  onChange: (id: string, data: Partial<Omit<CanvasNodeData, 'onChange'>>) => void;
};

const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );

function DetailDrawer({ node, onClose, onChange }: DetailDrawerProps) {
  if (!node) return null;

  return (
    <aside className="detail-drawer">
      <div className="detail-drawer__header">
        <div>
          <h2>节点详情</h2>
          <p>{node.type === 'groupNode' ? '分组区域' : '工作流节点'}</p>
        </div>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>

      <label>
        标题
        <input value={node.data.title} onChange={(event) => onChange(node.id, { title: event.target.value })} />
      </label>

      <label>
        标签
        <input
          value={node.data.tags?.join(', ') ?? ''}
          onChange={(event) => onChange(node.id, { tags: parseTags(event.target.value) })}
        />
      </label>

      <label>
        备注
        <textarea
          value={node.data.note ?? ''}
          placeholder="记录资料、思路、链接..."
          onChange={(event) => onChange(node.id, { note: event.target.value })}
        />
      </label>
    </aside>
  );
}

export default DetailDrawer;
