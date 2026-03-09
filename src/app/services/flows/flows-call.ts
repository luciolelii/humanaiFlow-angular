import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@environment';
import { Flow } from '@models/flow';
import { map, Observable } from 'rxjs';
import { flowFromApi, toFlowCreateRequest } from './flow-mapper';
import { FlowsCallServiceBase } from './flows-call.base';

export class FlowsCallService extends FlowsCallServiceBase {
  private readonly http = inject(HttpClient);

  override getFlowById(flowId: string): Observable<Flow> {
    const encodedId = encodeURIComponent(flowId);
    return this.http
      .get<unknown>(`${environment.apiUrl}/flows/${encodedId}`)
      .pipe(map((raw) => flowFromApi(raw)));
  }

  override createNewFlow(name?: string): Observable<Flow> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/flows`, toFlowCreateRequest(name ?? 'New Flow', undefined, undefined, 'DRAFT'))
      .pipe(map((raw) => flowFromApi(raw)));
  }

  override deleteFlow(flowId: string): Observable<void> {
    const encodedId = encodeURIComponent(flowId);
    return this.http.delete<void>(`${environment.apiUrl}/flows/${encodedId}`);
  }

  override retrieveAllFlows(): Observable<Flow[]> {
    return this.http
      .get<unknown[]>(`${environment.apiUrl}/flows`)
      .pipe(map((raw) => raw.map((flow) => flowFromApi(flow))));
  }

  override updateFlow(flow: Flow): Observable<Flow> {
    const encodedId = encodeURIComponent(flow.id);
    return this.http
      .put<unknown>(
        `${environment.apiUrl}/flows/${encodedId}`,
        toFlowCreateRequest(flow.name, flow.description, flow.data, flow.status)
      )
      .pipe(map((raw) => flowFromApi(raw)));
  }
}
