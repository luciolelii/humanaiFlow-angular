import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getExecutionStatusGroup, TaskExecutionStatus, TaskExecutionStatusGroup } from '@models/task-execution';
import { OrderEvent, OrderField, Ordering, orderDirType } from '@shared/ordering/ordering';
import { OrderViewState } from '@utilities/list-state-holder';

export type TaskExecutionFilter = 'all' | TaskExecutionStatusGroup;

/**
 * What kind of run a row is, so a bias variant is never mistaken for an ordinary rerun.
 *
 * This is the list's own vocabulary, not an API value: the mode the backend sends for a variant is
 * `EXPERIMENT` (see BiasExecutionMode). The two names looked interchangeable, and comparing an API
 * mode against this one is exactly how the variant check came to be always false.
 */
export type TaskExecutionKind = 'RUN' | 'RERUN' | 'BIAS_VARIANT';

export type TaskExecutionListItem = {
  id: string;
  title: string;
  flowName: string;
  status: TaskExecutionStatus;
  startedAt: string;
  creationTime: number;
  runNumber: number | null;
  rerunOfExecutionId?: string | null;
  /** The run number this one reruns - far more readable in a narrow list than its uuid. */
  rerunOfRunNumber?: number | null;
  kind: TaskExecutionKind;
  /** Which way the bias probes point; MIXED when a variant activates both at once. */
  biasDirection?: 'BIAS' | 'MITIGATION' | 'MIXED' | null;
  duration?: string;
  simulated?: boolean;
};

export type TaskExecutionGroupListItem = {
  id: string;
  sourceFlowId: string;
  name: string;
  executionCount: number;
  lastExecutionTime: number;
  lastExecutionTimeLabel: string;
  latestExecutionId: string;
  latestStatus: TaskExecutionStatus;
  latestRunNumber: number | null;
  /**
   * Name of the project the group's flow belongs to, derived by the host. Execution groups have a
   * single level and are keyed by source flow, so a project run shows up as N sibling groups: the
   * chip is what visually clusters them.
   */
  projectName?: string | null;
  executions: TaskExecutionListItem[];
};

