import { Injectable, Signal, signal } from '@angular/core';
import { environment } from '@environment';
import { BiasAnnotationsDescriptor, BlockType, BlockTypeName, FlowBlock } from '@models/flow';
import { BiasCapabilities } from '@models/bias-impact';
import { BlockDraftContext, BlocksCallServiceBase } from './block-call.base';
import { CatalogStore } from '@services/shared/catalog-store';
import { EmptyNodeCache } from '@services/shared/empty-node-cache';
import { PendingSyncCounter } from '@services/shared/pending-sync-counter';
import { catchError, firstValueFrom, Observable, of, tap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BlocksService extends CatalogStore<BlockType> {
  blocksCallService: BlocksCallServiceBase = new environment.blocksCallService();

  protected readonly loadErrorLabel = 'Retrieve blocks types failed';

  private readonly emptyBlockCache = new EmptyNodeCache<FlowBlock>();
  private readonly serverSync = new PendingSyncCounter();

  private readonly _biasAnnotationsDescriptor = signal<BiasAnnotationsDescriptor | null>(null);
  private readonly _biasCapabilities = signal<Record<string, BiasCapabilities>>({});
  private biasDescriptorPromise: Promise<BiasAnnotationsDescriptor> | null = null;

  readonly hasPendingServerSync = this.serverSync.active;
  readonly blockTypes = this.types;
  readonly catalogLoading = this.loading;
  readonly biasAnnotationsDescriptor = this._biasAnnotationsDescriptor.asReadonly();
  readonly biasCapabilities = this._biasCapabilities.asReadonly();

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

  retrieveBiasCapabilities(blockType: string, force = false): Observable<BiasCapabilities> {
    const cached = this._biasCapabilities()[blockType];
    if (cached && !force) return of(cached);

    return this.blocksCallService.retrieveBiasCapabilities(blockType).pipe(
      tap((capabilities) => {
        this._biasCapabilities.update((current) => ({ ...current, [blockType]: capabilities }));
      })
    );
  }

  retrieveBiasCapabilitiesForInstance(blockType: string, block: FlowBlock): Observable<BiasCapabilities> {
    return this.blocksCallService.retrieveBiasCapabilitiesForInstance(blockType, block);
  }

  hasLoadedBlockTypes() {
    return this.hasLoadedTypes();
  }

  getAllBlocksTypes(): Promise<Signal<BlockType[]>> {
    return this.getAllTypes();
  }

  async getBlockType(typeName: BlockTypeName): Promise<BlockType | undefined> {
    return this.getTypeOrFetch((blockType) => blockType.type === typeName);
  }

  peekBlockType(typeName: BlockTypeName): BlockType | null {
    return this.peekType((blockType) => blockType.type === typeName);
  }

  createEmptyBlock(blockType: BlockTypeName, context?: BlockDraftContext) {
    const flowId = typeof context?.flowId === 'string' && context.flowId.trim().length > 0 ? context.flowId.trim() : '';
    const cacheKey = `${String(blockType)}::${flowId}`;

    return this.emptyBlockCache.getOrCreate(cacheKey, () => this.blocksCallService.createEmptyBlock(blockType, context)).pipe(
      catchError((err) => {
        console.error('Create empty block failed', err);
        return throwError(() => err);
      })
    );
  }

  updateBlock(blockId: string, configuration: any, context?: BlockDraftContext) {
    return this.serverSync.track(this.blocksCallService.updateBlock(blockId, configuration, context)).pipe(
      catchError((err) => {
        console.error('Update block failed', err);
        return throwError(() => err);
      })
    );
  }

  protected fetchAll(): Observable<BlockType[]> {
    return this.blocksCallService.retrieveAllBlocksTypes();
  }

  protected override onLoaded(): void {
    this.emptyBlockCache.clear();
  }
}
