import { Injectable, signal } from '@angular/core';
import { Project, ProjectContext } from '@models/project';

type ProjectContextDialogState = {
  project: Project;
  resolve: (context: ProjectContext | null) => void;
};

@Injectable({ providedIn: 'root' })
export class ProjectContextDialogService {
  private readonly _state = signal<ProjectContextDialogState | null>(null);
  readonly state = this._state.asReadonly();

  open(project: Project): Promise<ProjectContext | null> {
    return new Promise<ProjectContext | null>((resolve) => {
      this._state.set({ project, resolve });
    });
  }

  close(context: ProjectContext | null) {
    const state = this._state();
    if (!state) return;

    state.resolve(context);
    this._state.set(null);
  }
}
