import { memo, useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import type { CanvasImageData, CanvasItem } from './canvasDocument';

type SelectEvent = { cancelBubble: boolean; evt: MouseEvent | TouchEvent };

type CanvasItemViewProps = {
  item: CanvasItem;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onEditText: (id: string) => void;
};

const FRAME_COLORS: Record<string, { line: string; label: string; fill: string }> = {
  red: { line: '#f4b7ca', label: '#c74f78', fill: '#fffafd' },
  blue: { line: '#add9ee', label: '#3c8db5', fill: '#fbfeff' },
  green: { line: '#a8dfd0', label: '#318f77', fill: '#fbfffd' },
  yellow: { line: '#ecd78f', label: '#a47d10', fill: '#fffef8' },
  violet: { line: '#cfc0ec', label: '#7759b8', fill: '#fdfcff' },
};

function useCanvasImage(url: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let active = true;
    const next = new Image();
    next.onload = () => { if (active) setImage(next); };
    next.onerror = () => { if (active) setImage(null); };
    next.src = url;
    return () => { active = false; };
  }, [url]);
  return image;
}

function ImageContent({ image, x = 0, y = 0 }: { image: CanvasImageData; x?: number; y?: number }) {
  const source = useCanvasImage(image.previewUrl || image.url);
  return (
    <Group x={x} y={y}>
      <Rect width={image.width} height={image.height} fill="#f2eff5" cornerRadius={6} />
      {source && <KonvaImage image={source} width={image.width} height={image.height} cornerRadius={6} />}
      {!source && <Text width={image.width} height={image.height} text="图片加载中" align="center" verticalAlign="middle" fontSize={13} fill="#968e9d" />}
    </Group>
  );
}

function CanvasItemView({ item, selected, onSelect, onMove, onEditText }: CanvasItemViewProps) {
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

  if (item.type === 'frame') {
    const color = FRAME_COLORS[item.color] || FRAME_COLORS.violet;
    return (
      <Group {...common}>
        <Rect
          width={item.width}
          height={item.height}
          fill={color.fill}
          stroke={selected ? '#8466c8' : color.line}
          strokeWidth={selected ? 2 : 1}
          cornerRadius={8}
          shadowColor="#453552"
          shadowOpacity={0.06}
          shadowBlur={12}
          shadowOffsetY={4}
        />
        <Rect width={item.width} height={38} fill={color.line} opacity={0.18} cornerRadius={[8, 8, 0, 0]} />
        <Text x={14} y={11} width={item.width - 28} text={item.name} fontSize={13} fontStyle="bold" fill={color.label} ellipsis />
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
        <Text x={12} y={10} width={item.width - 24} text={item.name} fontSize={11} fontStyle="bold" fill="#6f55aa" ellipsis />
        {item.images.map((image) => <ImageContent key={image.id} image={image} x={image.x} y={image.y} />)}
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
