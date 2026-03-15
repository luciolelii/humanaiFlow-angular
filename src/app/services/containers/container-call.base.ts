import { BlockType, BlockTypeName, FlowContainer, FlowData, FlowSubflowValidationResult } from "@models/flow";
import { Observable } from "rxjs";

export abstract class ContainersCallServiceBase {
  abstract retrieveAllContainerTypes(): Observable<BlockType[]>;

  abstract createEmptyContainer(containerType: BlockTypeName): Observable<FlowContainer>;

  abstract validateContainerSubflow(subFlow: FlowData): Observable<FlowSubflowValidationResult>;
}
