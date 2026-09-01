import { TestBed } from '@angular/core/testing';
import { BiasImpactExperimentDialogService } from './bias-impact-experiment-dialog';

describe('BiasImpactExperimentDialogService', () => {
  let service: BiasImpactExperimentDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BiasImpactExperimentDialogService);
  });

  it('opens only when at least one annotation has an executable probe', () => {
    service.open({
      executionId: 'execution', stepId: 'step', nodeId: 'node', nodeName: 'Node',
      capabilities: { blockType: 'LLM', supported: true, isolatedExperimentSupported: true, fullFlowExperimentSupported: true, externalSideEffects: false, configurationDependent: false, activationModes: [] },
      annotations: [
        { id: 'not-executable', biasProbe: { activationMode: 'PROMPT_DIRECTIVE' } },
        { id: 'executable', biasProbe: { activationMode: 'PROMPT_DIRECTIVE', instruction: 'Apply probe' } }
      ]
    });

    expect(service.state()?.annotations.map((annotation) => annotation.id)).toEqual(['executable']);
  });
});
