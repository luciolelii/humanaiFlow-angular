import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, Signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { Flow, FlowVisibility } from '@models/flow';
import { firstValueFrom } from 'rxjs';
import { FlowsService } from '@services/flows/flows';
import { FlowItem } from './flow-item/flow-item';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Project, UNGROUPED_PROJECT_KEY } from '@models/project';
import { ProjectContextDialogService } from '@services/dialogs/project-context-dialog';
import { ProjectDeleteDialogService } from '@services/dialogs/project-delete-dialog';
import { ProjectDialogService } from '@services/dialogs/project-dialog';
import { NotificationService } from '@services/notifications/notification';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { ProjectsService } from '@services/projects/projects';
import { EditorStateHolder } from '@stores/flow-editor';
import { PROJECTS_ENABLED } from '@shared/feature-flags';
import { OrderEvent, OrderField, Ordering, orderDirType } from "@shared/ordering/ordering";
import { ListStateViewHolder, OrderViewState } from '@utilities/list-state-holder';
import { FlowsGroup } from './flows-group/flows-group';
import { groupFlowsByProject } from './flow-grouping';

type FlowFilter = FlowVisibility | 'FINALIZED' | 'all';

/** 'all' groups by project; a concrete id (or the ungrouped key) renders a flat, scoped list. */
const ALL_PROJECTS = 'all';

