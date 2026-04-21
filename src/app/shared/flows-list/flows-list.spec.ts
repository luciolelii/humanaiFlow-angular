import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowsService } from '@services/flows/flows';
import { ListState } from '@stores/list-state';
import { vi } from 'vitest';

import { FlowsList } from './flows-list';

describe('FlowsList', () => {
  let component: FlowsList;
  let fixture: ComponentFixture<FlowsList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowsList],
      providers: [
        ListState,
        {
          provide: FlowsService,
          useValue: {
            flows: signal([]),
            hasLoadedFlows: vi.fn().mockReturnValue(true),
            getAllFlows: vi.fn().mockResolvedValue(signal([]))
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlowsList);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
