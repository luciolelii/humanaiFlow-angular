import { Injector } from "@angular/core";
import { NodeEditor, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets
} from "rete-connection-plugin";
import { AngularPlugin, Presets, AngularArea2D } from "rete-angular-plugin/21";
import { InputNodeComponent } from "@shared/nodes/input/input-node.component";
import { OutputNodeComponent } from "@shared/nodes/output/output-node.component";
import { HFNode, HFSchemes } from "@models/nodes";
import { FlowBlock, FlowData } from "@models/flow";
import { LLMNodeComponent } from "@shared/nodes/llm/llm";
import { CustomSocket } from "@shared/custom-socket/custom-socket";

type AreaExtra = AngularArea2D<HFSchemes>;

export async function createEditor(container: HTMLElement, injector: Injector, flowData: FlowData) {

  const editor = new NodeEditor<HFSchemes>();
  const area = new AreaPlugin<HFSchemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<HFSchemes, AreaExtra>();
  const render = new AngularPlugin<HFSchemes, AreaExtra>({ injector });

  

  render.addPreset(
    Presets.classic.setup({
      customize: {
        node(context) {
          if (context.payload.label === "Input") {
            return InputNodeComponent;
          }
          if (context.payload.label === "Output") {
            return OutputNodeComponent;
          }
          return LLMNodeComponent;
        },
        socket() {
          return CustomSocket;
        }
      },
    })
  );

  editor.addPipe((c) => {
    if (c.type === "connectioncreate") console.log(c.data);
    return c;
  });

  connection.addPreset(ConnectionPresets.classic.setup());

  AreaExtensions.simpleNodesOrder(area);

  editor.use(area);
  area.use(connection);
  area.use(render);

  AreaExtensions.simpleNodesOrder(area);

  if (flowData)
    await loadFlowData(editor, flowData);

  AreaExtensions.zoomAt(area, editor.getNodes());
  return editor;
}

export function exportGraph(editor: NodeEditor<HFSchemes>) {
  const nodeIdToBlockId = new Map<string, string>();
  const blocks: FlowBlock[] = editor.getNodes().map((node) => {
    const blockData = node.data;
    const blockId = blockData?.id ?? node.id;
    nodeIdToBlockId.set(node.id, blockId);

    const inputs = Object.entries(node.inputs).map(([name, input]) => ({
      name,
      type: ((input as any).socket?.name as string) ?? "ANY",
      multiple: false
    }));

    const outputs = Object.entries(node.outputs).map(([name, output]) => ({
      name,
      type: ((output as any).socket?.name as string) ?? "ANY",
      multiple: false
    }));

    return {
      id: blockId,
      sink: blockData?.sink ?? false,
      name: blockData?.name ?? node.label,
      position: blockData?.position,
      inputs,
      outputs,
      specificConfiguration: blockData?.specificConfiguration ?? {},
      typeName: blockData?.typeName ?? "LLMBlock"
    };
  });

  const connections = editor.getConnections().map((c) => ({
    id: String(c.id),
    sourceId: nodeIdToBlockId.get(c.source) ?? c.source,
    sourceName: c.sourceOutput,
    targetId: nodeIdToBlockId.get(c.target) ?? c.target,
    targetName: c.targetInput
  }));

  return {
    blocks,
    connections
  };
}

async function loadFlowData(editor: NodeEditor<HFSchemes>, flowData: FlowData) {
  if (!flowData.blocks?.length) return;

  const sockets = new Map<string, ClassicPreset.Socket>();
  const getSocket = (type: string) => {
    if (!sockets.has(type)) sockets.set(type, new ClassicPreset.Socket(type));
    return sockets.get(type)!;
  };

  const nodeMapping = new Map<string, any>();

  for (const block of flowData.blocks) {
    const nodeLabel =
      block.typeName === "InputBlock"
        ? "Input"
        : block.typeName === "OutputBlock"
          ? "Output"
          : block.typeName;
    const node = new ClassicPreset.Node(nodeLabel) as HFNode;
    node.data = block;

    nodeMapping.set(block.id, node.id);

    for (const output of block.outputs ?? []) {
      node.addOutput(output.name, new ClassicPreset.Output(getSocket(output.type ?? "ANY")));
    }

    for (const input of block.inputs ?? []) {
      node.addInput(input.name, new ClassicPreset.Input(getSocket(input.type ?? "ANY")));
    }

    await editor.addNode(node);
  }

  for (const c of flowData.connections ?? []) {
    if (!nodeMapping.has(c.sourceId) || !nodeMapping.has(c.targetId)) continue;

    const sourceNode = editor.getNode(nodeMapping.get(c.sourceId)) as any;
    const targetNode = editor.getNode(nodeMapping.get(c.targetId)) as any;

    await editor.addConnection(
      new ClassicPreset.Connection(sourceNode, c.sourceName, targetNode, c.targetName)
    );
  }
}
  