@Component({
  selector: 'app-flows-list',
  imports: [FlowItem, FlowsGroup, Ordering, MatButtonToggleModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatListModule, MatProgressSpinnerModule, MatSelectModule],
  templateUrl: './flows-list.html',
  styleUrl: './flows-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowsList extends ListStateViewHolder<Flow> {
  filter = signal<FlowFilter>('all');

  orderFields: OrderField[] = [
    { field: 'name', label: 'Name' },
    { field: 'updatedAt', label: 'Last Update Date' },
    { field: 'createdAt', label: 'Creation Date' }
  ];

  readonly orderBy = signal<string | null>('name');
  readonly orderDir = signal<orderDirType>('asc');

  searchTerm = model<string>('');

  private flowsService = inject(FlowsService);
  private projectsService = inject(ProjectsService);
  private projectDialog = inject(ProjectDialogService);
  private projectDeleteDialog = inject(ProjectDeleteDialogService);
  private projectContextDialog = inject(ProjectContextDialogService);
  private notifications = inject(NotificationService);
  private taskExecutions = inject(TaskExecutionsService);
  private router = inject(Router);
  private editorState = inject(EditorStateHolder);

  readonly projectsEnabled = PROJECTS_ENABLED;
  readonly ungroupedKey = UNGROUPED_PROJECT_KEY;

  readonly projects = this.projectsService.projects;

  /** 'all' | UNGROUPED_PROJECT_KEY | <projectId> */
  readonly projectFilter = signal<string>(ALL_PROJECTS);

  loading: WritableSignal<boolean> = signal(true);
  
  get orderView() {
    const existingState = this.view;
    return existingState.order;
  }

  flows?: Signal<Flow[]>;

  detailOpenedId = signal<string | null>(null);

  private readonly expandedGroupIds = signal<Set<string>>(new Set<string>());

  constructor() {
    super('flowsList', {defaultOrder: { orderBy: 'name', orderDir: 'asc' } as OrderViewState, defaultFilter: 'all'});
    effect(() => {
      if (!!this.filter && this.filter() != null)
        this.view.filter = this.filter();
    });
  }

  ngOnInit() {
    // Loaded alongside the flows, never gated on them: if the projects endpoint fails the list
    // simply falls back to the flat rendering. A project must never be able to break the flows.
    this.projectFilter.set((this.view.secondaryFilter as string) ?? ALL_PROJECTS);
    this.expandedGroupIds.set(this.view.expandedGroupIds ?? new Set<string>());
    if (PROJECTS_ENABLED && !this.projectsService.hasLoadedProjects()) {
      this.projectsService.getAllProjects().catch((err) => {
        console.error('Error loading projects', err);
      });
    }

    const existingState = this.view;
    this.orderBy.set(existingState.order.orderBy);
    this.orderDir.set(existingState.order.orderDir);

    if (existingState.list) {
      this.flows = existingState.list;
      this.loading.set(false);
      if (existingState.filter)
        this.filter.set(existingState.filter as FlowFilter || 'all');
      return;
    }

    if (this.flowsService.hasLoadedFlows()) {
      this.flows = this.flowsService.flows;
      this.view.list = this.flows;
      this.loading.set(false);
      return;
    }

    this.flowsService.getAllFlows().then(flowsSignal => {
      this.flows = flowsSignal;
      this.view.list = this.flows;
    }).catch((err) => {
      console.error('Error loading flows', err);
    }).finally(() => {
      this.loading.set(false);
    });
  }

  filteredFlows = computed(() => {
    const flows = this.flows ? this.flows() : [];
    if (!flows) return [];
    const searched = flows.filter(f => f.name.toLowerCase().includes(this.searchTerm().toLowerCase()));
    const scoped = this.scopeToProject(searched);
    if (this.filter() === 'all') return scoped;
    if (this.filter() === 'FINALIZED') return scoped.filter(f => !!f.finalized);
    return scoped.filter(f => f.visibility === this.filter());
  });

  private scopeToProject(flows: Flow[]): Flow[] {
    const selected = this.projectFilter();
    if (!PROJECTS_ENABLED || selected === ALL_PROJECTS) return flows;
    if (selected === UNGROUPED_PROJECT_KEY) return flows.filter(f => !f.projectId);
    return flows.filter(f => f.projectId === selected);
  }

  orderedFlows = computed(() => {
    const flows = [...this.filteredFlows()];
    const orderBy = this.orderBy();
    const orderDir = this.orderDir();
    if (!orderBy) return flows;

    return flows.sort((a, b) => {
      const aValue = this.toComparableValue((a as any)[orderBy]);
      const bValue = this.toComparableValue((b as any)[orderBy]);
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return orderDir === 'asc' ? -1 : 1;
      if (bValue == null) return orderDir === 'asc' ? 1 : -1;
      if (aValue < bValue) return orderDir === 'asc' ? -1 : 1;
      if (aValue > bValue) return orderDir === 'asc' ? 1 : -1;
      return 0;
    });
  });


  /**
   * Grouping is on only when there is something to group by and no single project is selected -
   * picking one project renders a flat, scoped list, which is clearer and cheaper than a single
   * group. With no projects at all the list renders exactly as it did before projects existed.
   */
  readonly groupingActive = computed(() =>
    PROJECTS_ENABLED && this.projects().length > 0 && this.projectFilter() === ALL_PROJECTS);

  /** Flows already filtered and sorted, then grouped: the existing pipeline is untouched. */
  readonly groupedFlows = computed(() => groupFlowsByProject(this.orderedFlows(), this.projects(),
    // While the list is being narrowed, an empty group is noise rather than reassurance.
    { hideEmpty: this.searchActive() || this.filter() !== 'all' }));

  readonly searchActive = computed(() => this.searchTerm().trim().length > 0);

  /**
   * While a search term is active every surviving group renders expanded, derived rather than by
   * mutating the persisted set - so clearing the search restores the user's own expansion. A
   * search hit must never sit hidden behind a collapsed header.
   */
  isGroupExpanded(key: string): boolean {
    return this.searchActive() || this.expandedGroupIds().has(key);
  }

  toggleGroup(key: string) {
    this.expandedGroupIds.update((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      this.view.expandedGroupIds = next;
      return next;
    });
  }

  onProjectFilterChange(value: string) {
    this.projectFilter.set(value);
    this.view.secondaryFilter = value;
  }

  async createProject() {
    const draft = await this.projectDialog.open({ project: null });
    if (!draft) return;

    try {
      const created = await firstValueFrom(this.projectsService.createProject(draft));
      this.toggleGroup(created.id);
      this.notifications.show(`Project “${created.name}” created`, 'success');
    } catch {
      this.notifications.show('Could not create the project.', 'error');
    }
  }

  async editProject(project: Project) {
    const draft = await this.projectDialog.open({ project });
    if (!draft) return;

    try {
      await firstValueFrom(this.projectsService.updateProject(project.id, draft));
      this.notifications.show('Project updated', 'success');
    } catch {
      this.notifications.show('Could not update the project.', 'error');
    }
  }

  async editProjectContext(project: Project) {
    const context = await this.projectContextDialog.open(project);
    if (!context) return;

    try {
      await firstValueFrom(this.projectsService.updateSharedContext(project.id, context));
      this.notifications.show('Shared context saved', 'success');
    } catch {
      this.notifications.show('Could not save the shared context.', 'error');
    }
  }

  /**
   * Deleting a project destroys its flows too. The count shown comes from the client cache, so it
   * matches exactly what the user has in front of them.
   */
  async deleteProject(project: Project) {
    const flows = (this.flows ? this.flows() : []).filter((flow) => flow.projectId === project.id);
    const confirmed = await this.projectDeleteDialog.open({
      project,
      flows: flows.map((flow) => ({ id: flow.id, name: flow.name, finalized: flow.finalized }))
    });
    if (!confirmed) return;

    try {
      await firstValueFrom(this.projectsService.deleteProject(project.id, true));
      // The open document may have just been deleted along with the project.
      const openFlowId = this.editorState.currentFlow()?.id;
      if (openFlowId && flows.some((flow) => flow.id === openFlowId)) {
        this.editorState.closeDocument();
      }
      // The flow cache is stale after a cascade: N flows are gone server-side.
      await this.flowsService.refresh(true);
      this.notifications.show(`Project “${project.name}” deleted`, 'success');
    } catch {
      this.notifications.show('Could not delete the project.', 'error');
    }
  }

  /**
   * Creates one execution per executable flow in the project and shows them in /tasks. They are
   * created, not started: each still needs its inputs and credentials, exactly as a single run does.
   */
  async runProject(project: Project) {
    try {
      const plan = await firstValueFrom(
        this.taskExecutions.createProjectExecutions(project.id, true));

      // The flows run one at a time in the project's order; each step starts only when the
      // previous one succeeded, so this kicks off the first and the backend advances the rest.
      const run = await firstValueFrom(
        this.taskExecutions.startProjectRun(project.id, plan.run.projectRunId));

      const skipped = plan.skipped.length;
      const skippedNote = skipped > 0 ? `; ${skipped} flow(s) skipped as not executable` : '';
      this.notifications.show(
        run.status === 'BLOCKED'
          ? `“${project.name}” is waiting: ${run.blockedReason ?? 'the first flow needs inputs'}`
          : `Running “${project.name}” — ${plan.run.executionCount} flow(s), one at a time${skippedNote}`,
        run.status === 'BLOCKED' ? 'info' : 'success');

      await this.router.navigate(['/tasks'], {
        queryParams: plan.run.executionIds.length ? { executionId: plan.run.executionIds[0] } : {}
      });
    } catch {
      this.notifications.show('Could not run the project.', 'error');
    }
  }

  /** Moves a flow one position within its project, persisting the run order. */
  async moveFlowInProject(event: { project: Project; flowId: string; direction: -1 | 1 }) {
    const current = this.groupedFlows().find((group) => group.key === event.project.id)?.flows ?? [];
    const index = current.findIndex((flow) => flow.id === event.flowId);
    const target = index + event.direction;
    if (index < 0 || target < 0 || target >= current.length) return;

    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    try {
      await firstValueFrom(this.projectsService.updateFlowOrder(
        event.project.id, reordered.map((flow) => flow.id)));
      await this.flowsService.refresh(true);
    } catch {
      this.notifications.show('Could not reorder the flows.', 'error');
    }
  }

  async createFlowInProject(project: Project) {
    try {
      const created = await firstValueFrom(this.flowsService.createNewFlow());
      await firstValueFrom(this.flowsService.assignFlowToProject(created.id, project.id));
      this.toggleGroupOn(project.id);
    } catch {
      this.notifications.show('Could not create the flow.', 'error');
    }
  }

  private toggleGroupOn(key: string) {
    if (this.expandedGroupIds().has(key)) return;
    this.toggleGroup(key);
  }

  onOrderChanged(event: OrderEvent) {
    const { orderBy, orderDir } = event;
    this.orderBy.set(orderBy);
    this.orderDir.set(orderDir);
    this.view.order = { orderBy, orderDir };
  }

  private toComparableValue(value: unknown): string | number | null {
    if (value == null) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') return value.toLowerCase();
    if (typeof value === 'number') return value;
    return String(value).toLowerCase();
  }

}
