import { FlowBlock, FlowPort } from './flow';

export type ExecutionStatus = 'RUNNING' | 'COMPLETED' | 'ERROR' | 'FAILED' | 'WAITING_FOR_INPUT' | string;
export type StepStatus = 'WAITING_FOR_INPUT' | 'FAILED' | 'COMPLETED' | 'RUNNING' | string;

export type TaskExecution = {
  id: string;
  name: string;
  creationTime: number;
  context: TaskExecutionContext;
};

export type TaskExecutionContext = {
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  startTime?: number | null;
  endTime?: number | null;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  steps: Record<string, TaskExecutionStep>;
  status: ExecutionStatus;
  waitingSteps: string[];
  executionResult: Record<string, unknown>;
};

export type TaskExecutionStep = {
  block: FlowBlock;
  id: string;
  inputs: TaskExecutionStepInput[];
  outputs: TaskExecutionStepOutput[];
  status: StepStatus;
  started: boolean;
  simulated: boolean;
};

export type TaskExecutionStepInput = {
  descriptor: FlowPort;
  value: unknown;
  registered: boolean;
  set: boolean;
};

export type TaskExecutionStepOutput = {
  descriptor: FlowPort;
  connected: boolean;
};
