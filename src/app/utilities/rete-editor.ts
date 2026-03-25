import { Injector } from "@angular/core";
import { NodeEditor, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets
} from "rete-connection-plugin";
import { AngularPlugin, Presets, AngularArea2D } from "rete-angular-plugin/21";
import { HFNode, HFSchemes } from "@models/nodes";
import {
  areFlowValueKindsCompatible,
  FlowBlock,
  FlowData,
  FlowNode,
  normalizeFlowPortValueKinds
} from "@models/flow";
import { BlocksService } from "@services/blocks/blocks";
import { ContainersService } from "@services/containers/containers";
import { EditorStateHolder } from "@stores/flow-editor";
import { ContainerNodeComponent } from "@shared/nodes/container-node/container-node";
import { GenericNodeComponent } from "@shared/nodes/generic-node/generic-node";
import { TaskStepNodeComponent } from "@shared/nodes/task-step-node/task-step-node";
import { CustomSocket } from "@shared/custom-socket/custom-socket";
import { firstValueFrom } from "rxjs";

type AreaExtra = AngularArea2D<HFSchemes>;
const editorSockets = new WeakMap<NodeEditor<HFSchemes>, Map<string, ClassicPreset.Socket>>();
const editorRuntime = new WeakMap<NodeEditor<HFSchemes>, ReteRuntimeContext>();
const areaProgrammaticTranslations = new WeakMap<AreaPlugin<HFSchemes, AreaExtra>, Set<string>>();

export type ReteEditorInstance = {
  editor: NodeEditor<HFSchemes>;
  area: AreaPlugin<HFSchemes, AreaExtra>;
};

type ReteRuntimeContext = {
  blocksService: BlocksService;
  containersService: ContainersService;
  flowState: EditorStateHolder;
  readonly: boolean;
};

