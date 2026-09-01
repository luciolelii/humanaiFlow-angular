import { TestBed } from '@angular/core/testing';
import { lastValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { BiasAnnotation, isProbeExecutable } from '@models/flow';
import { BiasCapabilities, BiasImpactJob, BiasImpactReport } from '@models/bias-impact';
import { BlocksService } from '@services/blocks/blocks';
import { TaskExecutionsService } from '@services/task-executions/task-executions';

describe('bias impact main API flow (annotation -> capability -> isolated experiment -> report)', () => {
  let blocks: BlocksService;
  let executions: TaskExecutionsService;

  const annotation: BiasAnnotation = {
    id: 'annotation-1',
    category: 'FRAMING',
    severity: 'HIGH',
    biasProbe: { activationMode: 'PROMPT_DIRECTIVE', instruction: 'Nudge the model towards a biased framing.' }
  };

  const capabilities: BiasCapabilities = {
    blockType: 'LLMBlock',
    supported: true,
    isolatedExperimentSupported: true,
    fullFlowExperimentSupported: true,
    externalSideEffects: false,
    configurationDependent: false,
    activationModes: ['PROMPT_DIRECTIVE']
  };

  const report: BiasImpactReport = {
    id: 'report-1',
    experimentId: 'experiment-1',
    kind: 'ISOLATED_STEP',
    baselineExecutionId: 'execution-1',
    biasedExecutionId: null,
    nodeId: 'step-1',
    annotationIds: ['annotation-1'],
    repetitions: 3,
    createdAt: '2026-07-21T10:00:00',
    rawOutputsIncluded: true,
    immediateImpact: { outputChanged: true, maximumTextDifference: 0.4, changeRate: 0.5, baselineOutput: { output: 'baseline' }, biasedOutputs: [{ output: 'variant' }] },
    downstreamImpact: [],
    routingChanges: [],
    mockedSideEffects: [],
    summary: 'The biased probe changed the output.',
    warnings: []
  };

  const queuedJob: BiasImpactJob = {
    id: 'job-1', status: 'QUEUED', executionId: 'execution-1', stepId: 'step-1',
    createdAt: '2026-07-21T10:00:00', startedAt: null, completedAt: null,
    reportId: null, report: null, errorCode: null, errorMessage: null, terminal: false
  };

  const completedJob: BiasImpactJob = { ...queuedJob, status: 'COMPLETED', completedAt: '2026-07-21T10:00:05', reportId: report.id, report, terminal: true };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    blocks = TestBed.inject(BlocksService);
    executions = TestBed.inject(TaskExecutionsService);

    blocks.blocksCallService = {
      retrieveBiasCapabilities: vi.fn().mockReturnValue(of(capabilities))
    } as unknown as typeof blocks.blocksCallService;

    executions.taskExecutionsCallService = {
      runBiasImpactExperiment: vi.fn().mockReturnValue(of(queuedJob)),
      getBiasImpactJob: vi.fn().mockReturnValue(of(completedJob)),
      getBiasImpactReport: vi.fn().mockReturnValue(of(report))
    } as unknown as typeof executions.taskExecutionsCallService;
  });

  it('runs an isolated experiment on an executable annotation and opens the resulting report', async () => {
    expect(isProbeExecutable(annotation.biasProbe)).toBe(true);

    const resolvedCapabilities = await lastValueFrom(blocks.retrieveBiasCapabilities('LLMBlock'));
    expect(resolvedCapabilities.isolatedExperimentSupported).toBe(true);

    const job = await lastValueFrom(executions.runBiasImpactExperiment('execution-1', 'step-1', {
      annotationIds: [annotation.id!],
      direction: 'BIAS',
      repetitions: 3,
      includeRawOutputs: true,
      externalSideEffectPolicy: 'BLOCK',
      confirmExternalSideEffects: false
    }));
    expect(job.status).toBe('QUEUED');

    const terminalJob = await lastValueFrom(executions.pollBiasImpactJob(job.id));
    expect(terminalJob.status).toBe('COMPLETED');
    expect(terminalJob.report?.id).toBe('report-1');

    const openedReport = await lastValueFrom(executions.getBiasImpactReport(terminalJob.reportId!));
    expect(openedReport).toEqual(report);
  });
});
