import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { BlockType, BlockTypeName } from '@models/flow';
import { BlocksCallServiceBase } from './block-call.base';
import { catchError, firstValueFrom, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BlocksService {
  blocksCallService: BlocksCallServiceBase = new environment.blocksCallService();

  toInit: boolean = true;

  private _blockTypes = signal<BlockType[]>([]);

  async getAllBlocksTypes() {
    if (this.toInit) {
      this.refresh();
      this.toInit = false;
    }

    return this._blockTypes.asReadonly();
  }

  refresh() {
    this.blocksCallService.retrieveAllBlocksTypes().subscribe((blockTypes) => {
      this._blockTypes.set(blockTypes);
    });
  }

  async getBlockType(typeName: BlockTypeName) {
    const current = this._blockTypes().find((blockType) => blockType.type === typeName);
    if (current) return current;

    const blockTypes = await firstValueFrom(this.blocksCallService.retrieveAllBlocksTypes());
    this._blockTypes.set(blockTypes);
    return blockTypes.find((blockType) => blockType.type === typeName);
  }

  createEmptyBlock(blockType: BlockTypeName) {
    return this.blocksCallService.createEmptyBlock(blockType).pipe(
      catchError((err) => {
        console.error('Create empty block failed', err);
        return throwError(() => err);
      })
    );
  }

  updateBlock(blockId: string, configuration: any) {
    return this.blocksCallService.updateBlock(blockId, configuration).pipe(
      catchError((err) => {
        console.error('Update block failed', err);
        return throwError(() => err);
      })
    );
  }
}
