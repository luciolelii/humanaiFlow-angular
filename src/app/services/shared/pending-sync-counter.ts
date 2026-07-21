import { computed, signal } from '@angular/core';
import { finalize, Observable } from 'rxjs';

/** Tracks how many "sync this to the server" requests are currently in flight. */
export class PendingSyncCounter {
  private readonly count = signal(0);
  readonly active = computed(() => this.count() > 0);

  track<T>(source: Observable<T>): Observable<T> {
    this.count.update((current) => current + 1);
    return source.pipe(
      finalize(() => this.count.update((current) => Math.max(0, current - 1)))
    );
  }
}
