import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { EditableExecutionInput, TaskExecutionInputsPanelComponent } from './task-execution-inputs-panel';

function makeInput(overrides: Partial<EditableExecutionInput> = {}): EditableExecutionInput {
  return {
    key: 'global:role',
    scope: 'global',
    nodeId: null,
    inputName: 'role',
    title: 'Flow',
    subtitle: 'role',
    type: 'TEXT',
    multiple: false,
    value: '',
    ...overrides
  };
}

async function build(inputs: EditableExecutionInput[], options: {
  pendingKeys?: string[];
  missing?: string[];
  saving?: Record<string, boolean>;
  readOnly?: boolean;
} = {}) {
  await TestBed.configureTestingModule({ imports: [TaskExecutionInputsPanelComponent] }).compileComponents();

  const fixture = TestBed.createComponent(TaskExecutionInputsPanelComponent);
  fixture.componentRef.setInput('editableInputs', inputs);
  fixture.componentRef.setInput('pendingKeys', options.pendingKeys ?? []);
  fixture.componentRef.setInput('missingGlobalInputNames', options.missing ?? []);
  fixture.componentRef.setInput('savingInputs', options.saving ?? {});
  fixture.componentRef.setInput('readOnly', options.readOnly ?? false);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('TaskExecutionInputsPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reports how many flow inputs are still missing', async () => {
    const fixture = await build(
      [makeInput({ key: 'g:a', inputName: 'a' }), makeInput({ key: 'g:b', inputName: 'b' })],
      { missing: ['b'] }
    );

    expect(fixture.componentInstance.providedGlobalCount()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('1 of 2 provided');
  });

  it('marks only the inputs the backend still considers unsatisfied', async () => {
    const provided = makeInput({ key: 'g:a', inputName: 'a' });
    const missing = makeInput({ key: 'g:b', inputName: 'b' });
    const fixture = await build([provided, missing], { missing: ['b'] });

    expect(fixture.componentInstance.isMissing(provided)).toBe(false);
    expect(fixture.componentInstance.isMissing(missing)).toBe(true);
  });

  it('never marks a node input as missing, since only globals gate the start', async () => {
    const nodeInput = makeInput({ key: 'n:x', scope: 'node', inputName: 'x', title: 'Reviewer' });
    const fixture = await build([nodeInput], { missing: ['x'] });

    expect(fixture.componentInstance.isMissing(nodeInput)).toBe(false);
  });

  it('offers a single save for every pending edit', async () => {
    const fixture = await build(
      [makeInput({ key: 'g:a', inputName: 'a' }), makeInput({ key: 'g:b', inputName: 'b' })],
      { pendingKeys: ['g:a', 'g:b'] }
    );

    expect(fixture.componentInstance.pendingCount()).toBe(2);
    expect(fixture.componentInstance.canSubmitAll()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('2 unsaved changes');

    const submitted = vi.fn();
    fixture.componentInstance.submitAllInputs.subscribe(submitted);
    fixture.componentInstance.submitAll();
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it('says everything is saved, and refuses to save, with nothing pending', async () => {
    const fixture = await build([makeInput()], {});

    expect(fixture.componentInstance.canSubmitAll()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('All changes saved');

    const submitted = vi.fn();
    fixture.componentInstance.submitAllInputs.subscribe(submitted);
    fixture.componentInstance.submitAll();
    expect(submitted).not.toHaveBeenCalled();
  });

  it('does not let a second save start while one is in flight', async () => {
    const fixture = await build([makeInput({ key: 'g:a', inputName: 'a' })],
      { pendingKeys: ['g:a'], saving: { 'g:a': true } });

    expect(fixture.componentInstance.anySaving()).toBe(true);
    expect(fixture.componentInstance.canSubmitAll()).toBe(false);
  });

  it('hides the save bar when the panel is read-only', async () => {
    const fixture = await build([makeInput()], { readOnly: true, pendingKeys: ['global:role'] });

    expect(fixture.nativeElement.querySelector('.inputs-panel-savebar')).toBeNull();
    expect(fixture.componentInstance.canSubmitAll()).toBe(false);
  });

  it('renders one row per item of a multi-value input, plus a way to add one', async () => {
    const fixture = await build([makeInput({ multiple: true, type: 'TEXT', value: ['one', 'two'] })]);

    expect(fixture.nativeElement.querySelectorAll('.inputs-panel-row').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.inputs-panel-add')).not.toBeNull();
    // The type label says it is a list, which is what the editor is offering.
    expect(fixture.nativeElement.textContent).toContain('TEXT[]');
  });
});
