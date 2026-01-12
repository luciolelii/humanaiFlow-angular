import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { Flow } from '@models/flow';
import { FlowsCallServiceBase } from './flows-call.base';
import { BehaviorSubject, catchError, tap, throwError } from 'rxjs';

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

}
