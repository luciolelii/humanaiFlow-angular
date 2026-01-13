import { Flow } from "@models/flow";
import { FlowsCallServiceBase } from "./flows-call.base";
import { BehaviorSubject, Observable, of } from "rxjs";

export class FlowsCallServiceFake extends FlowsCallServiceBase {
  override getFlowById(flowId: string): Observable<Flow> {
    const flow = this.data[flowId];
    if (!flow) {
      throw new Error(`Flow with id ${flowId} not found`);
    }
    return of(flow);
  }

  private data: Record<string, Flow> = {
    '1': { id: '1', name: 'Test Flow 1', data: {}, visibility: 'public', author: 'Alice', createdAt: new Date(), updatedAt: new Date() },
    '2': { id: '2', name: 'Test Flow 2', data: {}, visibility: 'private', author: 'Bob', createdAt: new Date(), updatedAt: new Date() },
  };

  override retrieveAllFlows() {
    return of(Object.values(this.data));
  }

  override updateFlow(flow: Flow) {
    this.data[flow.id] = flow;
    return of(void 0);
  }

  override createNewFlow(): Observable<Flow> {
    const newId = (Object.keys(this.data).length + 1).toString();
    this.data[newId] = { id: newId, name: 'New Flow', data: {}, visibility: 'private', author: 'Charlie', createdAt: new Date(), updatedAt: new Date() };
    return of(this.data[newId]);
  }

  override deleteFlow(flowId: string): Observable<void> {
    delete this.data[flowId];
    return of(void 0);
  }
}
