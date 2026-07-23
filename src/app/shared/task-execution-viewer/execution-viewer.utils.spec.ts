import { TaskExecutionStep } from '@models/task-execution';
import {
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
});
