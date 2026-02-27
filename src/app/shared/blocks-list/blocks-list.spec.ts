import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlocksList } from './blocks-list';

describe('BlocksList', () => {
  let component: BlocksList;
  let fixture: ComponentFixture<BlocksList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlocksList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BlocksList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
