import { inject } from '@angular/core';
import { Project, ProjectContext, ProjectDraft } from '@models/project';
import { Authorization } from '@services/authorization/authorization';
import { defer, Observable, of } from 'rxjs';
import { ProjectsCallServiceBase } from './projects-call.base';

export class ProjectsCallServiceFake extends ProjectsCallServiceBase {
  authorizationService = inject(Authorization);

  /**
   * Seeded so that flows '1' and '2' from FlowsCallServiceFake land in a project while 'testFlow'
   * stays outside one: that exercises both the grouped and the ungrouped rendering paths in dev.
   */
  private data: Record<string, Project> = {
    'p1': {
      id: 'p1',
      name: 'Recruiting',
      description: 'Candidate screening flows',
      owner: 'Alice',
      createdAt: new Date('January 5, 2026 09:00:00'),
      updatedAt: new Date('January 9, 2026 11:30:00'),
      sharedContext: {
        entries: [
          { name: 'tone', type: 'TEXT', multiple: false, value: 'formal', description: 'Writing tone' }
        ]
      }
    },
    'p2': {
      id: 'p2',
      name: 'Reporting',
      owner: 'Bob',
      createdAt: new Date('February 2, 2026 14:00:00'),
      updatedAt: new Date('February 3, 2026 08:15:00'),
      sharedContext: { entries: [] }
    }
  };

  private ownerUsername(): string {
    return this.authorizationService.loggedInUser()?.username ?? '';
  }

  private requireProject(projectId: string): Project {
    const project = this.data[projectId];
    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }
    return project;
  }

  override retrieveAllProjects(): Observable<Project[]> {
    return of(Object.values(this.data));
  }

  override getProjectById(projectId: string): Observable<Project> {
    return defer(() => of(this.requireProject(projectId)));
  }

  override createProject(draft: ProjectDraft): Observable<Project> {
    return defer(() => {
      // Not derived from the current count: after a delete that would reissue a freed id, and any
      // flow still pointing at it would silently reappear inside the new project.
      const id = crypto.randomUUID();
      const now = new Date();
      const created: Project = {
        id,
        name: draft.name,
        description: draft.description,
        owner: this.ownerUsername(),
        createdAt: now,
        updatedAt: now,
        sharedContext: { entries: [] },
        flowCount: 0
      };
      this.data[id] = created;
      return of(created);
    });
  }

  override updateProject(projectId: string, draft: ProjectDraft): Observable<Project> {
    return defer(() => {
      const updated: Project = {
        ...this.requireProject(projectId),
        name: draft.name,
        description: draft.description,
        updatedAt: new Date()
      };
      this.data[projectId] = updated;
      return of(updated);
    });
  }

  override updateSharedContext(projectId: string, context: ProjectContext): Observable<Project> {
    return defer(() => {
      const updated: Project = {
        ...this.requireProject(projectId),
        sharedContext: context,
        updatedAt: new Date()
      };
      this.data[projectId] = updated;
      return of(updated);
    });
  }

  override updateFlowOrder(projectId: string, _flowIds: string[]): Observable<Project> {
    return defer(() => of(this.requireProject(projectId)));
  }

  override deleteProject(projectId: string, confirm: boolean): Observable<void> {
    return defer(() => {
      this.requireProject(projectId);
      if (!confirm) {
        throw new Error('Project deletion must be confirmed.');
      }
      delete this.data[projectId];
      return of(undefined);
    });
  }
}
