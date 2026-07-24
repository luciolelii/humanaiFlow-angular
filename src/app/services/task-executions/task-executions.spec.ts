import { TestBed } from '@angular/core/testing';
import { BiasImpactJob } from '@models/bias-impact';
import { TaskExecution } from '@models/task-execution';
import { lastValueFrom, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { TaskExecutionsService } from './task-executions';

const job = (status: BiasImpactJob['status'], terminal: boolean): BiasImpactJob => ({
  id: 'job-1',
  status,
  executionId: 'execution-1',
  stepId: 'step-1',
  createdAt: '2026-07-21T10:00:00',
  startedAt: null,
  completedAt: terminal ? '2026-07-21T10:00:10' : null,
  reportId: null,
  report: null,
  errorCode: null,
  errorMessage: null,
  terminal
});

describe('TaskExecutionsService bias operations', () => {
  let service: TaskExecutionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TaskExecutionsService);
  });

  it('maps side-effect policy conflicts using the backend error code', async () => {
    service.taskExecutionsCallService = {
      runBiasImpactExperiment: () => throwError(() => ({
        status: 409,
        error: {
          detail: 'External side effects are blocked',
          errors: [{ code: 'BIAS_SIDE_EFFECT_BLOCKED', message: 'External side effects are blocked' }]
        }
      }))
    } as unknown as typeof service.taskExecutionsCallService;

    await expect(lastValueFrom(service.runBiasImpactExperiment('execution-1', 'step-1', {
      annotationIds: ['annotation-1'],
      repetitions: 3,
      includeRawOutputs: true,
      externalSideEffectPolicy: 'BLOCK',
      confirmExternalSideEffects: false
    }))).rejects.toEqual({
      reason: 'SIDE_EFFECT_BLOCKED',
      code: 'BIAS_SIDE_EFFECT_BLOCKED',
      message: 'External side effects are blocked'
    });
    expect(service.biasExperimentInProgress()).toBe(false);
  });

  it('polls until a terminal job and stops after completion', async () => {
    vi.useFakeTimers();
    const getBiasImpactJob = vi.fn()
      .mockReturnValueOnce(of(job('QUEUED', false)))
      .mockReturnValueOnce(of(job('RUNNING', false)))
      .mockReturnValueOnce(of(job('COMPLETED', true)));
    service.taskExecutionsCallService = { getBiasImpactJob } as unknown as typeof service.taskExecutionsCallService;

    const terminalJob = lastValueFrom(service.pollBiasImpactJob('job-1'));
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(terminalJob).resolves.toEqual(expect.objectContaining({ status: 'COMPLETED', terminal: true }));
    expect(getBiasImpactJob).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('retries a transient polling failure without abandoning the job', async () => {
    vi.useFakeTimers();
    const getBiasImpactJob = vi.fn()
      .mockReturnValueOnce(throwError(() => ({ status: 0 })))
      .mockReturnValueOnce(of(job('RUNNING', false)))
      .mockReturnValueOnce(of(job('COMPLETED', true)));
    service.taskExecutionsCallService = { getBiasImpactJob } as unknown as typeof service.taskExecutionsCallService;

    const terminalJob = lastValueFrom(service.pollBiasImpactJob('job-1'));
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(terminalJob).resolves.toEqual(expect.objectContaining({ status: 'COMPLETED' }));
    expect(getBiasImpactJob).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('replaces the local execution immediately with the interaction response', async () => {
    const baseline: TaskExecution = {
      id: 'execution-1',
      name: 'Human flow',
      creationTime: 1,
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: [],
        steps: {},
        status: 'WAITING',
        waitingSteps: ['decision-1']
      }
    };
    const updated: TaskExecution = {
      ...baseline,
      context: {
        ...baseline.context,
        status: 'SUCCESS',
        waitingSteps: []
      }
    };
    (service as any)._taskExecutions.set([baseline]);
    vi.spyOn(service, 'refresh').mockImplementation(() => undefined);
    service.taskExecutionsCallService = {
      submitInteractionText: vi.fn().mockReturnValue(of(updated))
    } as unknown as typeof service.taskExecutionsCallService;

    await lastValueFrom(service.submitInteractionText(
      'execution-1',
      'decision-1',
      'choice',
      'approve'
    ));

    expect(service.taskExecutions()[0].context.status).toBe('SUCCESS');
  });

  it('caches child interaction responses without adding them to the top-level list', async () => {
    const child: TaskExecution = {
      id: 'child-1',
      name: 'Interactive subflow',
      creationTime: 1,
      executionKind: 'SUBFLOW',
      parentExecutionId: 'parent-1',
      parentStepId: 'container-1',
      context: {
        inputs: {},
        result: { 'decision-1:choice': 'approve' },
        errors: {},
        warnings: [],
        steps: {},
        status: 'SUCCESS',
        waitingSteps: []
      }
    };
    (service as any)._taskExecutions.set([]);
    vi.spyOn(service, 'refresh').mockImplementation(() => undefined);
    service.taskExecutionsCallService = {
      submitInteractionText: vi.fn().mockReturnValue(of(child))
    } as unknown as typeof service.taskExecutionsCallService;

    await lastValueFrom(service.submitInteractionText(
      'child-1',
      'decision-1',
      'choice',
      'approve'
    ));

    expect(service.followedExecutions()['child-1']).toEqual(child);
    expect(service.taskExecutions()).toEqual([]);
  });

  it('caches every iteration returned for a looping container step', async () => {
    const iterationOne = {
      id: 'iteration-1',
      name: 'Iteration 1',
      creationTime: 1,
      executionKind: 'SUBFLOW',
      parentExecutionId: 'parent-1',
      parentStepId: 'container-1',
      parentIterationIndex: 1,
      subflowRole: 'MAIN',
      context: { inputs: {}, result: {}, errors: {}, warnings: {}, steps: {}, status: 'SUCCESS', waitingSteps: [] }
    } satisfies TaskExecution;
    const iterationTwo = {
      ...iterationOne,
      id: 'iteration-2',
      parentIterationIndex: 2
    } satisfies TaskExecution;
    service.taskExecutionsCallService = {
      retrieveStepIterations: vi.fn().mockReturnValue(of([iterationOne, iterationTwo]))
    } as unknown as typeof service.taskExecutionsCallService;

    const iterations = await lastValueFrom(service.retrieveStepIterations('parent-1', 'container-1'));

    expect(iterations).toEqual([iterationOne, iterationTwo]);
    expect(service.followedExecutions()['iteration-1']).toEqual(iterationOne);
    expect(service.followedExecutions()['iteration-2']).toEqual(iterationTwo);
  });

  it('retrieves and caches a child execution directly', async () => {
    const child = {
      id: 'child-1',
      name: 'Interactive subflow',
      creationTime: 1,
      executionKind: 'SUBFLOW',
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: [],
        steps: {},
        status: 'WAITING',
        waitingSteps: ['human-1']
      }
    } satisfies TaskExecution;
    service.taskExecutionsCallService = {
      retrieveTaskExecution: vi.fn().mockReturnValue(of(child))
    } as unknown as typeof service.taskExecutionsCallService;

    await lastValueFrom(service.retrieveExecution('child-1'));

    expect(service.followedExecutions()['child-1']).toEqual(child);
    expect(service.taskExecutions()).not.toContain(child);
  });
});
