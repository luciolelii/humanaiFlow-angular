import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlocksService } from '@services/blocks/blocks';
import { ListState } from '@stores/list-state';
import { vi } from 'vitest';

import { BlocksList } from './blocks-list';

const BLOCK_TYPES = [
  {
    type: 'LLMBlock',
    family: 'block',
    description: 'Runs a single prompt against an LLM and produces a textual response.',
    userInteractive: false,
    configurationType: null,
    configurationClass: null,
    schema: null
  }
];

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
            blockTypes: signal(BLOCK_TYPES),
            hasLoadedBlockTypes: vi.fn().mockReturnValue(true),
            getAllBlocksTypes: vi.fn().mockResolvedValue(signal(BLOCK_TYPES))
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

  it('keeps every card draggable, which is the whole point of the palette', () => {
    const card = fixture.nativeElement.querySelector('.blocks-list-card');
    expect(card).not.toBeNull();
    expect(card.getAttribute('draggable')).toBe('true');
  });

  it('hides the description until the info button asks for it', () => {
    // Descriptions run to several hundred characters; showing them all turns the palette into a wall
    // of text, and a tooltip could not render them readably either.
    expect(fixture.nativeElement.querySelector('.blocks-list-card-copy')).toBeNull();

    fixture.nativeElement.querySelector('.blocks-list-card-info').click();
    fixture.detectChanges();

    const copy = fixture.nativeElement.querySelector('.blocks-list-card-copy');
    expect(copy.textContent).toContain('Runs a single prompt');

    fixture.nativeElement.querySelector('.blocks-list-card-info').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.blocks-list-card-copy')).toBeNull();
  });

  it('shows one description at a time, so the list cannot unfold into a wall of text', () => {
    component.toggleInfo('LLMBlock', new Event('click'));
    component.toggleInfo('SomethingElse', new Event('click'));

    expect(component.infoOpenFor()).toBe('SomethingElse');
  });
});
