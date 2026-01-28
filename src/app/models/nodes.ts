import { GetSchemes, ClassicPreset } from "rete";
import { INodeModel } from "./flow";

export type HFNode = ClassicPreset.Node & {
  data: INodeModel;
};

export type HFConnection = ClassicPreset.Connection<HFNode, HFNode>;

export type HFSchemes = GetSchemes<HFNode, HFConnection>;