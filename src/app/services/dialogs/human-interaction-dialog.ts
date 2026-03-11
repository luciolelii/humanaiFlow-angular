import { Injectable, signal } from '@angular/core';

export type HumanInteractionDialogInput = {
  title?: string;
  actionDescription: string;
  currentInput: string;
};

export type HumanInteractionDialogResult = {
  mode: 'confirm' | 'edit';
  value: string;
};

@Injectable({ providedIn: 'root' })
export class HumanInteractionDialogService {
  private _state = signal<{
    title: string;
    actionDescription: string;
    currentInput: string;
    resolve: (value: HumanInteractionDialogResult | null) => void;
  } | null>(null);

  readonly state = this._state.asReadonly();

  open(input: HumanInteractionDialogInput): Promise<HumanInteractionDialogResult | null> {
    return new Promise((resolve) => {
      this._state.set({
        title: input.title ?? 'Human interaction',
        actionDescription: input.actionDescription,
        currentInput: input.currentInput,
        resolve
      });
    });
  }

  close(value: HumanInteractionDialogResult | null) {
    const state = this._state();
    if (!state) return;
    state.resolve(value);
    this._state.set(null);
  }
}
