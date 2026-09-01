import { BiasAnnotation, FlowBlock, FlowData, FlowNode } from '@models/flow';
import { TaskExecution, TaskExecutionStep } from '@models/task-execution';
import {
  mergeExecutionStepNode,
  resolveExecutionConnections,
  resolveExecutionDependencies
} from './execution-graph';

function node(
  id: string,
  position: { x: number; y: number },
  biasAnnotations: BiasAnnotation[] = []
): FlowBlock {
  return {
    id,
    name: id,
    position,
    inputs: [{ name: 'input', type: 'ANY', multiple: false }],
    outputs: [{ name: 'left', type: 'ANY', multiple: false }, { name: 'right', type: 'ANY', multiple: false }],
    specificConfiguration: { name: id },
    typeName: 'HumanDecisionBlock',
    nodeFamily: 'block',
    biasAnnotations
  };
}

function step(flowNode: FlowNode): TaskExecutionStep {
  return {
    id: flowNode.id,
    node: { ...flowNode, position: undefined, biasAnnotations: undefined } as any,
    inputs: [],
    outputs: [],
    status: 'READY',
    started: false,
    simulated: false
  };
}

const sourceFlow: FlowData = {
  blocks: [
    node('decision', { x: 100, y: 200 }, [{ id: 'bias-1', category: 'SELECTION_BIAS' }]),
    node('left-target', { x: 500, y: 80 }),
    node('right-target', { x: 500, y: 320 })
  ],
  containers: [],
  connections: [
    { id: 'c-left', sourceId: 'decision', sourceName: 'left', targetId: 'left-target', targetName: 'input' },
    { id: 'c-right', sourceId: 'decision', sourceName: 'right', targetId: 'right-target', targetName: 'input' }
  ],
  dependencies: [{ sourceId: 'left-target', targetId: 'right-target' }]
};

describe('execution graph topology', () => {
  const steps = sourceFlow.blocks.map(step);
  const execution: TaskExecution = {
    id: 'execution-1',
    name: 'Execution',
    creationTime: 1,
    stepConnections: sourceFlow.connections,
    stepDependencies: sourceFlow.dependencies,
    context: {
      inputs: {},
      result: {},
      errors: {},
      warnings: {},
      steps: {},
      status: 'READY',
      waitingSteps: []
    }
  };

  it('uses the explicit execution branches instead of a linear inferred fallback', () => {
    const inferred = [
      { id: 'linear-1', sourceId: 'decision', sourceName: 'left', targetId: 'left-target', targetName: 'input' },
      { id: 'linear-2', sourceId: 'left-target', sourceName: 'left', targetId: 'right-target', targetName: 'input' }
    ];

    expect(resolveExecutionConnections(execution, steps, sourceFlow, inferred)).toEqual(sourceFlow.connections);
  });

  it('uses source metadata only when it is missing from the execution step snapshot', () => {
    const merged = mergeExecutionStepNode(steps[0], sourceFlow);

    expect(merged?.position).toEqual({ x: 100, y: 200 });
    expect((merged as any)?.biasAnnotations).toEqual([{ id: 'bias-1', category: 'SELECTION_BIAS' }]);
    expect(merged?.outputs.map((port) => port.name)).toEqual(['left', 'right']);
  });

  it('uses explicit execution dependencies', () => {
    expect(resolveExecutionDependencies(execution, steps, sourceFlow)).toEqual(sourceFlow.dependencies);
  });

  it('uses a source-flow fallback for legacy executions with no explicit topology', () => {
    const partialSteps = steps.filter((item) => item.id !== 'right-target');
    const legacyExecution = { ...execution, stepConnections: undefined };

    expect(resolveExecutionConnections(legacyExecution, partialSteps, sourceFlow, [])).toEqual(sourceFlow.connections);
  });

  it('does not let a current source flow override the execution snapshot topology', () => {
    const explicitExecution = {
      ...execution,
      stepConnections: [
        { id: 'executed', sourceId: 'decision', sourceName: 'right', targetId: 'right-target', targetName: 'input' }
      ]
    };

    expect(resolveExecutionConnections(explicitExecution, steps, sourceFlow, [])).toEqual(explicitExecution.stepConnections);
  });

  it('preserves positions supplied by the execution even if the source flow has moved', () => {
    const executionPosition = { x: 640, y: 180 };
    const executionStep = {
      ...steps[0],
      node: { ...steps[0].node!, position: executionPosition }
    };

    expect(mergeExecutionStepNode(executionStep, sourceFlow)?.position).toEqual(executionPosition);
  });

  it('reproduces the documented five-edge decision graph, including both decision outputs', () => {
    const ids = Array.from({ length: 6 }, (_, index) =>
      `b1a50000-0000-4000-8000-00000000000${index + 1}`
    );
    const documentedConnections = [
      { id: 'c1', sourceId: ids[0], sourceName: 'output', targetId: ids[1], targetName: 'candidateProfile' },
      { id: 'c2', sourceId: ids[1], sourceName: 'response', targetId: ids[2], targetName: 'input' },
      { id: 'c3', sourceId: ids[2], sourceName: 'approve', targetId: ids[3], targetName: 'input' },
      { id: 'c4', sourceId: ids[2], sourceName: 'reject', targetId: ids[4], targetName: 'input' },
      { id: 'c5', sourceId: ids[3], sourceName: 'output', targetId: ids[5], targetName: 'input' }
    ];
    const documentedSteps = ids.map((id, index) => step(node(id, {
      x: index < 3 ? index * 300 : index === 4 ? 900 : index === 5 ? 1200 : 900,
      y: index === 4 ? 300 : index > 2 ? 40 : 160
    })));
    const documentedExecution = {
      ...execution,
      stepConnections: documentedConnections,
      stepDependencies: []
    };

    const resolved = resolveExecutionConnections(documentedExecution, documentedSteps, null, []);
    expect(resolved).toEqual(documentedConnections);
    expect(resolved.filter((connection) => connection.sourceId === ids[2]).map((connection) => connection.sourceName))
      .toEqual(['approve', 'reject']);
  });
});
