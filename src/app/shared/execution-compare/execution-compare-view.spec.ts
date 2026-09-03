import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TaskExecution } from '@models/task-execution';
import { ExecutionCompareViewComponent } from './execution-compare-view';

function execution(id: string, response: string, runNumber: number): TaskExecution {
  return {
    id,
    name: id,
    creationTime: 1,
    runNumber,
    context: {
      inputs: {},
      result: { 's1:response': response, 's2:response': 'identical' },
      errors: {},
      warnings: {},
      waitingSteps: [],
      status: 'SUCCESS',
      steps: {
        s1: {
          id: 's1', status: 'COMPLETED', simulated: false,
          node: { id: 's1', name: 'Evaluate', nodeFamily: 'block', typeName: 'LLMBlock', inputs: [], outputs: [{ name: 'response', type: 'TEXT' }], specificConfiguration: {} },
          inputs: [], outputs: [{ descriptor: { name: 'response', type: 'TEXT' }, connected: false }]
        },
        s2: {
          id: 's2', status: 'COMPLETED', simulated: false,
          node: { id: 's2', name: 'Steady', nodeFamily: 'block', typeName: 'LLMBlock', inputs: [], outputs: [{ name: 'response', type: 'TEXT' }], specificConfiguration: {} },
          inputs: [], outputs: [{ descriptor: { name: 'response', type: 'TEXT' }, connected: false }]
        }
      }
    }
  } as unknown as TaskExecution;
}

describe('ExecutionCompareViewComponent', () => {
  let fixture: ComponentFixture<ExecutionCompareViewComponent>;
  let component: ExecutionCompareViewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExecutionCompareViewComponent] }).compileComponents();
    fixture = TestBed.createComponent(ExecutionCompareViewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('left', execution('e1', 'Score 7 of 10', 1));
    fixture.componentRef.setInput('right', execution('e2', 'Score 5 of 10', 2));
    fixture.detectChanges();
  });

  it('shows only the differing node by default, and all of them on request', () => {
    // The differences are what the view exists for; on a long flow the rest is noise.
    expect(component.visibleNodes().map((node) => node.title)).toEqual(['Evaluate']);

    component.toggleOnlyDifferences();
    fixture.detectChanges();
    expect(component.visibleNodes().map((node) => node.title).sort()).toEqual(['Evaluate', 'Steady']);
  });

  it('names both runs by their run number', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Run #1');
    expect(text).toContain('Run #2');
  });

  it('marks the changed words on each side, and only those', () => {
    const parts = component.parts('Score 7 of 10', 'Score 5 of 10', 'left');
    expect(parts.filter((part) => part.kind === 'added')).toHaveLength(0);
    expect(parts.some((part) => part.kind === 'removed' && part.text.includes('7'))).toBe(true);

    const right = component.parts('Score 7 of 10', 'Score 5 of 10', 'right');
    expect(right.filter((part) => part.kind === 'removed')).toHaveLength(0);
    expect(right.some((part) => part.kind === 'added' && part.text.includes('5'))).toBe(true);
  });

  it('does not diff a value that is identical on both sides', () => {
    expect(component.parts('same', 'same', 'left')).toEqual([{ kind: 'same', text: 'same' }]);
  });

  it('warns that model output varies on its own', () => {
    // Without this the view invites reading every difference as a change in behaviour.
    expect(fixture.nativeElement.textContent).toContain('varies');
  });

  it('says so when two runs share no node, instead of showing everything as replaced', () => {
    const other = execution('e3', 'x', 3);
    (other.context as any).steps = {
      z9: {
        id: 'z9', status: 'COMPLETED', simulated: false,
        node: { id: 'z9', name: 'New node', nodeFamily: 'block', typeName: 'LLMBlock', inputs: [], outputs: [], specificConfiguration: {} },
        inputs: [], outputs: []
      }
    };
    fixture.componentRef.setInput('right', other);
    fixture.detectChanges();

    expect(component.comparison()?.disjoint).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('no node in common');
  });

  it('reports two identical runs as such rather than showing an empty page', () => {
    fixture.componentRef.setInput('right', execution('e2', 'Score 7 of 10', 2));
    fixture.detectChanges();

    expect(component.visibleNodes()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('same values on every node');
  });

  it('emits on close so the host can restore the run the user had open', () => {
    const closed = vi.fn();
    component.closed.subscribe(closed);
    fixture.nativeElement.querySelectorAll('button')[1].click();
    expect(closed).toHaveBeenCalled();
  });
});
