import { Flow } from "@models/flow";
import { FlowsCallServiceBase } from "./flows-call.base";
import { Observable } from "rxjs";

export class FlowsCallService extends FlowsCallServiceBase {
    override getFlowById(flowId: string): Observable<Flow> {
        throw new Error("Method not implemented.");
    }
    override createNewFlow(): Observable<Flow> {
        throw new Error("Method not implemented.");
    }
    override deleteFlow(flowId: string): Observable<void> {
        throw new Error("Method not implemented.");
    }
    override retrieveAllFlows(): Observable<Flow[]> {
        throw new Error("Method not implemented.");
    }
    override updateFlow(flow: Flow): Observable<void> {
        throw new Error("Method not implemented.");
    }
    
}