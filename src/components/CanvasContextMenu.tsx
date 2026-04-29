import type { Node } from 'reactflow';
import { getNodesByCategory } from '../nodes';
import type { CanvasNodeData, ContextMenuState } from '../types';

type CanvasContextMenuProps = {
  menu: ContextMenuState | null;
  node: Node<CanvasNodeData> | null;
  onClose: () => void;
  onFocusNode: (nodeId: string) => void;
  onOpenDetail: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddGroup: (position: { x: number; y: number }) => void;
  onAddWorkflowNode: (defId: string, position: { x: number; y: number }) => void;
};

function CanvasContextMenu({
  menu,
  node,
  onClose,
  onFocusNode,
  onOpenDetail,
  onDuplicateNode,
  onDeleteNode,
  onAddGroup,
  onAddWorkflowNode,
}: CanvasContextMenuProps) {
  if (!menu) return null;

  const grouped = getNodesByCategory();

  return (
    <div className="context-menu" style={{ left: menu.x, top: menu.y }}>
      {node ? (
        <>
          <div className="context-menu__title">{node.data.title}</div>
          <button
            type="button"
            onClick={() => {
              onFocusNode(node.id);
              onClose();
            }}
          >
            定位节点
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenDetail(node.id);
              onClose();
            }}
          >
            打开详情
          </button>
          <button
            type="button"
            onClick={() => {
              onDuplicateNode(node.id);
              onClose();
            }}
          >
            复制节点
          </button>
          <button
            type="button"
            className="context-menu__danger"
            onClick={() => {
              onDeleteNode(node.id);
              onClose();
            }}
          >
            删除节点
          </button>
        </>
      ) : (
        <>
          <div className="context-menu__title">添加节点</div>
          {Array.from(grouped.entries()).map(([category, defs]) =>
            defs.map((def) => (
              <button
                key={def.defId}
                type="button"
                onClick={() => {
                  onAddWorkflowNode(def.defId, menu.flowPosition);
                  onClose();
                }}
              >
                {category}：{def.name}
              </button>
            )),
          )}
          <div className="context-menu__separator" />
          <button
            type="button"
            onClick={() => {
              onAddGroup(menu.flowPosition);
              onClose();
            }}
          >
            新建分组区域
          </button>
        </>
      )}
    </div>
  );
}

export default CanvasContextMenu;
