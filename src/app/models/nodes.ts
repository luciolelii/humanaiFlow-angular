import { GetSchemes, ClassicPreset } from "rete";
import { FlowBlock } from "./flow";

export type HFNode = ClassicPreset.Node & {
  data?: FlowBlock;
};

export type HFConnection = ClassicPreset.Connection<HFNode, HFNode>;

export type HFSchemes = GetSchemes<HFNode, HFConnection>;
