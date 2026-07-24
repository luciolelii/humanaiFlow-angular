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
import { normalizeExecutionStatus, TaskExecution } from '@models/task-execution';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { findInteractiveSubflowTargets, TasksExecutor } from './tasks-executor';

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
            followedExecutions: signal({}),
            pendingExecutionCreation: signal(false),
            init: vi.fn(),
            retrieveExecution: vi.fn().mockReturnValue(of(null)),
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

  it('follows only container steps waiting for a child subflow', () => {
    const execution = {
      id: 'parent-1',
      name: 'Parent',
      creationTime: 1,
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: [],
        status: 'WAITING',
        waitingSteps: ['container-1'],
        steps: {
          'container-1': {
            id: 'container-1',
            status: 'WAITING_FOR_SUBFLOW',
            simulated: false,
            activeInnerExecutionId: 'child-2',
            containerContinuationPhase: 'WAITING_FOR_SUBFLOW',
            containerIterationIndex: 2,
            node: {
              id: 'container-1',
              name: 'Review loop',
              inputs: [],
              outputs: [],
              typeName: 'LoopContainer',
              nodeFamily: 'container',
              specificConfiguration: {}
            }
          },
          'human-1': {
            id: 'human-1',
            status: 'WAITING_FOR_INTERACTION',
            simulated: false
          }
        }
      }
    } satisfies TaskExecution;

    expect(findInteractiveSubflowTargets(execution)).toEqual([
      expect.objectContaining({
        childExecutionId: 'child-2',
        parentStepId: 'container-1',
        containerName: 'Review loop',
        iterationIndex: 2
      })
    ]);
  });

  it('detects a new child id as the next container iteration', () => {
    const step = {
      id: 'iterator-1',
      status: 'WAITING_FOR_SUBFLOW',
      simulated: false,
      activeInnerExecutionId: 'child-1',
      containerIterationIndex: 1
    };
    const execution = {
      id: 'parent-1',
      name: 'Parent',
      creationTime: 1,
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: [],
        status: 'WAITING',
        waitingSteps: ['iterator-1'],
        steps: { 'iterator-1': step }
      }
    } satisfies TaskExecution;

    expect(findInteractiveSubflowTargets(execution)[0]?.childExecutionId).toBe('child-1');
    const nextExecution = {
      ...execution,
      context: {
        ...execution.context,
        steps: {
          'iterator-1': {
            ...step,
            activeInnerExecutionId: 'child-2',
            containerIterationIndex: 2
          }
        }
      }
    } satisfies TaskExecution;
    expect(findInteractiveSubflowTargets(nextExecution)[0]).toEqual(expect.objectContaining({
      childExecutionId: 'child-2',
      iterationIndex: 2
    }));
    expect(normalizeExecutionStatus('WAITING_FOR_SUBFLOW')).toBe('WAITING');
  });
});
