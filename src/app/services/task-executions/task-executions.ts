import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { TaskExecution } from '@models/task-execution';
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
}

