import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorSidebar } from './editor-sidebar';

describe('EditorSidebar', () => {
  let component: EditorSidebar;
  let fixture: ComponentFixture<EditorSidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorSidebar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditorSidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
