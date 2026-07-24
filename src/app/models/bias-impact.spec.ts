import {
  BIAS_EXPERIMENT_ERROR_CODES,
  BIAS_PROBE_ERROR_CODES,
  BiasImpactJob,
  BiasImpactReport
} from './bias-impact';
import { BehavioralProbe, isProbeExecutable } from './flow';
import { TaskExecution } from './task-execution';

describe('bias impact models', () => {
  it('recognizes executable instruction-based probes', () => {
    expect(isProbeExecutable(undefined)).toBe(false);
    expect(isProbeExecutable({ activationMode: 'PROMPT_DIRECTIVE' })).toBe(false);
    expect(isProbeExecutable({
      activationMode: 'INPUT_TRANSFORMATION',
      instruction: '  ${original} with experimental framing  '
    })).toBe(true);
  });

  it('requires typed outputs for new MOCK_RESPONSE probes', () => {
    const legacyProbe: BehavioralProbe = {
      activationMode: 'MOCK_RESPONSE',
      instruction: 'legacy mock response'
    };
    const typedProbe: BehavioralProbe = {
      activationMode: 'MOCK_RESPONSE',
      mockOutputs: { body: 'controlled response', success: true }
    };

    expect(isProbeExecutable(legacyProbe)).toBe(false);
    expect(isProbeExecutable(typedProbe)).toBe(true);
  });

  it('models completed jobs with the definitive report field names', () => {
    const report: BiasImpactReport = {
      id: 'report-1',
      experimentId: 'experiment-1',
      kind: 'ISOLATED_STEP',
      baselineExecutionId: 'baseline-1',
      biasedExecutionId: null,
      nodeId: 'node-1',
      annotationIds: ['annotation-1'],
      repetitions: 3,
      createdAt: '2026-07-21T10:00:00',
      rawOutputsIncluded: true,
      immediateImpact: {
        outputChanged: true,
        maximumTextDifference: 0.5,
        changeRate: 1,
        baselineOutput: { response: 'baseline' },
        biasedOutputs: [{ response: 'biased' }]
      },
      downstreamImpact: [],
      routingChanges: [],
      mockedSideEffects: [{ nodeId: 'http-1', nodeName: 'HTTP call', kind: 'HTTP' }],
      summary: 'The output changed.',
      warnings: []
    };
    const job: BiasImpactJob = {
      id: 'job-1',
      status: 'COMPLETED',
      executionId: 'baseline-1',
      stepId: 'node-1',
      createdAt: '2026-07-21T09:59:00',
      startedAt: '2026-07-21T09:59:01',
      completedAt: '2026-07-21T10:00:00',
      reportId: report.id,
      report,
      errorCode: null,
      errorMessage: null,
      terminal: true
    };

    expect(job.report?.immediateImpact.biasedOutputs).toEqual([{ response: 'biased' }]);
    expect(job.report?.mockedSideEffects[0]?.kind).toBe('HTTP');
  });

  it('keeps bias execution context optional for existing executions', () => {
    const execution = {
      id: 'execution-1',
      name: 'Legacy execution',
      creationTime: 0,
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: {},
        steps: {},
        status: 'SUCCESS',
        waitingSteps: []
      }
    } satisfies TaskExecution;

    expect(execution).not.toHaveProperty('biasExecutionContext');
  });

  it('exports the backend error codes needed by probe and experiment flows', () => {
    expect(BIAS_PROBE_ERROR_CODES).toContain('BIAS_PROBE_MOCK_OUTPUT_TYPE_MISMATCH');
    expect(BIAS_EXPERIMENT_ERROR_CODES).toContain('BIAS_SIDE_EFFECT_CONFIRMATION_REQUIRED');
    expect(BIAS_EXPERIMENT_ERROR_CODES).toContain('BIAS_EXECUTION_HISTORY_MISMATCH');
    expect(BIAS_EXPERIMENT_ERROR_CODES).toContain('BIAS_SUBFLOW_ON_NON_CONTAINER');
    expect(BIAS_EXPERIMENT_ERROR_CODES).toContain('BIAS_SUBFLOW_NOT_EXECUTABLE');
    expect(BIAS_EXPERIMENT_ERROR_CODES).toContain('BIAS_ACTIVATION_ANNOTATIONS_REQUIRED');
  });
});
