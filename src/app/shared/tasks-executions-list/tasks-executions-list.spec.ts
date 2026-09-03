import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TaskExecutionGroupListItem, TasksExecutionsListComponent } from './tasks-executions-list';

function group(id: string, runIds: string[]): TaskExecutionGroupListItem {
  return {
    id,
    sourceFlowId: `flow-${id}`,
    name: `Group ${id}`,
    executionCount: runIds.length,
    lastExecutionTime: 1,
    lastExecutionTimeLabel: 'now',
    latestRunNumber: runIds.length,
    latestExecutionId: runIds[runIds.length - 1],
    executions: runIds.map((runId, index) => ({
      id: runId,
      title: runId,
      flowName: 'Flow',
      status: 'SUCCESS',
      startedAt: 'now',
      creationTime: index + 1,
      runNumber: index + 1,
      kind: 'RUN'
    }))
  } as unknown as TaskExecutionGroupListItem;
}

describe('TasksExecutionsListComponent comparison picking', () => {
  let fixture: ComponentFixture<TasksExecutionsListComponent>;
  let component: TasksExecutionsListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TasksExecutionsListComponent] }).compileComponents();
    fixture = TestBed.createComponent(TasksExecutionsListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('groups', [group('g1', ['e1', 'e2', 'e3'])]);
    fixture.componentRef.setInput('selectedExecutionId', 'e1');
    fixture.detectChanges();
  });

  it('needs two runs before it will compare', () => {
    component.toggleCompareMode('g1');
    expect(component.canCompare()).toBe(false);

    component.toggleComparePick('e1');
    expect(component.canCompare()).toBe(false);

    component.toggleComparePick('e2');
    expect(component.canCompare()).toBe(true);
  });

  it('emits the pair, oldest pick first', () => {
    const compared = vi.fn();
    component.compareRequested.subscribe(compared);

    component.toggleCompareMode('g1');
    component.toggleComparePick('e1');
    component.toggleComparePick('e2');
    component.submitCompare();

    expect(compared).toHaveBeenCalledWith({ leftId: 'e1', rightId: 'e2' });
  });

  it('replaces the older pick on a third click rather than refusing it', () => {
    // Refusing would leave the user hunting for which box to clear.
    component.toggleCompareMode('g1');
    component.toggleComparePick('e1');
    component.toggleComparePick('e2');
    component.toggleComparePick('e3');

    const compared = vi.fn();
    component.compareRequested.subscribe(compared);
    component.submitCompare();

    expect(compared).toHaveBeenCalledWith({ leftId: 'e2', rightId: 'e3' });
  });

  it('unticks a pick when it is clicked again', () => {
    component.toggleCompareMode('g1');
    component.toggleComparePick('e1');
    component.toggleComparePick('e1');

    expect(component.isComparePick('e1')).toBe(false);
    expect(component.comparePickCount()).toBe(0);
  });

  it('does not disturb which run is open', () => {
    // Ticking a box must not navigate away from what the user is reading.
    const selected = vi.fn();
    component.executionSelected.subscribe(selected);

    component.toggleCompareMode('g1');
    component.toggleComparePick('e2');

    expect(selected).not.toHaveBeenCalled();
    expect(component.selectedExecutionId()).toBe('e1');
  });

  it('confines comparison to one group, and clears the picks on leaving', () => {
    // Runs of different flows share no node ids, so comparing across groups is meaningless.
    component.toggleCompareMode('g1');
    component.toggleComparePick('e1');
    expect(component.isComparing('g1')).toBe(true);
    expect(component.isComparing('g2')).toBe(false);

    component.toggleCompareMode('g1');
    expect(component.isComparing('g1')).toBe(false);
    expect(component.comparePickCount()).toBe(0);
  });

  it('refuses to emit without a full pair', () => {
    const compared = vi.fn();
    component.compareRequested.subscribe(compared);

    component.toggleCompareMode('g1');
    component.toggleComparePick('e1');
    component.submitCompare();

    expect(compared).not.toHaveBeenCalled();
  });
});
