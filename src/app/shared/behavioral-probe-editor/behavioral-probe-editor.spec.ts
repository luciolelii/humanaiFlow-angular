import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowBlock } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { BehavioralProbeEditorComponent } from './behavioral-probe-editor';

const block: FlowBlock = {
  id: 'conditional-1',
  name: 'Conditional',
  inputs: [{ name: 'input', type: 'TEXT', multiple: true }],
  outputs: [
    { name: 'response', type: 'TEXT', multiple: false },
    { name: 'accepted', type: 'BOOLEAN', multiple: false },
    { name: 'items', type: 'TEXT', multiple: true }
  ],
  specificConfiguration: { useLlm: true },
  typeName: 'ConditionalBlock',
  nodeFamily: 'block'
};

describe('BehavioralProbeEditorComponent', () => {
  let fixture: ComponentFixture<BehavioralProbeEditorComponent>;
  let component: BehavioralProbeEditorComponent;
  const retrieveBiasCapabilities = vi.fn();
  const retrieveBiasCapabilitiesForInstance = vi.fn();

  beforeEach(async () => {
    retrieveBiasCapabilities.mockReset();
    retrieveBiasCapabilitiesForInstance.mockReset();
    retrieveBiasCapabilities.mockReturnValue(of({
      blockType: 'ConditionalBlock', supported: true, isolatedExperimentSupported: true,
      fullFlowExperimentSupported: true, externalSideEffects: false,
      configurationDependent: true, activationModes: ['INPUT_TRANSFORMATION']
    }));
    retrieveBiasCapabilitiesForInstance.mockReturnValue(of({
      blockType: 'ConditionalBlock', supported: true, isolatedExperimentSupported: true,
      fullFlowExperimentSupported: true, externalSideEffects: false,
      configurationDependent: true, activationModes: ['PROMPT_DIRECTIVE', 'MOCK_RESPONSE', 'ROUTING_OVERRIDE']
    }));
    await TestBed.configureTestingModule({
      imports: [BehavioralProbeEditorComponent],
      providers: [{
        provide: BlocksService,
        useValue: { retrieveBiasCapabilities, retrieveBiasCapabilitiesForInstance }
      }]
    }).compileComponents();
    fixture = TestBed.createComponent(BehavioralProbeEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('block', block);
    fixture.detectChanges();
  });

  it('uses instance capabilities when the type-level response is configuration dependent', () => {
    expect(retrieveBiasCapabilities).toHaveBeenCalledWith('ConditionalBlock');
    expect(retrieveBiasCapabilitiesForInstance).toHaveBeenCalledWith('ConditionalBlock', block);
    expect(component.activationModes).toEqual(['PROMPT_DIRECTIVE', 'MOCK_RESPONSE', 'ROUTING_OVERRIDE']);
  });

  it('emits typed complete mock outputs and never writes a new mock instruction', () => {
    const changed = vi.fn();
    component.probeChange.subscribe(changed);

    component.selectActivationMode('MOCK_RESPONSE');

    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({
      activationMode: 'MOCK_RESPONSE',
      instruction: undefined,
      mockOutputs: { response: '', accepted: false, items: [] }
    }));
  });

  it('updates templates, target inputs and routing branch for the selected mode', () => {
    const changed = vi.fn();
    component.probeChange.subscribe(changed);
    fixture.componentRef.setInput('probe', { activationMode: 'INPUT_TRANSFORMATION' });
    fixture.detectChanges();

    component.setInstruction('Frame ${original} as confirming evidence.');
    component.toggleTargetInput('input', true);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ targetInputs: ['input'] }));

    fixture.componentRef.setInput('probe', { activationMode: 'ROUTING_OVERRIDE' });
    fixture.detectChanges();
    component.setRoutingOutput('accepted');
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ instruction: 'accepted' }));
  });
});
