import { GetSchemes, ClassicPreset } from "rete";
import { FlowBlock } from "./flow";

export type HFNodeData = FlowBlock & {
  deleteNode?: () => Promise<void>;
  replaceWithCreatedBlock?: (block: FlowBlock) => Promise<void>;
};

export type HFNode = ClassicPreset.Node & {
  data?: HFNodeData;
};

export type HFConnection = ClassicPreset.Connection<HFNode, HFNode>;

export type HFSchemes = GetSchemes<HFNode, HFConnection>;
