import { computed, Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { BiasAnnotationsDescriptor, BlockType, BlockTypeName, FlowBlock } from '@models/flow';
import { BlockDraftContext, BlocksCallServiceBase } from './block-call.base';
import { catchError, finalize, firstValueFrom, map, Observable, of, shareReplay, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BlocksService {
  blocksCallService: BlocksCallServiceBase = new environment.blocksCallService();

  toInit: boolean = true;
  private loadingPromise: Promise<void> | null = null;
  private readonly _catalogLoading = signal(false);
  private readonly emptyBlockCache = new Map<string, FlowBlock>();
  private readonly pendingEmptyBlockRequests = new Map<string, Observable<FlowBlock>>();
  private readonly pendingServerSyncCount = signal(0);

  private _blockTypes = signal<BlockType[]>([]);
  private readonly _biasAnnotationsDescriptor = signal<BiasAnnotationsDescriptor | null>(null);
  private biasDescriptorPromise: Promise<BiasAnnotationsDescriptor> | null = null;
  readonly hasPendingServerSync = computed(() => this.pendingServerSyncCount() > 0);
  readonly blockTypes = this._blockTypes.asReadonly();
  readonly catalogLoading = this._catalogLoading.asReadonly();
  readonly biasAnnotationsDescriptor = this._biasAnnotationsDescriptor.asReadonly();

  async getBiasAnnotationsDescriptor(force = false): Promise<BiasAnnotationsDescriptor> {
    const cached = this._biasAnnotationsDescriptor();
    if (cached && !force) return cached;
    if (this.biasDescriptorPromise && !force) return this.biasDescriptorPromise;

    this.biasDescriptorPromise = firstValueFrom(this.blocksCallService.retrieveBiasAnnotationsDescriptor())
      .then((descriptor) => {
        this._biasAnnotationsDescriptor.set(descriptor);
        return descriptor;
      })
      .finally(() => { this.biasDescriptorPromise = null; });
    return this.biasDescriptorPromise;
  }

  hasLoadedBlockTypes() {
    return this._blockTypes().length > 0 || (!this.toInit && !this.loadingPromise);
  }

  async getAllBlocksTypes() {
    if (this.toInit) {
      this.toInit = false;
      await this.refresh();
    } else if (this.loadingPromise) {
      await this.loadingPromise;
    }

    return this._blockTypes.asReadonly();
  }

  async refresh(force = false): Promise<void> {
    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = firstValueFrom(this.blocksCallService.retrieveAllBlocksTypes())
      .finally(() => {
        this._catalogLoading.set(false);
      })
      .then((blockTypes) => {
        this._blockTypes.set(blockTypes);
        this.clearEmptyBlockCache();
      })
      .catch((err) => {
        console.error('Retrieve blocks types failed', err);
        throw err;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    this._catalogLoading.set(true);

    return this.loadingPromise;
  }

  async getBlockType(typeName: BlockTypeName) {
    const current = this._blockTypes().find((blockType) => blockType.type === typeName);
    if (current) return current;

    if (this.loadingPromise) {
      await this.loadingPromise;
      return this._blockTypes().find((blockType) => blockType.type === typeName);
    }

    this._catalogLoading.set(true);
    const blockTypes = await firstValueFrom(this.blocksCallService.retrieveAllBlocksTypes())
      .finally(() => {
        this._catalogLoading.set(false);
      });
    this._blockTypes.set(blockTypes);
    this.clearEmptyBlockCache();
    return blockTypes.find((blockType) => blockType.type === typeName);
  }

  peekBlockType(typeName: BlockTypeName) {
    return this._blockTypes().find((blockType) => blockType.type === typeName) ?? null;
  }

  createEmptyBlock(blockType: BlockTypeName, context?: BlockDraftContext) {
    const flowId = typeof context?.flowId === 'string' && context.flowId.trim().length > 0 ? context.flowId.trim() : '';
    const cacheKey = `${String(blockType)}::${flowId}`;
    const cached = this.emptyBlockCache.get(cacheKey);
    if (cached) {
      return of(this.cloneEmptyBlock(cached));
    }

    const pending = this.pendingEmptyBlockRequests.get(cacheKey);
    if (pending) {
      return pending.pipe(map((block) => this.cloneEmptyBlock(block)));
    }

    const request = this.blocksCallService.createEmptyBlock(blockType, context).pipe(
      map((block) => {
        this.emptyBlockCache.set(cacheKey, this.cloneEmptyBlock(block));
        return block;
      }),
      finalize(() => {
        this.pendingEmptyBlockRequests.delete(cacheKey);
      }),
      shareReplay(1)
    );

    this.pendingEmptyBlockRequests.set(cacheKey, request);

    return request.pipe(
      map((block) => this.cloneEmptyBlock(block)),
      catchError((err) => {
        console.error('Create empty block failed', err);
        return throwError(() => err);
      })
    );
  }

  updateBlock(blockId: string, configuration: any, context?: BlockDraftContext) {
    this.pendingServerSyncCount.update((count) => count + 1);
    return this.blocksCallService.updateBlock(blockId, configuration, context).pipe(
      finalize(() => {
        this.pendingServerSyncCount.update((count) => Math.max(0, count - 1));
      }),
      catchError((err) => {
        console.error('Update block failed', err);
        return throwError(() => err);
      })
    );
  }

  private clearEmptyBlockCache() {
    this.emptyBlockCache.clear();
    this.pendingEmptyBlockRequests.clear();
  }

  private cloneEmptyBlock(block: FlowBlock): FlowBlock {
    const clone = this.deepClone(block);
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
