import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import {
  normalizeExecutionStatus,
  TaskExecution,
  TaskExecutionGroup,
  TaskExecutionStep
} from '@models/task-execution';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  TaskExecutionListItem,
  TaskExecutionGroupListItem,
  TasksExecutionsListComponent
} from '@shared/tasks-executions-list/tasks-executions-list';
import { TaskExecutionViewerComponent } from '@shared/task-execution-viewer/task-execution-viewer';
import { formatDuration } from '@shared/task-execution-viewer/execution-viewer.utils';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { catchError, EMPTY, exhaustMap, timer } from 'rxjs';

export type InteractiveSubflowTarget = {
  childExecutionId: string;
  parentStep: TaskExecutionStep;
  parentStepId: string;
  containerName: string;
  iterationIndex: number | null;
};

export function findInteractiveSubflowTargets(
  execution: TaskExecution | null | undefined
): InteractiveSubflowTarget[] {
  if (!execution) return [];

  return Object.entries(execution.context.steps ?? {}).flatMap(([stepId, step]) => {
    const childExecutionId = String(step.activeInnerExecutionId ?? '').trim();
    if (String(step.status ?? '').toUpperCase() !== 'WAITING_FOR_SUBFLOW' || !childExecutionId) {
      return [];
    }

    return [{
      childExecutionId,
      parentStep: step,
      parentStepId: step.id || stepId,
      containerName: step.node?.name?.trim() || step.id || stepId,
      iterationIndex: typeof step.containerIterationIndex === 'number'
        ? step.containerIterationIndex
        : null
    }];
  });
}

@Component({
  selector: 'app-tasks-executor',
  imports: [TasksExecutionsListComponent, TaskExecutionViewerComponent, MatCardModule],
  templateUrl: './tasks-executor.html',
  styleUrl: './tasks-executor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksExecutor {
  private static readonly CHILD_POLL_INTERVAL_MS = 2_000;
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

  readonly interactiveSubflowTargets = computed<InteractiveSubflowTarget[]>(() =>
    findInteractiveSubflowTargets(this.selectedExecution())
  );

  readonly selectedChildExecutionId = signal<string | null>(null);
  readonly childExecutionLoading = signal(false);
  readonly childExecutionError = signal<string | null>(null);
  readonly activeSubflowTarget = computed<InteractiveSubflowTarget | null>(() => {
    const selectedId = this.selectedChildExecutionId();
    return this.interactiveSubflowTargets()
      .find((target) => target.childExecutionId === selectedId)
      ?? null;
  });
  readonly childExecution = computed<TaskExecution | null>(() => {
    const childId = this.activeSubflowTarget()?.childExecutionId;
    return childId ? this.taskExecutionsService.followedExecutions()[childId] ?? null : null;
  });
  readonly displayedExecution = computed<TaskExecution | null>(() =>
    this.childExecution() ?? this.selectedExecution()
  );

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
    effect(() => {
      const targets = this.interactiveSubflowTargets();
      const selectedId = this.selectedChildExecutionId();
      if (selectedId && targets.some((target) => target.childExecutionId === selectedId)) return;
      this.selectedChildExecutionId.set(targets[0]?.childExecutionId ?? null);
    });
    effect((onCleanup) => {
      const childExecutionId = this.activeSubflowTarget()?.childExecutionId ?? null;
      if (!childExecutionId) {
        this.childExecutionLoading.set(false);
        this.childExecutionError.set(null);
        return;
      }

      this.childExecutionLoading.set(
        !untracked(() => this.taskExecutionsService.followedExecutions()[childExecutionId])
      );
      this.childExecutionError.set(null);
      const subscription = timer(0, TasksExecutor.CHILD_POLL_INTERVAL_MS).pipe(
        exhaustMap(() => this.taskExecutionsService.retrieveExecution(childExecutionId).pipe(
          catchError(() => {
            this.childExecutionLoading.set(false);
            this.childExecutionError.set(
              'Unable to load the interactive subflow execution. Retrying…'
            );
            return EMPTY;
          })
        ))
      ).subscribe(() => {
        this.childExecutionLoading.set(false);
        this.childExecutionError.set(null);
      });

      onCleanup(() => subscription.unsubscribe());
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

  selectInteractiveSubflow(childExecutionId: string) {
    if (!this.interactiveSubflowTargets().some(
      (target) => target.childExecutionId === childExecutionId
    )) return;
    this.selectedChildExecutionId.set(childExecutionId);
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
      duration: this.formatExecutionDuration(execution.context.startTime ?? null, execution.context.endTime ?? null),
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

  private formatExecutionDuration(startTime: number | null, endTime: number | null): string {
    if (!startTime || !endTime) return '0 sec';
    return formatDuration(startTime, endTime);
  }
}
