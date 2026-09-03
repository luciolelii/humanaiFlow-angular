import { TestBed } from '@angular/core/testing';
import { Flow } from '@models/flow';
import { Project } from '@models/project';
import { Authorization } from '@services/authorization/authorization';
import { FlowsService } from '@services/flows/flows';
import { ProjectsService } from '@services/projects/projects';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { FlowsGroup } from './flows-group';

function makeFlow(id: string): Flow {
  return {
    id,
    name: `Flow ${id}`,
    visibility: 'PRIVATE',
    data: { blocks: [], containers: [], connections: [], dependencies: [] },
    author: 'alice',
    createdAt: new Date('2026-01-01'),
    status: 'DRAFT',
    updatedAt: new Date('2026-01-02')
  };
}

const project: Project = {
  id: 'p1',
  name: 'Recruiting',
  description: 'Screening flows',
  owner: 'alice',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  sharedContext: { entries: [] }
};

async function build(inputs: { project: Project | null; flows: Flow[]; expanded: boolean }) {
  await TestBed.configureTestingModule({
    imports: [FlowsGroup],
    providers: [
      { provide: FlowsService, useValue: { flows: signal([]), assignFlowToProject: vi.fn() } },
      { provide: ProjectsService, useValue: { projects: signal([]) } },
      { provide: Authorization, useValue: { loggedInUser: signal({ username: 'alice' }) } }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(FlowsGroup);
  fixture.componentRef.setInput('project', inputs.project);
  fixture.componentRef.setInput('flows', inputs.flows);
  fixture.componentRef.setInput('expanded', inputs.expanded);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('FlowsGroup', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the project name and a pluralised flow count', async () => {
    const fixture = await build({ project, flows: [makeFlow('1'), makeFlow('2')], expanded: false });

    expect(fixture.componentInstance.title()).toBe('Recruiting');
    expect(fixture.componentInstance.countLabel()).toBe('2 flows');
  });

  it('uses the singular for one flow', async () => {
    const fixture = await build({ project, flows: [makeFlow('1')], expanded: false });

    expect(fixture.componentInstance.countLabel()).toBe('1 flow');
  });

  it('renders the flows only while expanded', async () => {
    const collapsed = await build({ project, flows: [makeFlow('1')], expanded: false });
    expect(collapsed.nativeElement.querySelectorAll('app-flow-item').length).toBe(0);

    TestBed.resetTestingModule();
    const expanded = await build({ project, flows: [makeFlow('1')], expanded: true });
    expect(expanded.nativeElement.querySelectorAll('app-flow-item').length).toBe(1);
  });

  it('labels the ungrouped bucket and gives it no project actions', async () => {
    const fixture = await build({ project: null, flows: [makeFlow('1')], expanded: true });

    expect(fixture.componentInstance.title()).toBe('No project');
    expect(fixture.componentInstance.isUngrouped()).toBe(true);
    // The pseudo-group is not a project, so edit/delete/context would be meaningless.
    expect(fixture.nativeElement.querySelector('.flows-list-group-actions')).toBeNull();
  });

  it('reports a header click as a toggle intent', async () => {
    const fixture = await build({ project, flows: [makeFlow('1')], expanded: false });
    const toggled = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);

    fixture.nativeElement.querySelector('.flows-list-group-header').click();

    expect(toggled).toHaveBeenCalledTimes(1);
  });
});
