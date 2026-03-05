import { Component, computed, effect, inject, signal } from '@angular/core';
import { TaskExecution } from '@models/task-execution';
import {
  TaskExecutionListItem,
  TaskExecutionStatus,
  TasksExecutionsListComponent
} from '@shared/tasks-executions-list/tasks-executions-list';
import { TaskExecutionViewerComponent } from '@shared/task-execution-viewer/task-execution-viewer';
import { TaskExecutionsService } from '@services/task-executions/task-executions';

@Component({
  selector: 'app-tasks-executor',
  imports: [TasksExecutionsListComponent, TaskExecutionViewerComponent],
  templateUrl: './tasks-executor.html',
  styleUrl: './tasks-executor.css',
})
export class TasksExecutor {
  private taskExecutionsService = inject(TaskExecutionsService);

  readonly executionDetails = this.taskExecutionsService.taskExecutions;

  readonly executions = computed<TaskExecutionListItem[]>(() =>
    this.executionDetails().map((execution) => ({
      id: execution.id,
      title: execution.name,
      flowName: execution.name,
      status: this.toListStatus(execution.context.status),
      startedAt: this.formatDateTime(execution.creationTime),
      duration: this.formatDuration(execution.context.startTime ?? null, execution.context.endTime ?? null)
    }))
  );

  readonly selectedExecutionId = signal<string | null>(null);

  readonly selectedExecution = computed<TaskExecution | null>(() => {
    const selectedId = this.selectedExecutionId();
    const details = this.executionDetails();
    if (!details.length) return null;
    if (!selectedId) return details[0];
    return details.find((execution) => execution.id === selectedId) ?? details[0];
  });

  constructor() {
    this.taskExecutionsService.init();
    effect(() => {
      if (this.selectedExecutionId()) return;
      const first = this.executions()[0];
      if (first) this.selectedExecutionId.set(first.id);
    });
  }

  selectExecution(id: string) {
    this.selectedExecutionId.set(id);
  }

  private toListStatus(status: string): TaskExecutionStatus {
    if (status === 'COMPLETED') return 'COMPLETED';
    if (status === 'FAILED' || status === 'ERROR') return 'FAILED';
    if (status === 'RUNNING' || status === 'WAITING' || status === 'WAITING_FOR_INPUT') return 'RUNNING';
    return 'QUEUED';
  }

  private formatDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  private formatDuration(startTime: number | null, endTime: number | null): string {
    if (!startTime || !endTime) return '00:00:00';
    const diffMs = Math.max(0, endTime - startTime);
    const totalSeconds = Math.floor(diffMs / 1000);
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
}
