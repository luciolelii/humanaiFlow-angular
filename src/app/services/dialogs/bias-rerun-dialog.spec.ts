import { TestBed } from '@angular/core/testing';
import {
  BiasRerunDialogService,
  buildBiasRerunActivations,
  hasActivatableSubflowBiasProbe
} from './bias-rerun-dialog';

const capabilities = {
  blockType: 'LLM',
  supported: true,
  isolatedExperimentSupported: true,
  fullFlowExperimentSupported: true,
  externalSideEffects: false,
  configurationDependent: false,
  activationModes: []
};

describe('BiasRerunDialogService', () => {
  it('keeps a dialog state only when there are eligible block candidates', () => {
    const service = TestBed.inject(BiasRerunDialogService);
    const base = { executionId: 'baseline', onCreated: () => undefined };
    service.open({ ...base, candidates: [] });
    expect(service.state()).toBeNull();

    service.open({
      ...base,
      candidates: [{
        nodeId: 'node-1', nodeName: 'Node 1', annotations: [],
        capabilities,
        activationKind: 'ANNOTATIONS'
      }]
    });
    expect(service.state()?.executionId).toBe('baseline');
  });

  it('detects probes in both the main and guard subflows', () => {
    const block = (id: string, withProbe: boolean) => ({
      id,
      name: id,
      inputs: [],
      outputs: [],
      typeName: 'LLMBlock',
      specificConfiguration: {},
      biasAnnotations: withProbe ? [{ biasProbe: { activationMode: 'PROMPT_DIRECTIVE', instruction: 'probe' } }] : []
    });
    const flow = (blocks: ReturnType<typeof block>[]) => ({
      blocks,
      containers: [],
      connections: [],
      dependencies: []
    });
    const container = {
      id: 'loop',
      name: 'Loop',
      inputs: [],
      outputs: [],
      typeName: 'LoopContainer',
      nodeFamily: 'container' as const,
      specificConfiguration: {
        subFlow: flow([block('body', false)]),
        guardSubFlow: flow([block('guard', true)])
      }
    };

    expect(hasActivatableSubflowBiasProbe(container)).toBe(true);
    expect(hasActivatableSubflowBiasProbe({
      ...container,
      specificConfiguration: { subFlow: flow([block('body', false)]) }
    })).toBe(false);
  });

  it('builds annotation and all-or-nothing subflow activations', () => {
    const candidates = [
      {
        nodeId: 'block-1',
        nodeName: 'Block',
        annotations: [],
        capabilities,
        activationKind: 'ANNOTATIONS' as const
      },
      {
        nodeId: 'container-1',
        nodeName: 'Container',
        annotations: [],
        capabilities,
        activationKind: 'SUBFLOW' as const
      }
    ];

    expect(buildBiasRerunActivations(
      candidates,
      { 'block-1': ['annotation-1'], 'container-1': ['must-not-be-sent'] },
      { 'container-1': true }
    )).toEqual([
      { nodeId: 'block-1', annotationIds: ['annotation-1'], includeSubflow: false, direction: 'BIAS' },
      { nodeId: 'container-1', annotationIds: [], includeSubflow: true, direction: 'BIAS' }
    ]);
  });
});
