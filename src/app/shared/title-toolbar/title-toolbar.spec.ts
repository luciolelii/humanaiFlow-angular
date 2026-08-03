import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Flow } from '@models/flow';
import { EditorStateHolder } from '@stores/flow-editor';

import { TitleToolbar } from './title-toolbar';

function makeFlow(): Flow {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    visibility: 'PRIVATE',
    author: 'tester',
    createdAt: new Date(),
    status: 'DRAFT',
    updatedAt: new Date(),
    data: { blocks: [], containers: [], connections: [], dependencies: [], globalInputs: [], lanes: [] }
  };
}

describe('TitleToolbar', () => {
  let component: TitleToolbar;
  let fixture: ComponentFixture<TitleToolbar>;
  let editorState: EditorStateHolder;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TitleToolbar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TitleToolbar);
    component = fixture.componentInstance;
    editorState = TestBed.inject(EditorStateHolder);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides parent metadata and global inputs while editing a subflow', async () => {
    editorState.currentFlow.set({
      ...makeFlow(),
      description: 'Main flow description',
      data: {
        blocks: [],
        containers: [{
          id: 'container-1',
          name: 'Container',
          typeName: 'LoopContainer',
          nodeFamily: 'container',
          inputs: [],
          outputs: [],
          specificConfiguration: {
            subFlow: {
              blocks: [],
              containers: [],
              connections: [],
              dependencies: [],
              globalInputs: [{ name: 'topic', type: 'TEXT', multiple: false }],
              lanes: []
            }
          }
        }],
        connections: [],
        dependencies: [],
        globalInputs: [{ name: 'rootInput', type: 'TEXT', multiple: false }],
        lanes: []
      }
    });
    editorState.openSubflow([{ containerId: 'container-1', configurationPath: 'subFlow' }]);

    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('Description:');
    expect(host.textContent).not.toContain('Global Inputs');
    expect(host.textContent).not.toContain('Author:');
    expect(host.textContent).not.toContain('Created:');
    expect(host.textContent).not.toContain('Updated:');
    expect(host.textContent).not.toContain('Main flow:');
  });

  describe('lanes', () => {
    beforeEach(() => {
      editorState.currentFlow.set(makeFlow());
    });

    it('adds a lane with an assigned order and a palette color', () => {
      component.addLane();
      expect(component.creatingLane()).toBe(true);
      expect(component.draftLane().order).toBe(0);
      expect(component.draftLane().color).toBeTruthy();

      component.updateDraftLane({ name: 'Hiring Manager' });
      component.saveNewLane();

      expect(component.creatingLane()).toBe(false);
      expect(component.lanes()).toEqual([
        expect.objectContaining({ name: 'Hiring Manager', order: 0 })
      ]);
    });

    it('rejects an empty or duplicate lane name', () => {
      component.addLane();
      component.updateDraftLane({ name: '' });
      expect(component.canSaveDraftLane()).toBe(false);

      component.updateDraftLane({ name: 'HR' });
      component.saveNewLane();

      component.addLane();
      component.updateDraftLane({ name: 'hr' });
      expect(component.canSaveDraftLane()).toBe(false);
    });

    it('clears laneId on nodes that referenced a removed lane', () => {
      component.addLane();
      component.updateDraftLane({ name: 'HR' });
      component.saveNewLane();
      const laneId = component.lanes()[0].id;

      editorState.currentFlow.update((flow) => flow ? {
        ...flow,
        data: {
          ...flow.data,
          blocks: [{ id: 'b1', name: 'b1', inputs: [], outputs: [], specificConfiguration: {}, typeName: 'LLMBlock', laneId }]
        }
      } : flow);

      component.removeLane(0);

      expect(component.lanes()).toEqual([]);
      expect(editorState.currentFlow()?.data.blocks[0].laneId).toBeNull();
    });

    it('reorders lanes and renumbers their order', () => {
      component.addLane();
      component.updateDraftLane({ name: 'First' });
      component.saveNewLane();
      component.addLane();
      component.updateDraftLane({ name: 'Second' });
      component.saveNewLane();

      component.moveLane(1, -1);

      expect(component.lanes().map((lane) => lane.name)).toEqual(['Second', 'First']);
      expect(component.lanes().map((lane) => lane.order)).toEqual([0, 1]);
    });
  });
});
