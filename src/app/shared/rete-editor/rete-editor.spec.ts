import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReteEditor } from './rete-editor';

describe('ReteEditor', () => {
  let component: ReteEditor;
  let fixture: ComponentFixture<ReteEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReteEditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReteEditor);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
