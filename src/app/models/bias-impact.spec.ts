import { BIAS_EXPERIMENT_ERROR_CODES, BIAS_PROBE_ERROR_CODES, BiasImpactJob, BiasImpactReport, activeAnnotationIdsFor, biasInterventionMix, isBiasVariantContext } from './bias-impact';
import { BiasBehavioralProbe, isProbeExecutable } from './flow';
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
    const legacyProbe: BiasBehavioralProbe = {
      activationMode: 'MOCK_RESPONSE',
      instruction: 'legacy mock response'
    };
    const typedProbe: BiasBehavioralProbe = {
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


/** The shape the API actually sends, taken from a real persisted snapshot. */
function context(overrides: Record<string, unknown> = {}): any {
  return {
    experimentId: null,
    mode: 'NORMAL',
    activeBiasAnnotationIdsByNode: {},
    activeMitigationAnnotationIdsByNode: {},
    biasSubflowActivatedContainerIds: [],
    mitigationSubflowActivatedContainerIds: [],
    externalSideEffectPolicy: 'BLOCK',
    externalSideEffectsConfirmed: false,
    ...overrides
  };
}

describe('isBiasVariantContext', () => {
  it('is false for the NORMAL context every execution carries', () => {
    // The object is always present; only the mode distinguishes a variant. Testing for presence
    // marked every single run a bias variant.
    expect(isBiasVariantContext(context())).toBe(false);
    expect(isBiasVariantContext(null)).toBe(false);
    expect(isBiasVariantContext(undefined)).toBe(false);
  });

  it('is true for the mode the API actually sends, EXPERIMENT', () => {
    // The backend enum is NORMAL | EXPERIMENT. This used to assert BIAS_VARIANT - a value no
    // endpoint emits - so the predicate was always false and the fixtures protected the bug.
    expect(isBiasVariantContext(context({ mode: 'EXPERIMENT' }))).toBe(true);
    expect(isBiasVariantContext(context({ mode: 'BIAS_VARIANT' }))).toBe(false);
  });
});

describe('biasInterventionMix', () => {
  it('is null for a run that is not a variant', () => {
    expect(biasInterventionMix(context())).toBeNull();
  });

  it('reads bias from active bias annotations', () => {
    expect(biasInterventionMix(context({
      mode: 'EXPERIMENT',
      activeBiasAnnotationIdsByNode: { n1: ['a1'] }
    }))).toBe('BIAS');
  });

  it('reads mitigation from active mitigation annotations', () => {
    expect(biasInterventionMix(context({
      mode: 'EXPERIMENT',
      activeMitigationAnnotationIdsByNode: { n1: ['a1'] }
    }))).toBe('MITIGATION');
  });

  it('reports both directions as mixed', () => {
    expect(biasInterventionMix(context({
      mode: 'EXPERIMENT',
      activeBiasAnnotationIdsByNode: { n1: ['a1'] },
      activeMitigationAnnotationIdsByNode: { n2: ['a2'] }
    }))).toBe('MIXED');
  });

  it('also counts a direction activated through a container subflow', () => {
    expect(biasInterventionMix(context({
      mode: 'EXPERIMENT',
      biasSubflowActivatedContainerIds: ['c1']
    }))).toBe('BIAS');
    expect(biasInterventionMix(context({
      mode: 'EXPERIMENT',
      mitigationSubflowActivatedContainerIds: ['c1']
    }))).toBe('MITIGATION');
  });

  it('ignores a node whose annotation list is empty', () => {
    expect(biasInterventionMix(context({
      mode: 'EXPERIMENT',
      activeBiasAnnotationIdsByNode: { n1: [] }
    }))).toBeNull();
  });

  it('returns null for a variant with nothing recorded, rather than guessing a direction', () => {
    expect(biasInterventionMix(context({ mode: 'EXPERIMENT' }))).toBeNull();
  });
});

describe('activeAnnotationIdsFor', () => {
  it('combines both directions for a node', () => {
    const ctx = context({
      mode: 'EXPERIMENT',
      activeBiasAnnotationIdsByNode: { n1: ['bias-1'] },
      activeMitigationAnnotationIdsByNode: { n1: ['mit-1'] }
    });

    expect(activeAnnotationIdsFor(ctx, 'n1')).toEqual(['bias-1', 'mit-1']);
    expect(activeAnnotationIdsFor(ctx, 'other')).toEqual([]);
    expect(activeAnnotationIdsFor(null, 'n1')).toEqual([]);
  });
});
