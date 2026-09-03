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
import { MatTooltipModule } from '@angular/material/tooltip';
import { ExecutionTreeComponent, ExecutionTreeSelection, executionTreeHasContent } from '@shared/execution-tree/execution-tree';
import { formatDuration } from '@shared/task-execution-viewer/execution-viewer.utils';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { FlowsService } from '@services/flows/flows';
import { ProjectsService } from '@services/projects/projects';
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
  imports: [TasksExecutionsListComponent, TaskExecutionViewerComponent, ExecutionTreeComponent, MatCardModule, MatTooltipModule],
  templateUrl: './tasks-executor.html',
  styleUrl: './tasks-executor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksExecutor {
  private static readonly CHILD_POLL_INTERVAL_MS = 2_000;
  private taskExecutionsService = inject(TaskExecutionsService);
  private confirm = inject(ConfirmDialogService);
  private blocksService = inject(BlocksService);
  private flowsService = inject(FlowsService);
  private projectsService = inject(ProjectsService);
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
  readonly executionTreeOpen = signal(true);

  /**
   * A run with no container steps has no subtree to show, so the panel would open onto nothing.
   * Uses the tree's own rule, not a second guess at it.
   */
  readonly executionTreeAvailable = computed(() => executionTreeHasContent(
    this.selectedExecution(),
    (typeName) => !!this.containersService.peekContainerType(typeName)));

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

  /** Execution the user navigated to via the hierarchy tree (any depth). */
  readonly manualTreeSelectionId = signal<string | null>(null);

  readonly displayedExecution = computed<TaskExecution | null>(() => {
    const manual = this.resolveExecutionById(this.manualTreeSelectionId());
    if (manual) return manual;
    return this.childExecution() ?? this.selectedExecution();
  });

  readonly displayedParentExecution = computed<TaskExecution | null>(() => {
    const displayed = this.displayedExecution();
    const parentId = displayed?.parentExecutionId ?? null;
    if (!parentId || parentId === displayed?.id) return null;
    return this.resolveExecutionById(parentId);
  });

  readonly displayedParentContainerStep = computed<TaskExecutionStep | null>(() => {
    const displayed = this.displayedExecution();
    const parent = this.displayedParentExecution();
    const stepId = displayed?.parentStepId ?? null;
    if (!parent || !stepId) return null;
    return parent.context.steps?.[stepId] ?? null;
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
    // Needed only to label a group with its project; failure just leaves the chip off.
    void this.flowsService.getAllFlows().catch((err) => {
      console.error('Error preloading flows for task executor', err);
    });
    void this.projectsService.getAllProjects().catch((err) => {
      console.error('Error preloading projects for task executor', err);
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
      // Reset tree navigation whenever the selected top-level run changes.
      this.selectedExecutionId();
      untracked(() => this.manualTreeSelectionId.set(null));
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
    this.manualTreeSelectionId.set(null);
    this.selectedChildExecutionId.set(childExecutionId);
  }

  selectTreeExecution(selection: ExecutionTreeSelection) {
    this.manualTreeSelectionId.set(selection.executionId);
  }

  toggleExecutionTree() {
    if (!this.executionTreeAvailable()) return;
    this.executionTreeOpen.update((open) => !open);
  }

  private resolveExecutionById(executionId: string | null): TaskExecution | null {
    if (!executionId) return null;
    return this.executionDetails().find((execution) => execution.id === executionId)
      ?? this.taskExecutionsService.followedExecutions()[executionId]
      ?? null;
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
    // Resolved up front so a rerun can name the run it came from by number instead of by uuid.
    const runNumbers = new Map((group.executions ?? []).map((execution, index) =>
      [execution.id, typeof execution.runNumber === 'number' ? execution.runNumber : index + 1]));
    const executions = (group.executions ?? []).map((execution, index) =>
      this.toExecutionListItem(execution, index + 1, runNumbers)
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
      projectName: this.projectNameForFlow(group.sourceFlowId),
      executions
    };
  }

  /** Resolves source flow -> project -> name; null when the flow has no project. */
  private projectNameForFlow(sourceFlowId: string | null | undefined): string | null {
    if (!sourceFlowId) return null;
    const flow = this.flowsService.flows().find((candidate) => candidate.id === sourceFlowId);
    if (!flow?.projectId) return null;
    return this.projectsService.projectById().get(flow.projectId)?.name ?? flow.projectName ?? null;
  }

  private toExecutionListItem(execution: TaskExecution, fallbackRunNumber: number,
      runNumbers: Map<string, number> = new Map()): TaskExecutionListItem {
    const bias = execution.biasExecutionContext;
    const isBiasVariant = bias?.mode === 'BIAS_VARIANT';
    const directions = new Set((bias?.activeBiasProbes ?? []).map((probe) => probe.direction));
    const rerunOf = execution.rerunOfExecutionId ?? null;

    return {
      id: execution.id,
      title: execution.name,
      flowName: String(execution.sourceFlowId ?? execution.flowId ?? execution.name ?? ''),
      status: normalizeExecutionStatus(execution.context.status),
      startedAt: this.formatDateTime(execution.creationTime),
      creationTime: execution.creationTime,
      runNumber: typeof execution.runNumber === 'number' ? execution.runNumber : fallbackRunNumber,
      rerunOfExecutionId: rerunOf,
      rerunOfRunNumber: rerunOf ? runNumbers.get(rerunOf) ?? null : null,
      // A bias variant is reported as such even when it is also a rerun: that it carries probes is
      // the thing that changes how its result should be read.
      kind: isBiasVariant ? 'BIAS_VARIANT' : (rerunOf ? 'RERUN' : 'RUN'),
      biasDirection: !isBiasVariant
        ? null
        : directions.size > 1
          ? 'MIXED'
          : directions.has('MITIGATION') ? 'MITIGATION' : 'BIAS',
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
