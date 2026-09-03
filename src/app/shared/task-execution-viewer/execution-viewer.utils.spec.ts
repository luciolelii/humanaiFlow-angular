import { TaskExecution, TaskExecutionStep } from '@models/task-execution';
import {
  buildAuthorizationGate,
  buildVisibleExecutionLogs,
  getExecutionInputValues,
  getExecutionOutputValues,
  hasStoredValue,
  isExecutionStartable,
  planInputSaves,
  preparedInputValue
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

describe('authorization gate', () => {
  const geminiRequirement = {
    key: 'LLMProvider::Gemini::authorization',
    provider: 'Gemini',
    fieldName: 'authorization',
    description: 'Select a saved credential for Gemini.',
    requiredBySteps: ['step-1']
  };

  const headerRequirement = {
    key: 'HTTPServerCall::step-2::authorization',
    provider: 'HTTPServerCall',
    fieldName: 'authorization',
    description: 'Authorization header',
    requiredBySteps: ['step-2']
  };

  const capabilities = [
    { name: 'InternalOllama', requiresCredential: false },
    { name: 'Gemini', requiresCredential: true }
  ];

  const readyState = { capabilities, loading: false, failed: false };
  const failedState = { capabilities: [], loading: false, failed: true };

  const execution = (overrides: Partial<TaskExecution> = {}): TaskExecution => ({
    id: 'execution-1',
    name: 'Flow',
    creationTime: 1,
    requiredAuthorizations: [geminiRequirement],
    providedAuthorizations: {},
    missingAuthorizationKeys: ['LLMProvider::Gemini::authorization'],
    context: {
      inputs: {},
      result: {},
      errors: {},
      warnings: {},
      steps: {},
      status: 'CREATED',
      waitingSteps: []
    },
    ...overrides
  });

  it('blocks the start until the required credential is provided', () => {
    const pending = execution();
    expect(isExecutionStartable(pending, buildAuthorizationGate(pending, readyState))).toBe(false);

    const provided = execution({
      providedAuthorizations: { 'LLMProvider::Gemini::authorization': 'vault-secret-1' },
      missingAuthorizationKeys: []
    });
    const gate = buildAuthorizationGate(provided, readyState);

    expect(gate.satisfied).toBe(true);
    expect(gate.vault).toEqual([]);
    expect(gate.satisfiedVault.map((entry) => entry.provider)).toEqual(['Gemini']);
    expect(isExecutionStartable(provided, gate)).toBe(true);
  });

  it('keeps a provider key on the vault path even when the catalog is unavailable', () => {
    const gate = buildAuthorizationGate(execution(), failedState);

    expect(gate.runtime).toEqual([]);
    expect(gate.vault.map((entry) => entry.provider)).toEqual(['Gemini']);
    expect(gate.vault[0].requiresCredential).toBeNull();
    expect(gate.missingProviders).toEqual(['Gemini']);
  });

  it('routes authorizations that are not provider credentials to the literal-value panel', () => {
    const withHeader = execution({
      requiredAuthorizations: [geminiRequirement, headerRequirement],
      missingAuthorizationKeys: [geminiRequirement.key, headerRequirement.key]
    });
    const gate = buildAuthorizationGate(withHeader, readyState);

    expect(gate.runtime.map((requirement) => requirement.key)).toEqual([headerRequirement.key]);
    expect(gate.vault.map((entry) => entry.requirement.key)).toEqual([geminiRequirement.key]);
    expect(gate.satisfied).toBe(false);
  });

  it('reads requirements given as a map exactly like the array form', () => {
    const asMap = execution({
      requiredAuthorizations: { [geminiRequirement.key]: geminiRequirement }
    });

    expect(buildAuthorizationGate(asMap, readyState).vault.map((entry) => entry.requirement.key))
      .toEqual([geminiRequirement.key]);
  });

  it('does not start an execution whose inputs are still unset', () => {
    const missingInput = execution({
      missingAuthorizationKeys: [],
      context: {
        ...execution().context,
        globalInputDescriptors: { topic: { name: 'topic', kind: 'TEXT', value: null } },
        globalInputs: {}
      }
    });

    expect(isExecutionStartable(missingInput, buildAuthorizationGate(missingInput, readyState))).toBe(false);
  });

  it('does not start an execution that has already left INIT', () => {
    const running = execution({
      missingAuthorizationKeys: [],
      context: { ...execution().context, status: 'RUNNING' }
    });

    expect(isExecutionStartable(running, buildAuthorizationGate(running, readyState))).toBe(false);
  });
});

describe('hasStoredValue', () => {
  it('treats an empty or blank value as not supplied', () => {
    expect(hasStoredValue(null)).toBe(false);
    expect(hasStoredValue(undefined)).toBe(false);
    expect(hasStoredValue('')).toBe(false);
    expect(hasStoredValue('   ')).toBe(false);
  });

  it('treats an empty list, or a list of blanks, as not supplied', () => {
    // The step would still be waiting for it, so the panel must not report it as provided.
    expect(hasStoredValue([])).toBe(false);
    expect(hasStoredValue(['', '  '])).toBe(false);
  });

  it('accepts any non-blank content', () => {
    expect(hasStoredValue('Backend Developer')).toBe(true);
    expect(hasStoredValue(['', 'one'])).toBe(true);
    expect(hasStoredValue(0)).toBe(true);
    expect(hasStoredValue(false)).toBe(true);
  });
});

describe('planInputSaves', () => {
  function input(overrides: Record<string, unknown> = {}): any {
    return {
      key: 'global:role', scope: 'global', nodeId: null, inputName: 'role',
      title: 'Flow', subtitle: 'role', type: 'TEXT', multiple: false, value: '', provided: false,
      ...overrides
    };
  }

  it('puts every edited global in one map, so one request can carry them all', () => {
    // A request per global, fired in parallel, is what lost the values: the bulk endpoint replaced
    // the whole set, so whichever save landed last wiped its neighbours.
    const inputs = [
      input({ key: 'g:title', inputName: 'positionTitle' }),
      input({ key: 'g:req', inputName: 'jobRequirements' }),
      input({ key: 'g:questions', inputName: 'interviewQuestions', multiple: true, value: [] })
    ];

    const plan = planInputSaves(inputs, {
      'g:title': 'Backend Developer',
      'g:req': 'At least 3 years',
      'g:questions': ['first', 'second']
    });

    expect(plan.globals).toHaveLength(3);
    expect(plan.globalValues).toEqual({
      positionTitle: 'Backend Developer',
      jobRequirements: 'At least 3 years',
      interviewQuestions: ['first', 'second']
    });
    expect(plan.nodeInputs).toEqual([]);
  });

  it('keeps node inputs separate: there is no bulk endpoint per step', () => {
    const inputs = [
      input({ key: 'g:role', inputName: 'role' }),
      input({ key: 'step-1:cv', scope: 'node', nodeId: 'step-1', inputName: 'cv' })
    ];

    const plan = planInputSaves(inputs, { 'g:role': 'HR', 'step-1:cv': 'a cv' });

    expect(Object.keys(plan.globalValues)).toEqual(['role']);
    expect(plan.nodeInputs.map((one) => one.key)).toEqual(['step-1:cv']);
  });

  it('ignores anything the user has not edited', () => {
    const inputs = [
      input({ key: 'g:role', inputName: 'role', value: 'stored' }),
      input({ key: 'g:other', inputName: 'other', value: 'also stored' })
    ];

    const plan = planInputSaves(inputs, { 'g:role': 'edited' });

    // Sending an untouched value back would be a write the user did not ask for.
    expect(plan.globalValues).toEqual({ role: 'edited' });
    expect(plan.globals).toHaveLength(1);
  });

  it('sends an emptied field, which is an edit like any other', () => {
    const plan = planInputSaves([input({ key: 'g:role', inputName: 'role', value: 'was set' })],
      { 'g:role': '' });

    expect(plan.globalValues).toEqual({ role: '' });
  });
});

describe('preparedInputValue', () => {
  function listInput(): any {
    return { key: 'g:q', scope: 'global', nodeId: null, inputName: 'q', title: 'Flow',
      subtitle: 'q', type: 'TEXT', multiple: true, value: [], provided: false };
  }

  it('drops blank items and trims the rest of a list', () => {
    expect(preparedInputValue(listInput(), ['  first  ', '', '   ', 'second']))
      .toEqual(['first', 'second']);
  });

  it('sends a single value as a string, not as a one-item list', () => {
    const single: any = { ...listInput(), multiple: false, key: 'g:role', inputName: 'role' };
    expect(preparedInputValue(single, 'Backend Developer')).toBe('Backend Developer');
  });

  it('takes the first item when a single-valued input somehow holds a list', () => {
    const single: any = { ...listInput(), multiple: false };
    expect(preparedInputValue(single, ['first', 'second'])).toBe('first');
  });

  it('falls back to the stored value when there is no pending edit', () => {
    const single: any = { ...listInput(), multiple: false, value: 'stored' };
    expect(preparedInputValue(single, undefined)).toBe('stored');
  });
});
