import { computed, Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { BlockType, BlockTypeName, FlowBlock } from '@models/flow';
import { BlocksCallServiceBase } from './block-call.base';
import { catchError, finalize, firstValueFrom, map, Observable, of, shareReplay, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BlocksService {
  blocksCallService: BlocksCallServiceBase = new environment.blocksCallService();

  toInit: boolean = true;
  private loadingPromise: Promise<void> | null = null;
  private readonly emptyBlockCache = new Map<string, FlowBlock>();
  private readonly pendingEmptyBlockRequests = new Map<string, Observable<FlowBlock>>();
  private readonly pendingServerSyncCount = signal(0);

  private _blockTypes = signal<BlockType[]>([]);
  readonly hasPendingServerSync = computed(() => this.pendingServerSyncCount() > 0);
  readonly blockTypes = this._blockTypes.asReadonly();

  hasLoadedBlockTypes() {
    return this._blockTypes().length > 0 || !this.toInit;
  }

  async getAllBlocksTypes() {
    if (this.toInit) {
      await this.refresh();
      this.toInit = false;
    }

    return this._blockTypes.asReadonly();
  }

  async refresh(force = false): Promise<void> {
    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = firstValueFrom(this.blocksCallService.retrieveAllBlocksTypes())
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

    return this.loadingPromise;
  }

  async getBlockType(typeName: BlockTypeName) {
    const current = this._blockTypes().find((blockType) => blockType.type === typeName);
    if (current) return current;

    const blockTypes = await firstValueFrom(this.blocksCallService.retrieveAllBlocksTypes());
    this._blockTypes.set(blockTypes);
    this.clearEmptyBlockCache();
    return blockTypes.find((blockType) => blockType.type === typeName);
  }

  createEmptyBlock(blockType: BlockTypeName) {
    const cacheKey = String(blockType);
    const cached = this.emptyBlockCache.get(cacheKey);
    if (cached) {
      return of(this.cloneEmptyBlock(cached));
    }

    const pending = this.pendingEmptyBlockRequests.get(cacheKey);
    if (pending) {
      return pending.pipe(map((block) => this.cloneEmptyBlock(block)));
    }

    const request = this.blocksCallService.createEmptyBlock(blockType).pipe(
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

  updateBlock(blockId: string, configuration: any) {
    this.pendingServerSyncCount.update((count) => count + 1);
    return this.blocksCallService.updateBlock(blockId, configuration).pipe(
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
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
