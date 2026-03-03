import { CommonModule } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrderEvent, OrderField, Ordering, orderDirType } from '@shared/ordering/ordering';
import { OrderViewState } from '@utilities/list-state-holder';

export type TaskExecutionStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'QUEUED';

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
  imports: [CommonModule, FormsModule, Ordering],
  templateUrl: './tasks-executions-list.html',
  styleUrl: './tasks-executions-list.css',
})
export class TasksExecutionsListComponent {
  readonly executions = input<TaskExecutionListItem[]>([]);
  readonly selectedExecutionId = input<string | null>(null);
  readonly executionSelected = output<string>();
  readonly searchTerm = model<string>('');
  readonly filter = signal<TaskExecutionStatus | 'all'>('all');
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
    const status = this.filter();
    const orderBy = this.orderBy();
    const orderDir = this.orderDir();

    const filtered = this.executions().filter((execution) => {
      if (status !== 'all' && execution.status !== status) return false;
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

  onOrderChanged(event: OrderEvent) {
    this.orderBy.set(event.orderBy);
    this.orderDir.set(event.orderDir);
    this.orderView.orderBy = event.orderBy;
    this.orderView.orderDir = event.orderDir;
  }

  statusBadgeClass(status: TaskExecutionStatus) {
    if (status === 'RUNNING') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'FAILED') return 'bg-rose-100 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}
