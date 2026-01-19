import { Injector } from "@angular/core";
import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets
} from "rete-connection-plugin";
import { AngularPlugin, Presets, AngularArea2D, NodeComponent } from "rete-angular-plugin/21";
import { InputNodeComponent } from "@shared/nodes/input/input-node.component";
import { OutputNodeComponent } from "@shared/nodes/output/output-node.component";
import { flowTest } from "@models/test";

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type AreaExtra = AngularArea2D<Schemes>;

export async function createEditor(container: HTMLElement, injector: Injector, flowData?: any) {
  const socket = new ClassicPreset.Socket("socket");

  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
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

                    return NodeComponent;

                }
            },
        })
    );

  connection.addPreset(ConnectionPresets.classic.setup());

  editor.use(area);
  area.use(connection);
  area.use(render);

  AreaExtensions.simpleNodesOrder(area);

  if (flowTest) {
        for (const nodeData of flowTest.nodes) {
            const node = new ClassicPreset.Node(nodeData.nodeDefinition?.category || "Undefined");
            node.id = nodeData.key;
            Object.entries(nodeData.nodeDefinition?.outputs).forEach(([output, def]) => {
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
    }

    //await editor.addConnection(new ClassicPreset.Connection(a, "a", b, "b"));

  AreaExtensions.zoomAt(area, editor.getNodes());

  return () => area.destroy();
}
