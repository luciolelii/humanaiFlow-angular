import { BlockType, FlowBlock } from "@models/flow";
import { Observable } from "rxjs";

export abstract class BlocksCallServiceBase {

    abstract retrieveAllBlocksTypes() : Observable<BlockType[]>;

    abstract createNewBlock(configuration : any) : Observable<FlowBlock>;

}