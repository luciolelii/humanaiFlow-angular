import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TaskExecution } from '@models/task-execution';
import { ComparedNode, ComparedValue, compareExecutions } from './execution-compare';
import { DiffPart, diffSide, diffWords } from './execution-compare-diff';

@Component({
  selector: 'app-execution-compare-view',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './execution-compare-view.html',
  styleUrl: './execution-compare-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExecutionCompareViewComponent {
  readonly left = input<TaskExecution | null>(null);
  readonly right = input<TaskExecution | null>(null);
  readonly closed = output<void>();

  /** On by default: the differences are what the view exists to show. */
  readonly onlyDifferences = signal(true);

  readonly comparison = computed(() => {
    const left = this.left();
    const right = this.right();
    return left && right ? compareExecutions(left, right) : null;
  });

  readonly visibleNodes = computed<ComparedNode[]>(() => {
    const nodes = this.comparison()?.nodes ?? [];
    return this.onlyDifferences() ? nodes.filter((node) => node.changed) : nodes;
  });

  readonly visibleOutcomes = computed(() => {
    const outcomes = this.comparison()?.outcomes ?? [];
    return this.onlyDifferences() ? outcomes.filter((one) => one.state !== 'equal') : outcomes;
  });

  runLabel(execution: TaskExecution | null): string {
    if (!execution) return '—';
    return execution.runNumber ? `Run #${execution.runNumber}` : execution.name || execution.id;
  }

  toggleOnlyDifferences() {
    this.onlyDifferences.update((only) => !only);
  }

  visibleValues(node: ComparedNode): ComparedValue[] {
    return this.onlyDifferences() ? node.values.filter((value) => value.state !== 'equal') : node.values;
  }

  /**
   * The parts to render for one side. Equal values are not diffed at all: running the table over
   * text known to be identical is work whose only possible output is "all the same".
   */
  parts(left: string | null, right: string | null, side: 'left' | 'right'): DiffPart[] {
    const own = (side === 'left' ? left : right) ?? '';
    if (left === right) return own.length ? [{ kind: 'same', text: own }] : [];
    return diffSide(diffWords(left ?? '', right ?? ''), side);
  }

  hasContent(node: ComparedNode): boolean {
    return this.visibleValues(node).length > 0 || node.statusChanged;
  }
}