@Component({
  selector: 'app-tasks-executions-list',
  imports: [CommonModule, FormsModule, Ordering, MatButtonModule, MatButtonToggleModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatListModule, MatTooltipModule],
  templateUrl: './tasks-executions-list.html',
  styleUrl: './tasks-executions-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksExecutionsListComponent {
  readonly groups = input<TaskExecutionGroupListItem[]>([]);
  readonly selectedExecutionId = input<string | null>(null);
  readonly executionSelected = output<string>();
  readonly executionDeleteRequested = output<string>();
  readonly executionRerunRequested = output<string>();
  /** Two runs of one group, picked to be compared. */
  readonly compareRequested = output<{ leftId: string; rightId: string }>();
  /**
   * Which group is in compare mode, and which of its runs are ticked.
   *
   * Kept apart from `selectedExecutionId` on purpose: that one drives which run the main panel
   * shows, and folding the two together would make ticking a box navigate away from what the user
   * is reading. Confined to one group because comparing runs of different flows is meaningless -
   * they share no node ids.
   */
  private readonly compareGroupId = signal<string | null>(null);
  private readonly comparePicks = signal<string[]>([]);

  readonly searchTerm = model<string>('');
  readonly filter = signal<TaskExecutionFilter>('all');
  readonly orderBy = signal<string | null>('lastExecutionTime');
  readonly orderDir = signal<orderDirType>('desc');
  readonly expandedGroupIds = signal<Set<string>>(new Set<string>());

  /** Same reason as the flows list: the controls must not push the history off a short viewport. */
  readonly filtersOpen = signal(false);

  readonly activeFilterCount = computed(() => (this.filter() === 'all' ? 0 : 1));

  kindLabel(execution: TaskExecutionListItem): string {
    if (execution.kind === 'BIAS_VARIANT') {
      return execution.biasDirection === 'MITIGATION'
        ? 'Mitigation'
        : execution.biasDirection === 'MIXED' ? 'Bias + mitigation' : 'Bias';
    }
    return execution.kind === 'RERUN' ? 'Rerun' : 'Run';
  }

  kindTooltip(execution: TaskExecutionListItem): string {
    if (execution.kind === 'BIAS_VARIANT') {
      return 'A bias variant: this run had bias or mitigation probes activated, so its result is not a baseline.';
    }
    return execution.kind === 'RERUN' ? 'A plain rerun of an earlier execution.' : 'An original run.';
  }

  kindBadgeClass(execution: TaskExecutionListItem): string {
    if (execution.kind === 'BIAS_VARIANT') {
      return execution.biasDirection === 'MITIGATION'
        ? 'tasks-list-kind-mitigation'
        : 'tasks-list-kind-bias';
    }
    return execution.kind === 'RERUN' ? 'tasks-list-kind-rerun' : 'tasks-list-kind-run';
  }

  runCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'run' : 'runs'}`;
  }

  toggleFilters() {
    this.filtersOpen.update((open) => !open);
  }

  readonly orderView: OrderViewState = {
    orderBy: this.orderBy(),
    orderDir: this.orderDir()
  };

  readonly orderFields: OrderField[] = [
    { field: 'name', label: 'Name' },
    { field: 'executionCount', label: 'Executions' },
    { field: 'lastExecutionTime', label: 'Latest Run' },
    { field: 'latestStatus', label: 'Status' },
    // Sorting by project keeps the sibling groups of one project run adjacent.
    { field: 'projectName', label: 'Project' }
  ];

  readonly filteredGroups = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const filter = this.filter();
    const orderBy = this.orderBy();
    const orderDir = this.orderDir();

    const filtered = this.groups().filter((group) => {
      if (!this.groupMatchesFilter(group, filter)) return false;
      if (!term) return true;

      return (
        group.name.toLowerCase().includes(term) ||
        group.sourceFlowId.toLowerCase().includes(term) ||
        (group.projectName ?? '').toLowerCase().includes(term) ||
        group.id.toLowerCase().includes(term) ||
        group.executions.some((execution) =>
          execution.title.toLowerCase().includes(term) ||
          execution.flowName.toLowerCase().includes(term) ||
          execution.id.toLowerCase().includes(term) ||
          String(execution.rerunOfExecutionId ?? '').toLowerCase().includes(term)
        )
      );
    });

    if (!orderBy) return filtered;

    return [...filtered].sort((a, b) => {
      const aValue = (a as any)[orderBy];
      const bValue = (b as any)[orderBy];

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return orderDir === 'asc' ? -1 : 1;
      if (bValue == null) return orderDir === 'asc' ? 1 : -1;

      const aComparable = typeof aValue === 'string' ? aValue.toLowerCase() : aValue;
      const bComparable = typeof bValue === 'string' ? bValue.toLowerCase() : bValue;

      if (aComparable < bComparable) return orderDir === 'asc' ? -1 : 1;
      if (aComparable > bComparable) return orderDir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  selectExecution(executionId: string) {
    this.executionSelected.emit(executionId);
  }

  requestDeleteExecution(executionId: string, event?: Event) {
    event?.stopPropagation();
    this.executionDeleteRequested.emit(executionId);
  }

  requestRerunExecution(executionId: string, event?: Event) {
    event?.stopPropagation();
    this.executionRerunRequested.emit(executionId);
  }

  toggleGroup(groupId: string, event?: Event) {
    event?.stopPropagation();
    this.expandedGroupIds.update((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  isGroupExpanded(groupId: string): boolean {
    return this.expandedGroupIds().has(groupId);
  }

  onOrderChanged(event: OrderEvent) {
    this.orderBy.set(event.orderBy);
    this.orderDir.set(event.orderDir);
    this.orderView.orderBy = event.orderBy;
    this.orderView.orderDir = event.orderDir;
  }

  statusBadgeClass(status: TaskExecutionStatus) {
    const normalized = String(status).toUpperCase();
    if (normalized === 'SUCCESS') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (normalized === 'ERROR') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (normalized === 'CANCELLED') return 'bg-slate-200 text-slate-700 border-slate-300';
    if (normalized === 'SUSPENDED') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (normalized === 'WAITING') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (normalized === 'RUNNING') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (normalized === 'CREATED' || normalized === 'READY') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  isDeleteDisabled(status: TaskExecutionStatus): boolean {
    return getExecutionStatusGroup(status) === 'RUNNING';
  }

  canRerun(status: TaskExecutionStatus): boolean {
    return getExecutionStatusGroup(status) === 'FINAL';
  }

  runNumberLabel(runNumber: number | null | undefined): string {
    return runNumber == null ? '-' : `#${runNumber}`;
  }

  private groupMatchesFilter(group: TaskExecutionGroupListItem, filter: TaskExecutionFilter): boolean {
    if (filter === 'all') return true;
    return group.executions.some((execution) => this.matchesFilter(execution.status, filter));
  }

  private matchesFilter(status: TaskExecutionStatus, filter: TaskExecutionFilter): boolean {
    if (filter === 'all') return true;
    return getExecutionStatusGroup(status) === filter;
  }

  isComparing(groupId: string): boolean {
    return this.compareGroupId() === groupId;
  }

  toggleCompareMode(groupId: string, event?: Event) {
    event?.stopPropagation();
    const leaving = this.compareGroupId() === groupId;
    this.compareGroupId.set(leaving ? null : groupId);
    this.comparePicks.set([]);
  }

  isComparePick(executionId: string): boolean {
    return this.comparePicks().includes(executionId);
  }

  toggleComparePick(executionId: string, event?: Event) {
    event?.stopPropagation();
    this.comparePicks.update((current) => {
      if (current.includes(executionId)) return current.filter((id) => id !== executionId);
      // Two at a time: a third pick replaces the older one rather than refusing the click, which
      // would leave the user hunting for which box to clear.
      return current.length < 2 ? [...current, executionId] : [current[1], executionId];
    });
  }

  comparePickCount(): number {
    return this.comparePicks().length;
  }

  canCompare(): boolean {
    return this.comparePicks().length === 2;
  }

  submitCompare(event?: Event) {
    event?.stopPropagation();
    const [leftId, rightId] = this.comparePicks();
    if (!leftId || !rightId) return;
    this.compareRequested.emit({ leftId, rightId });
  }
}
