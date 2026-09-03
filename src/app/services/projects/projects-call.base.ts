import { Project, ProjectContext, ProjectDraft } from '@models/project';
import { Observable } from 'rxjs';

export abstract class ProjectsCallServiceBase {

    abstract retrieveAllProjects(): Observable<Project[]>;

    abstract getProjectById(projectId: string): Observable<Project>;

    abstract createProject(draft: ProjectDraft): Observable<Project>;

    abstract updateProject(projectId: string, draft: ProjectDraft): Observable<Project>;

    abstract updateSharedContext(projectId: string, context: ProjectContext): Observable<Project>;

    /** Sets the order a project run executes the flows in. */
    abstract updateFlowOrder(projectId: string, flowIds: string[]): Observable<Project>;

    /**
     * Deletes the project and every flow in it, finalized flows included. Without `confirm` the
     * backend refuses a non-empty project with 409 rather than destroying anything.
     */
    abstract deleteProject(projectId: string, confirm: boolean): Observable<void>;
}
