import { normalizeExecutionOutcomes } from './task-execution';

describe('normalizeExecutionOutcomes', () => {
  it('maps the backend outcome shape', () => {
    const outcomes = normalizeExecutionOutcomes([
      { stepId: 's1', code: 'APPROVED', label: 'Approved', payload: 'the answer', timestamp: 42 }
    ]);

    expect(outcomes).toEqual([
      { stepId: 's1', code: 'APPROVED', label: 'Approved', payload: 'the answer', timestamp: 42 }
    ]);
  });

  it('falls back to the code when no label is given', () => {
    expect(normalizeExecutionOutcomes([{ code: 'DONE' }])[0].label).toBe('DONE');
  });

  it('keeps an outcome that carries a payload but no code', () => {
    // The payload is the flow's answer, so it must never be dropped for want of a label.
    const outcomes = normalizeExecutionOutcomes([{ payload: { value: 1 } }]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].payload).toEqual({ value: 1 });
  });

  it('drops entries that carry neither a code nor a payload', () => {
    expect(normalizeExecutionOutcomes([{}, null, 'nope'])).toEqual([]);
  });

  it('returns nothing when the field is absent or not a list', () => {
    expect(normalizeExecutionOutcomes(undefined)).toEqual([]);
    expect(normalizeExecutionOutcomes({ code: 'X' })).toEqual([]);
  });

  it('normalizes a missing payload to null rather than undefined', () => {
    // The template distinguishes "no value reached this End" from "the value was null".
    expect(normalizeExecutionOutcomes([{ code: 'DONE' }])[0].payload).toBeNull();
  });
});
