import { TaskExecution } from '@models/task-execution';
import { compareExecutions } from './execution-compare';

type StepSpec = {
  id: string;
  name?: string;
  status?: string;
  inputs?: Record<string, unknown>;
  outputs?: string[];
};

function execution(id: string, steps: StepSpec[], overrides: Partial<TaskExecution['context']> = {}): TaskExecution {
  return {
    id,
    name: id,
    creationTime: 1,
    context: {
      inputs: {},
      result: {},
      errors: {},
      warnings: {},
      waitingSteps: [],
      status: 'SUCCESS',
      steps: Object.fromEntries(steps.map((step) => [step.id, {
        id: step.id,
        status: step.status ?? 'COMPLETED',
        simulated: false,
        node: {
          id: step.id,
          name: step.name ?? step.id,
          nodeFamily: 'block' as const,
          typeName: 'LLMBlock',
          inputs: Object.keys(step.inputs ?? {}).map((name) => ({ name, type: 'TEXT' })),
          outputs: (step.outputs ?? []).map((name) => ({ name, type: 'TEXT' })),
          specificConfiguration: {}
        },
        inputs: Object.entries(step.inputs ?? {}).map(([name, value]) => ({
          descriptor: { name, type: 'TEXT' }, value, set: true, registered: false
        })),
        outputs: (step.outputs ?? []).map((name) => ({ descriptor: { name, type: 'TEXT' }, connected: false }))
      }])),
      ...overrides
    }
  } as unknown as TaskExecution;
}

