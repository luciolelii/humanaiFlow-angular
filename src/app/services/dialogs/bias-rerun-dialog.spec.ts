import { TestBed } from '@angular/core/testing';
import { BiasRerunDialogService } from './bias-rerun-dialog';

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
        capabilities: { blockType: 'LLM', supported: true, isolatedExperimentSupported: true, fullFlowExperimentSupported: true, externalSideEffects: false, configurationDependent: false, activationModes: [] }
      }]
    });
    expect(service.state()?.executionId).toBe('baseline');
  });
});
