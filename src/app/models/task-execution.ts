import { FlowBlock, FlowBlockConnection, FlowContainer, FlowNode, FlowPort } from './flow';

export type TaskExecutionStatus = 'CREATED' | 'READY' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'ERROR';
export type TaskExecutionStatusGroup = 'INIT' | 'RUNNING' | 'FINAL';

export type StepStatus = 'WAITING_FOR_INPUT' | 'FAILED' | 'COMPLETED' | 'RUNNING' | string;

export type TaskExecution = {
  id: string;
  name: string;
  creationTime: number;
  context: TaskExecutionContext;
  stepConnections?: FlowBlockConnection[];
  requiredAuthorizations?: Record<string, TaskExecutionAuthorizationRequirement>;
  providedAuthorizations?: Record<string, unknown>;
  missingAuthorizationKeys?: string[];
};

export type TaskExecutionAuthorizationRequirement = {
  key: string;
  provider: string;
  fieldName: string;
  description: string;
  requiredBySteps: string[];
};

export type TaskExecutionContext = {
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  startTime?: number | null;
  endTime?: number | null;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  steps: Record<string, TaskExecutionStep>;
  status: TaskExecutionStatus;
  waitingSteps: string[];
  executionResult: Record<string, unknown>;
};

export type TaskExecutionStep = {
  node?: FlowNode;
  block?: FlowBlock;
  container?: FlowContainer;
  id: string;
  inputs: TaskExecutionStepInput[];
  outputs: TaskExecutionStepOutput[];
  result?: Record<string, unknown>;
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

export function getExecutionStatusGroup(status: string | null | undefined): TaskExecutionStatusGroup | null {
  const normalized = String(status ?? '').toUpperCase();
  if (!normalized) return null;

  if (normalized === 'CREATED' || normalized === 'READY') return 'INIT';
  if (
    normalized === 'RUNNING' ||
    normalized === 'WAITING'
  ) {
    return 'RUNNING';
  }
  if (normalized === 'SUCCESS' || normalized === 'ERROR') {
    return 'FINAL';
  }

  return null;
}

export function normalizeExecutionStatus(status: string | null | undefined): TaskExecutionStatus {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'CREATED') return 'CREATED';
  if (normalized === 'READY') return 'READY';
  if (normalized === 'RUNNING') return 'RUNNING';
  if (normalized === 'WAITING' || normalized === 'WAITING_FOR_INPUT' || normalized === 'WAITING_FOR_INTERACTION') {
    return 'WAITING';
  }
  if (normalized === 'SUCCESS' || normalized === 'COMPLETED') return 'SUCCESS';
  if (normalized === 'ERROR' || normalized === 'FAILED') return 'ERROR';
  return 'CREATED';
}

export function getTaskExecutionStepNode(step: TaskExecutionStep | null | undefined): FlowNode | null {
  if (!step) return null;
  if (step.node) {
    return step.node.nodeFamily === 'container'
      ? { ...step.node, nodeFamily: 'container' }
      : { ...step.node, nodeFamily: 'block' };
  }
  if (step.container) {
    return { ...step.container, nodeFamily: 'container' };
  }
  if (step.block) {
    return { ...step.block, nodeFamily: 'block' };
  }
  return null;
}
