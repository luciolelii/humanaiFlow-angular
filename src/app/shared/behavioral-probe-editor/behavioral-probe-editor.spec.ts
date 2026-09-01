import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowBlock, FlowContainer } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
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
      mockOutputs: { response: '', accepted: false, items: [] }
    }));
  });

  it('defaults a JSON-typed output to an empty object in mock outputs', () => {
    fixture.componentRef.setInput('block', { ...block, outputs: [...block.outputs, { name: 'dossier', type: 'JSON', multiple: false }] });
    fixture.detectChanges();

    const changed = vi.fn();
    component.probeChange.subscribe(changed);

    component.selectActivationMode('MOCK_RESPONSE');

    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({
      mockOutputs: expect.objectContaining({ dossier: {} })
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

describe('BehavioralProbeEditorComponent (container nodes)', () => {
  let fixture: ComponentFixture<BehavioralProbeEditorComponent>;
  let component: BehavioralProbeEditorComponent;

  const container: FlowContainer = {
    id: 'container-1',
    name: 'Candidate review',
    inputs: [{ name: 'candidateData', type: 'TEXT', multiple: false }],
    outputs: [{ name: 'decision', type: 'TEXT', multiple: false }],
    specificConfiguration: { name: 'Candidate review' },
    typeName: 'GenericContainer',
    nodeFamily: 'container'
  };

  const blocksRetrieveBiasCapabilities = vi.fn();
  const containersRetrieveBiasCapabilities = vi.fn();

  beforeEach(async () => {
    blocksRetrieveBiasCapabilities.mockReset();
    containersRetrieveBiasCapabilities.mockReset();
    containersRetrieveBiasCapabilities.mockReturnValue(of({
      blockType: 'GenericContainer', supported: true, isolatedExperimentSupported: false,
      fullFlowExperimentSupported: true, externalSideEffects: false,
      configurationDependent: false, activationModes: ['INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION']
    }));

    await TestBed.configureTestingModule({
      imports: [BehavioralProbeEditorComponent],
      providers: [
        { provide: BlocksService, useValue: { retrieveBiasCapabilities: blocksRetrieveBiasCapabilities } },
        { provide: ContainersService, useValue: { retrieveBiasCapabilities: containersRetrieveBiasCapabilities } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(BehavioralProbeEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('block', container);
    fixture.detectChanges();
  });

  it('loads capabilities from the containers service, not the blocks service, for container nodes', () => {
    expect(containersRetrieveBiasCapabilities).toHaveBeenCalledWith('GenericContainer');
    expect(blocksRetrieveBiasCapabilities).not.toHaveBeenCalled();
    expect(component.activationModes).toEqual(['INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION']);
  });

  it('lists target inputs from the container public inputs', () => {
    fixture.componentRef.setInput('probe', { activationMode: 'INPUT_TRANSFORMATION' });
    fixture.detectChanges();

    const checkboxLabels = Array.from(fixture.nativeElement.querySelectorAll('.probe-check span') as NodeListOf<Element>)
      .map((el) => el.textContent?.trim());
    expect(checkboxLabels.some((label) => label?.startsWith('candidateData'))).toBe(true);

    const changed = vi.fn();
    component.probeChange.subscribe(changed);
    component.toggleTargetInput('candidateData', true);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ targetInputs: ['candidateData'] }));
  });
});