export async function createEditor(
  container: HTMLElement,
  injector: Injector,
  flowData: FlowData,
  options?: { nodeView?: "editor" | "execution"; readonly?: boolean }
): Promise<ReteEditorInstance> {

  const editor = new NodeEditor<HFSchemes>();
  const area = new AreaPlugin<HFSchemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<HFSchemes, AreaExtra>();
  const render = new AngularPlugin<HFSchemes, AreaExtra>({ injector });
  const nodeView = options?.nodeView ?? "editor";
  const readonly = options?.readonly === true;
  const programmaticTranslations = new Set<string>();
  areaProgrammaticTranslations.set(area, programmaticTranslations);
  const runtime: ReteRuntimeContext = {
    blocksService: injector.get(BlocksService),
    containersService: injector.get(ContainersService),
    flowState: injector.get(EditorStateHolder),
    readonly
  };
  editorRuntime.set(editor, runtime);

  render.addPreset(
    Presets.classic.setup({
      customize: {
        node(context: any) {
          if (nodeView === "execution") return TaskStepNodeComponent;
          const nodeFamily = context?.payload?.data?.nodeFamily;
          return nodeFamily === "container" ? ContainerNodeComponent : GenericNodeComponent;  
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
  editor.addPipe((context) => {
    if (context.type !== "connectioncreate") return context;

    const sourceNode = editor.getNode(context.data.source) as HFNode | undefined;
    const targetNode = editor.getNode(context.data.target) as HFNode | undefined;
    const sourcePort = resolveNodePort(sourceNode, "output", context.data.sourceOutput);
    const targetPort = resolveNodePort(targetNode, "input", context.data.targetInput);

    if (!sourcePort || !targetPort) return;

    const compatible = areFlowValueKindsCompatible(
      normalizeFlowPortValueKinds(sourcePort),
      normalizeFlowPortValueKinds(targetPort)
    );

    return compatible ? context : undefined;
  });

  connection.addPreset(ConnectionPresets.classic.setup());

  AreaExtensions.simpleNodesOrder(area);

  area.addPipe((context: any) => {
    if (readonly && context?.type === 'nodetranslate') {
      const nodeId = String(context?.data?.id ?? '');
      if (!programmaticTranslations.has(nodeId)) return;
    }
    return context;
  });

  editor.use(area);
  area.use(connection);
  area.use(render);

  AreaExtensions.simpleNodesOrder(area);

  if (flowData)
    await loadFlowData(editor, area, flowData, runtime);

  AreaExtensions.zoomAt(area, editor.getNodes());
  return { editor, area };
}

export function exportGraph(editor: NodeEditor<HFSchemes>) {
  const nodeIdToBlockId = new Map<string, string>();
  const nodes: FlowNode[] = editor.getNodes().map((node) => {
    const blockData = node.data;
    const blockId = blockData?.id ?? node.id;
    nodeIdToBlockId.set(node.id, blockId);

    const inputs = cloneValue(blockData?.inputs ?? []);
    const outputs = cloneValue(blockData?.outputs ?? []);

    return {
      id: blockId,
      name: blockData?.name ?? node.label,
      position: blockData?.position,
      inputs,
      outputs,
      specificConfiguration: cloneValue(blockData?.specificConfiguration ?? {}),
      typeName: blockData?.typeName ?? "LLMBlock",
      nodeFamily: blockData?.nodeFamily === 'container' ? 'container' : 'block'
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
    blocks: nodes.filter((node): node is FlowBlock => node.nodeFamily === 'block'),
    containers: nodes.filter((node) => node.nodeFamily === 'container'),
    connections
  };
}

export async function addBlockToEditor(
  editor: NodeEditor<HFSchemes>,
  area: AreaPlugin<HFSchemes, AreaExtra>,
  block: FlowNode,
  position?: { x: number; y: number },
  runtime?: ReteRuntimeContext
) {
  const resolvedRuntime = runtime ?? editorRuntime.get(editor);
  const node = new ClassicPreset.Node(block.typeName) as HFNode;
  const removeNode = async () => {
    if (!editor.getNode(node.id)) return;
    const relatedConnectionIds = editor.getConnections()
      .filter((connection) => connection.source === node.id || connection.target === node.id)
      .map((connection) => connection.id);

    for (const connectionId of relatedConnectionIds) {
      await editor.removeConnection(connectionId);
    }

    await editor.removeNode(node.id);
  };
  const clearContainerSubflow = async () => {
    const currentNode = editor.getNode(node.id) as HFNode | undefined;
    if (!currentNode?.data) return;
    const nextConfiguration = {
      ...cloneValue(currentNode.data.specificConfiguration ?? {})
    };
    delete (nextConfiguration as Record<string, unknown>)["subFlow"];
    const replacement = {
      ...cloneValue(currentNode.data),
      inputs: [],
      outputs: [],
      specificConfiguration: nextConfiguration
    };
    const replaceNode = currentNode.data['replaceWithCreatedNode'];
    if (typeof replaceNode === 'function') {
      await replaceNode(replacement);
    } else {
      currentNode.data = {
        ...currentNode.data,
        inputs: [],
        outputs: [],
        specificConfiguration: nextConfiguration,
        __containerValidationErrors: [],
        __containerAssignmentError: null,
        __containerAssigning: false
      };
      await area.update("node", node.id);
    }
    if (resolvedRuntime) {
      resolvedRuntime.flowState.updateData(exportGraph(editor));
    }
  };
  const applyContainerSubflow = async (
    candidateSubFlow: FlowData,
    options?: { selectedIds?: Set<string>; validationUrl?: string | null; preValidate?: boolean; source?: 'drag' | 'import' }
  ) => {
    if (!resolvedRuntime) return;

    const liveNode = editor.getNode(node.id) as HFNode | undefined;
    if (!liveNode?.data) return;

    liveNode.data = {
      ...liveNode.data,
      __containerAssigning: true,
      __containerAssignmentError: null,
      __containerValidationErrors: []
    };
    await area.update("node", node.id);
    try {
      const currentLiveNode = editor.getNode(node.id) as HFNode | undefined;
      if (!currentLiveNode?.data) return;

      if (options?.preValidate) {
        const validation = await firstValueFrom(
          resolvedRuntime.containersService.validateContainerSubflow(candidateSubFlow, options?.validationUrl)
        );

        if (!validation.valid) {
          currentLiveNode.data = {
            ...currentLiveNode.data,
            __containerAssigning: false,
            __containerAssignmentError: validation.errors[0]?.message ?? "Selected subflow is not valid",
            __containerValidationErrors: validation.errors
          };
          await area.update("node", node.id);
          return;
        }
      }

      const nextConfiguration = {
        ...cloneValue(currentLiveNode.data.specificConfiguration ?? {}),
        subFlow: candidateSubFlow
      };
      const nextPosition = cloneValue(currentLiveNode.data['position'] ?? null);

      const containerId = String(currentLiveNode.data['id'] ?? '');
      const replacementFromServer = await firstValueFrom(
        resolvedRuntime.containersService.createContainer(containerId, {
          ...nextConfiguration,
          position: nextPosition,
          typeName: currentLiveNode.data['typeName']
        })
      );
      if (options?.source === 'import') {
        console.log('Container create response after subFlow import:', replacementFromServer);
      }

      const selectedIds = options?.selectedIds ?? new Set<string>();
      const selectedNodeIds = editor.getNodes()
        .filter((candidate) => selectedIds.has(String(candidate.data?.id ?? "")))
        .map((candidate) => candidate.id)
        .filter((candidateId) => candidateId !== node.id);

      for (const selectedNodeId of selectedNodeIds) {
        if (!editor.getNode(selectedNodeId)) continue;

        const relatedConnectionIds = editor.getConnections()
          .filter((connection) => connection.source === selectedNodeId || connection.target === selectedNodeId)
          .map((connection) => connection.id);

        for (const connectionId of relatedConnectionIds) {
          await editor.removeConnection(connectionId);
        }

        await editor.removeNode(selectedNodeId);
      }

      const replacement = {
        ...cloneValue(currentLiveNode.data),
        ...cloneValue(replacementFromServer),
        position: cloneValue(currentLiveNode.data['position'] ?? replacementFromServer.position),
        specificConfiguration: nextConfiguration,
        __containerAssigning: false,
        __containerAssignmentError: null,
        __containerValidationErrors: []
      };
      const replaceNode = currentLiveNode.data['replaceWithCreatedNode'];
      if (typeof replaceNode === 'function') {
        await replaceNode(replacement);
      } else {
        currentLiveNode.data = replacement;
        await area.update("node", node.id);
      }

      resolvedRuntime.flowState.clearBlockSelection();
      resolvedRuntime.flowState.updateData(exportGraph(editor));
    } catch (error) {
      const currentLiveNode = editor.getNode(node.id) as HFNode | undefined;
      if (!currentLiveNode?.data) return;

      currentLiveNode.data = {
        ...currentLiveNode.data,
        __containerAssigning: false,
        __containerValidationErrors: [],
        __containerAssignmentError: error instanceof Error
          ? error.message
          : "Container update failed"
      };
      await area.update("node", node.id);
    }
  };
  const assignSelectedBlocksToContainer = async (selectedBlockIds?: string[]) => {
    if (!resolvedRuntime) return;

    const currentNode = editor.getNode(node.id) as HFNode | undefined;
    const containerBlockId = currentNode?.data?.id;
    if (!currentNode?.data || typeof containerBlockId !== "string") return;

    const selection = Array.from(new Set((selectedBlockIds ?? resolvedRuntime.flowState.selectedBlockIds())
      .filter((id) => typeof id === "string" && id.length > 0)
      .filter((id) => id !== containerBlockId)));

    if (!selection.length) {
      currentNode.data = {
        ...currentNode.data,
        __containerAssignmentError: "Select one or more nodes before dropping them into the container.",
        __containerValidationErrors: []
      };
      await area.update("node", node.id);
      return;
    }

    const currentFlow = exportGraph(editor);
    const selectedBlocks = currentFlow.blocks.filter((candidate) => selection.includes(candidate.id));
    const selectedContainers = currentFlow.containers.filter((candidate) => selection.includes(candidate.id));
    const selectedIds = new Set([
      ...selectedBlocks.map((candidate) => candidate.id),
      ...selectedContainers.map((candidate) => candidate.id)
    ]);
    const candidateSubFlow: FlowData = {
      blocks: cloneValue(selectedBlocks),
      containers: cloneValue(selectedContainers),
      connections: cloneValue(
        currentFlow.connections.filter((connection) =>
          selectedIds.has(connection.sourceId) && selectedIds.has(connection.targetId)
        )
      )
    };
    await applyContainerSubflow(candidateSubFlow, { selectedIds, preValidate: true });
  };
  const assignImportedSubflow = async (subFlow: FlowData, validationUrl?: string | null) => {
    await applyContainerSubflow(cloneValue(subFlow), { validationUrl, source: 'import' });
  };
  const replaceWithCreatedNode = async (createdBlock: FlowNode) => {
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
    const replacementNode = await addBlockToEditor(
      editor,
      area,
      { ...createdBlock, position: currentPosition },
      currentPosition,
      resolvedRuntime
    );

    if (!replacementNode) return;

    for (const connection of previousConnections) {
      await editor.removeConnection(connection.id);
    }
    await editor.removeNode(node.id);

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

      try {
        await editor.addConnection(
          new ClassicPreset.Connection(sourceNode as HFNode, sourceOutput, targetNode as HFNode, targetInput)
        );
      } catch (error) {
        console.warn('Failed to restore connection after node replacement', {
          connection,
          error
        });
      }
    }
  };
  const cloneNode = async () => {
    if (resolvedRuntime?.readonly) return;

    const currentNode = editor.getNode(node.id) as HFNode | undefined;
    if (!currentNode?.data) return;

    const sourceData = currentNode.data as Record<string, unknown>;
    const sourcePosition = sourceData['position'] as { x: number; y: number } | undefined;
    const nextPosition = sourcePosition
      ? { x: sourcePosition.x + 48, y: sourcePosition.y + 48 }
      : { x: 168, y: 148 };

    const clonedNode = {
      ...cloneValue(block),
      ...cloneValue(sourceData),
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      position: nextPosition,
      inputs: cloneValue((sourceData['inputs'] as FlowNode['inputs'] | undefined) ?? block.inputs ?? []),
      outputs: cloneValue((sourceData['outputs'] as FlowNode['outputs'] | undefined) ?? block.outputs ?? []),
      specificConfiguration: cloneValue((sourceData['specificConfiguration'] as FlowNode['specificConfiguration'] | undefined) ?? block.specificConfiguration ?? {}),
      nodeFamily: sourceData['nodeFamily'] === 'container' ? 'container' : 'block',
      __needsServerCreate: sourceData['nodeFamily'] === 'container' ? false : true,
      __createdOnServer: false,
      __isCreatingOnServer: false,
      __updateBlockError: null
    } as FlowNode & Record<string, unknown>;

    await addBlockToEditor(editor, area, clonedNode, nextPosition, resolvedRuntime);
  };
  node.data = {
    ...cloneValue(block),
    position: position ?? block.position,
    __readonly: resolvedRuntime?.readonly === true,
    deleteNode: removeNode,
    cloneNode,
    replaceWithCreatedNode,
    assignSelectedBlocksToContainer,
    assignImportedSubflow,
    clearContainerSubflow,
    __containerValidationErrors: [],
    __containerAssignmentError: null,
    __containerAssigning: false
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
    node.data = {
      ...node.data,
      position: { x: targetPosition.x, y: targetPosition.y }
    };
    await applyNodePosition(area, node.id, targetPosition);
  }

  return node;
}

async function loadFlowData(
  editor: NodeEditor<HFSchemes>,
  area: AreaPlugin<HFSchemes, AreaExtra>,
  flowData: FlowData,
  runtime?: ReteRuntimeContext
) {
  const topLevelNodes = [...(flowData.blocks ?? []), ...(flowData.containers ?? [])];
  if (!topLevelNodes.length) return;

  const nodeMapping = new Map<string, any>();

  for (const [index, block] of topLevelNodes.entries()) {
    const fallbackPosition = block.position ?? {
      x: 120 + (index % 3) * 340,
      y: 100 + Math.floor(index / 3) * 220
    };
    const node = await addBlockToEditor(editor, area, block, fallbackPosition, runtime);
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

function resolveNodePort(node: HFNode | undefined, kind: "input" | "output", portName: string) {
  const ports = node?.data?.[kind === "input" ? "inputs" : "outputs"];
  if (!Array.isArray(ports)) return null;
  return ports.find((port) => port?.name === portName) ?? null;
}

async function applyNodePosition(
  area: AreaPlugin<HFSchemes, AreaExtra>,
  nodeId: string,
  position: { x: number; y: number }
) {
  const programmaticTranslations = areaProgrammaticTranslations.get(area);
  if (programmaticTranslations) programmaticTranslations.add(nodeId);
  try {
    await area.translate(nodeId, position);
  } finally {
    programmaticTranslations?.delete(nodeId);
  }
}

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Functions and runtime socket objects are not cloneable; fall back to JSON-safe clone.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
