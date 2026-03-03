import { Component, signal } from '@angular/core';
import { TasksExecutionsListComponent, TaskExecutionListItem } from '@shared/tasks-executions-list/tasks-executions-list';
import { TaskExecutionViewerComponent } from '@shared/task-execution-viewer/task-execution-viewer';

@Component({
  selector: 'app-tasks-executor',
  imports: [TasksExecutionsListComponent, TaskExecutionViewerComponent],
  templateUrl: './tasks-executor.html',
  styleUrl: './tasks-executor.css',
})
export class TasksExecutor {
  readonly executions = signal<TaskExecutionListItem[]>([
    {
      id: 'run-001',
      title: 'Customer onboarding flow',
      flowName: 'Onboarding',
      status: 'RUNNING',
      startedAt: '2026-03-03 10:21',
      duration: '00:02:13'
    },
    {
      id: 'run-002',
      title: 'Weekly report generation',
      flowName: 'Report Builder',
      status: 'COMPLETED',
      startedAt: '2026-03-03 09:15',
      duration: '00:06:48'
    },
    {
      id: 'run-003',
      title: 'Data enrichment pipeline',
      flowName: 'Enricher',
      status: 'FAILED',
      startedAt: '2026-03-03 08:42',
      duration: '00:01:59'
    }
  ]);

  readonly selectedExecutionId = signal<string | null>(this.executions()[0]?.id ?? null);

  readonly selectedExecution = () =>
    this.executions().find((execution) => execution.id === this.selectedExecutionId()) ?? null;

  selectExecution(id: string) {
    this.selectedExecutionId.set(id);
  }
}
