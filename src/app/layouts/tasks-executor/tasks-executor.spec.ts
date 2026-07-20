import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { HumanInteractionDialogService } from '@services/dialogs/human-interaction-dialog';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { TasksExecutor } from './tasks-executor';

describe('TasksExecutor', () => {
  let component: TasksExecutor;
  let fixture: ComponentFixture<TasksExecutor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TasksExecutor],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({})),
            snapshot: {
              queryParamMap: convertToParamMap({})
            }
          }
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn().mockResolvedValue(true)
          }
        },
        {
          provide: TaskExecutionsService,
          useValue: {
            taskExecutions: signal([]),
            taskExecutionGroups: signal([]),
            pendingExecutionCreation: signal(false),
            init: vi.fn(),
            deleteExecution: vi.fn().mockReturnValue(of(null)),
            rerunExecution: vi.fn().mockReturnValue(of(null))
          }
        },
        {
          provide: ConfirmDialogService,
          useValue: {
            open: vi.fn().mockResolvedValue(true)
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
        },
        {
          provide: HumanInteractionDialogService,
          useValue: {
            state: signal(null),
            close: vi.fn(),
            update: vi.fn()
          }
        },
        {
          provide: NodeSettingsDialogService,
          useValue: {
            open: vi.fn().mockResolvedValue(null)
          }
        },
        {
          provide: FieldRetriever,
          useValue: {
            retrieveText: vi.fn(),
            retrieveSchema: vi.fn(),
            retrieveStructuredData: vi.fn()
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TasksExecutor);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
