import { signal } from '@angular/core';
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

const BIAS_DESCRIPTOR = {
  type: 'BiasAnnotation',
  blockProperty: 'biasAnnotations',
  multiple: true,
  maxItems: 10,
  schema: {
    type: 'object',
    properties: {
      category: { type: 'string', 'x-ui-label': 'Category' },
      severity: { type: 'string', 'x-ui-label': 'Severity' },
      issue: { type: 'string', 'x-ui-label': 'Issue' },
      rationale: { type: 'string', 'x-ui-label': 'Rationale' }
    }
  },
  options: {},
  defaults: {},
  serverGeneratedFields: []
};

describe('TaskStepNodeComponent bias canvas highlighting', () => {
  let fixture: ComponentFixture<TaskStepNodeComponent>;
  let component: TaskStepNodeComponent;
  let comparisonViewState: BiasComparisonViewStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskStepNodeComponent],
      providers: [
        {
          provide: BlocksService,
          useValue: {
            peekBlockType: vi.fn().mockReturnValue(null),
            getBlockType: vi.fn().mockResolvedValue(null),
            retrieveBiasCapabilities: vi.fn().mockReturnValue(of(null)),
            getBiasAnnotationsDescriptor: vi.fn().mockResolvedValue(BIAS_DESCRIPTOR),
            biasAnnotationsDescriptor: signal(BIAS_DESCRIPTOR)
          }
        },
        { provide: ContainersService, useValue: { peekContainerType: vi.fn().mockReturnValue(null), getContainerType: vi.fn().mockResolvedValue(null) } },
        { provide: NodeSettingsDialogService, useValue: { open: vi.fn().mockResolvedValue(null) } },
        { provide: SubflowPreviewDialogService, useValue: { open: vi.fn() } },
        { provide: HumanInteractionDialogService, useValue: { open: vi.fn(), close: vi.fn(), update: vi.fn(), state: vi.fn().mockReturnValue(null) } },
        { provide: TaskExecutionsService, useValue: { submitInteractionText: vi.fn().mockReturnValue(of(null)), refresh: vi.fn() } },
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

  it('represents node capabilities and bias annotation counts in the execution node', () => {
    component.data.data.capabilities = {
      visualRole: 'DECISION',
      terminal: false,
      biasAnnotationsAllowed: true,
      allowsIncomingConnections: true,
      allowsOutgoingConnections: true,
      canDependOnOtherNodes: false,
      canHaveDependentNodes: false
    };
    component.data.data.biasAnnotations = [
      { id: 'annotation-1', biasProbe: { activationMode: 'PROMPT_DIRECTIVE', instruction: 'Nudge it' } },
      { id: 'annotation-2' }
    ];

    expect(component.visualRoleLabel()).toBe('Decision');
    expect(component.allBiasAnnotations()).toHaveLength(2);
    expect(component.activeBiasAnnotationCount()).toBe(1);
    expect(component.capabilitiesTooltip()).toContain('Bias annotations: allowed');
    expect(component.isBiasCapable()).toBe(true);
  });

  it('shows a readable bias count and opens the readonly annotations detail from the badge', () => {
    fixture.componentRef.setInput('data', {
      ...component.data,
      data: {
        ...component.data.data,
        biasAnnotations: [
          {
            id: 'annotation-1',
            category: 'SELECTION_BIAS',
            severity: 'HIGH',
            issue: 'First issue',
            rationale: 'First rationale',
            biasProbe: {
              activationMode: 'INPUT_TRANSFORMATION',
              instruction: 'Transform the candidate profile'
            }
          },
          { id: 'annotation-2', category: 'ACCESSIBILITY_BIAS', severity: 'MEDIUM', issue: 'Second issue' }
        ]
      }
    });
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.llm-node-bias-summary') as HTMLButtonElement;
    expect(badge.textContent).toContain('2 bias annotations');
    expect(badge.textContent).not.toContain('0/2');

    badge.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog.bias-modal-backdrop');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('First issue');
    expect(dialog.textContent).toContain('Second issue');
    expect(dialog.textContent).toContain('First rationale');
    expect(dialog.textContent).toContain('Transform the candidate profile');
  });

  it('uses the singular label and hides the annotation badge when no annotations exist', () => {
    component.data.data.biasAnnotations = [{ id: 'annotation-1' }];
    expect(component.biasAnnotationBadgeLabel()).toBe('1 bias annotation');

    component.data.data.biasAnnotations = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.llm-node-bias-summary')).toBeNull();
  });

  describe('human interaction contracts', () => {
    function configureInteraction(kind: 'single-response' | 'human-decision') {
      component.data.data.specificConfiguration = {
        ...component.data.data.specificConfiguration,
        __executionId: 'execution-1',
        __executionNodeId: 'node-1',
        __executionStatus: 'WAITING',
        __stepStatus: 'WAITING_FOR_INTERACTION',
        question: 'Should the candidate proceed?',
        options: [
          { name: 'approve', label: 'Approve' },
          { name: 'reject', label: 'Reject' }
        ],
        rationaleRequired: true,
        rationaleLabel: 'Evidence-based rationale'
      };
      (component as any).blockDescriptor = {
        interactionContract: {
          kind,
          messageField: kind === 'human-decision' ? 'rationale' : null,
          completionField: kind === 'human-decision' ? 'choice' : 'output',
          historyField: null,
          responseField: kind === 'human-decision' ? 'choice' : 'output',
          supportsPartialResult: kind === 'human-decision'
        }
      };
    }

    it('dispatches a human decision with dynamic options from the node configuration', () => {
      configureInteraction('human-decision');
      const dialog = TestBed.inject(HumanInteractionDialogService) as any;

      component.openInteractionModal();

      expect(dialog.open).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'human-decision',
        question: 'Should the candidate proceed?',
        decisionOptions: [
          { name: 'approve', label: 'Approve' },
          { name: 'reject', label: 'Reject' }
        ],
        rationaleRequired: true,
        rationaleLabel: 'Evidence-based rationale'
      }));
    });

    it('builds a template substitution map from step inputs, global inputs and execution variables', () => {
      configureInteraction('human-decision');
      component.data.data.specificConfiguration = {
        ...component.data.data.specificConfiguration,
        __executionInputs: { candidateProfile: 'Jane Doe' },
        __globalInputs: { cvs: ['cv-1', 'cv-2'] },
        __executionVariables: { retryCount: 2 },
        __executionName: 'Ranking run'
      };
      const dialog = TestBed.inject(HumanInteractionDialogService) as any;

      component.openInteractionModal();

      expect(dialog.open).toHaveBeenCalledWith(expect.objectContaining({
        templateValues: {
          candidateProfile: 'Jane Doe',
          'global.cvs': ['cv-1', 'cv-2'],
          'vars.retryCount': 2,
          'context.executionId': 'execution-1',
          'context.executionName': 'Ranking run'
        }
      }));
    });

    it('submits rationale first and the technical choice last', () => {
      configureInteraction('human-decision');
      const dialog = TestBed.inject(HumanInteractionDialogService) as any;
      const executions = TestBed.inject(TaskExecutionsService) as any;
      component.openInteractionModal();
      const input = dialog.open.mock.calls.at(-1)[0];

      input.onSubmit({
        mode: 'decision',
        choice: 'approve',
        rationale: 'Documented evidence'
      });

      expect(executions.submitInteractionText.mock.calls).toEqual([
        ['execution-1', 'node-1', 'rationale', 'Documented evidence'],
        ['execution-1', 'node-1', 'choice', 'approve']
      ]);
    });

    it('uses the single-response completion field and never confirms the runtime input', () => {
      configureInteraction('single-response');
      const dialog = TestBed.inject(HumanInteractionDialogService) as any;
      const executions = TestBed.inject(TaskExecutionsService) as any;
      component.openInteractionModal();
      const input = dialog.open.mock.calls.at(-1)[0];

      input.onSubmit({ mode: 'complete', value: 'Human response' });

      expect(executions.submitInteractionText).toHaveBeenCalledWith(
        'execution-1',
        'node-1',
        'output',
        'Human response'
      );
    });

    it('does not open a form unless the authoritative step status is WAITING_FOR_INTERACTION', () => {
      configureInteraction('single-response');
      component.data.data.specificConfiguration.__stepStatus = 'WAITING_FOR_INPUT';
      const dialog = TestBed.inject(HumanInteractionDialogService) as any;

      component.openInteractionModal();

      expect(dialog.open).not.toHaveBeenCalled();
    });
  });

  it('does not mark EndBlock as bias capable when the catalog forbids bias annotations', () => {
    component.data.data.typeName = 'EndBlock';
    component.data.data.capabilities = undefined;
    (component as any).blockDescriptor = {
      capabilities: {
        visualRole: 'END',
        terminal: true,
        biasAnnotationsAllowed: false,
        allowsIncomingConnections: true,
        allowsOutgoingConnections: false,
        canDependOnOtherNodes: true,
        canHaveDependentNodes: false
      }
    };
    fixture.detectChanges();

    expect(component.isBiasCapable()).toBe(false);
    expect(fixture.nativeElement.querySelector('.llm-node-bias-capability')).toBeNull();
  });

  it('waits for catalog capabilities instead of using permissive defaults for the badge', () => {
    component.data.data.capabilities = undefined;
    (component as any).blockDescriptor = null;
    fixture.detectChanges();

    expect(component.isBiasCapable()).toBe(false);
    expect(fixture.nativeElement.querySelector('.llm-node-bias-capability')).toBeNull();
  });

  describe('Measure bias impact availability', () => {
    beforeEach(() => {
      component.data.data.capabilities = {
        visualRole: 'PROCESS',
        terminal: false,
        biasAnnotationsAllowed: true,
        allowsIncomingConnections: true,
        allowsOutgoingConnections: true,
        canDependOnOtherNodes: true,
        canHaveDependentNodes: true
      };
      component.data.data.biasAnnotations = [
        { id: 'annotation-1', biasProbe: { activationMode: 'PROMPT_DIRECTIVE', instruction: 'Nudge it' } }
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

  describe('isEmptyDisplayValue', () => {
    const isEmptyDisplayValue = (value: unknown): boolean => (component as any).isEmptyDisplayValue(value);

    it('treats an array of blank strings as empty, matching the editor-side isMissingValue semantics', () => {
      expect(isEmptyDisplayValue(['', '', ''])).toBe(true);
    });

    it('treats an array containing a real value as non-empty', () => {
      expect(isEmptyDisplayValue(['', 'value', ''])).toBe(false);
    });

    it('treats an object whose values are all missing as empty', () => {
      expect(isEmptyDisplayValue({ a: '', b: null })).toBe(true);
    });

    it('treats null/undefined/blank strings as empty', () => {
      expect(isEmptyDisplayValue(null)).toBe(true);
      expect(isEmptyDisplayValue(undefined)).toBe(true);
      expect(isEmptyDisplayValue('   ')).toBe(true);
    });
  });
});
