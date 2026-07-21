import { Injectable, signal } from '@angular/core';
import { BiasAnnotation } from '@models/flow';
import { BiasCapabilities } from '@models/bias-impact';
import { TaskExecution } from '@models/task-execution';

export type BiasRerunCandidate = {
  nodeId: string;
  nodeName: string;
  annotations: BiasAnnotation[];
  capabilities: BiasCapabilities;
};

export type BiasRerunDialogInput = {
  executionId: string;
  candidates: BiasRerunCandidate[];
  onCreated: (execution: TaskExecution) => void;
};

@Injectable({ providedIn: 'root' })
export class BiasRerunDialogService {
  private readonly _state = signal<BiasRerunDialogInput | null>(null);
  readonly state = this._state.asReadonly();

  open(input: BiasRerunDialogInput) {
    if (input.candidates.length) this._state.set(input);
  }

  close() { this._state.set(null); }
}
