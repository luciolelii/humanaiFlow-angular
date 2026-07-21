import { Injectable, signal } from '@angular/core';
import { BiasAnnotation, isProbeExecutable } from '@models/flow';
import { BiasCapabilities } from '@models/bias-impact';

export type BiasImpactExperimentDialogInput = {
  executionId: string;
  stepId: string;
  nodeId: string;
  nodeName: string;
  annotations: BiasAnnotation[];
  capabilities: BiasCapabilities;
};

@Injectable({ providedIn: 'root' })
export class BiasImpactExperimentDialogService {
  private readonly _state = signal<BiasImpactExperimentDialogInput | null>(null);
  readonly state = this._state.asReadonly();

  open(input: BiasImpactExperimentDialogInput) {
    const annotations = input.annotations.filter((annotation) => isProbeExecutable(annotation.behavioralProbe));
    if (!annotations.length) return;
    this._state.set({ ...input, annotations });
  }

  close() {
    this._state.set(null);
  }
}
