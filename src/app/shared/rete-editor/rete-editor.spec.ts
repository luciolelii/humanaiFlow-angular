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

  it('does not render the dormant swimlane UI', () => {
    fixture.componentRef.setInput('flowData', {
      blocks: [
        { id: 'b1', name: 'Review', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock', laneId: 'hr' },
        { id: 'b2', name: 'Approve', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'HumanInteractionBlock', laneId: 'hr' }
      ],
      containers: [],
      connections: [],
      dependencies: [],
      lanes: [{ id: 'hr', name: 'HR', order: 0, color: '#0f766e' }]
    });
    component.laneTransform.set({ x: -900, y: 40, k: 0.75 });
    fixture.detectChanges();

    expect(component.swimlanesEnabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.rete-lanes-layer')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.rete-lane-headers')).toBeNull();
  });
});
