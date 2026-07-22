import { BlockType, BlockTypeName, FlowContainer, FlowData, FlowSubflowValidationResult } from "@models/flow";
import { BiasCapabilities } from "@models/bias-impact";
import { Observable } from "rxjs";

export abstract class ContainersCallServiceBase {
  abstract retrieveAllContainerTypes(): Observable<BlockType[]>;

  abstract retrieveBiasCapabilities(containerType: string): Observable<BiasCapabilities>;

  abstract retrieveBiasCapabilitiesForInstance(containerType: string, container: FlowContainer): Observable<BiasCapabilities>;

  abstract createEmptyContainer(containerType: BlockTypeName): Observable<FlowContainer>;

  abstract createContainer(containerId: string, configuration: any): Observable<FlowContainer>;

  abstract validateContainerSubflow(subFlow: FlowData, validationUrl?: string | null): Observable<FlowSubflowValidationResult>;
}
