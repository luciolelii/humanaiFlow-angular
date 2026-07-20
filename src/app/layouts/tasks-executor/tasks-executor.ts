import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { normalizeExecutionStatus, TaskExecution, TaskExecutionGroup } from '@models/task-execution';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  TaskExecutionListItem,
  TaskExecutionGroupListItem,
  TasksExecutionsListComponent
} from '@shared/tasks-executions-list/tasks-executions-list';
import { TaskExecutionViewerComponent } from '@shared/task-execution-viewer/task-execution-viewer';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';

@Component({
  selector: 'app-tasks-executor',
  imports: [TasksExecutionsListComponent, TaskExecutionViewerComponent, MatCardModule],
  templateUrl: './tasks-executor.html',
  styleUrl: './tasks-executor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksExecutor {
  private taskExecutionsService = inject(TaskExecutionsService);
  private confirm = inject(ConfirmDialogService);
  private blocksService = inject(BlocksService);
  private containersService = inject(ContainersService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private routeExecutionId = toSignal(
    this.route.queryParamMap,
    { initialValue: this.route.snapshot.queryParamMap }
  );

  readonly executionDetails = this.taskExecutionsService.taskExecutions;
  readonly executionGroups = this.taskExecutionsService.taskExecutionGroups;
  readonly pendingExecutionCreation = this.taskExecutionsService.pendingExecutionCreation;

  readonly groups = computed<TaskExecutionGroupListItem[]>(() =>
    this.executionGroups().map((group) => this.toGroupListItem(group))
  );

  readonly selectedExecutionId = signal<string | null>(null);
  readonly requestedExecutionId = signal<string | null>(null);

  readonly selectedExecution = computed<TaskExecution | null>(() => {
    const selectedId = this.selectedExecutionId();
    const details = this.executionDetails();
    if (!details.length) return null;
    if (!selectedId) return details[0];
    return details.find((execution) => execution.id === selectedId) ?? null;
  });

  readonly showExecutionCreationLoader = computed(() =>
    this.pendingExecutionCreation() && !this.requestedExecutionId()
  );

  constructor() {
    void this.blocksService.getAllBlocksTypes().catch((err) => {
      console.error('Error preloading block types for task executor', err);
    });
    void this.containersService.getAllContainerTypes().catch((err) => {
      console.error('Error preloading container types for task executor', err);
    });
    this.taskExecutionsService.init();
    effect(() => {
      const routeSelectedId = this.routeExecutionId().get('executionId');
      this.requestedExecutionId.set(routeSelectedId);
      if (routeSelectedId) {
        this.selectedExecutionId.set(routeSelectedId);
      }
    });
    effect(() => {
      const requestedId = this.requestedExecutionId();
      if (!requestedId) return;
      const exists = this.executionDetails().some((execution) => execution.id === requestedId);
      if (exists) {
        this.selectedExecutionId.set(requestedId);
      }
    });
    effect(() => {
      if (this.requestedExecutionId()) return;
      if (this.selectedExecutionId()) return;
      const first = this.groups()[0];
      if (first?.latestExecutionId) this.selectedExecutionId.set(first.latestExecutionId);
    });
  }

  selectExecution(id: string) {
    this.requestedExecutionId.set(null);
    this.selectedExecutionId.set(id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { executionId: id },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  async removeExecution(id: string) {
    const confirmed = await this.confirm.open('Are you sure you want to delete this execution?');
    if (!confirmed) return;

    this.taskExecutionsService.deleteExecution(id).subscribe({
      next: () => {
        if (this.selectedExecutionId() === id) {
          this.selectedExecutionId.set(null);
        }
      },
      error: (err) => console.error('Error deleting execution:', err)
    });
  }

  rerunExecution(id: string) {
    this.taskExecutionsService.rerunExecution(id).subscribe({
      next: (execution) => this.selectExecution(execution.id),
      error: (err) => console.error('Error rerunning execution:', err)
    });
  }

  private toGroupListItem(group: TaskExecutionGroup): TaskExecutionGroupListItem {
    const executions = (group.executions ?? []).map((execution, index) =>
      this.toExecutionListItem(execution, index + 1)
    );
    const latestExecution = executions.find((execution) => execution.id === group.latestExecutionId)
      ?? executions[executions.length - 1]
      ?? null;

    return {
      id: group.id,
      sourceFlowId: group.sourceFlowId,
      name: group.name,
      executionCount: group.executionCount,
      lastExecutionTime: group.lastExecutionTime,
      lastExecutionTimeLabel: this.formatDateTime(group.lastExecutionTime),
      latestExecutionId: group.latestExecutionId || latestExecution?.id || '',
      latestStatus: latestExecution?.status ?? 'CREATED',
      latestRunNumber: latestExecution?.runNumber ?? null,
      executions
    };
  }

  private toExecutionListItem(execution: TaskExecution, fallbackRunNumber: number): TaskExecutionListItem {
    return {
      id: execution.id,
      title: execution.name,
      flowName: String(execution.sourceFlowId ?? execution.flowId ?? execution.name ?? ''),
      status: normalizeExecutionStatus(execution.context.status),
      startedAt: this.formatDateTime(execution.creationTime),
      creationTime: execution.creationTime,
      runNumber: typeof execution.runNumber === 'number' ? execution.runNumber : fallbackRunNumber,
      rerunOfExecutionId: execution.rerunOfExecutionId ?? null,
      duration: this.formatDuration(execution.context.startTime ?? null, execution.context.endTime ?? null),
      simulated: execution.interactionSimulationEnabled === true
    };
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
    if (!startTime || !endTime) return '0 sec';
    const diffMs = Math.max(0, endTime - startTime);
    const totalSeconds = Math.floor(diffMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    if (totalSeconds < 60) {
      return `${totalSeconds} sec`;
    }

    if (totalMinutes < 60) {
      const seconds = totalSeconds % 60;
      return seconds > 0 ? `${totalMinutes} min ${seconds} sec` : `${totalMinutes} min`;
    }

    if (totalHours < 24) {
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${totalHours} h ${minutes} min` : `${totalHours} h`;
    }

    const hours = totalHours % 24;
    return hours > 0 ? `${totalDays} gg ${hours} h` : `${totalDays} gg`;
  }
}
