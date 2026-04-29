import { createContext, useContext } from 'react';
import type { CanvasNodeData } from '../types';
import type { PortValues, SystemContext } from '../types/workflow';

export type CanvasCallbacks = {
  onChange: (id: string, data: Partial<Omit<CanvasNodeData, 'onChange' | 'ctx' | 'propagate'>>) => void;
  ctx: SystemContext;
  propagate: (nodeId: string, portValues: PortValues) => void;
};

export const CanvasCallbacksCtx = createContext<CanvasCallbacks | null>(null);

export function useCanvasCallbacks() {
  return useContext(CanvasCallbacksCtx)!;
}
