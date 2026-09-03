import { FlowBlockConnection, FlowData, FlowNode, FlowNodeDependency, FlowPort, LLMDescriptor } from './flow';
import { BiasExecutionContext } from './bias-impact';

export type TaskExecutionStatus = 'CREATED' | 'READY' | 'RUNNING' | 'WAITING' | 'SUSPENDED' | 'SUCCESS' | 'ERROR' | 'CANCELLED';
export type TaskExecutionStatusGroup = 'INIT' | 'RUNNING' | 'PAUSED' | 'FINAL';

export type StepStatus =
  | 'WAITING_FOR_INPUT'
  | 'WAITING_FOR_DEPENDENCY'
  | 'WAITING_FOR_INTERACTION'
  | 'WAITING_FOR_SUBFLOW'
  | 'READY'
  | 'RUNNING'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'FAILED'
  | 'CANCELLED'
  | string;

export type ContainerContinuationPhase =
  | 'CHILD_CREATED'
  | 'CHILD_RUNNING'
  | 'WAITING_FOR_SUBFLOW'
  | 'CHILD_COMPLETED'
  | string;

export type ExecutionKind = 'TOP_LEVEL' | 'SUBFLOW' | string;
export type SubflowRole = 'MAIN' | 'GUARD' | string;

export type ExecutionEventLogEntry = {
  id: string;
  timestamp: number;
  stepId?: string | null;
  nodeId?: string | null;
  nodeName?: string | null;
  level?: string | null;
  type?: string | null;
  message?: string | null;
  details?: unknown;
};

export type TaskExecution = {
  id: string;
  name: string;
  creationTime: number;
  flowId?: string | null;
  sourceFlowId?: string | null;
  /** The project the source flow belonged to when the run was created. */
  projectId?: string | null;
  /** Ties together the executions started by one project run; null for a single-flow run. */
  projectRunId?: string | null;
  runNumber?: number | null;
  rerunOfExecutionId?: string | null;
  executionKind?: ExecutionKind;
  parentExecutionId?: string | null;
  parentStepId?: string | null;
  parentIterationIndex?: number | null;
  subflowRole?: SubflowRole | null;
  biasExecutionContext?: BiasExecutionContext;
  context: TaskExecutionContext;
  interactionSimulationEnabled?: boolean;
  simulationAvailable?: boolean;
  interactionSimulationDescriptor?: LLMDescriptor;
  flowSnapshot?: FlowData;
  stepConnections?: FlowBlockConnection[];
  stepDependencies?: FlowNodeDependency[];
  requiredAuthorizations?: Record<string, TaskExecutionAuthorizationRequirement> | TaskExecutionAuthorizationRequirement[];
  providedAuthorizations?: Record<string, unknown>;
  missingAuthorizationKeys?: string[];
  missingGlobalInputKeys?: string[];
};

export type TaskExecutionGroup = {
  id: string;
  sourceFlowId: string;
  name: string;
  firstExecutionId: string;
  latestExecutionId: string;
  creationTime: number;
  lastExecutionTime: number;
  executionCount: number;
  executions: TaskExecution[];
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
  globalInputs?: Record<string, unknown>;
  globalInputDescriptors?: Record<string, TaskExecutionGlobalInputDescriptor>;
  /**
   * Values inherited from the flow's project, frozen when the run was created. Read in prompts as
   * `${{project.<name>}}`.
   */
  projectContext?: Record<string, unknown>;
  result: Record<string, unknown>;
  partialResult?: Record<string, unknown>;
  startTime?: number | null;
  endTime?: number | null;
  errors: Record<string, string>;
  warnings: Record<string, string> | unknown[];
  steps: Record<string, TaskExecutionStep>;
  status: TaskExecutionStatus;
  waitingSteps: string[];
  authorizations?: Record<string, unknown>;
  executionVariables?: Record<string, unknown>;
  executionVariableDescriptors?: Record<string, unknown>;
  errorCodes?: Record<string, unknown>;
  outcomes?: unknown[];
};

export type TaskExecutionGlobalInputDescriptor = {
  name: string;
  kind: string;
  value: unknown;
  description?: string | null;
  cleanupPolicy?: string | null;
  multiple?: boolean;
};

export type TaskExecutionStep = {
  node?: FlowNode;
  id: string;
  inputs?: TaskExecutionStepInput[];
  outputs?: TaskExecutionStepOutput[];
  result?: Record<string, unknown>;
  status: StepStatus;
  started?: boolean;
  skipReason?: string | null;
  simulated: boolean;
  activeInnerExecutionId?: string | null;
  containerContinuationPhase?: ContainerContinuationPhase | null;
  containerIterationIndex?: number | null;
  activeBiasProbes?: Array<{
    annotationId: string;
    direction: 'BIAS' | 'MITIGATION';
    activationMode: string;
    instruction?: string;
  }>;
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
  if (normalized === 'SUSPENDED') {
    return 'PAUSED';
  }
  if (normalized === 'SUCCESS' || normalized === 'ERROR' || normalized === 'CANCELLED') {
    return 'FINAL';
  }

  return null;
}

export function normalizeExecutionStatus(status: string | null | undefined): TaskExecutionStatus {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'CREATED') return 'CREATED';
  if (normalized === 'READY') return 'READY';
  if (normalized === 'RUNNING') return 'RUNNING';
  if (
    normalized === 'WAITING' ||
    normalized === 'WAITING_FOR_INPUT' ||
    normalized === 'WAITING_FOR_INTERACTION' ||
    normalized === 'WAITING_FOR_SUBFLOW' ||
    normalized === 'WAITING_FOR_DEPENDENCY'
  ) {
    return 'WAITING';
  }
  if (normalized === 'SUSPENDED') return 'SUSPENDED';
  if (normalized === 'CANCELLED') return 'CANCELLED';
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
  return null;
}
