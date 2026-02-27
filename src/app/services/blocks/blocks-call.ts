import { BlockType, FlowBlock } from "@models/flow";
import { Observable } from "rxjs";
import { BlocksCallServiceBase } from "./block-call.base";

export class BlocksCallService extends BlocksCallServiceBase {
  override retrieveAllBlocksTypes(): Observable<BlockType[]> {
    throw new Error("Method not implemented.");
  }

  override createNewBlock(configuration: any): Observable<FlowBlock> {
    throw new Error("Method not implemented.");
  }
}
