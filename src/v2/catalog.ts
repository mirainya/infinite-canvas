import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  FileOutput,
  Images,
  ImageUp,
  MessageSquareText,
  Scissors,
  Sparkles,
  TextCursorInput,
  TextQuote,
  WandSparkles,
} from 'lucide-react';
import type { V2NodeData, V2NodeType } from './types';

export type DataType = 'image' | 'image-list' | 'text' | 'text-list';

export type PortDefinition = {
  id: string;
  label: string;
  accepts: DataType[];
};

export type NodeDefinition = {
  type: V2NodeType;
  name: string;
  category: '输入' | '整理' | '创作' | '输出';
  tone: 'pink' | 'mint' | 'lemon' | 'violet' | 'blue';
  icon: LucideIcon;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  defaults: V2NodeData;
};

export const NODE_CATALOG: NodeDefinition[] = [
  { type: 'image-input', name: '图像输入', category: '输入', tone: 'pink', icon: ImageUp, inputs: [], outputs: [{ id: 'image', label: '图像', accepts: ['image'] }], defaults: { title: '图像输入' } },
  { type: 'text-input', name: '文本输入', category: '输入', tone: 'lemon', icon: TextCursorInput, inputs: [], outputs: [{ id: 'text', label: '文本', accepts: ['text'] }], defaults: { title: '文本输入', text: '' } },
  { type: 'image-collection', name: '图像集合', category: '整理', tone: 'blue', icon: Images, inputs: [{ id: 'images', label: '图像', accepts: ['image', 'image-list'] }], outputs: [{ id: 'image', label: '主图', accepts: ['image'] }, { id: 'images', label: '集合', accepts: ['image-list'] }], defaults: { title: '图像集合', items: [] } },
  { type: 'text-collection', name: '文本集合', category: '整理', tone: 'lemon', icon: TextQuote, inputs: [{ id: 'texts', label: '文本', accepts: ['text', 'text-list'] }], outputs: [{ id: 'text', label: '首条', accepts: ['text'] }, { id: 'texts', label: '集合', accepts: ['text-list'] }], defaults: { title: '文本集合', items: [] } },
  { type: 'ai-image', name: 'AI 图像', category: '创作', tone: 'violet', icon: WandSparkles, inputs: [{ id: 'prompt', label: '提示词', accepts: ['text'] }, { id: 'prompts', label: '提示词组', accepts: ['text-list'] }, { id: 'images', label: '参考图', accepts: ['image', 'image-list'] }, { id: 'mask', label: '蒙版', accepts: ['image'] }], outputs: [{ id: 'image', label: '主图', accepts: ['image'] }, { id: 'images', label: '全部', accepts: ['image-list'] }], defaults: { title: 'AI 图像', prompt: '', aspectRatio: '1:1', count: 1 } },
  { type: 'text-generation', name: '文本生成', category: '创作', tone: 'blue', icon: Bot, inputs: [{ id: 'instruction', label: '指令', accepts: ['text'] }, { id: 'content', label: '内容', accepts: ['text', 'text-list'] }, { id: 'images', label: '参考图', accepts: ['image', 'image-list'] }], outputs: [{ id: 'text', label: '文本', accepts: ['text'] }], defaults: { title: '文本生成', instruction: '', content: '' } },
  { type: 'prompt-enhance', name: '提示词增强', category: '创作', tone: 'mint', icon: Sparkles, inputs: [{ id: 'brief', label: '描述', accepts: ['text', 'text-list'] }, { id: 'images', label: '参考图', accepts: ['image', 'image-list'] }], outputs: [{ id: 'prompt', label: '提示词', accepts: ['text'] }, { id: 'prompts', label: '提示词组', accepts: ['text-list'] }], defaults: { title: '提示词增强', brief: '' } },
  { type: 'image-split', name: '图像切分', category: '创作', tone: 'pink', icon: Scissors, inputs: [{ id: 'image', label: '图像', accepts: ['image'] }], outputs: [{ id: 'images', label: '切片', accepts: ['image-list'] }], defaults: { title: '图像切分', rows: 2, columns: 2 } },
  { type: 'image-output', name: '图像输出', category: '输出', tone: 'mint', icon: FileOutput, inputs: [{ id: 'images', label: '图像', accepts: ['image', 'image-list'] }], outputs: [], defaults: { title: '图像输出' } },
  { type: 'text-output', name: '文本输出', category: '输出', tone: 'lemon', icon: MessageSquareText, inputs: [{ id: 'texts', label: '文本', accepts: ['text', 'text-list'] }], outputs: [], defaults: { title: '文本输出' } },
];

export const NODE_BY_TYPE = new Map(NODE_CATALOG.map((item) => [item.type, item]));

export function canConnect(sourceType: V2NodeType, sourceHandle: string, targetType: V2NodeType, targetHandle: string) {
  const source = NODE_BY_TYPE.get(sourceType)?.outputs.find((port) => port.id === sourceHandle);
  const target = NODE_BY_TYPE.get(targetType)?.inputs.find((port) => port.id === targetHandle);
  return Boolean(source && target && source.accepts.some((type) => target.accepts.includes(type)));
}
