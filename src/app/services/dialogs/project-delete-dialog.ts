import { Injectable, signal } from '@angular/core';
import { Project } from '@models/project';

export type ProjectDeleteDialogInput = {
  project: Project;
  /**
   * The flows that will be destroyed, taken from the client cache rather than from the API count:
   * the user must be shown exactly what they can see in the sidebar.
   */
  flows: { id: string; name: string; finalized?: boolean }[];
};

type ProjectDeleteDialogState = ProjectDeleteDialogInput & {
  resolve: (confirmed: boolean) => void;
};

/**
 * A dedicated dialog rather than a wider ConfirmDialogService: that service's single-message
 * signature is used by many callers, and widening it for one destructive case would ripple through
 * every one of them.
 */
@Injectable({ providedIn: 'root' })
export class ProjectDeleteDialogService {
  private readonly _state = signal<ProjectDeleteDialogState | null>(null);
  readonly state = this._state.asReadonly();

  open(input: ProjectDeleteDialogInput): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this._state.set({ ...input, resolve });
    });
  }

  close(confirmed: boolean) {
    const state = this._state();
    if (!state) return;

    state.resolve(confirmed);
    this._state.set(null);
  }
}
