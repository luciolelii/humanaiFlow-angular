import { Flow, FlowData } from "@models/flow";
import { FlowsCallServiceBase } from "./flows-call.base";
import { BehaviorSubject, Observable, of } from "rxjs";
import { Authorization } from "@services/authorization/authorization";
import { inject } from "@angular/core";

export class FlowsCallServiceFake extends FlowsCallServiceBase {
  override getFlowById(flowId: string): Observable<Flow> {
    const flow = this.data[flowId];
    if (!flow) {
      throw new Error(`Flow with id ${flowId} not found`);
    }
    return of(flow);
  }

  authorizationService = inject(Authorization);

  private data: Record<string, Flow> = {
    '1': { id: '1', name: 'A Flow', data: new FlowData(), visibility: 'public', author: 'Alice', createdAt: new Date("December 17, 2023 03:24:00"), updatedAt: new Date("January 7, 2026 12:24:00") },
    '2': { id: '2', name: 'Test Flow', data: new FlowData(), visibility: 'private', author: 'Bob', createdAt: new Date("April 25, 2025 12:24:00"), updatedAt: new Date("April 27, 2025 18:42:00") },
  };

  override retrieveAllFlows() {
    return of(Object.values(this.data));
  }

  override updateFlow(flow: Flow) {
    this.data[flow.id] = flow;
    return of(void 0);
  }

  override createNewFlow(name?: string): Observable<Flow> {
    const newId = (Object.keys(this.data).length + 1).toString();
    this.data[newId] = { id: newId, name: name || `New Flow`, data: new FlowData() , visibility: 'private', author: this.authorizationService.loggedInUser()!.username, createdAt: new Date(), updatedAt: new Date() };
    return of(this.data[newId]);
  }

  override deleteFlow(flowId: string): Observable<void> {
    delete this.data[flowId];
    return of(void 0);
  }
}
