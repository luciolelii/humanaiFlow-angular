import { Injectable, signal } from '@angular/core';
import { Project, ProjectDraft } from '@models/project';

export type ProjectDialogInput = {
  /** Null creates a project; a project edits it. */
  project: Project | null;
};

type ProjectDialogState = ProjectDialogInput & {
  resolve: (draft: ProjectDraft | null) => void;
};

@Injectable({ providedIn: 'root' })
export class ProjectDialogService {
  private readonly _state = signal<ProjectDialogState | null>(null);
  readonly state = this._state.asReadonly();

  open(input: ProjectDialogInput): Promise<ProjectDraft | null> {
    return new Promise<ProjectDraft | null>((resolve) => {
      this._state.set({ ...input, resolve });
    });
  }

  close(draft: ProjectDraft | null) {
    const state = this._state();
    if (!state) return;

    state.resolve(draft);
    this._state.set(null);
  }
}
