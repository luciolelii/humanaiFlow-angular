import { TestBed } from '@angular/core/testing';
import { BiasImpactJob } from '@models/bias-impact';
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
});
