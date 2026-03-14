import { BlockType, BlockTypeName, FlowBlock, FlowContainer, FlowData, FlowSubflowValidationResult } from "@models/flow";
import { Observable } from "rxjs";

export abstract class BlocksCallServiceBase {

    abstract retrieveAllBlocksTypes() : Observable<BlockType[]>;

    abstract retrieveAllContainerTypes() : Observable<BlockType[]>;

    abstract createEmptyBlock(blockType: BlockTypeName) : Observable<FlowBlock>;

    abstract createEmptyContainer(containerType: BlockTypeName) : Observable<FlowContainer>;

    abstract updateBlock(blockId : string, configuration : any) : Observable<FlowBlock>;

    abstract validateContainerSubflow(subFlow: FlowData) : Observable<FlowSubflowValidationResult>;

}
