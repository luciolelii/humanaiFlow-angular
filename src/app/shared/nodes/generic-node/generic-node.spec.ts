import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_NODE_CAPABILITIES } from '@models/flow';
import { BlocksService } from '@services/blocks/blocks';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { EditorStateHolder } from '@stores/flow-editor';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { GenericNodeComponent } from './generic-node';

describe('GenericNodeComponent', () => {
  let component: GenericNodeComponent;
  let fixture: ComponentFixture<GenericNodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenericNodeComponent],
      providers: [
        {
          provide: NodeSettingsDialogService,
          useValue: {
            open: vi.fn().mockResolvedValue(null)
          }
        },
        {
          provide: EditorStateHolder,
          useValue: {
            currentFlow: vi.fn().mockReturnValue(null),
            activeFlowData: vi.fn().mockReturnValue(null),
            flowValidationErrors: vi.fn().mockReturnValue([]),
            isBlockSelected: vi.fn().mockReturnValue(false),
            isValidationNodeHighlighted: vi.fn().mockReturnValue(false),
            updateData: vi.fn(),
            stopDraggingSelectedBlocks: vi.fn()
          }
        },
        {
          provide: FieldRetriever,
          useValue: {
            retrieveSchema: vi.fn(),
            retrieveStructuredData: vi.fn(),
            retrieveText: vi.fn()
          }
        },
        {
          provide: BlocksService,
          useValue: {
            peekBlockType: vi.fn().mockReturnValue(null),
            getBlockType: vi.fn().mockResolvedValue(null),
            biasAnnotationsDescriptor: vi.fn().mockReturnValue(null),
            updateBlock: vi.fn()
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GenericNodeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('data', {
      id: 'node-1',
      inputs: {},
      outputs: {},
      selected: false,
      data: {
        id: 'node-1',
        typeName: '',
        name: 'Node 1',
        inputs: [],
        outputs: [],
        specificConfiguration: { name: 'Node 1' }
      }
    });
    fixture.componentRef.setInput('emit', vi.fn());
    fixture.componentRef.setInput('rendered', vi.fn());
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('writes parameter changes into the active subflow data instead of the main flow', () => {
    const editorState = TestBed.inject(EditorStateHolder) as any;
    const activeSubflowData = {
      blocks: [{
        id: 'node-1',
        name: 'Node 1',
        typeName: 'LLMBlock',
        inputs: [],
        outputs: [],
        specificConfiguration: { name: 'Node 1' }
      }],
      containers: [],
      connections: [],
      dependencies: []
    };
    editorState.activeFlowData.mockReturnValue(activeSubflowData);
    component.data.data = {
      ...component.data.data,
      typeName: 'LLMBlock',
      specificConfiguration: { name: 'Edited node', prompt: 'Updated prompt' }
    };

    (component as any).markFlowDirty();

    expect(editorState.updateData).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [expect.objectContaining({
        id: 'node-1',
        name: 'Edited node',
        specificConfiguration: expect.objectContaining({ prompt: 'Updated prompt' })
      })]
    }));
  });

  it('renders every input and output after the Rete node payload is updated', () => {
    fixture.componentRef.setInput('data', {
      ...component.data,
      inputs: {
        existing: { socket: { name: 'ANY' } },
        new: { socket: { name: 'ANY' } }
      },
      outputs: {
        noAssessment: { socket: { name: 'ANY' } },
        excluded: { socket: { name: 'ANY' } },
        continued: { socket: { name: 'ANY' } }
      },
      data: {
        ...component.data.data,
        inputs: [
          { name: 'existing', type: 'ANY', multiple: false },
          { name: 'new', type: 'ANY', multiple: false }
        ],
        outputs: [
          { name: 'noAssessment', type: 'ANY', multiple: false },
          { name: 'excluded', type: 'ANY', multiple: false },
          { name: 'continued', type: 'ANY', multiple: false }
        ]
      }
    });

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const inputLabels = Array.from(host.querySelectorAll('.llm-row-input .llm-pill-name'))
      .map((element) => element.textContent?.trim());
    const outputLabels = Array.from(host.querySelectorAll('.llm-row-output .llm-pill-name'))
      .map((element) => element.textContent?.trim());

    expect(inputLabels).toEqual(['existing', 'new']);
    expect(outputLabels).toEqual(['noAssessment', 'excluded', 'continued']);
  });

  it('keeps long port labels available as tooltips', () => {
    const longInput = 'input.with.a.very.long.descriptive.label.that.must.not.expand.the.node';
    const longOutput = 'output.with.a.very.long.descriptive.label.that.must.not.expand.the.node';
    fixture.componentRef.setInput('data', {
      ...component.data,
      inputs: { [longInput]: { socket: { name: 'TEXT' } } },
      outputs: { [longOutput]: { socket: { name: 'TEXT' } } },
      data: {
        ...component.data.data,
        inputs: [{ name: longInput, type: 'TEXT', multiple: false }],
        outputs: [{ name: longOutput, type: 'TEXT', multiple: false }]
      }
    });

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.llm-row-input .llm-pill')?.getAttribute('title')).toBe(longInput);
    expect(host.querySelector('.llm-row-output .llm-pill')?.getAttribute('title')).toBe(longOutput);
  });

  it('keeps a flexible port kind-selectable after narrowing it once', () => {
    fixture.componentRef.setInput('data', {
      ...component.data,
      outputs: {
        output: { socket: { name: 'ANY' } }
      },
      data: {
        ...component.data.data,
        outputs: [{ name: 'output', type: 'ANY', multiple: false }]
      }
    });
    fixture.detectChanges();

    expect(component.canTogglePortMultiplicity('output', 'output')).toBe(true);
    expect(component.portSelectableKindOptions('output', 'output').map((option) => option.label)).toEqual(
      expect.arrayContaining(['TEXT', 'FILE', 'JSON'])
    );

    component.onPortKindChange('output', 'output', 'TEXT::single');

    expect(component.portCurrentKindLabel('output', 'output')).toBe('TEXT');
    expect(component.canTogglePortMultiplicity('output', 'output')).toBe(true);
    expect(component.portSelectableKindOptions('output', 'output').map((option) => option.label)).toEqual(
      expect.arrayContaining(['TEXT', 'FILE', 'JSON'])
    );
  });

  it('restores and syncs persisted expanded-mode state', () => {
    const nodeData = component.data.data as Record<string, unknown>;
    nodeData['__focusOpen'] = true;

    (component as any).restorePersistedFocusState();

    expect(component.focusOpen).toBe(true);
    expect(nodeData['__focusOpen']).toBe(true);

    component.toggleFocus();
    expect(component.focusOpen).toBe(false);
    expect(nodeData['__focusOpen']).toBe(false);
  });

  it('has no bias annotation badge when the block has no annotations', () => {
    expect(component.biasAnnotationBadge).toBeNull();
  });

  it('allows bias annotations by default when no descriptor capabilities are known', () => {
    expect(component.biasAnnotationsAllowed).toBe(true);
  });

  it('hides the bias badge and the annotations panel when biasAnnotationsAllowed is false', async () => {
    const blocks = TestBed.inject(BlocksService) as any;
    blocks.peekBlockType.mockReturnValue({
      type: 'EndBlock',
      capabilities: { ...DEFAULT_NODE_CAPABILITIES, biasAnnotationsAllowed: false }
    });
    component.data.data = {
      ...component.data.data,
      typeName: 'EndBlock',
      biasAnnotations: [{ id: 'a1', severity: 'HIGH' }]
    };

    await (component as any).loadSchemaContext();
    fixture.detectChanges();

    expect(component.biasAnnotationsAllowed).toBe(false);
    expect(component.biasAnnotationBadge).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-bias-annotations')).toBeNull();
  });

  it('has no lane badge when the block has no laneId', () => {
    expect(component.laneBadge).toBeNull();
  });

  it('does not render a lane badge while swimlanes are disabled', () => {
    const editorState = TestBed.inject(EditorStateHolder) as any;
    editorState.currentFlow.mockReturnValue({
      data: { lanes: [{ id: 'lane-hr', name: 'HR', order: 0, color: '#F59F00' }] }
    });
    component.data.data = { ...component.data.data, laneId: 'lane-hr' };

    expect(component.laneBadge).toBeNull();
  });

  it('computes the bias annotation badge from the node annotations and the severity catalog', () => {
    const blocks = TestBed.inject(BlocksService) as any;
    blocks.biasAnnotationsDescriptor.mockReturnValue({
      options: {
        severity: [
          { value: 'LOW', label: 'Low' },
          { value: 'HIGH', label: 'High' }
        ]
      }
    });
    component.data.data = {
      ...component.data.data,
      biasAnnotations: [
        { id: 'a1', severity: 'LOW' },
        { id: 'a2', severity: 'HIGH', behavioralProbe: { activationMode: 'PROMPT_DIRECTIVE', instruction: 'do it' } }
      ]
    };

    expect(component.biasAnnotationBadge).toEqual({
      count: 2,
      hasExecutableProbe: true,
      maxSeverityLabel: 'High'
    });
  });

  it('preserves id, position and bias annotations during block regeneration', async () => {
    const blocks = TestBed.inject(BlocksService) as any;
    const replacement = vi.fn().mockResolvedValue(undefined);
    component.data.data = {
      ...component.data.data,
      id: 'old-id', typeName: 'LLMBlock', position: { x: 10, y: 20 },
      biasAnnotations: [{ id: 'bias-1', category: 'DYNAMIC', issue: 'keep me' }],
      __needsServerCreate: true, replaceWithCreatedNode: replacement
    };
    blocks.updateBlock.mockReturnValue(of({
      id: 'generated-id', name: 'Generated', typeName: 'LLMBlock', inputs: [], outputs: [],
      specificConfiguration: {}, position: { x: 99, y: 99 }, biasAnnotations: []
    }));

    (component as any).maybeCreateBlockOnServer();
    await fixture.whenStable();
    expect(replacement).toHaveBeenCalledWith(expect.objectContaining({
      id: 'old-id', position: { x: 10, y: 20 },
      biasAnnotations: [{ id: 'bias-1', category: 'DYNAMIC', issue: 'keep me' }]
    }));
  });
});
