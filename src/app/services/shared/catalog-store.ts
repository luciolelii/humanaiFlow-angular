import { Signal, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

/**
 * Shared loading/caching state machine for a "type catalog" (block types,
 * container types): a signal holding the last-loaded list, a single in-flight
 * load shared across concurrent callers, and automatic retry after a failed
 * initial load (a first failed fetch no longer leaves the catalog permanently
 * empty — the next call retries instead of silently returning nothing).
 *
 * Subclasses provide `fetchAll()` (the HTTP call) and the domain-specific
 * public method names (`getAllBlocksTypes`, `getAllContainerTypes`, ...) that
 * delegate to the protected methods here.
 */
export abstract class CatalogStore<T> {
  private toInit = true;
  private loadingPromise: Promise<void> | null = null;
  private readonly _loading = signal(false);
  private readonly _types = signal<T[]>([]);

  protected readonly loading = this._loading.asReadonly();
  protected readonly types = this._types.asReadonly();

  /** Fetches the full catalog from the backend. */
  protected abstract fetchAll(): Observable<T[]>;
  /** Label used in the `console.error` logged when a fetch fails. */
  protected abstract readonly loadErrorLabel: string;
  /** Called whenever a fresh catalog is stored, e.g. to invalidate derived caches. */
  protected onLoaded(): void {}

  protected hasLoadedTypes(): boolean {
    return this._types().length > 0 || (!this.toInit && !this.loadingPromise);
  }

  protected async getAllTypes(): Promise<Signal<T[]>> {
    if (this.toInit) {
      this.toInit = false;
      try {
        await this.refresh();
      } catch (err) {
        this.toInit = true;
        throw err;
      }
    } else if (this.loadingPromise) {
      await this.loadingPromise;
    }

    return this.types;
  }

  protected async refresh(force = false): Promise<void> {
    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = firstValueFrom(this.fetchAll())
      .finally(() => {
        this._loading.set(false);
      })
      .then((types) => {
        this._types.set(types);
        this.onLoaded();
      })
      .catch((err) => {
        console.error(this.loadErrorLabel, err);
        throw err;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    this._loading.set(true);

    return this.loadingPromise;
  }

  protected async getTypeOrFetch(predicate: (type: T) => boolean): Promise<T | undefined> {
    const current = this._types().find(predicate);
    if (current) return current;

    if (this.loadingPromise) {
      await this.loadingPromise;
      return this._types().find(predicate);
    }

    this._loading.set(true);
    const types = await firstValueFrom(this.fetchAll()).finally(() => this._loading.set(false));
    this._types.set(types);
    this.onLoaded();
    return types.find(predicate);
  }

  protected peekType(predicate: (type: T) => boolean): T | null {
    return this._types().find(predicate) ?? null;
  }
}
