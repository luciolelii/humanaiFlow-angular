import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlocksService } from '@services/blocks/blocks';
import { ListState } from '@stores/list-state';
import { vi } from 'vitest';

import { BlocksList } from './blocks-list';

describe('BlocksList', () => {
  let component: BlocksList;
  let fixture: ComponentFixture<BlocksList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlocksList],
      providers: [
        ListState,
        {
          provide: BlocksService,
          useValue: {
            catalogLoading: signal(false),
            blockTypes: signal([]),
            hasLoadedBlockTypes: vi.fn().mockReturnValue(true),
            getAllBlocksTypes: vi.fn().mockResolvedValue(signal([]))
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BlocksList);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
