import { Flow } from "@models/flow";
import { Observable } from "rxjs";

export abstract class FlowsCallServiceBase {
   
    abstract getFlowById(flowId: string) : Observable<Flow>;

    abstract retrieveAllFlows() : Observable<Flow[]>;

    abstract updateFlow(flow: Flow) : Observable<Flow>;

    abstract createNewFlow(name?: string) : Observable<Flow>;

    abstract deleteFlow(flowId: string) : Observable<void>;

}
