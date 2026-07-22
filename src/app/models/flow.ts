

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
    validationErrors?: FlowValidationError[];
};

export type FlowData = {
  blocks: FlowBlock[];
  containers: FlowContainer[];
  connections: FlowBlockConnection[];
  dependencies: FlowNodeDependency[];
  globalInputs?: FlowGlobalInput[];
  lanes?: FlowLane[];
};

export type FlowLane = {
  id: string;
  name: string;
  description?: string | null;
  order: number;
  color?: string | null;
};

export type FlowGlobalInput = {
  name: string;
  type: string;
  multiple: boolean;
  valueSchema?: Record<string, unknown> | null;
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

export type BlockInteractionContractKind = 'chat-session' | 'single-response' | string;

export type BlockInteractionContract = {
  kind: BlockInteractionContractKind;
  messageField: string | null;
  completionField: string | null;
  historyField: string | null;
  responseField: string | null;
  supportsPartialResult: boolean;
};

export type BlockType = {
  type: BlockTypeName;
  family: NodeFamily;
  description: string;
  userInteractive: boolean;
  interactionContract?: BlockInteractionContract | null;
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
  laneId?: string | null;
};

export type BiasActivationMode =
  | 'PROMPT_DIRECTIVE'
  | 'INPUT_TRANSFORMATION'
  | 'OUTPUT_TRANSFORMATION'
  | 'ROUTING_OVERRIDE'
  | 'MOCK_RESPONSE'
  | string;

export type BehavioralProbe = {
  activationMode?: BiasActivationMode;
  instruction?: string;
  targetInputs?: string[];
  expectedImpact?: string;
  mockOutputs?: Record<string, unknown>;
};

export function isProbeExecutable(probe: BehavioralProbe | null | undefined): boolean {
  if (!probe?.activationMode) return false;

  if (probe.activationMode === 'MOCK_RESPONSE') {
    return !!probe.mockOutputs && Object.keys(probe.mockOutputs).length > 0;
  }

  return typeof probe.instruction === 'string' && probe.instruction.trim().length > 0;
}

export type BiasAnnotation = Record<string, unknown> & {
  id?: string;
  category?: string;
  severity?: string;
  issue?: string;
  rationale?: string;
  mitigation?: string;
  status?: string;
  source?: string;
  analysisId?: string;
  behavioralProbe?: BehavioralProbe;
};

export type BiasAnnotationOption = {
  value: string;
  label: string;
  description?: string;
};

export type BiasAnnotationsDescriptor = {
  type: string;
  blockProperty: string;
  multiple: boolean;
  maxItems: number | null;
  schema: Record<string, unknown>;
  options: Record<string, BiasAnnotationOption[]>;
  defaults: Record<string, unknown>;
  serverGeneratedFields: string[];
};

export type FlowBlock = FlowNodeBase & {
  nodeFamily?: 'block';
  biasAnnotations?: BiasAnnotation[];
};

export type FlowContainer = FlowNodeBase & {
  nodeFamily: 'container';
  biasAnnotations?: BiasAnnotation[];
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
  valueSchema?: Record<string, unknown> | null;
};

export type FlowBlockConnection = {
  id: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
};

export type FlowNodeDependency = {
  sourceId: string;
  targetId: string;
};

export type FlowValidationError = {
  code?: string | null;
  entity?: string | null;
  id?: string | null;
  field?: string | null;
  message: string;
  relatedNodeIds?: string[];
};

export const FLOW_DEPENDANT_PORT_KEY = '__dependant';
export const FLOW_DEPENDENCY_PORT_KEY = '__dependency';
export const FLOW_DEPENDENCY_SOCKET_TYPE = '__FLOW_DEPENDENCY__';

export function normalizeFlowValidationErrors(raw: unknown): FlowValidationError[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      code: typeof item['code'] === 'string' ? item['code'] : null,
      entity: typeof item['entity'] === 'string' ? item['entity'] : null,
      id: typeof item['id'] === 'string' ? item['id'] : null,
      field: typeof item['field'] === 'string' ? item['field'] : null,
      message: String(item['message'] ?? item['error'] ?? 'Validation error'),
      relatedNodeIds: normalizeRelatedNodeIds(item)
    }));
}

function normalizeRelatedNodeIds(item: Record<string, unknown>): string[] {
  const explicitNodeIds = Array.isArray(item['relatedNodeIds'])
    ? item['relatedNodeIds'].map((value) => String(value)).filter((value) => value.length > 0)
    : [];

  if (explicitNodeIds.length > 0) {
    return Array.from(new Set(explicitNodeIds));
  }

  const entity = typeof item['entity'] === 'string' ? item['entity'].toLowerCase() : '';
  const id = typeof item['id'] === 'string' ? item['id'].trim() : '';

  if ((entity === 'block' || entity === 'container') && id.length > 0) {
    return [id];
  }

  return [];
}

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
