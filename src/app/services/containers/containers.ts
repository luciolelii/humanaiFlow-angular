import { computed, Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { BlockType, BlockTypeName, FlowData, FlowNode } from '@models/flow';
import { catchError, finalize, firstValueFrom, map, Observable, of, shareReplay, throwError } from 'rxjs';
import { ContainersCallServiceBase } from './container-call.base';

@Injectable({
  providedIn: 'root',
})
export class ContainersService {
  containersCallService: ContainersCallServiceBase = new environment.containersCallService();

  toInit = true;
  private loadingPromise: Promise<void> | null = null;
  private readonly emptyContainerCache = new Map<string, FlowNode>();
  private readonly pendingEmptyContainerRequests = new Map<string, Observable<FlowNode>>();
  private readonly pendingServerSyncCount = signal(0);

  private _containerTypes = signal<BlockType[]>([]);
  readonly hasPendingServerSync = computed(() => this.pendingServerSyncCount() > 0);
  readonly containerTypes = this._containerTypes.asReadonly();

  hasLoadedContainerTypes() {
    return this._containerTypes().length > 0 || !this.toInit;
  }

  async getAllContainerTypes() {
    if (this.toInit) {
      this.toInit = false;
      await this.refresh();
    }

    return this._containerTypes.asReadonly();
  }

  async refresh(force = false): Promise<void> {
    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = firstValueFrom(this.containersCallService.retrieveAllContainerTypes())
      .then((containerTypes) => {
        this._containerTypes.set(containerTypes);
        this.clearEmptyContainerCache();
      })
      .catch((err) => {
        console.error('Retrieve container types failed', err);
        throw err;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  async getContainerType(typeName: BlockTypeName) {
    const current = this._containerTypes().find((containerType) => containerType.type === typeName);
    if (current) return current;

    const containerTypes = await firstValueFrom(this.containersCallService.retrieveAllContainerTypes());
    this._containerTypes.set(containerTypes);
    this.clearEmptyContainerCache();
    return containerTypes.find((containerType) => containerType.type === typeName);
  }

  peekContainerType(typeName: BlockTypeName) {
    return this._containerTypes().find((containerType) => containerType.type === typeName) ?? null;
  }

  createEmptyContainer(containerType: BlockTypeName) {
    const cacheKey = String(containerType);
    const cached = this.emptyContainerCache.get(cacheKey);
    if (cached) {
      return of(this.cloneEmptyNode(cached));
    }

    const pending = this.pendingEmptyContainerRequests.get(cacheKey);
    if (pending) {
      return pending.pipe(map((container) => this.cloneEmptyNode(container)));
    }

    const request = this.containersCallService.createEmptyContainer(containerType).pipe(
      map((container) => {
        this.emptyContainerCache.set(cacheKey, this.cloneEmptyNode(container));
        return container;
      }),
      finalize(() => {
        this.pendingEmptyContainerRequests.delete(cacheKey);
      }),
      shareReplay(1)
    );

    this.pendingEmptyContainerRequests.set(cacheKey, request);

    return request.pipe(
      map((container) => this.cloneEmptyNode(container)),
      catchError((err) => {
        console.error('Create empty container failed', err);
        return throwError(() => err);
      })
    );
  }

  createContainer(containerId: string, configuration: any) {
    this.pendingServerSyncCount.update((count) => count + 1);
    return this.containersCallService.createContainer(containerId, configuration).pipe(
      finalize(() => {
        this.pendingServerSyncCount.update((count) => Math.max(0, count - 1));
      }),
      catchError((err) => {
        console.error('Create container failed', err);
        return throwError(() => err);
      })
    );
  }

  validateContainerSubflow(subFlow: FlowData, validationUrl?: string | null) {
    return this.containersCallService.validateContainerSubflow(this.deepClone(subFlow), validationUrl).pipe(
      catchError((err) => {
        console.error('Validate container subflow failed', err);
        return throwError(() => err);
      })
    );
  }

  private clearEmptyContainerCache() {
    this.emptyContainerCache.clear();
    this.pendingEmptyContainerRequests.clear();
  }

  private cloneEmptyNode(node: FlowNode): FlowNode {
    const clone = this.deepClone(node);
    return {
      ...clone,
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      position: undefined
    };
  }

  private deepClone<T>(value: T): T {
    if (typeof globalThis.structuredClone === 'function') {
      try {
        return globalThis.structuredClone(value);
      } catch {
        // Some cached payloads may carry non-cloneable runtime fields.
      }
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
