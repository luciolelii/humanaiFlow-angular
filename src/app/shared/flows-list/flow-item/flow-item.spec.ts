import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { FlowsService } from '@services/flows/flows';
import { EditorStateHolder } from '@stores/flow-editor';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { FlowItem } from './flow-item';

describe('FlowItem', () => {
  let component: FlowItem;
  let fixture: ComponentFixture<FlowItem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowItem],
      providers: [
        provideRouter([]),
        {
          provide: Authorization,
          useValue: {
            loggedInUser: vi.fn().mockReturnValue({ username: 'author' })
          }
        },
        {
          provide: ConfirmDialogService,
          useValue: {
            open: vi.fn().mockResolvedValue(true)
          }
        },
        {
          provide: FlowsService,
          useValue: {
            cloneFlow: vi.fn().mockReturnValue(of(null)),
            deleteFlow: vi.fn().mockReturnValue(of(null))
          }
        },
        {
          provide: EditorStateHolder,
          useValue: {
            currentFlow: signal(null),
            isDirty: vi.fn().mockReturnValue(false),
            openDocument: vi.fn(),
            closeDocument: vi.fn()
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlowItem);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('flow', {
      id: 'flow-1',
      name: 'Test flow',
      visibility: 'PRIVATE',
      data: { blocks: [], containers: [], connections: [], dependencies: [] },
      author: 'author',
      createdAt: new Date(),
      status: 'DRAFT',
      updatedAt: new Date()
    });
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('puts every action behind one menu, leaving the row quiet', () => {
    // The card used to carry four icon buttons, which overflowed a 320px sidebar.
    const triggers = fixture.nativeElement.querySelectorAll('.flow-item-menu-trigger');
    expect(triggers.length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(1);
  });

  it('shows visibility as an indicator rather than a disabled button', () => {
    const indicator = fixture.nativeElement.querySelector('.flow-item-visibility');
    expect(indicator).not.toBeNull();
    expect(indicator.tagName.toLowerCase()).toBe('mat-icon');
  });
});
