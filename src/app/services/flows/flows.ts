import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { Flow } from '@models/flow';
import { FlowsCallServiceBase } from './flows-call.base';
import { BehaviorSubject, catchError, combineLatest, Observable, switchMap, tap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class FlowsService {

  flowsCallService: FlowsCallServiceBase = new environment.flowsCallService();

  toInit: boolean = true;

  private _flows = signal<Flow[]>([]);

  async getAllFlows() {
    console.log('Flows signal accessed');
    if (this.toInit) {
      this.refresh();
      this.toInit = false;

    }

    return this._flows.asReadonly();
  }

  refresh() {
    this.flowsCallService.retrieveAllFlows().subscribe(flows => {
      this._flows.set(flows);
    });
  }

  updateFlow(flow: Flow) {
    return this.flowsCallService.updateFlow(flow).pipe(
      tap(() => this.refresh()),
      catchError(err => {
        console.error('Update flow failed', err);
        return throwError(() => err);
      })
    );
  }

  deleteFlow(flowId: string) {
    return this.flowsCallService.deleteFlow(flowId).pipe(
      tap(() => this.refresh()),
      catchError(err => {
        console.error('Delete flow failed', err);
        return throwError(() => err);
      })
    );
  }

  cloneFlow(flowId: string): Observable<void> {
    const originalFlow$ = this.flowsCallService.getFlowById(flowId);

    const newFlow$ = this.flowsCallService.createNewFlow();

    return combineLatest([originalFlow$, newFlow$]).pipe(
      switchMap(([originalFlow, newFlow]) => {
        newFlow.name = this.nextFileName(originalFlow.name);
        newFlow.data = originalFlow.data ;

        return this.flowsCallService.updateFlow(newFlow);
      }),
      tap(() => this.refresh()),
      catchError(err => {
        console.error('Cloning flow failed', err);
        return throwError(() => err);
      })
    );

  }

  createNewFlow(name? : string) {
    return this.flowsCallService.createNewFlow(name || this.nextFileName('New Flow')).pipe(
      tap(() => this.refresh()),
      catchError(err => {
        console.error('Create new flow failed', err);
        return throwError(() => err);
      })
    );
  }


  private nextFileName(base: string): string {
    let n = 0;

    while (true) {
      const name =
        n === 0 ? `${base}` : `${base}(${n})`;
      const exists = this._flows().some(flow => flow.name === name);
      if (!exists) {
        return name;
      }
      n++;
    }
  }

}
