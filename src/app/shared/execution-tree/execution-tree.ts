import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core';
import { TaskExecution, TaskExecutionStep } from '@models/task-execution';
import { ContainersService } from '@services/containers/containers';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { take } from 'rxjs';

export type ExecutionTreeSelection = {
  executionId: string;
};

export type ContainerStepView = {
  stepId: string;
  name: string;
  status: string;
  waitingForSubflow: boolean;
};

/**
 * A container step spawns a *separate* TaskExecution per iteration, linked back
 * via `parentExecutionId`/`parentStepId`. The step itself only exposes the
 * currently active child (`activeInnerExecutionId`); the full set of iterations
 * is fetched lazily from `GET /executions/{id}/node/{stepId}/iterations` (see
 * TaskExecutionsService.retrieveStepIterations). Each iteration is itself a full
 * execution that may contain further container steps, so the tree recurses.
 */
/**
 * Whether a step opens a subtree. Exported as a function taking the container-type predicate rather
 * than living only on the component, so the panel hosting the tree decides "is there anything to
 * show" with the very same rule the tree uses to show it - otherwise the two drift and the panel
 * offers to open onto nothing.
 */
export function isContainerStep(step: TaskExecutionStep,
    isKnownContainerType: (typeName: string) => boolean): boolean {
  if (step.node?.nodeFamily === 'container') return true;
  if (step.activeInnerExecutionId) return true;
  if (step.containerContinuationPhase) return true;
  if (typeof step.containerIterationIndex === 'number') return true;
  const typeName = step.node?.typeName;
  return !!typeName && isKnownContainerType(typeName);
}

export function executionTreeHasContent(execution: TaskExecution | null | undefined,
    isKnownContainerType: (typeName: string) => boolean): boolean {
  if (!execution) return false;
  return Object.values(execution.context.steps ?? {})
      .some((step) => isContainerStep(step, isKnownContainerType));
}

@Component({
  selector: 'app-execution-tree',
  imports: [CommonModule],
  templateUrl: './execution-tree.html',
  styleUrl: './execution-tree.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.execution-tree-empty]': '!hasContainerContent()'
  }
})
export class ExecutionTreeComponent {
  private containersService = inject(ContainersService);
  private taskExecutionsService = inject(TaskExecutionsService);

  readonly rootExecution = input<TaskExecution | null>(null);
  readonly selectedExecutionId = input<string | null>(null);
  readonly executionSelected = output<ExecutionTreeSelection>();

  private readonly expandedKeys = signal<Set<string>>(new Set<string>());
  private readonly loadingStepKeys = signal<Set<string>>(new Set<string>());
  private readonly stepErrors = signal<Record<string, string>>({});
  private readonly iterationsByStep = signal<Record<string, TaskExecution[]>>({});
  private lastRootId: string | null = null;

  readonly hasContainerContent = computed(() => {
    const root = this.rootExecution();
    return !!root && this.containerSteps(root).length > 0;
  });

  constructor() {
    // Reset the tree only when the top-level run actually changes — polling
    // hands us a fresh TaskExecution object on every tick with the same id, and
    // we must not wipe expansion/loaded state each time.
    effect(() => {
      const rootId = this.rootExecution()?.id ?? null;
      if (rootId === this.lastRootId) return;
      this.lastRootId = rootId;
      untracked(() => {
        this.expandedKeys.set(rootId ? new Set<string>([this.execKey(rootId)]) : new Set<string>());
        this.iterationsByStep.set({});
        this.loadingStepKeys.set(new Set<string>());
        this.stepErrors.set({});
      });
    });
  }

  containerSteps(execution: TaskExecution): ContainerStepView[] {
    return Object.values(execution.context.steps ?? {})
      .filter((step) => this.isContainerStep(step))
      .map((step) => ({
        stepId: step.id,
        name: step.node?.name?.trim() || step.id,
        status: String(step.status ?? ''),
        waitingForSubflow: String(step.status ?? '').toUpperCase() === 'WAITING_FOR_SUBFLOW'
      }));
  }

  private isContainerStep(step: TaskExecutionStep): boolean {
    return isContainerStep(step, (typeName) => !!this.containersService.peekContainerType(typeName));
  }

