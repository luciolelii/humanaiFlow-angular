import { Flow, FlowValidationError } from "@models/flow";
import { Observable } from "rxjs";

export abstract class FlowsCallServiceBase {
   
    abstract getFlowById(flowId: string) : Observable<Flow>;

    abstract retrieveAllFlows() : Observable<Flow[]>;

    abstract updateFlow(flow: Flow) : Observable<Flow>;

    abstract createFlow(flow: Pick<Flow, 'name' | 'description' | 'data' | 'status'>) : Observable<Flow>;

    abstract createNewFlow(name?: string) : Observable<Flow>;

    abstract deleteFlow(flowId: string) : Observable<void>;

    abstract updatePublished(flowId: string, value: boolean) : Observable<Flow>;

    abstract finalizeFlow(flowId: string) : Observable<Flow>;

    abstract getFlowValidation(flowId: string) : Observable<FlowValidationError[]>;

}
