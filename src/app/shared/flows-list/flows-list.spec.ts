import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { Flow } from '@models/flow';
import { Project } from '@models/project';
import { FlowsService } from '@services/flows/flows';
import { ProjectsService } from '@services/projects/projects';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { of, throwError } from 'rxjs';
import { ListState } from '@stores/list-state';
import { vi } from 'vitest';

import { FlowsList } from './flows-list';

function makeFlow(id: string, name: string, projectId?: string): Flow {
  return {
    id,
    name,
    visibility: 'PRIVATE',
    data: { blocks: [], containers: [], connections: [], dependencies: [] },
    author: 'alice',
    createdAt: new Date('2026-01-01'),
    status: 'DRAFT',
    updatedAt: new Date('2026-01-02'),
    projectId
  };
}

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    owner: 'alice',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sharedContext: { entries: [] }
  };
}

let taskExecutionsStub: {
  createProjectExecutions: ReturnType<typeof vi.fn>;
  startProjectRun: ReturnType<typeof vi.fn>;
};

async function build(flows: Flow[], projects: Project[]) {
  taskExecutionsStub = {
    createProjectExecutions: vi.fn(),
    startProjectRun: vi.fn().mockReturnValue(of({
      projectRunId: 'r1', projectId: 'p1', name: 'Recruiting', createdAt: 1,
      executionCount: 1, status: 'RUNNING', currentExecutionId: 'e1',
      completedCount: 0, blockedReason: null, executionIds: ['e1']
    }))
  };
  await TestBed.configureTestingModule({
    imports: [FlowsList],
    providers: [
      ListState,
      provideRouter([]),
      {
        provide: FlowsService,
        useValue: {
          flows: signal(flows),
          hasLoadedFlows: vi.fn().mockReturnValue(true),
          getAllFlows: vi.fn().mockResolvedValue(signal(flows)),
          refresh: vi.fn().mockResolvedValue(undefined)
        }
      },
      {
        provide: ProjectsService,
        useValue: {
          projects: signal(projects),
          hasLoadedProjects: vi.fn().mockReturnValue(true),
          getAllProjects: vi.fn().mockResolvedValue(signal(projects))
        }
      },
      { provide: TaskExecutionsService, useValue: taskExecutionsStub }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(FlowsList);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('FlowsList', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('should create', async () => {
    const fixture = await build([], []);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the flat list, with no group headers, when there are no projects', async () => {
    // Regression guard: a user with no projects must see exactly the pre-projects list.
    const fixture = await build([makeFlow('1', 'Alpha'), makeFlow('2', 'Beta')], []);

    expect(fixture.componentInstance.groupingActive()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('app-flows-group').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('app-flow-item').length).toBe(2);
  });

  it('groups the flows once projects exist', async () => {
    const fixture: ComponentFixture<FlowsList> = await build(
      [makeFlow('1', 'Alpha', 'p1'), makeFlow('2', 'Beta')],
      [makeProject('p1', 'Recruiting')]
    );

    expect(fixture.componentInstance.groupingActive()).toBe(true);
    const groups = fixture.componentInstance.groupedFlows();
    expect(groups.map((group) => group.key)).toEqual(['p1', '__ungrouped__']);
    expect(fixture.nativeElement.querySelectorAll('app-flows-group').length).toBe(2);
  });

  it('renders a flat list when a single project is selected', async () => {
    const fixture = await build(
      [makeFlow('1', 'Alpha', 'p1'), makeFlow('2', 'Beta')],
      [makeProject('p1', 'Recruiting')]
    );

    fixture.componentInstance.onProjectFilterChange('p1');
    fixture.detectChanges();

    expect(fixture.componentInstance.groupingActive()).toBe(false);
    expect(fixture.componentInstance.orderedFlows().map((flow) => flow.id)).toEqual(['1']);
  });

  it('scopes the list to unassigned flows when "No project" is selected', async () => {
    const fixture = await build(
      [makeFlow('1', 'Alpha', 'p1'), makeFlow('2', 'Beta')],
      [makeProject('p1', 'Recruiting')]
    );

    fixture.componentInstance.onProjectFilterChange('__ungrouped__');
    fixture.detectChanges();

    expect(fixture.componentInstance.orderedFlows().map((flow) => flow.id)).toEqual(['2']);
  });

  it('auto-expands groups while a search term is active, without touching the saved expansion', async () => {
    const fixture = await build(
      [makeFlow('1', 'Alpha', 'p1')],
      [makeProject('p1', 'Recruiting')]
    );
    const component = fixture.componentInstance;

    expect(component.isGroupExpanded('p1')).toBe(false);

    component.searchTerm.set('alp');
    fixture.detectChanges();
    // A search hit must never sit hidden behind a collapsed header.
    expect(component.isGroupExpanded('p1')).toBe(true);

    component.searchTerm.set('');
    fixture.detectChanges();
    // Clearing the search restores the user's own expansion rather than leaving it forced open.
    expect(component.isGroupExpanded('p1')).toBe(false);
  });

  it('persists group expansion in the shared list state', async () => {
    const fixture = await build(
      [makeFlow('1', 'Alpha', 'p1')],
      [makeProject('p1', 'Recruiting')]
    );

    fixture.componentInstance.toggleGroup('p1');
    fixture.detectChanges();

    expect(fixture.componentInstance.isGroupExpanded('p1')).toBe(true);
    expect(fixture.componentInstance.view.expandedGroupIds?.has('p1')).toBe(true);
  });

  it('runs a project and navigates to the created executions', async () => {
    const fixture = await build([makeFlow('1', 'Alpha', 'p1')], [makeProject('p1', 'Recruiting')]);
    taskExecutionsStub.createProjectExecutions.mockReturnValue(of({
      run: { projectRunId: 'r1', projectId: 'p1', name: 'Recruiting', createdAt: 1, executionCount: 1, executionIds: ['e1'] },
      skipped: []
    }));
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.runProject(makeProject('p1', 'Recruiting'));

    // Non-executable flows are skipped rather than failing the whole run from the UI.
    expect(taskExecutionsStub.createProjectExecutions).toHaveBeenCalledWith('p1', true);
    // Creating is not enough: the run must also be started, or nothing would happen.
    expect(taskExecutionsStub.startProjectRun).toHaveBeenCalledWith('p1', 'r1');
    expect(navigate).toHaveBeenCalledWith(['/tasks'], { queryParams: { executionId: 'e1' } });
  });

  it('still navigates when a project run produced no executions', async () => {
    const fixture = await build([makeFlow('1', 'Alpha', 'p1')], [makeProject('p1', 'Recruiting')]);
    taskExecutionsStub.createProjectExecutions.mockReturnValue(of({
      run: { projectRunId: 'r1', projectId: 'p1', name: 'Recruiting', createdAt: 1, executionCount: 0, executionIds: [] },
      skipped: [{ flowId: '1', flowName: 'Alpha', reason: 'Flow is not executable' }]
    }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.runProject(makeProject('p1', 'Recruiting'));

    expect(navigate).toHaveBeenCalledWith(['/tasks'], { queryParams: {} });
  });

  it('does not navigate when the project run fails', async () => {
    const fixture = await build([makeFlow('1', 'Alpha', 'p1')], [makeProject('p1', 'Recruiting')]);
    taskExecutionsStub.createProjectExecutions.mockReturnValue(throwError(() => new Error('boom')));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.runProject(makeProject('p1', 'Recruiting'));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('reports a blocked run instead of claiming it is running', async () => {
    const fixture = await build([makeFlow('1', 'Alpha', 'p1')], [makeProject('p1', 'Recruiting')]);
    taskExecutionsStub.createProjectExecutions.mockReturnValue(of({
      run: { projectRunId: 'r1', projectId: 'p1', name: 'Recruiting', createdAt: 1, executionCount: 1,
             status: 'PENDING', currentExecutionId: 'e1', completedCount: 0, blockedReason: null, executionIds: ['e1'] },
      skipped: []
    }));
    taskExecutionsStub.startProjectRun.mockReturnValue(of({
      projectRunId: 'r1', projectId: 'p1', name: 'Recruiting', createdAt: 1, executionCount: 1,
      status: 'BLOCKED', currentExecutionId: 'e1', completedCount: 0,
      blockedReason: 'missing global inputs: requirements', executionIds: ['e1']
    }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.runProject(makeProject('p1', 'Recruiting'));

    // Still navigates, so the user can supply what the run is waiting for.
    expect(navigate).toHaveBeenCalled();
  });

  it('keeps the filters collapsed by default, so the flows are what you see first', async () => {
    const fixture = await build([makeFlow('1', 'Alpha')], []);

    expect(fixture.componentInstance.filtersOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('mat-button-toggle-group')).toBeNull();
    // The search box is the control people reach for first, so it stays outside the panel.
    expect(fixture.nativeElement.querySelector('.flows-list-search')).not.toBeNull();

    fixture.componentInstance.toggleFilters();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-button-toggle-group')).not.toBeNull();
  });

  it('counts the active filters, so a collapsed panel cannot silently hide flows', async () => {
    const fixture = await build([makeFlow('1', 'Alpha', 'p1')], [makeProject('p1', 'Recruiting')]);
    const component = fixture.componentInstance;

    expect(component.activeFilterCount()).toBe(0);

    component.filter.set('PUBLIC');
    component.onProjectFilterChange('p1');
    fixture.detectChanges();

    expect(component.activeFilterCount()).toBe(2);
  });
});
