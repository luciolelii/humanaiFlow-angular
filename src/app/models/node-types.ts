
export interface INodeDefinitionType {
  name: string;
  category: string;
  outputs: Record<string, IOObject>;
  inputs: Record<string, IOObject>;
  fixedParameters?: Record<string, IParameter> | null;
  runtimeParameters?: Record<string, IParameter> | null;
}

export interface IExecutionNodeType extends INodeDefinitionType {
  executor: string;
  outputMappers?: Record<string, IMapper>;
  inputMappers?: Record<string, IMapper>;
}

export interface IInputNodeType extends INodeDefinitionType {
  simulabe: boolean;
}

export interface IHumanInteractionNodeType extends INodeDefinitionType {
  simulabe: boolean;
  interactionDescription: string;
}

export interface IIOutputNodeType extends INodeDefinitionType {
}

export interface IMapper {
  type: string;
}

export interface ITraslatorMapper extends IMapper {
  translation: string;
}

export interface IDirectMapper extends IMapper {
  fieldName: string;
}

export interface IParserMapper extends IMapper {
  from?: string;
  to?: string;
  fieldName: string;
  multiSeparator?: string;
}

export interface IParameter {
  name: string;
  label: string;
  description: string;
  type: ParameterType;
  required: boolean;
  validations?: IValidation[];
  specificAttributes?: any;
};

export enum ParameterType {
  Text = 'Text',
  LongText = 'LongText',
  Select = 'Select',
  DynamicMultiOptions = 'DynamicMultiOptions',
  Number = 'Number',
  Boolean = 'Boolean'
}



export interface IExecutor {
  identifier: string,
  name: string,
  description: string,
  inputs: Record<string, IOObject>,
  outputs: Record<string, IOObject>,
  mandatoryParameters: IParameter[],
}

export enum IOType {
  TEXT = 'TEXT',
  //CSV = 'CSV',
}

export interface IOObject {
  type: IOType;
  multiple: boolean;
}

export interface IValidation {
  validator: string;
  value?: number | string;
  message: string;
}

export interface IFlowError {
  type: string;
  node: string | undefined;
  connection: string | undefined;
  input: string | undefined;
  output: string | undefined;
  parameter: string | undefined;
}

