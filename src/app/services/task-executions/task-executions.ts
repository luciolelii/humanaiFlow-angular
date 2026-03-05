import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { TaskExecution } from '@models/task-execution';
import { catchError, tap, throwError } from 'rxjs';
import { TaskExecutionsCallServiceBase } from './task-executions-call.base';

@Injectable({
  providedIn: 'root',
})
export class TaskExecutionsService {
  taskExecutionsCallService: TaskExecutionsCallServiceBase = new environment.taskExecutionsCallService();
  private initialized = false;
  private _taskExecutions = signal<TaskExecution[]>([]);

  taskExecutions = this._taskExecutions.asReadonly();

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.refresh();
  }

  refresh() {
    this.taskExecutionsCallService.retrieveAllTaskExecutions().subscribe((taskExecutions) => {
      this._taskExecutions.set(taskExecutions);
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
}
