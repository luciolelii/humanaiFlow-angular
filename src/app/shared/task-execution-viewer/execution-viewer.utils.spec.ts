import { TaskExecution, TaskExecutionStep } from '@models/task-execution';
import {
  buildAuthorizationGate,
  buildVisibleExecutionLogs,
  getExecutionInputValues,
  getExecutionOutputValues,
  isExecutionStartable
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
