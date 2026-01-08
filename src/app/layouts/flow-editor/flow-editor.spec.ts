import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlowEditor } from './flow-editor';

describe('FlowEditor', () => {
  let component: FlowEditor;
  let fixture: ComponentFixture<FlowEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowEditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlowEditor);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
