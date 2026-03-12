import { CommonModule } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
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

export type TaskExecutionListItem = {
  id: string;
  title: string;
  flowName: string;
  status: TaskExecutionStatus;
  startedAt: string;
  duration?: string;
};

@Component({
  selector: 'app-tasks-executions-list',
  imports: [CommonModule, FormsModule, Ordering, MatButtonModule, MatButtonToggleModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatListModule, MatTooltipModule],
  templateUrl: './tasks-executions-list.html',
  styleUrl: './tasks-executions-list.css',
})
export class TasksExecutionsListComponent {
  readonly executions = input<TaskExecutionListItem[]>([]);
  readonly selectedExecutionId = input<string | null>(null);
  readonly executionSelected = output<string>();
  readonly executionDeleteRequested = output<string>();
  readonly searchTerm = model<string>('');
  readonly filter = signal<TaskExecutionFilter>('all');
  readonly orderBy = signal<string | null>('startedAt');
  readonly orderDir = signal<orderDirType>('desc');

  readonly orderView: OrderViewState = {
    orderBy: this.orderBy(),
    orderDir: this.orderDir()
  };

  readonly orderFields: OrderField[] = [
    { field: 'title', label: 'Title' },
    { field: 'flowName', label: 'Flow Name' },
    { field: 'startedAt', label: 'Started At' },
    { field: 'duration', label: 'Duration' }
  ];

  readonly filteredExecutions = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const filter = this.filter();
    const orderBy = this.orderBy();
    const orderDir = this.orderDir();

    const filtered = this.executions().filter((execution) => {
      if (!this.matchesFilter(execution.status, filter)) return false;
      if (!term) return true;

      return (
        execution.title.toLowerCase().includes(term) ||
        execution.flowName.toLowerCase().includes(term) ||
        execution.id.toLowerCase().includes(term)
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
    if (normalized === 'WAITING') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (normalized === 'RUNNING') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (normalized === 'CREATED' || normalized === 'READY') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  isDeleteDisabled(status: TaskExecutionStatus): boolean {
    return getExecutionStatusGroup(status) === 'RUNNING';
  }

  private matchesFilter(status: TaskExecutionStatus, filter: TaskExecutionFilter): boolean {
    if (filter === 'all') return true;
    return getExecutionStatusGroup(status) === filter;
  }
}
