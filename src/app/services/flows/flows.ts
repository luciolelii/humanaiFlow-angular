import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { Flow } from '@models/flow';
import { FlowsCallServiceBase } from './flows-call.base';
import { catchError, firstValueFrom, Observable, tap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class FlowsService {

  flowsCallService: FlowsCallServiceBase = new environment.flowsCallService();

  toInit: boolean = true;
  private loadingPromise: Promise<void> | null = null;

  private _flows = signal<Flow[]>([]);
  readonly flows = this._flows.asReadonly();

  hasLoadedFlows() {
    return this._flows().length > 0 || !this.toInit;
  }

  async getAllFlows() {
    if (this.toInit) {
      this.toInit = false;
      await this.refresh();
    }

    return this.flows;
  }

  async refresh(force = false): Promise<void> {
    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = firstValueFrom(this.flowsCallService.retrieveAllFlows())
      .then((flows) => {
        this._flows.set(flows);
      })
      .catch((err) => {
        console.error('Retrieve flows failed', err);
        throw err;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  updateFlow(flow: Flow) {
    return this.flowsCallService.updateFlow(flow).pipe(
      tap((updatedFlow) => {
        this._flows.update((flows) => {
          const index = flows.findIndex((current) => current.id === updatedFlow.id);
          if (index < 0) {
            return [updatedFlow, ...flows];
          }

          const next = [...flows];
          next[index] = updatedFlow;
          return next;
        });
      }),
      catchError(err => {
        console.error('Update flow failed', err);
        return throwError(() => err);
      })
    );
  }

  createFlow(flow: Pick<Flow, 'name' | 'description' | 'data' | 'status'>) {
    return this.flowsCallService.createFlow(flow).pipe(
      tap((createdFlow) => {
        this._flows.update((flows) => [createdFlow, ...flows]);
      }),
      catchError(err => {
        console.error('Create flow failed', err);
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

  updatePublished(flowId: string, value: boolean) {
    return this.flowsCallService.updatePublished(flowId, value).pipe(
      tap((updatedFlow) => {
        this._flows.update((flows) => {
          const index = flows.findIndex((current) => current.id === updatedFlow.id);
          if (index < 0) return [updatedFlow, ...flows];
          const next = [...flows];
          next[index] = updatedFlow;
          return next;
        });
      }),
      catchError(err => {
        console.error('Update published failed', err);
        return throwError(() => err);
      })
    );
  }

  finalizeFlow(flowId: string) {
    return this.flowsCallService.finalizeFlow(flowId).pipe(
      tap((updatedFlow) => {
        this._flows.update((flows) => {
          const index = flows.findIndex((current) => current.id === updatedFlow.id);
          if (index < 0) return [updatedFlow, ...flows];
          const next = [...flows];
          next[index] = updatedFlow;
          return next;
        });
      }),
      catchError(err => {
        console.error('Finalize flow failed', err);
        return throwError(() => err);
      })
    );
  }

  cloneFlow(flow: Pick<Flow, 'name' | 'description' | 'data' | 'status'>): Observable<Flow> {
    return this.createFlow({
      name: `${flow.name} (cloned)`,
      description: flow.description,
      data: flow.data,
      status: flow.status
    }).pipe(
      catchError(err => {
        console.error('Cloning flow failed', err);
        return throwError(() => err);
      })
    );
  }

  createNewFlow(name? : string) {
    return this.createFlow({
      name: name || this.nextFileName('New Flow'),
      description: undefined,
      data: {
        blocks: [],
        containers: [],
        connections: []
      },
      status: 'DRAFT'
    }).pipe(
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
