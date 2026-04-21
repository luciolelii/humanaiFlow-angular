import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Ordering } from './ordering';

describe('Ordering', () => {
  let component: Ordering;
  let fixture: ComponentFixture<Ordering>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ordering]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Ordering);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('orderView', { orderBy: null, orderDir: 'asc' });
    fixture.componentRef.setInput('orderFields', []);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
