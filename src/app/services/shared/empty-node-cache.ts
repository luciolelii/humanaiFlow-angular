import { finalize, map, Observable, of, shareReplay } from 'rxjs';
import { deepClone } from './deep-clone';

/**
 * Caches "empty" node templates (an empty block/container fresh from the
 * backend) keyed by a cache key (usually the type name), de-duplicating
 * concurrent requests for the same key and handing every caller its own
 * clone with a fresh id so mutating one instance never leaks into another.
 */
export class EmptyNodeCache<T extends { id?: string; position?: unknown }> {
  private readonly cache = new Map<string, T>();
  private readonly pendingRequests = new Map<string, Observable<T>>();

  getOrCreate(cacheKey: string, request: () => Observable<T>): Observable<T> {
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return of(this.cloneWithNewId(cached));
    }

    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending.pipe(map((node) => this.cloneWithNewId(node)));
    }

    const shared = request().pipe(
      map((node) => {
        this.cache.set(cacheKey, this.cloneWithNewId(node));
        return node;
      }),
      finalize(() => {
        this.pendingRequests.delete(cacheKey);
      }),
      shareReplay(1)
    );

    this.pendingRequests.set(cacheKey, shared);

    return shared.pipe(map((node) => this.cloneWithNewId(node)));
  }

  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  private cloneWithNewId(node: T): T {
    const clone = deepClone(node);
    return {
      ...clone,
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      position: undefined
    };
  }
}
