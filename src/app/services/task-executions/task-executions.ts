import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { LLMDescriptor } from '@models/flow';
import {
  BiasImpactExperimentRequest,
  BiasImpactJob,
  BiasImpactReport,
  BiasRerunRequest,
  BiasSideEffectError
} from '@models/bias-impact';
import { ExecutionEventLogEntry, getExecutionStatusGroup, TaskExecution, TaskExecutionGroup } from '@models/task-execution';
import {
  catchError,
  defer,
  EMPTY,
  expand,
  filter,
  finalize,
  map,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
  timeout,
  timer
} from 'rxjs';
import { TaskExecutionsCallServiceBase } from './task-executions-call.base';

@Injectable({
  providedIn: 'root',
})
export class TaskExecutionsService {
  private static readonly POLL_INTERVAL_MS = 5000;
  private destroyRef = inject(DestroyRef);
  taskExecutionsCallService: TaskExecutionsCallServiceBase = new environment.taskExecutionsCallService();
  private initialized = false;
  private refreshInFlight = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _taskExecutions = signal<TaskExecution[]>([]);
  private _taskExecutionGroups = signal<TaskExecutionGroup[]>([]);
  private _pendingExecutionCreation = signal(false);
  private _biasExperimentInProgress = signal(false);
  private _biasRerunInProgress = signal(false);
  private _followedExecutions = signal<Record<string, TaskExecution>>({});

