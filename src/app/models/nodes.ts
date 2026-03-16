import { GetSchemes, ClassicPreset } from "rete";
import { FlowData, FlowNode } from "./flow";

export type HFNodeData = FlowNode & {
  deleteNode?: () => Promise<void>;
  replaceWithCreatedNode?: (block: FlowNode) => Promise<void>;
  assignSelectedBlocksToContainer?: (blockIds?: string[]) => Promise<void>;
  assignImportedSubflow?: (subFlow: FlowData, validationUrl?: string | null) => Promise<void>;
  clearContainerSubflow?: () => Promise<void>;
  [key: string]: unknown;
};

export type HFNode = ClassicPreset.Node & {
  data?: HFNodeData;
};

export type HFConnection = ClassicPreset.Connection<HFNode, HFNode>;

export type HFSchemes = GetSchemes<HFNode, HFConnection>;
