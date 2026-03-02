import { BlockType, BlockTypeName, FlowBlock } from "@models/flow";
import { Observable } from "rxjs";

export abstract class BlocksCallServiceBase {

    abstract retrieveAllBlocksTypes() : Observable<BlockType[]>;

    abstract createEmptyBlock(blockType: BlockTypeName) : Observable<FlowBlock>;

    abstract updateBlock(blockId : string, configuration : any) : Observable<FlowBlock>;

}