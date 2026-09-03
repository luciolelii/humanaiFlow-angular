import { TestBed } from '@angular/core/testing';
import { Project } from '@models/project';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ProjectsCallServiceBase } from './projects-call.base';
import { ProjectsService } from './projects';

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

describe('ProjectsService', () => {
  let service: ProjectsService;
  let callServiceSpy: {
    retrieveAllProjects: ReturnType<typeof vi.fn>;
    getProjectById: ReturnType<typeof vi.fn>;
    createProject: ReturnType<typeof vi.fn>;
    updateProject: ReturnType<typeof vi.fn>;
    updateSharedContext: ReturnType<typeof vi.fn>;
    deleteProject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    callServiceSpy = {
      retrieveAllProjects: vi.fn(),
      getProjectById: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      updateSharedContext: vi.fn(),
      deleteProject: vi.fn()
    };

    TestBed.configureTestingModule({});
    service = TestBed.inject(ProjectsService);
    service.projectsCallService = callServiceSpy as unknown as ProjectsCallServiceBase;
    service.toInit = true;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads projects once and exposes them as a signal', async () => {
    callServiceSpy.retrieveAllProjects.mockReturnValue(of([makeProject('p1', 'Recruiting')]));

    await service.getAllProjects();
    await service.getAllProjects();

    expect(callServiceSpy.retrieveAllProjects).toHaveBeenCalledTimes(1);
    expect(service.projects().map((project) => project.id)).toEqual(['p1']);
  });

  it('stays empty and reports not loaded when the endpoint fails', async () => {
    // The flows list falls back to the flat rendering on this path: projects must never be able
    // to break the flows.
    callServiceSpy.retrieveAllProjects.mockReturnValue(throwError(() => new Error('boom')));

    await service.getAllProjects();

    expect(service.projects()).toEqual([]);
    expect(service.hasLoadedProjects()).toBe(false);
  });

  it('indexes projects by id for O(1) lookup from a flow', async () => {
    callServiceSpy.retrieveAllProjects.mockReturnValue(of([makeProject('p1', 'Recruiting')]));
    await service.getAllProjects();

    expect(service.projectById().get('p1')?.name).toBe('Recruiting');
  });

  it('prepends a created project to the cache', async () => {
    callServiceSpy.retrieveAllProjects.mockReturnValue(of([makeProject('p1', 'One')]));
    await service.getAllProjects();
    callServiceSpy.createProject.mockReturnValue(of(makeProject('p2', 'Two')));

    await new Promise((resolve) => service.createProject({ name: 'Two' }).subscribe(resolve));

    expect(service.projects().map((project) => project.id)).toEqual(['p2', 'p1']);
  });

  it('replaces an updated project in place', async () => {
    callServiceSpy.retrieveAllProjects.mockReturnValue(of([makeProject('p1', 'Old')]));
    await service.getAllProjects();
    callServiceSpy.updateProject.mockReturnValue(of(makeProject('p1', 'New')));

    await new Promise((resolve) => service.updateProject('p1', { name: 'New' }).subscribe(resolve));

    expect(service.projects()).toHaveLength(1);
    expect(service.projects()[0].name).toBe('New');
  });

  it('drops a deleted project from the cache and confirms by default', async () => {
    callServiceSpy.retrieveAllProjects.mockReturnValue(of([makeProject('p1', 'Doomed')]));
    await service.getAllProjects();
    callServiceSpy.deleteProject.mockReturnValue(of(undefined));

    await new Promise((resolve) => service.deleteProject('p1').subscribe(resolve));

    expect(service.projects()).toEqual([]);
    expect(callServiceSpy.deleteProject).toHaveBeenCalledWith('p1', true);
  });
});
