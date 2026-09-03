import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { EditableExecutionInput, TaskExecutionInputsPanelComponent, parseJsonArrayInput } from './task-execution-inputs-panel';

function makeInput(overrides: Partial<EditableExecutionInput> = {}): EditableExecutionInput {
  const input: EditableExecutionInput = {
    key: 'global:role',
    scope: 'global',
    nodeId: null,
    inputName: 'role',
    title: 'Flow',
    subtitle: 'role',
    type: 'TEXT',
    multiple: false,
    value: '',
    provided: false,
    ...overrides
  };
  // The panel labels an input by its subtitle, so keep the two in step unless a test sets both.
  return overrides.inputName && !overrides.subtitle
    ? { ...input, subtitle: overrides.inputName }
    : input;
}

async function build(inputs: EditableExecutionInput[], options: {
  pendingKeys?: string[];
  saving?: Record<string, boolean>;
  readOnly?: boolean;
} = {}) {
  await TestBed.configureTestingModule({ imports: [TaskExecutionInputsPanelComponent] }).compileComponents();

  const fixture = TestBed.createComponent(TaskExecutionInputsPanelComponent);
  fixture.componentRef.setInput('editableInputs', inputs);
  fixture.componentRef.setInput('pendingKeys', options.pendingKeys ?? []);
  fixture.componentRef.setInput('savingInputs', options.saving ?? {});
  fixture.componentRef.setInput('readOnly', options.readOnly ?? false);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('TaskExecutionInputsPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('counts every input, node ones included, since all of them are required', async () => {
    // A step without its manual input never reaches READY, so a node input blocks the start just
    // as a global one does and must be part of the tally.
    const fixture = await build([
      makeInput({ key: 'g:a', inputName: 'a', provided: true }),
      makeInput({ key: 'g:b', inputName: 'b' }),
      makeInput({ key: 'n:c', scope: 'node', inputName: 'c', title: 'Reviewer' })
    ]);

    expect(fixture.componentInstance.providedCount()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('1 of 3 provided');
  });

  it('marks exactly the inputs with nothing stored', async () => {
    const provided = makeInput({ key: 'g:a', inputName: 'a', provided: true });
    const missing = makeInput({ key: 'n:b', scope: 'node', inputName: 'b', title: 'Reviewer' });
    const fixture = await build([provided, missing]);

    expect(fixture.componentInstance.isMissing(provided)).toBe(false);
    expect(fixture.componentInstance.isMissing(missing)).toBe(true);
  });

  it('names the two groups after the domain: global and node inputs', async () => {
    const fixture = await build([
      makeInput({ key: 'g:a', inputName: 'a' }),
      makeInput({ key: 'n:b', scope: 'node', inputName: 'b', title: 'Reviewer' })
    ]);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Global inputs');
    expect(text).toContain('Node inputs');
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

  it('badges each group with how many it is still missing', async () => {
    const fixture = await build([
      makeInput({ key: 'g:a', inputName: 'a', provided: true }),
      makeInput({ key: 'g:b', inputName: 'b' }),
      makeInput({ key: 'n:c', scope: 'node', inputName: 'c', title: 'Reviewer', provided: true })
    ]);

    expect(fixture.componentInstance.globalMissingCount()).toBe(1);
    expect(fixture.componentInstance.nodeMissingCount()).toBe(0);

    const badges = fixture.nativeElement.querySelectorAll('.inputs-panel-badge');
    expect(badges[0].classList).toContain('inputs-panel-badge-missing');
    expect(badges[0].textContent.trim()).toBe('1');
    expect(badges[1].classList).toContain('inputs-panel-badge-done');
  });

  it('opens a group that is still missing something and collapses a complete one', async () => {
    // What needs attention is what you see, without having to expand anything first.
    const fixture = await build([
      makeInput({ key: 'g:a', inputName: 'a' }),
      makeInput({ key: 'n:b', scope: 'node', inputName: 'b', title: 'Reviewer', provided: true })
    ]);

    expect(fixture.componentInstance.globalsOpen()).toBe(true);
    expect(fixture.componentInstance.nodesOpen()).toBe(false);
  });

  it('lets the user override either default, in both directions', async () => {
    const fixture = await build([
      makeInput({ key: 'g:a', inputName: 'a' }),
      makeInput({ key: 'n:b', scope: 'node', inputName: 'b', title: 'Reviewer', provided: true })
    ]);

    fixture.componentInstance.toggleGlobals();
    fixture.componentInstance.toggleNodes();
    fixture.detectChanges();

    expect(fixture.componentInstance.globalsOpen()).toBe(false);
    expect(fixture.componentInstance.nodesOpen()).toBe(true);
  });

  it('keeps the save bar reachable even with both groups collapsed', async () => {
    const fixture = await build([makeInput({ key: 'g:a', inputName: 'a', provided: true })],
      { pendingKeys: ['g:a'] });

    expect(fixture.componentInstance.globalsOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.inputs-panel-savebar')).not.toBeNull();
    expect(fixture.componentInstance.canSubmitAll()).toBe(true);
  });

  it('offers the JSON import only on a multi-value input', async () => {
    const fixture = await build([
      makeInput({ key: 'g:single', inputName: 'positionTitle' }),
      makeInput({ key: 'g:many', inputName: 'interviewQuestions', multiple: true, value: [''] })
    ]);

    const buttons = fixture.nativeElement.querySelectorAll('.inputs-panel-import');
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute('aria-label')).toContain('interviewQuestions');
  });

  it('imports a pasted array as the input items, through the normal pending change', async () => {
    const input = makeInput({ key: 'g:many', inputName: 'interviewQuestions', multiple: true, value: [''] });
    const fixture = await build([input]);
    const changed = vi.fn();
    fixture.componentInstance.textInputChange.subscribe(changed);

    fixture.componentInstance.openImport(input, new Event('click'));
    fixture.componentInstance.importText.set('["first question", "second question"]');
    fixture.componentInstance.applyImport();

    // Emitted like any other edit, so the single Save still governs when it is sent.
    expect(changed).toHaveBeenCalledWith({ input, value: ['first question', 'second question'] });
    expect(fixture.componentInstance.importTarget()).toBeNull();
  });

  it('keeps the dialog open and explains why when the text will not do', async () => {
    const input = makeInput({ key: 'g:many', inputName: 'q', multiple: true, value: [''] });
    const fixture = await build([input]);
    const changed = vi.fn();
    fixture.componentInstance.textInputChange.subscribe(changed);

    fixture.componentInstance.openImport(input, new Event('click'));
    fixture.componentInstance.importText.set('not json at all');
    fixture.componentInstance.applyImport();

    expect(fixture.componentInstance.importTarget()).not.toBeNull();
    expect(fixture.componentInstance.importError()).toContain('Not valid JSON');
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('parseJsonArrayInput', () => {
  it('accepts the array of interview questions it exists for', () => {
    const pasted = `[
      "Describe a Java and Spring Boot service you built or maintained. What was your specific contribution?",
      "Give an example of a REST API you designed or improved. How did you handle errors, validation, and API versioning?",
      "Describe a performance or reliability problem involving a relational database. What did you do and what was the measurable result?",
      "Explain how you have used Docker and CI/CD in a production or project environment.",
      "Describe a situation where you collaborated with product, QA, or other engineers to deliver a backend feature. What was the outcome?"
    ]`;

    const result = parseJsonArrayInput(pasted);

    expect(result.error).toBeNull();
    expect(result.values).toHaveLength(5);
    expect(result.values?.[3]).toContain('Docker and CI/CD');
  });

  it('rejects text that is not JSON, quoting the reason', () => {
    expect(parseJsonArrayInput('["unterminated').error).toContain('Not valid JSON');
  });

  it('rejects valid JSON that is not an array', () => {
    expect(parseJsonArrayInput('{"a": 1}').error).toContain('Expected a JSON array');
    expect(parseJsonArrayInput('"just a string"').error).toContain('Expected a JSON array');
  });

  it('rejects an empty array rather than wiping the items', () => {
    expect(parseJsonArrayInput('[]').error).toContain('empty');
  });

  it('rejects nothing pasted at all', () => {
    expect(parseJsonArrayInput('   ').error).toContain('Paste a JSON array');
  });

  it('names the offending item when one is not a text value', () => {
    // Silently coercing an object to "[object Object]" would be worse than refusing.
    expect(parseJsonArrayInput('["ok", {"a": 1}]').error).toBe(
      'Every item must be a text value; item 2 is an object.');
    expect(parseJsonArrayInput('["ok", ["nested"]]').error).toContain('item 2 is an array');
    expect(parseJsonArrayInput('["ok", null]').error).toContain('item 2 is null');
  });

  it('converts plain numbers and booleans to text', () => {
    expect(parseJsonArrayInput('[1, true]').values).toEqual(['1', 'true']);
  });
});
