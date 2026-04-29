import type { ReactNode, ComponentType } from 'react';
import type { NodeDefinition, ControlDef, PortValues } from '../types/workflow';

export type NodeBodyProps = {
  id: string;
  def: NodeDefinition;
  pv: PortValues;
  selected: boolean;
  running: boolean;
  error: string;
  updatePV: (key: string, value: string | number | null) => void;
  handleRun: () => void;
  renderCtrl: (ctrl: ControlDef) => ReactNode;
  renderPorts: () => ReactNode;
  renderFooter: () => ReactNode;
};

const bodyRegistry = new Map<string, ComponentType<NodeBodyProps>>();

export function registerNodeBody(view: string, component: ComponentType<NodeBodyProps>) {
  bodyRegistry.set(view, component);
}

export function getNodeBody(view?: string): ComponentType<NodeBodyProps> | undefined {
  if (!view || view === 'default') return undefined;
  return bodyRegistry.get(view);
}
