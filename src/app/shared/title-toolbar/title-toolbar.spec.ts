import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TitleToolbar } from './title-toolbar';

describe('TitleToolbar', () => {
  let component: TitleToolbar;
  let fixture: ComponentFixture<TitleToolbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TitleToolbar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TitleToolbar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
