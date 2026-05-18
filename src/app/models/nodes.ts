import { GetSchemes, ClassicPreset } from "rete";
import { FlowData, FlowNode } from "./flow";

export type HFNodeData = FlowNode & {
  deleteNode?: () => Promise<void>;
  replaceWithCreatedNode?: (block: FlowNode) => Promise<void>;
  assignSelectedBlocksToContainer?: (blockIds?: string[]) => Promise<void>;
  assignImportedSubflow?: (subFlow: FlowData, validationUrl?: string | null) => Promise<void>;
  clearContainerSubflow?: () => Promise<void>;
  cloneNode?: () => Promise<void>;
  __readonly?: boolean;
  __needsServerCreate?: boolean;
  __createdOnServer?: boolean;
  __isCreatingOnServer?: boolean;
  __focusOpen?: boolean;
  __updateBlockError?: string | null;
  __containerValidationErrors?: unknown[];
  __containerAssignmentError?: string | null;
  __containerAssigning?: boolean;
};

export type HFNode = ClassicPreset.Node & {
  data?: HFNodeData;
};

export type HFConnection = ClassicPreset.Connection<HFNode, HFNode>;

export type HFSchemes = GetSchemes<HFNode, HFConnection>;
