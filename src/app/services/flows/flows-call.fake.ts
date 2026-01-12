import { Flow } from "@models/flow";
import { FlowsCallServiceBase } from "./flows-call.base";
import { BehaviorSubject, of } from "rxjs";

export class FlowsCallServiceFake extends FlowsCallServiceBase {

  private data: Record<string, Flow> = {
    '1': { id: '1', name: 'Test Flow 1', data: {}, visibility: 'public' },
    '2': { id: '2', name: 'Test Flow 2', data: {}, visibility: 'private' },
  };

  retrieveAllFlows() {
    return of(Object.values(this.data));
  }

  updateFlow(flow: Flow) {
    this.data[flow.id] = flow;
    return of(void 0);
  }
}
