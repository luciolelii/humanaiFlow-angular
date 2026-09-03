import { Flow, FlowValidationError, GroupedFlowValidation } from "@models/flow";
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

    abstract getGroupedFlowValidation(flowId: string) : Observable<GroupedFlowValidation>;

    /**
     * Moves a flow into a project, or detaches it when projectId is null. Its own endpoint, not a
     * field on the update body: that body is a full replace, so a project carried there would be
     * lost on every editor save. Works on finalized flows - membership is metadata, not content.
     */
    abstract assignFlowToProject(flowId: string, projectId: string | null) : Observable<Flow>;

}
