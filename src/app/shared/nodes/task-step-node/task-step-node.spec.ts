import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { SubflowPreviewDialogService } from '@services/dialogs/subflow-preview-dialog';
import { HumanInteractionDialogService } from '@services/dialogs/human-interaction-dialog';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { BiasImpactExperimentDialogService } from '@services/dialogs/bias-impact-experiment-dialog';
import { BiasComparisonViewStateService } from '@services/bias/bias-comparison-view-state';
import { BiasImpactReport } from '@models/bias-impact';

import { TaskStepNodeComponent } from './task-step-node';

const REPORT: BiasImpactReport = {
  id: 'report-1',
  experimentId: 'experiment-1',
  kind: 'FULL_FLOW',
  baselineExecutionId: 'baseline-1',
  biasedExecutionId: 'variant-1',
  nodeId: null,
  annotationIds: ['annotation-1'],
  repetitions: 1,
  createdAt: '2026-07-21T10:00:00',
  rawOutputsIncluded: true,
  immediateImpact: { outputChanged: true, maximumTextDifference: 0.5, changeRate: 1, baselineOutput: {}, biasedOutputs: [{}] },
  downstreamImpact: [
    { nodeId: 'step-changed', nodeName: 'Changed', baselineStatus: 'COMPLETED', biasedStatus: 'COMPLETED', changed: true, baselineOutputs: {}, biasedOutputs: {} }
  ],
  routingChanges: [{ nodeId: 'step-router', baselineBranch: 'false', biasedBranch: 'true' }],
  mockedSideEffects: [],
  summary: 'Outputs changed',
  warnings: []
};

describe('TaskStepNodeComponent bias canvas highlighting', () => {
  let fixture: ComponentFixture<TaskStepNodeComponent>;
  let component: TaskStepNodeComponent;
  let comparisonViewState: BiasComparisonViewStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskStepNodeComponent],
      providers: [
        { provide: BlocksService, useValue: { peekBlockType: vi.fn().mockReturnValue(null), getBlockType: vi.fn().mockResolvedValue(null), retrieveBiasCapabilities: vi.fn().mockReturnValue(of(null)) } },
        { provide: ContainersService, useValue: { peekContainerType: vi.fn().mockReturnValue(null), getContainerType: vi.fn().mockResolvedValue(null) } },
        { provide: NodeSettingsDialogService, useValue: { open: vi.fn().mockResolvedValue(null) } },
        { provide: SubflowPreviewDialogService, useValue: { open: vi.fn() } },
        { provide: HumanInteractionDialogService, useValue: { open: vi.fn(), close: vi.fn(), update: vi.fn(), state: vi.fn().mockReturnValue(null) } },
        { provide: TaskExecutionsService, useValue: { submitInteractionText: vi.fn().mockReturnValue(of(null)) } },
        { provide: BiasImpactExperimentDialogService, useValue: { open: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskStepNodeComponent);
    component = fixture.componentInstance;
    comparisonViewState = TestBed.inject(BiasComparisonViewStateService);

    component.data = {
      id: 'step-changed',
      inputs: {},
      outputs: {},
      data: {
        id: 'step-changed',
        typeName: 'LLMBlock',
        name: 'Step',
        inputs: [],
        outputs: [],
        specificConfiguration: { __executionNodeId: 'step-changed', __biasActiveAnnotationIds: ['annotation-1'] }
      }
    };
    component.emit = vi.fn();
    component.rendered = vi.fn();
    fixture.detectChanges();
  });

  it('flags a node as bias-active when it has active annotation ids in its execution config', () => {
    expect(component.isBiasActive()).toBe(true);
  });

  it('is not bias-active when the active annotation list is empty', () => {
    (component.data.data.specificConfiguration as Record<string, unknown>)['__biasActiveAnnotationIds'] = [];
    expect(component.isBiasActive()).toBe(false);
  });

  it('flags a node as downstream-changed only while its id appears in the highlighted report', () => {
    expect(component.isBiasDownstreamChanged()).toBe(false);

    comparisonViewState.show({ report: REPORT });
    expect(component.isBiasDownstreamChanged()).toBe(true);

    comparisonViewState.clear();
    expect(component.isBiasDownstreamChanged()).toBe(false);
  });

  it('flags the router node referenced by a routing change in the highlighted report', () => {
    (component.data.data.specificConfiguration as Record<string, unknown>)['__executionNodeId'] = 'step-router';
    comparisonViewState.show({ report: REPORT });

    expect(component.isBiasRoutingChangeSource()).toBe(true);
  });

  describe('Measure bias impact availability', () => {
    beforeEach(() => {
      component.data.data.biasAnnotations = [
        { id: 'annotation-1', behavioralProbe: { activationMode: 'PROMPT_DIRECTIVE', instruction: 'Nudge it' } }
      ];
      component.biasCapabilities = { blockType: 'LLMBlock', supported: true, isolatedExperimentSupported: true, fullFlowExperimentSupported: true, externalSideEffects: false, configurationDependent: false, activationModes: ['PROMPT_DIRECTIVE'] };
    });

    it('is hidden when there is nothing measurable (no executable annotation / capability)', () => {
      component.data.data.biasAnnotations = [];
      expect(component.hasMeasurableBiasAnnotations()).toBe(false);
    });

    it('is shown but disabled with an explanatory tooltip while the execution has not reached a final state', () => {
      (component.data.data.specificConfiguration as Record<string, unknown>)['__executionStatusGroup'] = 'RUNNING';

      expect(component.hasMeasurableBiasAnnotations()).toBe(true);
      expect(component.canMeasureBiasImpact()).toBe(false);
      expect(component.measureBiasImpactTooltip()).toBe('Available once the execution reaches a final state');
    });

    it('is enabled once the execution reaches a final state', () => {
      (component.data.data.specificConfiguration as Record<string, unknown>)['__executionStatusGroup'] = 'FINAL';

      expect(component.canMeasureBiasImpact()).toBe(true);
      expect(component.measureBiasImpactTooltip()).toBe('Measure bias impact');
    });
  });
});
