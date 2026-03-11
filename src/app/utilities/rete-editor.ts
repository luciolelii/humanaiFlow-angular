import { Injector } from "@angular/core";
import { NodeEditor, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets
} from "rete-connection-plugin";
import { AngularPlugin, Presets, AngularArea2D } from "rete-angular-plugin/21";
import { HFNode, HFSchemes } from "@models/nodes";
import { FlowBlock, FlowData } from "@models/flow";
import { GenericNodeComponent } from "@shared/nodes/generic-node/generic-node";
import { TaskStepNodeComponent } from "@shared/nodes/task-step-node/task-step-node";
import { CustomSocket } from "@shared/custom-socket/custom-socket";

type AreaExtra = AngularArea2D<HFSchemes>;
const editorSockets = new WeakMap<NodeEditor<HFSchemes>, Map<string, ClassicPreset.Socket>>();

export type ReteEditorInstance = {
  editor: NodeEditor<HFSchemes>;
  area: AreaPlugin<HFSchemes, AreaExtra>;
};

export async function createEditor(
  container: HTMLElement,
  injector: Injector,
  flowData: FlowData,
  options?: { nodeView?: "editor" | "execution" }
): Promise<ReteEditorInstance> {

  const editor = new NodeEditor<HFSchemes>();
  const area = new AreaPlugin<HFSchemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<HFSchemes, AreaExtra>();
  const render = new AngularPlugin<HFSchemes, AreaExtra>({ injector });
  const nodeView = options?.nodeView ?? "editor";

  

  render.addPreset(
    Presets.classic.setup({
      customize: {
        node(_context) {
          return nodeView === "execution" ? TaskStepNodeComponent : GenericNodeComponent;
        },
        socket(context: any) {
          // rete-angular passes only `payload` to the socket component.
          // Build a per-render payload copy to avoid mutating shared socket objects.
          const socketPayload = context?.payload;
          const socketSide = context?.side === "output" ? "output" : "input";
          context.payload = {
            ...(socketPayload ?? {}),
            __hfSide: socketSide
          };
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
    await loadFlowData(editor, area, flowData);

  AreaExtensions.zoomAt(area, editor.getNodes());
  return { editor, area };
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
      name: blockData?.name ?? node.label,
      position: blockData?.position,
      inputs,
      outputs,
      specificConfiguration: cloneValue(blockData?.specificConfiguration ?? {}),
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

export async function addBlockToEditor(
  editor: NodeEditor<HFSchemes>,
  area: AreaPlugin<HFSchemes, AreaExtra>,
  block: FlowBlock,
  position?: { x: number; y: number }
) {
  const node = new ClassicPreset.Node(toNodeLabel(block.typeName)) as HFNode;
  const removeNode = async () => {
    if (!editor.getNode(node.id)) return;
    await editor.removeNode(node.id);
  };
  const replaceWithCreatedBlock = async (createdBlock: FlowBlock) => {
    if (!editor.getNode(node.id)) return;
    const previousConnections = editor.getConnections()
      .filter((connection) => connection.source === node.id || connection.target === node.id)
      .map((connection) => ({
        id: connection.id,
        source: connection.source,
        sourceOutput: connection.sourceOutput,
        target: connection.target,
        targetInput: connection.targetInput
      }));
    const currentPosition = (node.data?.position ?? position ?? createdBlock.position) as { x: number; y: number } | undefined;
    for (const connection of previousConnections) {
      await editor.removeConnection(connection.id);
    }
    await editor.removeNode(node.id);
    const replacementNode = await addBlockToEditor(
      editor,
      area,
      { ...createdBlock, position: currentPosition },
      currentPosition
    );

    if (!replacementNode) return;

    const replacementOutputNames = new Set(Object.keys(replacementNode.outputs));
    const replacementInputNames = new Set(Object.keys(replacementNode.inputs));

    for (const connection of previousConnections) {
      const sourceNode = connection.source === node.id
        ? replacementNode
        : editor.getNode(connection.source);
      const targetNode = connection.target === node.id
        ? replacementNode
        : editor.getNode(connection.target);

      if (!sourceNode || !targetNode) continue;

      const sourceOutput = connection.source === node.id
        ? connection.sourceOutput
        : connection.sourceOutput;
      const targetInput = connection.target === node.id
        ? connection.targetInput
        : connection.targetInput;

      if (connection.source === node.id && !replacementOutputNames.has(sourceOutput)) continue;
      if (connection.target === node.id && !replacementInputNames.has(targetInput)) continue;

      await editor.addConnection(
        new ClassicPreset.Connection(sourceNode as HFNode, sourceOutput, targetNode as HFNode, targetInput)
      );
    }
  };
  node.data = {
    ...cloneValue(block),
    position: position ?? block.position,
    deleteNode: removeNode,
    replaceWithCreatedBlock
  };

  for (const output of block.outputs ?? []) {
    node.addOutput(output.name, new ClassicPreset.Output(getSocket(editor, output.type ?? "ANY")));
  }

  for (const input of block.inputs ?? []) {
    node.addInput(input.name, new ClassicPreset.Input(getSocket(editor, input.type ?? "ANY")));
  }

  await editor.addNode(node);

  const targetPosition = position ?? block.position;
  if (targetPosition) {
    await area.translate(node.id, targetPosition);
  }

  return node;
}

async function loadFlowData(
  editor: NodeEditor<HFSchemes>,
  area: AreaPlugin<HFSchemes, AreaExtra>,
  flowData: FlowData
) {
  if (!flowData.blocks?.length) return;

  const nodeMapping = new Map<string, any>();

  for (const block of flowData.blocks) {
    const node = await addBlockToEditor(editor, area, block, block.position);
    nodeMapping.set(block.id, node.id);
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

function getSocket(editor: NodeEditor<HFSchemes>, type: string) {
  if (!editorSockets.has(editor)) {
    editorSockets.set(editor, new Map<string, ClassicPreset.Socket>());
  }
  const map = editorSockets.get(editor)!;
  if (!map.has(type)) {
    map.set(type, new ClassicPreset.Socket(type));
  }
  return map.get(type)!;
}

function toNodeLabel(typeName: string) {
  if (typeName === "InputBlock" || typeName === "SourceBlock") return "Input";
  if (typeName === "OutputBlock") return "Output";
  return typeName;
}

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
