import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupHolder } from './group-holder';

describe('GroupHolder', () => {
  let component: GroupHolder;
  let fixture: ComponentFixture<GroupHolder>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupHolder]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GroupHolder);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