  taskExecutions = this._taskExecutions.asReadonly();
  taskExecutionGroups = this._taskExecutionGroups.asReadonly();
  pendingExecutionCreation = this._pendingExecutionCreation.asReadonly();
  biasExperimentInProgress = this._biasExperimentInProgress.asReadonly();
  biasRerunInProgress = this._biasRerunInProgress.asReadonly();
  followedExecutions = this._followedExecutions.asReadonly();

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.destroyRef.onDestroy(() => this.stopPolling());
    this.refresh();
  }

  refresh() {
    if (this.refreshInFlight) return;
    this.refreshInFlight = true;

    this.taskExecutionsCallService.retrieveTaskExecutionGroups().pipe(
      finalize(() => {
        this.refreshInFlight = false;
      })
    ).subscribe((groups) => {
      const taskExecutions = this.flattenGroups(groups);
      this._taskExecutionGroups.set([...groups]);
      this._taskExecutions.set([...taskExecutions]);
      this.updatePollingState(taskExecutions);
    });
  }

  retrieveExecutionEvents(executionId: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.retrieveExecutionEvents(executionId),
      'Retrieve execution events failed',
      false
    );
  }

  retrieveExecution(executionId: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.retrieveTaskExecution(executionId).pipe(
        tap((execution) => this.cacheFollowedExecution(execution))
      ),
      'Retrieve execution failed',
      false
    );
  }

  createExecution(flowId: string) {
    this._pendingExecutionCreation.set(true);
    return this.taskExecutionsCallService.createTaskExecution(flowId).pipe(
      finalize(() => this._pendingExecutionCreation.set(false)),
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Create execution failed', err);
        return throwError(() => err);
      })
    );
  }

  rerunExecution(executionId: string) {
    this._pendingExecutionCreation.set(true);
    return this.taskExecutionsCallService.rerunTaskExecution(executionId).pipe(
      finalize(() => this._pendingExecutionCreation.set(false)),
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Rerun execution failed', err);
        return throwError(() => err);
      })
    );
  }

  runBiasImpactExperiment(
    executionId: string,
    stepId: string,
    request: BiasImpactExperimentRequest
  ): Observable<BiasImpactJob> {
    this._biasExperimentInProgress.set(true);
    return this.taskExecutionsCallService.runBiasImpactExperiment(executionId, stepId, request).pipe(
      finalize(() => this._biasExperimentInProgress.set(false)),
      catchError((error) => throwError(() => this.toBiasOperationError(error)))
    );
  }

  getBiasImpactJob(jobId: string): Observable<BiasImpactJob> {
    return this.taskExecutionsCallService.getBiasImpactJob(jobId).pipe(
      catchError((error) => throwError(() => this.toBiasOperationError(error)))
    );
  }

  pollBiasImpactJob(jobId: string): Observable<BiasImpactJob> {
    type PollState = { job: BiasImpactJob | null; failures: number };
    const poll = (failures: number): Observable<PollState> => this.getBiasImpactJob(jobId).pipe(
      timeout({ first: 15_000 }),
      map((job) => ({ job, failures: 0 })),
      catchError((error) => {
        if (!this.isRetryablePollingError(error)) {
          return throwError(() => error);
        }
        console.warn('Bias impact job polling request failed; retrying', error);
        return of({ job: null, failures: failures + 1 });
      })
    );

    return defer(() => poll(0)).pipe(
      expand((state) => {
        if (state.job?.terminal) return EMPTY;
        const delay = state.job
          ? 1_500
          : Math.min(5_000, 1_500 * (2 ** Math.min(state.failures, 2)));
        return timer(delay).pipe(switchMap(() => poll(state.failures)));
      }),
      filter((state): state is { job: BiasImpactJob; failures: number } => state.job !== null),
      map((state) => state.job)
    );
  }

  createBiasedRerun(executionId: string, request: BiasRerunRequest): Observable<TaskExecution> {
    this._biasRerunInProgress.set(true);
    this._pendingExecutionCreation.set(true);
    return this.taskExecutionsCallService.createBiasedRerun(executionId, request).pipe(
      tap(() => this.refresh()),
      finalize(() => {
        this._pendingExecutionCreation.set(false);
        this._biasRerunInProgress.set(false);
      }),
      catchError((error) => throwError(() => this.toBiasOperationError(error)))
    );
  }

  compareBiasExecutions(
    baselineExecutionId: string,
    biasedExecutionId: string,
    includeRawOutputs: boolean
  ): Observable<BiasImpactReport> {
    return this.taskExecutionsCallService
      .compareBiasExecutions(baselineExecutionId, biasedExecutionId, includeRawOutputs)
      .pipe(catchError((error) => throwError(() => this.toBiasOperationError(error))));
  }

  listBiasImpactReports(executionId: string): Observable<BiasImpactReport[]> {
    return this.taskExecutionsCallService.listBiasImpactReports(executionId).pipe(
      catchError((error) => throwError(() => this.toBiasOperationError(error)))
    );
  }

  getBiasImpactReport(reportId: string): Observable<BiasImpactReport> {
    return this.taskExecutionsCallService.getBiasImpactReport(reportId).pipe(
      catchError((error) => throwError(() => this.toBiasOperationError(error)))
    );
  }

  deleteExecution(executionId: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.deleteTaskExecution(executionId),
      'Delete execution failed'
    );
  }

  startExecution(executionId: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.startTaskExecution(executionId),
      'Start execution failed'
    );
  }

  simulateExecution(executionId: string, simulator: LLMDescriptor) {
    const execution = this._taskExecutions().find((item) => item.id === executionId);
    if (execution?.simulationAvailable !== true) {
      return throwError(() => new Error('Simulation is not available for this execution.'));
    }
    if (!simulator?.provider?.trim() || !simulator?.model?.trim()) {
      return throwError(() => new Error('A simulator descriptor is required to start simulation.'));
    }

    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.simulateTaskExecution(executionId, simulator),
      'Simulate execution failed'
    );
  }

  cancelExecution(executionId: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.cancelTaskExecution(executionId),
      'Cancel execution failed'
    );
  }

  resumeExecution(executionId: string) {
    const execution = this._taskExecutions().find((item) => item.id === executionId);
    const status = String(execution?.context.status ?? '').toUpperCase();
    if (status !== 'SUSPENDED') {
      return throwError(() => new Error('Resume is only supported for suspended executions.'));
    }

    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.resumeTaskExecution(executionId),
      'Resume execution failed'
    );
  }

  prepareStringInput(executionId: string, nodeId: string, inputName: string, value: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareStringInput(executionId, nodeId, inputName, value),
      'Prepare string input failed'
    );
  }

  prepareStringArrayInput(executionId: string, nodeId: string, inputName: string, values: string[]) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareStringArrayInput(executionId, nodeId, inputName, values),
      'Prepare string array input failed'
    );
  }

  prepareFileInput(executionId: string, nodeId: string, inputName: string, file: File) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareFileInput(executionId, nodeId, inputName, file),
      'Prepare file input failed'
    );
  }

  prepareFileArrayInput(executionId: string, nodeId: string, inputName: string, files: File[]) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareFileArrayInput(executionId, nodeId, inputName, files),
      'Prepare file array input failed'
    );
  }

  prepareGlobalStringInput(executionId: string, inputName: string, value: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareGlobalStringInput(executionId, inputName, value),
      'Prepare global string input failed'
    );
  }

  prepareGlobalStringArrayInput(executionId: string, inputName: string, values: string[]) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareGlobalStringArrayInput(executionId, inputName, values),
      'Prepare global string array input failed'
    );
  }

  prepareGlobalFileInput(executionId: string, inputName: string, file: File) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareGlobalFileInput(executionId, inputName, file),
      'Prepare global file input failed'
    );
  }

  prepareGlobalFileArrayInput(executionId: string, inputName: string, files: File[]) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.prepareGlobalFileArrayInput(executionId, inputName, files),
      'Prepare global file array input failed'
    );
  }

  submitInteractionText(executionId: string, nodeId: string, fieldName: string, value: string) {
    const execution = this._taskExecutions().find((item) => item.id === executionId);
    if (execution?.interactionSimulationEnabled === true) {
      return throwError(() => new Error('Manual interaction is disabled for simulated executions.'));
    }

    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.submitInteractionText(executionId, nodeId, fieldName, value).pipe(
        tap((updatedExecution) => {
          if (updatedExecution.executionKind === 'SUBFLOW') {
            this.cacheFollowedExecution(updatedExecution);
          } else {
            this.replaceExecution(updatedExecution);
          }
        })
      ),
      'Submit interaction text failed'
    );
  }

  provideAuthorization(executionId: string, key: string, value: string) {
    return this.withRefreshAndErrorHandling(
      this.taskExecutionsCallService.provideAuthorization(executionId, key, value),
      'Provide authorization failed'
    );
  }

  private updatePollingState(taskExecutions: TaskExecution[]) {
    const shouldPoll = taskExecutions.some((execution) =>
      getExecutionStatusGroup(execution.context.status) === 'RUNNING'
    );

    if (shouldPoll) {
      this.startPolling();
      return;
    }

    this.stopPolling();
  }

  private replaceExecution(updatedExecution: TaskExecution) {
    this._taskExecutions.update((executions) => {
      const index = executions.findIndex((execution) => execution.id === updatedExecution.id);
      if (index < 0) return [updatedExecution, ...executions];
      return executions.map((execution) =>
        execution.id === updatedExecution.id ? updatedExecution : execution
      );
    });

    this._taskExecutionGroups.update((groups) =>
      groups.map((group) => {
        if (!(group.executions ?? []).some((execution) => execution.id === updatedExecution.id)) {
          return group;
        }
        return {
          ...group,
          executions: group.executions.map((execution) =>
            execution.id === updatedExecution.id ? updatedExecution : execution
          ),
          lastExecutionTime: Math.max(group.lastExecutionTime, updatedExecution.creationTime)
        };
      })
    );
  }

  private cacheFollowedExecution(execution: TaskExecution) {
    this._followedExecutions.update((current) => ({
      ...current,
      [execution.id]: execution
    }));
  }

  private flattenGroups(groups: TaskExecutionGroup[]): TaskExecution[] {
    return groups
      .flatMap((group) => group.executions ?? [])
      .sort((left, right) => (right.creationTime ?? 0) - (left.creationTime ?? 0));
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.refresh();
    }, TaskExecutionsService.POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private withRefreshAndErrorHandling<T>(source: Observable<T>, errorMessage: string, refresh = true): Observable<T> {
    const piped = refresh
      ? source.pipe(tap(() => this.refresh()))
      : source;
    return piped.pipe(
      catchError((err) => {
        console.error(errorMessage, err);
        return throwError(() => err);
      })
    );
  }

  private toBiasOperationError(error: unknown): unknown {
    const response = error as { status?: unknown; error?: unknown };
    if (response?.status !== 409 || !response.error || typeof response.error !== 'object') {
      return error;
    }

    const body = response.error as Record<string, unknown>;
    const errors = Array.isArray(body['errors']) ? body['errors'] : [];
    const first = errors[0];
    if (!first || typeof first !== 'object') return error;
    const record = first as Record<string, unknown>;
    const code = record['code'];
    const message = typeof record['message'] === 'string'
      ? record['message']
      : typeof body['detail'] === 'string' ? body['detail'] : 'Bias experiment request was rejected';

    if (code === 'BIAS_SIDE_EFFECT_BLOCKED') {
      const mapped: BiasSideEffectError = {
        reason: 'SIDE_EFFECT_BLOCKED',
        code,
        message
      };
      return mapped;
    }
    if (code === 'BIAS_SIDE_EFFECT_CONFIRMATION_REQUIRED') {
      const mapped: BiasSideEffectError = {
        reason: 'CONFIRMATION_REQUIRED',
        code,
        message
      };
      return mapped;
    }
    return error;
  }

  private isRetryablePollingError(error: unknown): boolean {
    const value = error as { status?: unknown; name?: unknown };
    const status = typeof value?.status === 'number' ? value.status : null;
    return value?.name === 'TimeoutError' || status === 0 || (status != null && status >= 500);
  }
}
