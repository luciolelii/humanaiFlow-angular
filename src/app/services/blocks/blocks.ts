import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { BlockType } from '@models/flow';
import { BlocksCallServiceBase } from './block-call.base';
import { catchError, throwError } from 'rxjs';

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

  createNewBlock(configuration: any) {
    return this.blocksCallService.createNewBlock(configuration).pipe(
      catchError((err) => {
        console.error('Create block failed', err);
        return throwError(() => err);
      })
    );
  }
}
