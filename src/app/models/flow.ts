

export type FlowVisibility = 'PUBLIC' | 'PRIVATE';
export type FlowStatus = 'DRAFT' | 'EXECUTABLE';

export type Flow = {
    id: string;
    name: string;
    visibility: FlowVisibility;
    data: FlowData;
    author: string;
    description?: string;
    createdAt: Date;
    status: FlowStatus;
    updatedAt: Date;
    published?: boolean;
    finalized?: boolean;
};

export type FlowData = {
  blocks: FlowBlock[];
  containers: FlowContainer[];
  connections: FlowBlockConnection[];
};

export type FlowSubflowValidationError = {
  entity?: string;
  id?: string;
  field?: string;
  message: string;
};

export type FlowSubflowValidationResult = {
  valid: boolean;
  errors: FlowSubflowValidationError[];
  openInputs: FlowContainerOpenInput[];
  openOutputs: FlowContainerOpenOutput[];
};

export type BlockTypeName = "HumanInteractionBlock" | "LLMBlock" | "SourceBlock" | string;
export type NodeFamily = 'block' | 'container';

export type BlockTypeSchema = Record<string, unknown> | null;

export type BlockType = {
  type: BlockTypeName;
  family: NodeFamily;
  description: string;
  userInteractive: boolean;
  hasExampleBlock?: boolean;
  exampleBlockEndpoint?: string | null;
  configurationType: string | null;
  configurationClass: string | null;
  schema: BlockTypeSchema;
};

export type FlowNodeBase = {
  id: string;
  name: string;
  position?: { x: number, y: number };
  inputs: FlowPort[];
  outputs: FlowPort[];
  specificConfiguration: FlowBlockConfiguration;
  typeName: BlockTypeName;
  nodeFamily?: NodeFamily;
};

export type FlowBlock = FlowNodeBase & {
  nodeFamily?: 'block';
};

export type FlowContainer = FlowNodeBase & {
  nodeFamily: 'container';
};

export type FlowNode = FlowBlock | FlowContainer;

export type FlowValueKind = {
  type: string;
  multiple: boolean;
};

export type FlowPort = {
  name: string;
  type: string;
  multiple: boolean;
  valueKinds?: FlowValueKind[];
};

export type FlowBlockConnection = {
  id: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
};

export type FlowBlockConfiguration =
  | LLMBlockConfiguration
  | HumanInteractiveBlockConfiguration
  | Record<string, unknown>;

export type FlowContainerOpenInput = FlowPort & {
  targetBlockId?: string;
  targetInputName?: string;
  blockId?: string;
  inputName?: string;
};

export type FlowContainerOpenOutput = FlowPort & {
  sourceBlockId?: string;
  sourceOutputName?: string;
  blockId?: string;
  outputName?: string;
};

export type LLMDescriptor = {
  provider: string;
  model: string;
};

export type LLMBlockConfiguration = {
  type: "LLMBlockConfiguration";
  name: string;
  llmDescriptor: LLMDescriptor;
  prompt: string;
};

export type HumanInteractiveBlockConfiguration = {
  type: "HumanInteractiveBlockConfiguration";
  name: string;
  actionDescription: string;
  llmDescriptor: LLMDescriptor;
  inputAsList: boolean;
  outputAsList: boolean;
};

export function currentFlowPortValueKind(port: FlowPort): FlowValueKind {
  return {
    type: String(port.type ?? 'ANY').toUpperCase(),
    multiple: Boolean(port.multiple)
  };
}

export function normalizeFlowPortValueKinds(port: FlowPort): FlowValueKind[] {
  const rawKinds = Array.isArray(port.valueKinds) ? port.valueKinds : [];
  const normalized = rawKinds
    .filter((kind): kind is FlowValueKind => !!kind && typeof kind.type === 'string')
    .map((kind) => ({
      type: String(kind.type).toUpperCase(),
      multiple: Boolean(kind.multiple)
    }));

  if (!normalized.length) {
    return [currentFlowPortValueKind(port)];
  }

  const unique = new Map<string, FlowValueKind>();
  for (const kind of normalized) {
    unique.set(`${kind.type}:${kind.multiple ? 'multi' : 'single'}`, kind);
  }
  return Array.from(unique.values());
}

export function flowValueKindLabel(kind: FlowValueKind): string {
  const type = String(kind.type ?? 'ANY').toUpperCase();
  return kind.multiple ? `${type}[]` : type;
}

export function areFlowValueKindsCompatible(sourceKinds: FlowValueKind[], targetKinds: FlowValueKind[]): boolean {
  return sourceKinds.some((source) =>
    targetKinds.some((target) => {
      if (Boolean(source.multiple) !== Boolean(target.multiple)) return false;
      const sourceType = String(source.type ?? 'ANY').toUpperCase();
      const targetType = String(target.type ?? 'ANY').toUpperCase();
      return sourceType === 'ANY' || targetType === 'ANY' || sourceType === targetType;
    })
  );
}
