import { Injectable, Signal, signal } from '@angular/core';
import { environment } from '@environment';
import { BlockType, BlockTypeName, FlowContainer, FlowData, FlowNode } from '@models/flow';
import { BiasCapabilities } from '@models/bias-impact';
import { catchError, Observable, of, tap, throwError } from 'rxjs';
import { ContainersCallServiceBase } from './container-call.base';
import { CatalogStore } from '@services/shared/catalog-store';
import { EmptyNodeCache } from '@services/shared/empty-node-cache';
import { PendingSyncCounter } from '@services/shared/pending-sync-counter';
import { deepClone } from '@services/shared/deep-clone';

@Injectable({
  providedIn: 'root',
})
export class ContainersService extends CatalogStore<BlockType> {
  containersCallService: ContainersCallServiceBase = new environment.containersCallService();

  protected readonly loadErrorLabel = 'Retrieve container types failed';

  private readonly emptyContainerCache = new EmptyNodeCache<FlowNode>();
  private readonly serverSync = new PendingSyncCounter();

  private readonly _biasCapabilities = signal<Record<string, BiasCapabilities>>({});

  readonly hasPendingServerSync = this.serverSync.active;
  readonly containerTypes = this.types;
  readonly catalogLoading = this.loading;
  readonly biasCapabilities = this._biasCapabilities.asReadonly();

  retrieveBiasCapabilities(containerType: string, force = false): Observable<BiasCapabilities> {
    const cached = this._biasCapabilities()[containerType];
    if (cached && !force) return of(cached);

    return this.containersCallService.retrieveBiasCapabilities(containerType).pipe(
      tap((capabilities) => {
        this._biasCapabilities.update((current) => ({ ...current, [containerType]: capabilities }));
      })
    );
  }

  retrieveBiasCapabilitiesForInstance(containerType: string, container: FlowContainer): Observable<BiasCapabilities> {
    return this.containersCallService.retrieveBiasCapabilitiesForInstance(containerType, container);
  }

  hasLoadedContainerTypes() {
    return this.hasLoadedTypes();
  }

  getAllContainerTypes(): Promise<Signal<BlockType[]>> {
    return this.getAllTypes();
  }

  async getContainerType(typeName: BlockTypeName): Promise<BlockType | undefined> {
    return this.getTypeOrFetch((containerType) => containerType.type === typeName);
  }

  peekContainerType(typeName: BlockTypeName): BlockType | null {
    return this.peekType((containerType) => containerType.type === typeName);
  }

  createEmptyContainer(containerType: BlockTypeName) {
    const cacheKey = String(containerType);

    return this.emptyContainerCache.getOrCreate(cacheKey, () => this.containersCallService.createEmptyContainer(containerType)).pipe(
      catchError((err) => {
        console.error('Create empty container failed', err);
        return throwError(() => err);
      })
    );
  }

  createContainer(containerId: string, configuration: any) {
    return this.serverSync.track(this.containersCallService.createContainer(containerId, configuration)).pipe(
      catchError((err) => {
        console.error('Create container failed', err);
        return throwError(() => err);
      })
    );
  }

  validateContainerSubflow(subFlow: FlowData, validationUrl?: string | null) {
    return this.containersCallService.validateContainerSubflow(deepClone(subFlow), validationUrl).pipe(
      catchError((err) => {
        console.error('Validate container subflow failed', err);
        return throwError(() => err);
      })
    );
  }

  protected fetchAll(): Observable<BlockType[]> {
    return this.containersCallService.retrieveAllContainerTypes();
  }

  protected override onLoaded(): void {
    this.emptyContainerCache.clear();
  }
}
