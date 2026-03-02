import { Flow } from "@models/flow";
import { FlowsCallServiceBase } from "./flows-call.base";
import { Observable } from "rxjs";

export class FlowsCallService extends FlowsCallServiceBase {
    override getFlowById(_flowId: string): Observable<Flow> {
        throw new Error("Method not implemented.");
    }
    override createNewFlow(_name?: string): Observable<Flow> {
        throw new Error("Method not implemented.");
    }
    override deleteFlow(_flowId: string): Observable<void> {
        throw new Error("Method not implemented.");
    }
    override retrieveAllFlows(): Observable<Flow[]> {
        throw new Error("Method not implemented.");
    }
    override updateFlow(_flow: Flow): Observable<void> {
        throw new Error("Method not implemented.");
    }
    
}
