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

/** The shape the API actually sends: bias and mitigation live in separate collections. */
function normalBias(): any {
  return {
    experimentId: null,
    mode: 'NORMAL',
    activeBiasAnnotationIdsByNode: {},
    activeMitigationAnnotationIdsByNode: {},
    biasSubflowActivatedContainerIds: [],
    mitigationSubflowActivatedContainerIds: [],
    externalSideEffectPolicy: 'BLOCK',
    externalSideEffectsConfirmed: false
  };
}

function variantBias(overrides: Record<string, unknown>): any {
  return { ...normalBias(), mode: 'EXPERIMENT', experimentId: 'x', ...overrides };
}

describe('TasksExecutor', () => {
  let component: TasksExecutor;
  let fixture: ComponentFixture<TasksExecutor>;
  /** Hoisted so a test can feed the component a run; the component only exposes it read-only. */
  let taskExecutions: ReturnType<typeof signal<TaskExecution[]>>;

  beforeEach(async () => {
    taskExecutions = signal<TaskExecution[]>([]);
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
            taskExecutions,
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

  it('does not let the tree panel be opened onto nothing', () => {
    // No run selected, so no container steps: the toggle is inert rather than opening an empty panel.
    expect(component.executionTreeAvailable()).toBe(false);

    component.toggleExecutionTree();
    expect(component.executionTreeOpen()).toBe(true);
  });

  it('toggles the execution tree panel once a run has a subtree', () => {
    component.selectedExecutionId.set('parent-1');
    taskExecutions.set([{
      id: 'parent-1',
      name: 'Parent',
      creationTime: 1,
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: {},
        status: 'RUNNING',
        waitingSteps: [],
        steps: {
          'step-1': {
            id: 'step-1',
            status: 'RUNNING',
            simulated: false,
            node: { nodeFamily: 'container' }
          }
        }
      }
    } as any]);

    expect(component.executionTreeAvailable()).toBe(true);

    component.toggleExecutionTree();
    expect(component.executionTreeOpen()).toBe(false);

    component.toggleExecutionTree();
    expect(component.executionTreeOpen()).toBe(true);
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

  it('tells a bias variant apart from a plain rerun', () => {
    // The backend sets a bias context on every execution, defaulting to NORMAL, so presence alone
    // marked everything a variant. Only the mode distinguishes them.
    const plain = {
      id: 'e1', name: 'Plain', creationTime: 1, runNumber: 1,
      biasExecutionContext: normalBias(),
      context: { inputs: {}, result: {}, errors: {}, warnings: {}, status: 'SUCCESS', waitingSteps: [], steps: {} }
    };
    const rerun = { ...plain, id: 'e2', name: 'Rerun', runNumber: 2, rerunOfExecutionId: 'e1' };
    const variant = {
      ...plain, id: 'e3', name: 'Variant', runNumber: 3, rerunOfExecutionId: 'e1',
      biasExecutionContext: variantBias({ activeBiasAnnotationIdsByNode: { n1: ['a1'] } })
    };

    taskExecutions.set([]);
    const group = {
      id: 'g1', sourceFlowId: 'f1', name: 'Group', firstExecutionId: 'e1', latestExecutionId: 'e3',
      creationTime: 1, lastExecutionTime: 3, executionCount: 3,
      executions: [plain, rerun, variant]
    } as any;

    const rows = (component as any).toGroupListItem(group).executions;

    expect(rows.map((row: any) => row.kind)).toEqual(['RUN', 'RERUN', 'BIAS_VARIANT']);
    expect(rows[2].biasDirection).toBe('BIAS');
    // A rerun names the run it came from by number, not by uuid.
    expect(rows[1].rerunOfRunNumber).toBe(1);
    expect(rows[0].rerunOfRunNumber).toBeNull();
  });

  it('reports a mitigation-only variant as such', () => {
    const variant = {
      id: 'e1', name: 'Mitigated', creationTime: 1, runNumber: 1,
      biasExecutionContext: variantBias({ activeMitigationAnnotationIdsByNode: { n1: ['a1'] } }),
      context: { inputs: {}, result: {}, errors: {}, warnings: {}, status: 'SUCCESS', waitingSteps: [], steps: {} }
    };

    const rows = (component as any).toGroupListItem({
      id: 'g1', sourceFlowId: 'f1', name: 'G', firstExecutionId: 'e1', latestExecutionId: 'e1',
      creationTime: 1, lastExecutionTime: 1, executionCount: 1, executions: [variant]
    } as any).executions;

    expect(rows[0].biasDirection).toBe('MITIGATION');
  });

  it('reports a variant that ran with both directions as mixed', () => {
    const both = {
      id: 'e1', name: 'Both', creationTime: 1, runNumber: 1, rerunOfExecutionId: 'e0',
      biasExecutionContext: variantBias({
        activeBiasAnnotationIdsByNode: { n1: ['a1'] },
        activeMitigationAnnotationIdsByNode: { n2: ['a2'] }
      }),
      context: { inputs: {}, result: {}, errors: {}, warnings: {}, status: 'SUCCESS', waitingSteps: [], steps: {} }
    };

    const rows = (component as any).toGroupListItem({
      id: 'g1', sourceFlowId: 'f1', name: 'G', firstExecutionId: 'e1', latestExecutionId: 'e1',
      creationTime: 1, lastExecutionTime: 1, executionCount: 1, executions: [both]
    } as any).executions;

    expect(rows[0].kind).toBe('BIAS_VARIANT');
    expect(rows[0].biasDirection).toBe('MIXED');
  });

  it('detects a direction activated only through a container subflow', () => {
    // An intervention can be turned on for a whole subflow instead of per annotation.
    const viaSubflow = {
      id: 'e1', name: 'Subflow mitigation', creationTime: 1, runNumber: 1,
      biasExecutionContext: variantBias({ mitigationSubflowActivatedContainerIds: ['c1'] }),
      context: { inputs: {}, result: {}, errors: {}, warnings: {}, status: 'SUCCESS', waitingSteps: [], steps: {} }
    };

    const rows = (component as any).toGroupListItem({
      id: 'g1', sourceFlowId: 'f1', name: 'G', firstExecutionId: 'e1', latestExecutionId: 'e1',
      creationTime: 1, lastExecutionTime: 1, executionCount: 1, executions: [viaSubflow]
    } as any).executions;

    expect(rows[0].biasDirection).toBe('MITIGATION');
  });
});
