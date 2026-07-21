import { signal } from '@angular/core';
import { vi } from 'vitest';
import { scheduleSignalClear } from './temporary-signal';

describe('scheduleSignalClear', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('clears the signal back to null after the default delay', () => {
    const message = signal<string | null>('Saved.');
    scheduleSignalClear(message);

    expect(message()).toBe('Saved.');
    vi.advanceTimersByTime(3000);
    expect(message()).toBeNull();
  });

  it('respects a custom delay', () => {
    const message = signal<string | null>('Saved.');
    scheduleSignalClear(message, 5000);

    vi.advanceTimersByTime(3000);
    expect(message()).toBe('Saved.');
    vi.advanceTimersByTime(2000);
    expect(message()).toBeNull();
  });
});
