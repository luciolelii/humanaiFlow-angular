import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenericNodeComponent } from './generic-node';

describe('GenericNodeComponent', () => {
  let component: GenericNodeComponent;
  let fixture: ComponentFixture<GenericNodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenericNodeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GenericNodeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
