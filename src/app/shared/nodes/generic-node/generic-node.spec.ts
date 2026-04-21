import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlocksService } from '@services/blocks/blocks';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { EditorStateHolder } from '@stores/flow-editor';
import { vi } from 'vitest';

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
            getBlockType: vi.fn().mockResolvedValue(null)
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
});
