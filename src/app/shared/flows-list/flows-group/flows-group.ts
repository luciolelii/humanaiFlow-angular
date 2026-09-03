import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Flow } from '@models/flow';
import { Project } from '@models/project';
import { FlowItem } from '../flow-item/flow-item';

/**
 * One collapsible project section of the flows list. Purely presentational: the list owns the
 * grouping and the expansion state, this only renders and reports intent.
 *
 * The DOM shape and class naming deliberately mirror `tasks-executions-list`, which already
 * implements collapsible groups, so the two sidebars read as one product.
 */
@Component({
  selector: 'app-flows-group',
  imports: [FlowItem, MatButtonModule, MatCardModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './flows-group.html',
  styleUrl: './flows-group.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowsGroup {
  readonly project = input<Project | null>(null);
  readonly flows = input.required<Flow[]>();
  readonly expanded = input<boolean>(false);
  readonly detailOpenedId = model<string | null>(null);

  readonly toggled = output<void>();
  readonly editRequested = output<Project>();
  readonly contextRequested = output<Project>();
  readonly deleteRequested = output<Project>();
  readonly newFlowRequested = output<Project>();
  readonly runRequested = output<Project>();
  readonly moveRequested = output<{ project: Project; flowId: string; direction: -1 | 1 }>();

  /** The ungrouped bucket is a pseudo-project: it has no actions of its own. */
  readonly title = computed(() => this.project()?.name ?? 'No project');
  readonly isUngrouped = computed(() => this.project() === null);
  /** A project run needs at least one executable flow, and the backend refuses the rest. */
  readonly canRun = computed(() => this.flows().some((flow) => flow.status === 'EXECUTABLE'));

  readonly runTooltip = computed(() =>
    this.canRun() ? 'Run every executable flow in this project' : 'No executable flow in this project'
  );

  readonly countLabel = computed(() => {
    const count = this.flows().length;
    return `${count} ${count === 1 ? 'flow' : 'flows'}`;
  });

  /** Reordering is per-project, so it is offered only inside a real project group. */
  readonly canReorder = computed(() => !this.isUngrouped() && this.flows().length > 1);

  move(flowId: string, direction: -1 | 1, event: Event) {
    event.stopPropagation();
    const project = this.project();
    if (project) {
      this.moveRequested.emit({ project, flowId, direction });
    }
  }

  onHeaderClick(event: Event) {
    event.stopPropagation();
    this.toggled.emit();
  }
}
