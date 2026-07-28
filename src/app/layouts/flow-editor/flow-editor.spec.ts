import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorStateHolder } from '@stores/flow-editor';

import { FlowEditor } from './flow-editor';

describe('FlowEditor', () => {
  let component: FlowEditor;
  let fixture: ComponentFixture<FlowEditor>;
  let editorState: EditorStateHolder;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowEditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlowEditor);
    component = fixture.componentInstance;
    editorState = TestBed.inject(EditorStateHolder);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the refine assistant collapsed when a flow opens without subflows', async () => {
    editorState.currentFlow.set({
      id: 'flow-1',
      name: 'Test Flow',
      visibility: 'PRIVATE',
      author: 'tester',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'DRAFT',
      data: {
        blocks: [],
        containers: [],
        connections: [],
        dependencies: []
      },
      validationErrors: []
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.assistantOpen()).toBe(false);
  });

  it('collapses the refine assistant again when switching to another flow', async () => {
    editorState.currentFlow.set({
      id: 'flow-1',
      name: 'First Flow',
      visibility: 'PRIVATE',
      author: 'tester',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'DRAFT',
      data: {
        blocks: [],
        containers: [],
        connections: [],
        dependencies: []
      },
      validationErrors: []
    });

    fixture.detectChanges();
    await fixture.whenStable();

    component.assistantOpen.set(true);

    editorState.currentFlow.set({
      id: 'flow-2',
      name: 'Second Flow',
      visibility: 'PRIVATE',
      author: 'tester',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'DRAFT',
      data: {
        blocks: [],
        containers: [],
        connections: [],
        dependencies: []
      },
      validationErrors: []
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.assistantOpen()).toBe(false);
  });
});
