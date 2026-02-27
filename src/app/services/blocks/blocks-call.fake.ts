import { BlockType, FlowBlock } from "@models/flow";
import { Observable, of } from "rxjs";
import { BlocksCallServiceBase } from "./block-call.base";

export class BlocksCallServiceFake extends BlocksCallServiceBase {
  private readonly blockTypes: BlockType[] = [
    {
      userInteractive: true,
      blockConfigurationClass:
        "it.cnr.isti.workflow.manager.blocks.configurations.HumanInteractiveBlockConfiguration",
      description: "A block that requires human interaction",
      name: "HumanInteractionBlock"
    },
    {
      userInteractive: false,
      blockConfigurationClass:
        "it.cnr.isti.workflow.manager.blocks.configurations.LLMBlockConfiguration",
      description: "This type represents a LLM node in the workflow manager",
      name: "LLMBlock"
    },
    {
      userInteractive: true,
      blockConfigurationClass: null,
      description: "This type represents a source node in the workflow manager",
      name: "SourceBlock"
    }
  ];

  override retrieveAllBlocksTypes(): Observable<BlockType[]> {
    return of(this.blockTypes);
  }

  override createNewBlock(configuration: any): Observable<FlowBlock> {
    const typeName = configuration?.typeName ?? "LLMBlock";
    const block: FlowBlock = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      sink: false,
      name: configuration?.name ?? "new-block",
      position: configuration?.position,
      inputs: configuration?.inputs ?? [],
      outputs: configuration?.outputs ?? [],
      specificConfiguration: configuration?.specificConfiguration ?? {},
      typeName
    };

    return of(block);
  }
}
