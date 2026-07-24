import { TaskExecutionStep } from '@models/task-execution';
import {
  buildVisibleExecutionLogs,
  getExecutionInputValues,
  getExecutionOutputValues
} from './execution-viewer.utils';

describe('execution viewer runtime values', () => {
  const documentedStep: TaskExecutionStep = {
    id: 'decision-1',
    status: 'WAITING_FOR_INTERACTION',
    simulated: false,
    node: {
      id: 'decision-1',
      name: 'Decision',
      typeName: 'HumanDecisionBlock',
      inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
      outputs: [
        { name: 'approve', type: 'TEXT', multiple: false },
        { name: 'reject', type: 'TEXT', multiple: false }
      ],
      specificConfiguration: {}
    }
  };

  it('uses node port descriptors when the execution step omits runtime wrappers', () => {
    expect(getExecutionInputValues(documentedStep, {
      'decision-1:input': 'Candidate evidence'
    })).toEqual({ input: 'Candidate evidence' });

    expect(getExecutionOutputValues(documentedStep, {
      'decision-1:approve': 'Candidate evidence'
    })).toEqual({ approve: 'Candidate evidence' });
  });

  it('surfaces inner subflow identifiers from bias experiment events', () => {
    const [event] = buildVisibleExecutionLogs([{
      id: 'event-1',
      timestamp: 1,
      type: 'BIAS_EXPERIMENT_APPLIED',
      message: 'Applied behavioral probe',
      details: {
        innerExecutionId: 'inner-execution-1',
        innerNodeId: 'inner-node-1',
        innerStepId: 'inner-step-1',
        iterationIndex: 2,
        containerType: 'LoopContainer'
      }
    }]);

    expect(event).toEqual(expect.objectContaining({
      innerExecutionId: 'inner-execution-1',
      innerNodeId: 'inner-node-1',
      innerStepId: 'inner-step-1',
      iterationIndex: '2',
      containerType: 'LoopContainer'
    }));
  });
});
