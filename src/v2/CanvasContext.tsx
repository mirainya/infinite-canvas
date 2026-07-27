import { createContext, useContext } from 'react';
import type { ModelInfo, V2NodeData } from './types';

type CanvasContextValue = {
  projectId: string;
  outputs: Record<string, Record<string, unknown>>;
  imageModels: ModelInfo[];
  chatModels: ModelInfo[];
  updateNode: (id: string, patch: Partial<V2NodeData>) => void;
  uploadImage: (file: File, kind?: string) => Promise<string>;
  openImage: (url: string) => void;
};

export const V2CanvasContext = createContext<CanvasContextValue | null>(null);

export function useV2Canvas() {
  const value = useContext(V2CanvasContext);
  if (!value) throw new Error('V2CanvasContext is missing');
  return value;
}
