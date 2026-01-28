import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Llm } from './llm';

describe('Llm', () => {
  let component: Llm;
  let fixture: ComponentFixture<Llm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Llm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Llm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
