import { Flow } from "@models/flow";
import { Observable } from "rxjs";

export abstract class FlowsCallServiceBase {
   
    abstract retrieveAllFlows() : Observable<Flow[]>;

    abstract updateFlow(flow: Flow) : Observable<void>;

}