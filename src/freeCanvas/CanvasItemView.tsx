import { memo, useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import type { CanvasImageData, CanvasItem } from './canvasDocument';

type SelectEvent = { cancelBubble: boolean; evt: MouseEvent | TouchEvent };

type CanvasItemViewProps = {
  item: CanvasItem;
  selected: boolean;
  contentCount?: number;
  spaceProgress?: { completed: number; total: number };
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onEditText: (id: string) => void;
  onCandidateSelect: (groupId: string, imageId: string) => void;
};

const IMAGE_CACHE = new Map<string, HTMLImageElement>();
const IMAGE_LOADS = new Map<string, Promise<HTMLImageElement | null>>();

const FRAME_COLORS: Record<string, { line: string; label: string; fill: string }> = {
  red: { line: '#f4b7ca', label: '#c74f78', fill: '#fffafd' },
  blue: { line: '#add9ee', label: '#3c8db5', fill: '#fbfeff' },
  green: { line: '#a8dfd0', label: '#318f77', fill: '#fbfffd' },
  yellow: { line: '#ecd78f', label: '#a47d10', fill: '#fffef8' },
  violet: { line: '#cfc0ec', label: '#7759b8', fill: '#fdfcff' },
};

function useCanvasImage(url: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(() => IMAGE_CACHE.get(url) || null);
  useEffect(() => {
    let active = true;
    const cached = IMAGE_CACHE.get(url);
    if (cached) {
      void Promise.resolve(cached).then((next) => { if (active) setImage(next); });
      return () => { active = false; };
    }
    let load = IMAGE_LOADS.get(url);
    if (!load) {
      load = new Promise((resolve) => {
        const next = new Image();
        next.onload = () => {
          IMAGE_CACHE.set(url, next);
          IMAGE_LOADS.delete(url);
          resolve(next);
        };
        next.onerror = () => {
          IMAGE_LOADS.delete(url);
          resolve(null);
        };
        next.src = url;
      });
      IMAGE_LOADS.set(url, load);
    }
    void load.then((next) => { if (active) setImage(next); });
    return () => { active = false; };
  }, [url]);
  return image;
}

const SPACE_COLORS = {
  pink: { fill: '#fff8fb', line: '#f3bed1', strong: '#bd5178', wash: '#fde7ef' },
  mint: { fill: '#f7fdfa', line: '#adddce', strong: '#2f8b73', wash: '#e5f7f1' },
  lemon: { fill: '#fffdf6', line: '#e8d38d', strong: '#96720e', wash: '#fff4cb' },
  blue: { fill: '#f7fcff', line: '#afd8eb', strong: '#3985aa', wash: '#e4f4fb' },
  violet: { fill: '#fbf9ff', line: '#cfc1ea', strong: '#7153ad', wash: '#eee7fb' },
};

function ImageContent({ image, x = 0, y = 0, width = image.width, height = image.height }: {
  image: CanvasImageData;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const source = useCanvasImage(image.previewUrl || image.url);
  const sourceWidth = source?.naturalWidth || source?.width || image.naturalWidth;
  const sourceHeight = source?.naturalHeight || source?.height || image.naturalHeight;
  const sourceRatio = sourceWidth / Math.max(1, sourceHeight);
  const targetRatio = width / Math.max(1, height);
  const crop = sourceRatio > targetRatio
    ? { x: (sourceWidth - sourceHeight * targetRatio) / 2, y: 0, width: sourceHeight * targetRatio, height: sourceHeight }
    : { x: 0, y: (sourceHeight - sourceWidth / targetRatio) / 2, width: sourceWidth, height: sourceWidth / targetRatio };
  return (
    <Group x={x} y={y}>
      <Rect width={width} height={height} fill="#f2eff5" cornerRadius={6} />
      {source && <KonvaImage image={source} width={width} height={height} crop={crop} cornerRadius={6} />}
      {!source && <Text width={width} height={height} text="图片加载中" align="center" verticalAlign="middle" fontSize={13} fill="#968e9d" />}
    </Group>
  );
}

function CanvasItemView({ item, selected, contentCount = 0, spaceProgress, onSelect, onMove, onEditText, onCandidateSelect }: CanvasItemViewProps) {
  const select = (event: SelectEvent) => {
    event.cancelBubble = true;
    onSelect(item.id, 'shiftKey' in event.evt && event.evt.shiftKey);
  };
  const common = {
    id: item.id,
    name: 'canvas-object',
    x: item.x,
    y: item.y,
    rotation: item.rotation,
    opacity: item.opacity,
    draggable: !item.locked,
    onClick: select,
    onTap: select,
    onDragEnd: (event: { target: { x: () => number; y: () => number } }) => onMove(item.id, event.target.x(), event.target.y()),
  };

  if (item.type === 'space') {
    const color = SPACE_COLORS[item.accent];
    const progress = spaceProgress || { completed: 0, total: 0 };
    return (
      <Group {...common}>
        <Rect
          width={item.width}
          height={item.height}
          fill={color.fill}
          stroke={selected ? color.strong : color.line}
          strokeWidth={selected ? 2 : 1}
          cornerRadius={10}
          shadowColor="#44374d"
          shadowOpacity={0.08}
          shadowBlur={28}
          shadowOffsetY={9}
        />
        <Rect width={item.width} height={78} fill={color.wash} opacity={0.52} cornerRadius={[10, 10, 0, 0]} />
        <Rect x={20} y={18} width={5} height={42} fill={color.strong} cornerRadius={3} />
        <Rect x={36} y={18} width={42} height={42} fill="#ffffff" opacity={0.9} cornerRadius={8} />
        <Text x={36} y={28} width={42} text="✦" align="center" fontSize={20} fill={color.strong} />
        <Text x={92} y={18} width={item.width - 310} text={item.name} fontSize={20} fontStyle="bold" fill="#39333f" ellipsis />
        <Text x={92} y={47} width={item.width - 310} text={item.subtitle} fontSize={12} fill="#716977" ellipsis />
        {progress.total > 0 && (
          <Group>
            <Text x={item.width - 196} y={20} width={168} text={`${progress.completed} / ${progress.total} 已完成`} align="right" fontSize={11} fontStyle="bold" fill={color.strong} />
            {Array.from({ length: progress.total }, (_, index) => (
              <Rect
                key={index}
                x={item.width - 28 - (progress.total - index) * 22}
                y={46}
                width={16}
                height={6}
                fill={index < progress.completed ? color.strong : '#ffffff'}
                opacity={index < progress.completed ? 1 : 0.9}
                cornerRadius={3}
              />
            ))}
          </Group>
        )}
      </Group>
    );
  }

  if (item.type === 'frame') {
    const color = FRAME_COLORS[item.color] || FRAME_COLORS.violet;
    return (
      <Group {...common}>
        <Rect
          width={item.width}
          height={item.height}
          fill={color.fill}
          stroke={selected ? color.label : color.line}
          strokeWidth={selected ? 2 : 1}
          cornerRadius={8}
          shadowColor="#453552"
          shadowOpacity={selected ? 0.12 : 0.055}
          shadowBlur={selected ? 18 : 12}
          shadowOffsetY={5}
        />
        <Rect width={item.width} height={58} fill={color.line} opacity={selected ? 0.27 : 0.18} cornerRadius={[8, 8, 0, 0]} />
        <Rect x={14} y={12} width={26} height={26} fill="#ffffff" opacity={0.92} cornerRadius={7} />
        <Text x={14} y={19} width={26} text={String(item.order || '·')} align="center" fontSize={10} fontStyle="bold" fill={color.label} />
        <Text x={48} y={10} width={item.width - 142} text={item.name} fontSize={13} fontStyle="bold" fill={color.label} ellipsis />
        <Text x={48} y={32} width={item.width - 64} text={item.brief || ''} fontSize={9} fill="#756e7a" ellipsis />
        <Rect x={item.width - 82} y={12} width={68} height={24} fill="#ffffff" opacity={0.9} cornerRadius={6} />
        <Text x={item.width - 82} y={19} width={68} text={contentCount ? `${contentCount} 张作品` : item.aspectRatio || '自由'} align="center" fontSize={9} fontStyle="bold" fill={contentCount ? color.label : '#847c89'} />
        {!contentCount && (
          <Group listening={false}>
            <Rect x={14} y={72} width={item.width - 28} height={item.height - 88} stroke={color.line} strokeWidth={1} dash={[7, 7]} cornerRadius={6} />
            <Text x={14} y={item.height / 2 - 21} width={item.width - 28} text="＋" align="center" fontSize={24} fill={color.line} />
            <Text x={14} y={item.height / 2 + 10} width={item.width - 28} text="待创作" align="center" fontSize={10} fill={color.label} opacity={0.62} />
          </Group>
        )}
      </Group>
    );
  }

  if (item.type === 'image') {
    return (
      <Group {...common}>
        <ImageContent image={item} />
        <Rect width={item.width} height={item.height} stroke={selected ? '#8466c8' : '#ffffff'} strokeWidth={selected ? 2 : 1} cornerRadius={6} listening={false} />
      </Group>
    );
  }

  if (item.type === 'image-group') {
    const featured = item.images.find((image) => image.id === item.featuredImageId) || item.images[0];
    if (item.collapsed && featured) {
      return (
        <Group {...common}>
          <Rect width={item.width} height={item.height} fill="#ffffff" stroke={selected ? '#8466c8' : '#e1dce7'} strokeWidth={selected ? 2 : 1} cornerRadius={8} shadowColor="#453552" shadowOpacity={0.1} shadowBlur={16} shadowOffsetY={5} />
          <Rect width={item.width} height={38} fill="#f7f2ff" cornerRadius={[8, 8, 0, 0]} />
          <Text x={12} y={11} width={item.width - 80} text="候选池" fontSize={11} fontStyle="bold" fill="#6f55aa" />
          <Text x={item.width - 68} y={11} width={56} text={`${item.images.length} 张`} align="right" fontSize={10} fill="#8d82a4" />
          <ImageContent image={featured} x={10} y={48} width={item.width - 20} height={item.height - 58} />
          <Rect x={10} y={48} width={item.width - 20} height={item.height - 58} stroke="#ffffff" strokeWidth={2} cornerRadius={6} listening={false} />
        </Group>
      );
    }
    return (
      <Group {...common}>
        <Rect
          width={item.width}
          height={item.height}
          fill="#ffffff"
          stroke={selected ? '#8466c8' : '#e1dce7'}
          strokeWidth={selected ? 2 : 1}
          cornerRadius={8}
          shadowColor="#453552"
          shadowOpacity={0.09}
          shadowBlur={16}
          shadowOffsetY={5}
        />
        <Rect width={item.width} height={34} fill="#f7f2ff" cornerRadius={[8, 8, 0, 0]} />
        <Text x={12} y={10} width={item.width - 80} text="候选池" fontSize={11} fontStyle="bold" fill="#6f55aa" ellipsis />
        <Text x={item.width - 68} y={10} width={56} text={`${item.images.length} 张`} align="right" fontSize={10} fill="#8d82a4" />
        {item.images.map((image, index) => (
          <Group
            key={image.id}
            onClick={(event: SelectEvent) => { event.cancelBubble = true; onCandidateSelect(item.id, image.id); }}
            onTap={(event: SelectEvent) => { event.cancelBubble = true; onCandidateSelect(item.id, image.id); }}
          >
            <ImageContent image={image} x={image.x} y={image.y} />
            <Rect x={image.x} y={image.y} width={image.width} height={image.height} stroke={image.id === featured?.id ? '#f06f9e' : '#ffffff'} strokeWidth={image.id === featured?.id ? 3 : 1} cornerRadius={6} listening={false} />
            <Rect x={image.x + 7} y={image.y + 7} width={23} height={20} fill={image.id === featured?.id ? '#f06f9e' : 'rgba(48,45,54,0.55)'} cornerRadius={5} listening={false} />
            <Text x={image.x + 7} y={image.y + 12} width={23} text={String(index + 1)} align="center" fontSize={9} fontStyle="bold" fill="#ffffff" listening={false} />
          </Group>
        ))}
      </Group>
    );
  }

  if (item.type === 'text') {
    return (
      <Text
        {...common}
        text={item.text}
        width={item.width}
        height={item.height}
        padding={4}
        fontSize={item.fontSize}
        fontFamily="Inter, 'Microsoft YaHei', sans-serif"
        fill={item.color}
        align={item.align}
        verticalAlign="middle"
        onDblClick={() => onEditText(item.id)}
        onDblTap={() => onEditText(item.id)}
      />
    );
  }

  return (
    <Line
      {...common}
      points={item.points}
      stroke={item.color}
      strokeWidth={item.strokeWidth}
      lineCap="round"
      lineJoin="round"
      tension={0.35}
      hitStrokeWidth={14}
    />
  );
}

export default memo(CanvasItemView);
