import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmDialogHostComponent } from './confirm-dialog';

describe('ConfirmDialogHostComponent', () => {
  let component: ConfirmDialogHostComponent;
  let fixture: ComponentFixture<ConfirmDialogHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogHostComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogHostComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
