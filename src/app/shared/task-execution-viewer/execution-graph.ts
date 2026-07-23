import { FlowBlockConnection, FlowData, FlowNode, FlowNodeDependency } from '@models/flow';
import { getTaskExecutionStepNode, TaskExecution, TaskExecutionStep } from '@models/task-execution';

export function executionStepNodeId(step: TaskExecutionStep): string {
  return String(getTaskExecutionStepNode(step)?.id ?? step.id);
}

export function mergeExecutionStepNode(
  step: TaskExecutionStep,
  sourceFlow: FlowData | null | undefined
): FlowNode | null {
  const executionNode = getTaskExecutionStepNode(step);
  if (!executionNode) return null;

  const sourceNode = findFlowNode(sourceFlow, executionNode.id)
    ?? findFlowNode(sourceFlow, step.id);
  if (!sourceNode) return executionNode;

  return {
    ...sourceNode,
    ...executionNode,
    id: executionNode.id,
    position: executionNode.position ?? sourceNode.position,
    inputs: executionNode.inputs?.length ? executionNode.inputs : sourceNode.inputs,
    outputs: executionNode.outputs?.length ? executionNode.outputs : sourceNode.outputs,
    specificConfiguration: {
      ...(sourceNode.specificConfiguration ?? {}),
      ...(executionNode.specificConfiguration ?? {})
    },
    biasAnnotations: executionNode.biasAnnotations ?? sourceNode.biasAnnotations,
    capabilities: executionNode.capabilities ?? sourceNode.capabilities,
    nodeFamily: sourceNode.nodeFamily ?? executionNode.nodeFamily
  } as FlowNode;
}

export function resolveExecutionConnections(
  execution: TaskExecution | null | undefined,
  steps: TaskExecutionStep[],
  sourceFlow: FlowData | null | undefined,
  inferredConnections: FlowBlockConnection[]
): FlowBlockConnection[] {
  const explicit = execution?.stepConnections;
  const source = sourceFlow?.connections ?? [];
  const selected = Array.isArray(explicit)
    ? explicit
    : source.length
      ? source
      : inferredConnections;
  return normalizeConnectionsForSteps(selected, steps, sourceFlow);
}

export function resolveExecutionDependencies(
  execution: TaskExecution | null | undefined,
  steps: TaskExecutionStep[],
  sourceFlow: FlowData | null | undefined
): FlowNodeDependency[] {
  const explicit = execution?.stepDependencies;
  const source = sourceFlow?.dependencies ?? [];
  const selected = Array.isArray(explicit) ? explicit : source;
  const ids = executionNodeIds(steps, sourceFlow);

  return selected.flatMap((dependency) => {
    const sourceId = ids.get(String(dependency.sourceId));
    const targetId = ids.get(String(dependency.targetId));
    return sourceId && targetId ? [{ sourceId, targetId }] : [];
  });
}

function findFlowNode(flow: FlowData | null | undefined, id: string): FlowNode | null {
  if (!flow) return null;
  return [...(flow.blocks ?? []), ...(flow.containers ?? [])].find((node) => node.id === id) ?? null;
}

function normalizeConnectionsForSteps(
  connections: FlowBlockConnection[],
  steps: TaskExecutionStep[],
  sourceFlow: FlowData | null | undefined
): FlowBlockConnection[] {
  const ids = executionNodeIds(steps, sourceFlow);
  return connections.flatMap((connection, index) => {
    const sourceId = ids.get(String(connection.sourceId));
    const targetId = ids.get(String(connection.targetId));
    if (!sourceId || !targetId) return [];

    return [{
      id: String(connection.id || `${sourceId}:${connection.sourceName}->${targetId}:${connection.targetName}:${index}`),
      sourceId,
      sourceName: String(connection.sourceName),
      targetId,
      targetName: String(connection.targetName)
    }];
  });
}

function executionNodeIds(
  steps: TaskExecutionStep[],
  sourceFlow?: FlowData | null
): Map<string, string> {
  const ids = new Map<string, string>();
  for (const step of steps) {
    const nodeId = executionStepNodeId(step);
    ids.set(String(step.id), nodeId);
    ids.set(nodeId, nodeId);
  }
  for (const node of [...(sourceFlow?.blocks ?? []), ...(sourceFlow?.containers ?? [])]) {
    ids.set(node.id, node.id);
  }
  return ids;
}