describe('compareExecutions', () => {
  it('marks a node whose output differs, and leaves an identical one alone', () => {
    const left = execution('run-1', [{ id: 's1', name: 'Evaluate', outputs: ['response'] }],
      { result: { 's1:response': 'Score 7/10' } });
    const right = execution('run-2', [{ id: 's1', name: 'Evaluate', outputs: ['response'] }],
      { result: { 's1:response': 'Score 5/10' } });

    const { nodes, changedNodeCount } = compareExecutions(left, right);

    expect(changedNodeCount).toBe(1);
    const value = nodes[0].values.find((one) => one.key === 'outputs.response');
    expect(value).toMatchObject({ left: 'Score 7/10', right: 'Score 5/10', state: 'changed' });
  });

  it('reports an unchanged node as equal', () => {
    const step = { id: 's1', outputs: ['response'] };
    const result = { 's1:response': 'same' };
    const comparison = compareExecutions(
      execution('run-1', [step], { result }),
      execution('run-2', [step], { result })
    );

    expect(comparison.changedNodeCount).toBe(0);
    expect(comparison.nodes[0].state).toBe('equal');
  });

  it('reads a connected output from the input it fed, since context.result never holds it', () => {
    // This is the case that matters on a real flow: every wired output is absent from
    // context.result, so comparing that map alone would report almost nothing.
    const wiring = {
      stepConnections: [
        { id: 'c1', sourceId: 's1', sourceName: 'response', targetId: 's2', targetName: 'summary' }
      ]
    };
    const left = {
      ...execution('run-1', [
        { id: 's1', name: 'Interview', outputs: ['response'] },
        { id: 's2', name: 'Evaluate', inputs: { summary: 'interview went well' } }
      ], { inputs: { 's2:summary': 'interview went well' } }),
      ...wiring
    };
    const right = {
      ...execution('run-2', [
        { id: 's1', name: 'Interview', outputs: ['response'] },
        { id: 's2', name: 'Evaluate', inputs: { summary: 'interview went badly' } }
      ], { inputs: { 's2:summary': 'interview went badly' } }),
      ...wiring
    };

    const { nodes } = compareExecutions(left as TaskExecution, right as TaskExecution);

    const interview = nodes.find((node) => node.title === 'Interview')!;
    expect(interview.values.find((one) => one.key === 'outputs.response')).toMatchObject({
      left: 'interview went well',
      right: 'interview went badly',
      state: 'changed'
    });
  });

  it('compares the outcomes, which is where the answer lives when the flow ends on an End node', () => {
    // The real run this was built for has result {} and a single outcome: omitting outcomes would
    // make the comparison useless in exactly the case it was asked for.
    const outcome = (payload: string) => ({
      outcomes: [{ stepId: 's9', code: 'MULTI_CV_RANKING_ACCEPTED', label: 'Final ranking', payload, timestamp: 1 }]
    });
    const comparison = compareExecutions(
      execution('run-1', [{ id: 's1' }], outcome('1. Alice — 7/10')),
      execution('run-2', [{ id: 's1' }], outcome('1. Bob — 6/10'))
    );

    expect(comparison.outcomes).toHaveLength(1);
    expect(comparison.outcomes[0]).toMatchObject({
      code: 'MULTI_CV_RANKING_ACCEPTED',
      left: '1. Alice — 7/10',
      right: '1. Bob — 6/10',
      state: 'changed'
    });
  });

  it('flags an outcome only one run reached, even with no payload to compare', () => {
    const comparison = compareExecutions(
      execution('run-1', [{ id: 's1' }], {
        outcomes: [{ stepId: 's9', code: 'ACCEPTED', label: 'Accepted', payload: null, timestamp: 1 }]
      }),
      execution('run-2', [{ id: 's1' }], {
        outcomes: [{ stepId: 's9', code: 'REVIEW_REQUESTED', label: 'Review', payload: null, timestamp: 1 }]
      })
    );

    expect(comparison.outcomes.map((one) => [one.code, one.state]))
      .toEqual([['ACCEPTED', 'only-left'], ['REVIEW_REQUESTED', 'only-right']]);
  });

  it('marks a node that only one run has', () => {
    const comparison = compareExecutions(
      execution('run-1', [{ id: 's1', name: 'Shared' }, { id: 's2', name: 'Dropped' }]),
      execution('run-2', [{ id: 's1', name: 'Shared' }])
    );

    expect(comparison.nodes.find((node) => node.title === 'Dropped')?.state).toBe('only-left');
    expect(comparison.disjoint).toBe(false);
  });

  it('reports two runs with no node in common as disjoint', () => {
    // Almost always the flow was edited between the runs, which makes a per-node join meaningless
    // rather than merely empty - the view has to say so instead of showing everything as replaced.
    const comparison = compareExecutions(
      execution('run-1', [{ id: 'old-1' }]),
      execution('run-2', [{ id: 'new-1' }])
    );

    expect(comparison.disjoint).toBe(true);
  });

  it('treats a differing step status as a change even when the values match', () => {
    const comparison = compareExecutions(
      execution('run-1', [{ id: 's1', status: 'COMPLETED' }]),
      execution('run-2', [{ id: 's1', status: 'SKIPPED' }])
    );

    expect(comparison.nodes[0].statusChanged).toBe(true);
    expect(comparison.nodes[0].changed).toBe(true);
  });

  it('puts the changed nodes first', () => {
    const comparison = compareExecutions(
      execution('run-1', [
        { id: 's1', name: 'Alpha', outputs: ['out'] },
        { id: 's2', name: 'Beta', outputs: ['out'] }
      ], { result: { 's1:out': 'same', 's2:out': 'left' } }),
      execution('run-2', [
        { id: 's1', name: 'Alpha', outputs: ['out'] },
        { id: 's2', name: 'Beta', outputs: ['out'] }
      ], { result: { 's1:out': 'same', 's2:out': 'right' } })
    );

    expect(comparison.nodes.map((node) => node.title)).toEqual(['Beta', 'Alpha']);
  });

  it('ignores a port that is empty on both sides rather than listing it as equal', () => {
    const comparison = compareExecutions(
      execution('run-1', [{ id: 's1', outputs: ['unused'] }]),
      execution('run-2', [{ id: 's1', outputs: ['unused'] }])
    );

    expect(comparison.nodes[0].values).toEqual([]);
  });
});
