import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { getExecutionStatusGroup, TaskExecution } from '@models/task-execution';
import { catchError, finalize, tap, throwError } from 'rxjs';
import { TaskExecutionsCallServiceBase } from './task-executions-call.base';

@Injectable({
  providedIn: 'root',
})
export class TaskExecutionsService {
  private static readonly POLL_INTERVAL_MS = 5000;
  taskExecutionsCallService: TaskExecutionsCallServiceBase = new environment.taskExecutionsCallService();
  private initialized = false;
  private refreshInFlight = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _taskExecutions = signal<TaskExecution[]>([]);

  taskExecutions = this._taskExecutions.asReadonly();

  init() {
    if (this.initialized) return;
    this.initialized = true;
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

  createExecution(flowId: string) {
    return this.taskExecutionsCallService.createTaskExecution(flowId).pipe(
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Create execution failed', err);
        return throwError(() => err);
      })
    );
  }

  deleteExecution(executionId: string) {
    return this.taskExecutionsCallService.deleteTaskExecution(executionId).pipe(
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Delete execution failed', err);
        return throwError(() => err);
      })
    );
  }

  startExecution(executionId: string) {
    return this.taskExecutionsCallService.startTaskExecution(executionId).pipe(
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Start execution failed', err);
        return throwError(() => err);
      })
    );
  }

  prepareStringInput(executionId: string, nodeId: string, inputName: string, value: string) {
    return this.taskExecutionsCallService.prepareStringInput(executionId, nodeId, inputName, value).pipe(
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Prepare string input failed', err);
        return throwError(() => err);
      })
    );
  }

  prepareFileInput(executionId: string, nodeId: string, inputName: string, file: File) {
    return this.taskExecutionsCallService.prepareFileInput(executionId, nodeId, inputName, file).pipe(
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Prepare file input failed', err);
        return throwError(() => err);
      })
    );
  }

  submitInteractionText(executionId: string, nodeId: string, fieldName: string, value: string) {
    return this.taskExecutionsCallService.submitInteractionText(executionId, nodeId, fieldName, value).pipe(
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Submit interaction text failed', err);
        return throwError(() => err);
      })
    );
  }

  provideAuthorization(executionId: string, key: string, value: string) {
    return this.taskExecutionsCallService.provideAuthorization(executionId, key, value).pipe(
      tap(() => this.refresh()),
      catchError((err) => {
        console.error('Provide authorization failed', err);
        return throwError(() => err);
      })
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
}
