import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { GraphSelectionService } from '@services/graph-selection/graph-selection';
import { EditorStateHolder } from '@stores/flow-editor';
import { vi } from 'vitest';

import { ReteEditor } from './rete-editor';

describe('ReteEditor', () => {
  let component: ReteEditor;
  let fixture: ComponentFixture<ReteEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReteEditor],
      providers: [
        {
          provide: EditorStateHolder,
          useValue: {
            selectedBlockIds: vi.fn().mockReturnValue([]),
            stopDraggingSelectedBlocks: vi.fn(),
            updateData: vi.fn(),
            clearBlockSelection: vi.fn(),
            setSelectedBlocks: vi.fn()
          }
        },
        {
          provide: BlocksService,
          useValue: {}
        },
        {
          provide: ContainersService,
          useValue: {}
        },
        {
          provide: GraphSelectionService,
          useValue: {
            deleteConnectionRequestTick: vi.fn(),
            selectedConnectionId: vi.fn().mockReturnValue(null),
            clearConnectionSelection: vi.fn()
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReteEditor);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('flowId', 'flow-1');
    fixture.componentRef.setInput('flowData', {
      blocks: [],
      containers: [],
      connections: [],
      dependencies: [],
      globalInputs: []
    });
    (component as any).reloadEditor = vi.fn().mockResolvedValue(undefined);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