  /** Iterations for a step, minus GUARD subflows (debug-only, see backend doc). */
  iterationsFor(executionId: string, stepId: string): TaskExecution[] {
    const all = this.iterationsByStep()[this.stepKey(executionId, stepId)] ?? [];
    return all.filter((iteration) => String(iteration.subflowRole ?? '').toUpperCase() !== 'GUARD');
  }

  isExecutionExpanded(executionId: string): boolean {
    return this.expandedKeys().has(this.execKey(executionId));
  }

  toggleExecution(executionId: string, event?: Event) {
    event?.stopPropagation();
    this.toggleKey(this.execKey(executionId));
  }

  isStepExpanded(executionId: string, stepId: string): boolean {
    return this.expandedKeys().has(this.stepExpandKey(executionId, stepId));
  }

  toggleStep(executionId: string, stepId: string, event?: Event) {
    event?.stopPropagation();
    const key = this.stepExpandKey(executionId, stepId);
    const willExpand = !this.expandedKeys().has(key);
    this.toggleKey(key);
    if (willExpand) {
      this.ensureIterationsLoaded(executionId, stepId);
    }
  }

  isStepLoading(executionId: string, stepId: string): boolean {
    return this.loadingStepKeys().has(this.stepKey(executionId, stepId));
  }

  stepError(executionId: string, stepId: string): string | null {
    return this.stepErrors()[this.stepKey(executionId, stepId)] ?? null;
  }

  isStepLoaded(executionId: string, stepId: string): boolean {
    return this.stepKey(executionId, stepId) in this.iterationsByStep();
  }

  selectExecution(execution: TaskExecution) {
    this.executionSelected.emit({ executionId: execution.id });
  }

  executionLabel(execution: TaskExecution): string {
    if (execution.id === this.rootExecution()?.id) return execution.name || 'Execution';
    if (typeof execution.parentIterationIndex === 'number') {
      return `Iteration ${execution.parentIterationIndex}`;
    }
    return execution.name || 'Subflow';
  }

  statusDotClass(status: string | null | undefined): string {
    const normalized = String(status ?? '').toUpperCase();
    if (normalized === 'SUCCESS' || normalized === 'COMPLETED') return 'tree-dot-success';
    if (normalized === 'ERROR' || normalized === 'FAILED') return 'tree-dot-error';
    if (normalized === 'CANCELLED') return 'tree-dot-cancelled';
    if (normalized === 'SUSPENDED') return 'tree-dot-suspended';
    if (normalized === 'WAITING' || normalized.startsWith('WAITING_')) return 'tree-dot-waiting';
    if (normalized === 'RUNNING') return 'tree-dot-running';
    return 'tree-dot-idle';
  }

  private ensureIterationsLoaded(executionId: string, stepId: string) {
    const key = this.stepKey(executionId, stepId);
    if (key in this.iterationsByStep()) return;
    if (this.loadingStepKeys().has(key)) return;

    this.loadingStepKeys.update((current) => new Set(current).add(key));
    this.stepErrors.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

    this.taskExecutionsService.retrieveStepIterations(executionId, stepId).pipe(take(1)).subscribe({
      next: (iterations) => {
        this.iterationsByStep.update((current) => ({ ...current, [key]: iterations }));
        this.clearLoading(key);
      },
      error: (err) => {
        this.stepErrors.update((current) => ({ ...current, [key]: this.toErrorMessage(err) }));
        this.clearLoading(key);
      }
    });
  }

  private clearLoading(key: string) {
    this.loadingStepKeys.update((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  private toggleKey(key: string) {
    this.expandedKeys.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  private toErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status?: number }).status;
      if (status === 400) return 'This step is not an iterating container.';
      if (status === 404) return 'Step no longer exists.';
      if (status === 403) return 'Not authorized to load iterations.';
    }
    return 'Unable to load iterations.';
  }

  private execKey(executionId: string): string {
    return `exec:${executionId}`;
  }

  private stepExpandKey(executionId: string, stepId: string): string {
    return `step:${this.stepKey(executionId, stepId)}`;
  }

  private stepKey(executionId: string, stepId: string): string {
    return `${executionId}::${stepId}`;
  }
}
