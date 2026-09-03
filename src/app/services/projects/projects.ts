import { computed, Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { Project, ProjectContext, ProjectDraft } from '@models/project';
import { catchError, firstValueFrom, Observable, of, tap, throwError } from 'rxjs';
import { ProjectsCallServiceBase } from './projects-call.base';

@Injectable({
  providedIn: 'root',
})
export class ProjectsService {

  projectsCallService: ProjectsCallServiceBase = new environment.projectsCallService();

  toInit: boolean = true;
  private loadingPromise: Promise<void> | null = null;

  private _projects = signal<Project[]>([]);
  readonly projects = this._projects.asReadonly();

  /** Lets a flow resolve its project in O(1) without threading inputs through the tree. */
  readonly projectById = computed(() => new Map(this._projects().map((project) => [project.id, project])));

  hasLoadedProjects() {
    return this._projects().length > 0 || !this.toInit;
  }

  async getAllProjects() {
    if (this.toInit) {
      this.toInit = false;
      try {
        await this.refresh();
      } catch {
        this.toInit = true;
      }
    }

    return this.projects;
  }

  getProjectById(projectId: string, forceRefresh = false): Observable<Project> {
    const cached = this._projects().find((project) => project.id === projectId);
    if (cached && !forceRefresh) return of(cached);

    return this.projectsCallService.getProjectById(projectId).pipe(
      tap((project) => this.patch(project))
    );
  }

  async refresh(force = false): Promise<void> {
    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = firstValueFrom(this.projectsCallService.retrieveAllProjects())
      .then((projects) => {
        this._projects.set(projects);
      })
      .catch((err) => {
        this.loadingPromise = null;
        console.error('Retrieve projects failed', err);
        throw err;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  createProject(draft: ProjectDraft) {
    return this.projectsCallService.createProject(draft).pipe(
      tap((created) => this._projects.update((projects) => [created, ...projects])),
      catchError((err) => {
        console.error('Create project failed', err);
        return throwError(() => err);
      })
    );
  }

  updateProject(projectId: string, draft: ProjectDraft) {
    return this.projectsCallService.updateProject(projectId, draft).pipe(
      tap((updated) => this.patch(updated)),
      catchError((err) => {
        console.error('Update project failed', err);
        return throwError(() => err);
      })
    );
  }

  updateSharedContext(projectId: string, context: ProjectContext) {
    return this.projectsCallService.updateSharedContext(projectId, context).pipe(
      tap((updated) => this.patch(updated)),
      catchError((err) => {
        console.error('Update project shared context failed', err);
        return throwError(() => err);
      })
    );
  }

  updateFlowOrder(projectId: string, flowIds: string[]) {
    return this.projectsCallService.updateFlowOrder(projectId, flowIds).pipe(
      tap((updated) => this.patch(updated)),
      catchError((err) => {
        console.error('Update project flow order failed', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Deletes the project and every flow in it. The caller must also refresh the flow cache, which
   * this cascade leaves stale.
   */
  deleteProject(projectId: string, confirm = true) {
    return this.projectsCallService.deleteProject(projectId, confirm).pipe(
      tap(() => this._projects.update((projects) => projects.filter((p) => p.id !== projectId))),
      catchError((err) => {
        console.error('Delete project failed', err);
        return throwError(() => err);
      })
    );
  }

  private patch(project: Project) {
    this._projects.update((projects) => {
      const index = projects.findIndex((current) => current.id === project.id);
      if (index < 0) return [project, ...projects];
      const next = [...projects];
      next[index] = project;
      return next;
    });
  }
}
