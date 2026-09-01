import { Injectable, signal } from '@angular/core';
import { BiasAnnotation, FlowData, FlowNode } from '@models/flow';
import { BiasCapabilities, BiasInterventionDirection, BiasRerunActivation } from '@models/bias-impact';
import { TaskExecution } from '@models/task-execution';

export type BiasRerunCandidate = {
  nodeId: string;
  nodeName: string;
  annotations: BiasAnnotation[];
  capabilities: BiasCapabilities;
  activationKind: 'ANNOTATIONS' | 'SUBFLOW';
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

export function hasActivatableSubflowBiasProbe(container: FlowNode, direction: BiasInterventionDirection = 'BIAS'): boolean {
  const configuration = container.specificConfiguration as Record<string, unknown> | null | undefined;
  const subflows = [configuration?.['subFlow'], configuration?.['guardSubFlow']]
    .filter((value): value is FlowData => !!value && typeof value === 'object' && !Array.isArray(value));

  return subflows.some((subflow) =>
    (Array.isArray(subflow.blocks) ? subflow.blocks : []).some((block) =>
      (Array.isArray(block.biasAnnotations) ? block.biasAnnotations : [])
        .some((annotation) => direction === 'BIAS'
          ? !!annotation.biasProbe
          : direction === 'MITIGATION' ? !!annotation.mitigationProbe : !!annotation.biasProbe && !!annotation.mitigationProbe)
    )
  );
}

export function buildBiasRerunActivations(
  candidates: BiasRerunCandidate[],
  annotationIdsByNode: Record<string, string[]>,
  selectedSubflowsByNode: Record<string, boolean>,
  direction: BiasInterventionDirection = 'BIAS'
): BiasRerunActivation[] {
  return candidates.flatMap((candidate): BiasRerunActivation[] => {
    if (candidate.activationKind === 'SUBFLOW') {
      return selectedSubflowsByNode[candidate.nodeId]
        ? [{ nodeId: candidate.nodeId, annotationIds: [], includeSubflow: true, direction }]
        : [];
    }

    const annotationIds = annotationIdsByNode[candidate.nodeId] ?? [];
    return annotationIds.length ? [{ nodeId: candidate.nodeId, annotationIds, includeSubflow: false, direction }] : [];
  });
}
