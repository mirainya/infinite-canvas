export type DataType = 'STRING' | 'IMAGE' | 'NUMBER' | 'MASK' | 'ANY';

export type PortDef = {
  id: string;
  label: string;
  type: DataType;
  required?: boolean;
};

export type ControlDef =
  | { kind: 'text'; id: string; label: string; placeholder?: string; multiline?: boolean; default?: string }
  | { kind: 'number'; id: string; label: string; min?: number; max?: number; step?: number; default?: number }
  | { kind: 'select'; id: string; label: string; options: string[]; default?: string }
  | { kind: 'imageUpload'; id: string; label: string }
  | { kind: 'imageUploadMulti'; id: string; label: string; max?: number }
  | { kind: 'imageEdit'; id: string; label: string };

export type PortValues = Record<string, string | number | null>;

export type ExecuteStatus = 'queued' | 'running' | 'done' | 'failed';

export type SystemContext = {
  execute: (defId: string, inputs: PortValues, controls: PortValues, sourceId?: number) => Promise<PortValues>;
  executeStream?: (defId: string, inputs: PortValues, controls: PortValues, onStatus: (status: ExecuteStatus) => void, sourceId?: number) => Promise<PortValues>;
};

export type NodeDefinition = {
  defId: string;
  name: string;
  category: string;
  view?: string;
  inputs: PortDef[];
  outputs: PortDef[];
  controls: ControlDef[];
};
