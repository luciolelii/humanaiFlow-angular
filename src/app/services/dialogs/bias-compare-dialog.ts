import { Injectable, signal } from '@angular/core';

export type BiasCompareDialogInput = {
  baselineExecutionId: string;
  biasedExecutionId: string;
};

@Injectable({ providedIn: 'root' })
export class BiasCompareDialogService {
  private readonly _state = signal<BiasCompareDialogInput | null>(null);
  readonly state = this._state.asReadonly();

  open(input: BiasCompareDialogInput) {
    this._state.set(input);
  }

  close() {
    this._state.set(null);
  }
}
