import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { LLMDescriptor } from '@models/flow';
import { ExecutionEventLogEntry, getExecutionStatusGroup, TaskExecution } from '@models/task-execution';
import { catchError, finalize, Observable, tap, throwError } from 'rxjs';
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
  private _pendingExecutionCreation = signal(false);

  taskExecutions = this._taskExecutions.asReadonly();
  pendingExecutionCreation = this._pendingExecutionCreation.asReadonly();

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.destroyRef.onDestroy(() => this.stopPolling());
    this.refresh();
  }

  refresh() {
    if (this.refreshInFlight) return;
    this.refreshInFlight = true;

    this.taskExecutionsCallService.retrieveAllTaskExecutions().pipe(
      finalize(() => {
        this.refreshInFlight = false;
      })
    ).subscribe((taskExecutions) => {
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
      this.taskExecutionsCallService.submitInteractionText(executionId, nodeId, fieldName, value),
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
}
