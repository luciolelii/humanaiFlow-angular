

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
  connections: FlowBlockConnection[];
};

export type BlockTypeName = "HumanInteractionBlock" | "LLMBlock" | "SourceBlock" | string;

export type BlockTypeSchema = Record<string, unknown> | null;

export type BlockType = {
  type: BlockTypeName;
  description: string;
  userInteractive: boolean;
  hasExampleBlock?: boolean;
  exampleBlockEndpoint?: string | null;
  configurationType: string | null;
  configurationClass: string | null;
  schema: BlockTypeSchema;
};

export type FlowBlock = {
  id: string;
  name: string;
  position?: { x: number, y: number };
  inputs: FlowPort[];
  outputs: FlowPort[];
  specificConfiguration: FlowBlockConfiguration;
  typeName: BlockTypeName;
};

export type FlowPort = {
  name: string;
  type: string;
  multiple: boolean;
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
