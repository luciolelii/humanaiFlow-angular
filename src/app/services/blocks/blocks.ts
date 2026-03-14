import { computed, Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { BlockType, BlockTypeName, FlowData, FlowNode, NodeFamily } from '@models/flow';
import { BlocksCallServiceBase } from './block-call.base';
import { catchError, finalize, firstValueFrom, forkJoin, map, Observable, of, shareReplay, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BlocksService {
  blocksCallService: BlocksCallServiceBase = new environment.blocksCallService();

  toInit: boolean = true;
  private loadingPromise: Promise<void> | null = null;
  private readonly emptyBlockCache = new Map<string, FlowNode>();
  private readonly pendingEmptyBlockRequests = new Map<string, Observable<FlowNode>>();
  private readonly pendingServerSyncCount = signal(0);

  private _blockTypes = signal<BlockType[]>([]);
  readonly hasPendingServerSync = computed(() => this.pendingServerSyncCount() > 0);

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

    this.loadingPromise = firstValueFrom(forkJoin({
      blocks: this.blocksCallService.retrieveAllBlocksTypes(),
      containers: this.blocksCallService.retrieveAllContainerTypes()
    }))
      .then(({ blocks, containers }) => {
        this._blockTypes.set([...blocks, ...containers]);
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

    const { blocks, containers } = await firstValueFrom(forkJoin({
      blocks: this.blocksCallService.retrieveAllBlocksTypes(),
      containers: this.blocksCallService.retrieveAllContainerTypes()
    }));
    const blockTypes = [...blocks, ...containers];
    this._blockTypes.set(blockTypes);
    this.clearEmptyBlockCache();
    return blockTypes.find((blockType) => blockType.type === typeName);
  }

  createEmptyBlock(blockType: BlockTypeName, family?: NodeFamily) {
    const cacheKey = `${family ?? 'auto'}:${String(blockType)}`;
    const cached = this.emptyBlockCache.get(cacheKey);
    if (cached) {
      return of(this.cloneEmptyNode(cached));
    }

    const pending = this.pendingEmptyBlockRequests.get(cacheKey);
    if (pending) {
      return pending.pipe(map((block) => this.cloneEmptyNode(block)));
    }

    const request = this.createEmptyNodeRequest(blockType, family).pipe(
      map((block) => {
        this.emptyBlockCache.set(cacheKey, this.cloneEmptyNode(block));
        return block;
      }),
      finalize(() => {
        this.pendingEmptyBlockRequests.delete(cacheKey);
      }),
      shareReplay(1)
    );

    this.pendingEmptyBlockRequests.set(cacheKey, request);

    return request.pipe(
      map((block) => this.cloneEmptyNode(block)),
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

  validateContainerSubflow(subFlow: FlowData) {
    return this.blocksCallService.validateContainerSubflow(this.deepClone(subFlow)).pipe(
      catchError((err) => {
        console.error('Validate container subflow failed', err);
        return throwError(() => err);
      })
    );
  }

  private clearEmptyBlockCache() {
    this.emptyBlockCache.clear();
    this.pendingEmptyBlockRequests.clear();
  }

  private createEmptyNodeRequest(blockType: BlockTypeName, family?: NodeFamily): Observable<FlowNode> {
    const normalizedFamily = family ?? this._blockTypes().find((type) => type.type === blockType)?.family ?? 'block';
    return normalizedFamily === 'container'
      ? this.blocksCallService.createEmptyContainer(blockType)
      : this.blocksCallService.createEmptyBlock(blockType);
  }

  private cloneEmptyNode(block: FlowNode): FlowNode {
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
