import { Injector, Input } from "@angular/core";
import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets
} from "rete-connection-plugin";
import { AngularPlugin, Presets, AngularArea2D, NodeComponent } from "rete-angular-plugin/21";
import { InputNodeComponent } from "@shared/nodes/input/input-node.component";
import { OutputNodeComponent } from "@shared/nodes/output/output-node.component";
import { HFNode, HFSchemes } from "@models/nodes";
import { FlowData, INodeModel } from "@models/flow";
import { LLMNodeComponent } from "@shared/nodes/llm/llm";
import { OutputSocket } from "@shared/sockets/output/output";
import { InputSocket } from "@shared/sockets/input/input";

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type AreaExtra = AngularArea2D<Schemes>;

export async function createEditor(container: HTMLElement, injector: Injector, flowData: FlowData) {

  const editor = new NodeEditor<HFSchemes>();
  const area = new AreaPlugin<HFSchemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new AngularPlugin<Schemes, AreaExtra>({ injector });

  AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
    accumulating: AreaExtensions.accumulateOnCtrl()
  });

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
        socket(context) {
          const side = context.side;
          return side === "input" ? InputSocket : OutputSocket;

        }
      },
    })
  );

  area.addPipe((c) => {
    if (c.type === "render") console.log(c.data);
    return c;
  });

  connection.addPreset(ConnectionPresets.classic.setup());

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
  const nodes: INodeModel[] = editor.getNodes().map(node => ({
    key: node.data.key,
    name: node.data.name,
    position: node.data.position,
    nodeDefinition: node.data.nodeDefinition,
    parameters: node.data.parameters,

  }));

  const connections = editor.getConnections().map(c => ({
    id: c.id,
    from: {
      nodeId: c.source,
      output: c.sourceOutput
    },
    to: {
      nodeId: c.target,
      input: c.targetInput
    }
  }));

  return {
    nodes,
    connections
  };
}


async function loadFlowData(editor: NodeEditor<HFSchemes>, flowData: FlowData) {
  if (flowData.nodes.length === 0) return;
  const socket = new ClassicPreset.Socket("socket");
  const nodeMapping = new Map<string, string>();
  for (const nodeData of flowData.nodes) {
    if (!nodeData.nodeDefinition) continue;
    const node: HFNode = new ClassicPreset.Node(nodeData.nodeDefinition.category) as HFNode;
    node.data = nodeData;
    nodeMapping.set(nodeData.key, node.id);
    Object.entries(nodeData.nodeDefinition?.outputs).forEach(([output, def]) => {
      console.log("Adding output", output);
      node.addOutput(output,
        new ClassicPreset.Output(
          socket, output
        )
      );
    });
    Object.entries(nodeData.nodeDefinition?.inputs).forEach(([input, def]) => {
      console.log("Adding input", input);
      node.addInput(input,
        new ClassicPreset.Input(
          socket, input
        )
      );
    });

    await editor.addNode(node);
    /*if (nodeData.position != null)
        area.translate(node.id, { x: nodeData.position.x, y: nodeData.position.y });*/
  }

  for (const connections of flowData.connections) {
    {
      if (!nodeMapping.has(connections.sourceNode) || !nodeMapping.has(connections.targetNode)) {
        console.warn("Cannot create connection, node not found", connections);
        continue;
      }
      const targetNode = editor.getNode(nodeMapping.get(connections.targetNode)!) as HFNode;
      const node = editor.getNode(nodeMapping.get(connections.sourceNode)!) as HFNode;
      if (node && targetNode) {
        console.log("Creating connection from", node.id, "to", targetNode.id);
        const connection = new ClassicPreset.Connection(
          node,
          connections.sourceField,
          targetNode,
          connections.targetField
        );
        await editor.addConnection(connection);
      }

    }
  }

}

