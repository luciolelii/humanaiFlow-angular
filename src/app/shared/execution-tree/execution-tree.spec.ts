import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskExecution } from '@models/task-execution';
import { BlockType } from '@models/flow';
import { ContainersService } from '@services/containers/containers';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ExecutionTreeComponent } from './execution-tree';

function containerStep(overrides: Partial<TaskExecution['context']['steps'][string]> = {}) {
  return {
    id: 'container-1',
    status: 'SUCCESS',
    simulated: false,
    node: { id: 'container-1', name: 'Loop container', nodeFamily: 'container' as const, typeName: 'LoopContainer', inputs: [], outputs: [], specificConfiguration: {} },
    activeInnerExecutionId: 'iteration-3',
    containerIterationIndex: 3,
    ...overrides
  };
}

function rootExecution(steps: TaskExecution['context']['steps'] = {}): TaskExecution {
  return {
    id: 'root-1',
    name: 'Root run',
    creationTime: 1,
    context: {
      inputs: {},
      result: {},
      errors: {},
      warnings: {},
      waitingSteps: [],
      status: 'RUNNING',
      steps
    }
  };
}

function iteration(id: string, index: number, subflowRole: string | null = null): TaskExecution {
  return {
    id,
    name: `Iteration ${index}`,
    creationTime: index,
    executionKind: 'SUBFLOW',
    parentExecutionId: 'root-1',
    parentStepId: 'container-1',
    parentIterationIndex: index,
    subflowRole: subflowRole ?? undefined,
    context: {
      inputs: {},
      result: {},
      errors: {},
      warnings: {},
      waitingSteps: [],
      status: 'SUCCESS',
      steps: {}
    }
  };
}

describe('ExecutionTreeComponent', () => {
  let fixture: ComponentFixture<ExecutionTreeComponent>;
  let component: ExecutionTreeComponent;
  const retrieveStepIterations = vi.fn();

  beforeEach(async () => {
    retrieveStepIterations.mockReset();
    await TestBed.configureTestingModule({
      imports: [ExecutionTreeComponent],
      providers: [
        { provide: ContainersService, useValue: { peekContainerType: () => null as BlockType | null } },
        { provide: TaskExecutionsService, useValue: { retrieveStepIterations } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ExecutionTreeComponent);
    component = fixture.componentInstance;
  });

  it('reports no container content for a flat execution with only block steps', () => {
    const execution = rootExecution({
      'block-1': { id: 'block-1', status: 'SUCCESS', simulated: false, node: { id: 'block-1', name: 'LLM', nodeFamily: 'block', typeName: 'LLMBlock', inputs: [], outputs: [], specificConfiguration: {} } }
    });
    fixture.componentRef.setInput('rootExecution', execution);
    fixture.detectChanges();

    expect(component.hasContainerContent()).toBe(false);
    expect(component.containerSteps(execution)).toEqual([]);
  });

  it('lists container steps and flags WAITING_FOR_SUBFLOW ones', () => {
    const execution = rootExecution({ 'container-1': containerStep({ status: 'WAITING_FOR_SUBFLOW' }) });
    fixture.componentRef.setInput('rootExecution', execution);
    fixture.detectChanges();

    const steps = component.containerSteps(execution);
    expect(steps).toEqual([{
      stepId: 'container-1',
      name: 'Loop container',
      status: 'WAITING_FOR_SUBFLOW',
      waitingForSubflow: true
    }]);
    expect(component.hasContainerContent()).toBe(true);
  });

  it('lazily loads iterations only once, in order, on expand', () => {
    retrieveStepIterations.mockReturnValue(of([iteration('it-1', 1, 'MAIN'), iteration('it-2', 2, 'MAIN')]));
    const execution = rootExecution({ 'container-1': containerStep() });
    fixture.componentRef.setInput('rootExecution', execution);
    fixture.detectChanges();

    expect(component.isStepLoaded('root-1', 'container-1')).toBe(false);

    component.toggleStep('root-1', 'container-1');
    fixture.detectChanges();

    expect(retrieveStepIterations).toHaveBeenCalledWith('root-1', 'container-1');
    expect(retrieveStepIterations).toHaveBeenCalledTimes(1);
    expect(component.isStepExpanded('root-1', 'container-1')).toBe(true);
    expect(component.iterationsFor('root-1', 'container-1').map((it) => it.id)).toEqual(['it-1', 'it-2']);

    component.toggleStep('root-1', 'container-1');
    component.toggleStep('root-1', 'container-1');
    fixture.detectChanges();

    expect(retrieveStepIterations).toHaveBeenCalledTimes(1);
  });

  it('filters out GUARD subflows from a LoopContainer iteration list', () => {
    retrieveStepIterations.mockReturnValue(of([
      iteration('main-1', 1, 'MAIN'),
      iteration('guard-1', 1, 'GUARD'),
      iteration('main-2', 2, 'MAIN'),
      iteration('guard-2', 2, 'GUARD')
    ]));
    const execution = rootExecution({ 'container-1': containerStep() });
    fixture.componentRef.setInput('rootExecution', execution);
    fixture.detectChanges();

    component.toggleStep('root-1', 'container-1');
    fixture.detectChanges();

    expect(component.iterationsFor('root-1', 'container-1').map((it) => it.id)).toEqual(['main-1', 'main-2']);
  });

  it('surfaces a friendly message when the step is not a container', () => {
    retrieveStepIterations.mockReturnValue(throwError(() => ({ status: 400 })));
    const execution = rootExecution({ 'container-1': containerStep() });
    fixture.componentRef.setInput('rootExecution', execution);
    fixture.detectChanges();

    component.toggleStep('root-1', 'container-1');
    fixture.detectChanges();

    expect(component.stepError('root-1', 'container-1')).toBe('This step is not an iterating container.');
    expect(component.isStepLoading('root-1', 'container-1')).toBe(false);
  });

  it('emits the selected execution id on click', () => {
    const execution = rootExecution({ 'container-1': containerStep() });
    fixture.componentRef.setInput('rootExecution', execution);
    fixture.detectChanges();

    const selected = vi.fn();
    component.executionSelected.subscribe(selected);
    component.selectExecution(execution);

    expect(selected).toHaveBeenCalledWith({ executionId: 'root-1' });
  });

  it('resets expansion and cached iterations when the root execution id changes', () => {
    retrieveStepIterations.mockReturnValue(of([iteration('it-1', 1, 'MAIN')]));
    const execution = rootExecution({ 'container-1': containerStep() });
    fixture.componentRef.setInput('rootExecution', execution);
    fixture.detectChanges();

    component.toggleStep('root-1', 'container-1');
    fixture.detectChanges();
    expect(component.isStepLoaded('root-1', 'container-1')).toBe(true);

    const otherExecution = rootExecution({ 'container-2': containerStep({ id: 'container-2' }) });
    otherExecution.id = 'root-2';
    fixture.componentRef.setInput('rootExecution', otherExecution);
    fixture.detectChanges();

    expect(component.isStepLoaded('root-1', 'container-1')).toBe(false);
    expect(component.isExecutionExpanded('root-2')).toBe(true);
  });
});
