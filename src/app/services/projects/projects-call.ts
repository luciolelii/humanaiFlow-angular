import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@environment';
import { Project, ProjectContext, ProjectDraft } from '@models/project';
import { map, Observable } from 'rxjs';
import { projectFromApi, toProjectContextRequest, toProjectRequest } from './project-mapper';
import { ProjectsCallServiceBase } from './projects-call.base';

export class ProjectsCallService extends ProjectsCallServiceBase {
  private readonly http = inject(HttpClient);

  override retrieveAllProjects(): Observable<Project[]> {
    return this.http
      .get<unknown[]>(`${environment.apiUrl}/projects`)
      .pipe(map((raw) => raw.map((project) => projectFromApi(project))));
  }

  override getProjectById(projectId: string): Observable<Project> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/projects/${encodeURIComponent(projectId)}`)
      .pipe(map((raw) => projectFromApi(raw)));
  }

  override createProject(draft: ProjectDraft): Observable<Project> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/projects`, toProjectRequest(draft))
      .pipe(map((raw) => projectFromApi(raw)));
  }

  override updateProject(projectId: string, draft: ProjectDraft): Observable<Project> {
    return this.http
      .put<unknown>(`${environment.apiUrl}/projects/${encodeURIComponent(projectId)}`, toProjectRequest(draft))
      .pipe(map((raw) => projectFromApi(raw)));
  }

  override updateSharedContext(projectId: string, context: ProjectContext): Observable<Project> {
    return this.http
      .put<unknown>(
        `${environment.apiUrl}/projects/${encodeURIComponent(projectId)}/context`,
        toProjectContextRequest(context)
      )
      .pipe(map((raw) => projectFromApi(raw)));
  }

  override updateFlowOrder(projectId: string, flowIds: string[]): Observable<Project> {
    return this.http
      .put<unknown>(`${environment.apiUrl}/projects/${encodeURIComponent(projectId)}/flow-order`, { flowIds })
      .pipe(map((raw) => projectFromApi(raw)));
  }

  override deleteProject(projectId: string, confirm: boolean): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}/projects/${encodeURIComponent(projectId)}?confirm=${confirm}`
    );
  }
}
