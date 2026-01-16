import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlowItem } from './flow-item';

describe('FlowItem', () => {
  let component: FlowItem;
  let fixture: ComponentFixture<FlowItem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowItem]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlowItem);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
