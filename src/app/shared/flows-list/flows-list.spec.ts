import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlowsList } from './flows-list';

describe('FlowsList', () => {
  let component: FlowsList;
  let fixture: ComponentFixture<FlowsList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowsList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlowsList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
