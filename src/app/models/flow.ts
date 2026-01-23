import { INodeDefinitionType } from "./node-types";

export type FlowVisibility = 'PUBLIC' | 'PRIVATE';

export type Flow = {
    id: string;
    name: string;
    visibility: FlowVisibility;
    data: FlowData;
    author: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
};

export type FlowData = {
    nodes: INodeModel[];
    connections: IConnectionModel[];
}

export type INodeModel = {
  key: string;
  name?: string;
  position: { x: number, y: number } | null;
  parameters?: Record<string, any> | null;
  nodeDefinition: INodeDefinitionType;
}

export type IConnectionModel = {
  key: string;
  sourceNode: string;
  sourceField: string;
  targetNode: string;
  targetField: string;
}


