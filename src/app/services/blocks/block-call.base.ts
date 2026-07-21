import { BiasAnnotationsDescriptor, BlockType, BlockTypeName, FlowBlock } from "@models/flow";
import { BiasCapabilities } from "@models/bias-impact";
import { Observable } from "rxjs";

export type BlockDraftContext = {
  flowId?: string | null;
  replacesBlockId?: string | null;
};

export abstract class BlocksCallServiceBase {

    abstract retrieveAllBlocksTypes() : Observable<BlockType[]>;

    abstract retrieveBiasAnnotationsDescriptor(): Observable<BiasAnnotationsDescriptor>;

    abstract retrieveBiasCapabilities(blockType: string): Observable<BiasCapabilities>;

    abstract retrieveBiasCapabilitiesForInstance(blockType: string, block: FlowBlock): Observable<BiasCapabilities>;

    abstract createEmptyBlock(blockType: BlockTypeName, context?: BlockDraftContext) : Observable<FlowBlock>;

    abstract updateBlock(blockId : string, configuration : any, context?: BlockDraftContext) : Observable<FlowBlock>;

}
