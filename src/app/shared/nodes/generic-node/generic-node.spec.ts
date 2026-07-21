import { ComponentFixture, TestBed } from '@angular/core/testing';
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
