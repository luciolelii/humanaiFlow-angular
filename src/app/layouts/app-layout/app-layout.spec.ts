import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AppLayout } from './app-layout';

describe('AppLayout', () => {
  let component: AppLayout;
  let fixture: ComponentFixture<AppLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppLayout],
      providers: [
        provideRouter([]),
        {
          provide: Authorization,
          useValue: {
            loggedInUser: signal(null),
            logout: vi.fn().mockReturnValue(of(null)),
            changePassword: vi.fn().mockReturnValue(of(null))
          }
        },
        {
          provide: BlocksService,
          useValue: {
            getAllBlocksTypes: vi.fn().mockResolvedValue(signal([]))
          }
        },
        {
          provide: ContainersService,
          useValue: {
            getAllContainerTypes: vi.fn().mockResolvedValue(signal([]))
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppLayout);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
