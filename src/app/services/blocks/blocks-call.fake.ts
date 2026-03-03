import { BlockType, FlowBlock } from "@models/flow";
import { Observable, of } from "rxjs";
import { BlocksCallServiceBase } from "./block-call.base";

export class BlocksCallServiceFake extends BlocksCallServiceBase {
  private readonly blockTypes: BlockType[] = [
  {
    "type": "HumanInteractionBlock",
    "description": "A block that requires human interaction",
    "userInteractive": true,
    "configurationType": "HumanInteractiveBlockConfiguration",
    "configurationClass": "it.cnr.isti.workflow.manager.blocks.configurations.HumanInteractiveBlockConfiguration",
    "schema": {
      "$schema": "http://json-schema.org/draft-04/schema#",
      "title": "HumanInteractiveBlockConfiguration",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "HumanInteractiveBlockConfiguration"
          ],
          "default": "HumanInteractiveBlockConfiguration"
        },
        "name": {
          "type": "string"
        },
        "actionDescription": {
          "type": "string"
        },
        "llmDescriptor": {
          "$ref": "#/definitions/LLMDescriptor"
        },
        "inputAsList": {
          "type": "boolean"
        },
        "outputAsList": {
          "type": "boolean"
        }
      },
      "required": [
        "type",
        "name",
        "actionDescription",
        "llmDescriptor",
        "inputAsList",
        "outputAsList"
      ],
      "definitions": {
        "LLMDescriptor": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "provider",
            "model"
          ],
          "properties": {
            "provider": {
              "type": "string",
              "x-retriever-name": "providers",
              "x-retriever-url": "/retriever/{blockType}/providers",
              "x-retriever-owner": "LLMDescriptor"
            },
            "model": {
              "type": "string",
              "x-retriever-name": "models",
              "x-retriever-url": "/retriever/{blockType}/models",
              "x-retriever-owner": "LLMDescriptor",
              "x-retriever-depends-on": [
                "provider"
              ]
            }
          }
        }
      }
    }
  },
  {
    "type": "LLMBlock",
    "description": "This type represents a LLM node in the workflow manager",
    "userInteractive": false,
    "configurationType": "LLMBlockConfiguration",
    "configurationClass": "it.cnr.isti.workflow.manager.blocks.configurations.LLMBlockConfiguration",
    "schema": {
      "$schema": "http://json-schema.org/draft-04/schema#",
      "title": "LLMBlockConfiguration",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "LLMBlockConfiguration"
          ],
          "default": "LLMBlockConfiguration"
        },
        "name": {
          "type": "string"
        },
        "llmDescriptor": {
          "$ref": "#/definitions/LLMDescriptor"
        },
        "prompt": {
          "type": "string"
        }
      },
      "required": [
        "type",
        "name",
        "llmDescriptor",
        "prompt"
      ],
      "definitions": {
        "LLMDescriptor": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "provider",
            "model"
          ],
          "properties": {
            "provider": {
              "type": "string",
              "x-retriever-name": "providers",
              "x-retriever-url": "/retriever/{blockType}/providers",
              "x-retriever-owner": "LLMDescriptor"
            },
            "model": {
              "type": "string",
              "x-retriever-name": "models",
              "x-retriever-url": "/retriever/{blockType}/models",
              "x-retriever-owner": "LLMDescriptor",
              "x-retriever-depends-on": [
                "provider"
              ]
            }
          }
        }
      }
    }
  },
  {
    "type": "SourceBlock",
    "description": "This type represents a source node in the workflow manager",
    "userInteractive": true,
    "configurationType": null,
    "configurationClass": null,
    "schema": null
  }
];

  override retrieveAllBlocksTypes(): Observable<BlockType[]> {
    return of(this.blockTypes);
  }

  override createEmptyBlock(blockType: string): Observable<FlowBlock> {
    const descriptor = this.blockTypes.find((b) => b.type === blockType);
    const typeName = descriptor?.type ?? blockType ?? "LLMBlock";
    const schema = descriptor?.schema as Record<string, any> | null;

    const specificConfiguration = schema
      ? this.buildObjectFromSchema(schema, schema)
      : {};

    if (typeof specificConfiguration === "object" && specificConfiguration != null) {
      if (!("name" in specificConfiguration)) {
        (specificConfiguration as any).name = typeName;
      }
    }

    const io = this.defaultIOForBlockType(typeName);
    const block: FlowBlock = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      sink: typeName === "HumanInteractionBlock",
      name: typeName,
      position: undefined,
      inputs: io.inputs,
      outputs: io.outputs,
      specificConfiguration,
      typeName
    };

    return of(block);
  }

  override updateBlock(blockId: string, configuration: any): Observable<FlowBlock> {
    const typeName = configuration?.typeName ?? "LLMBlock";
    const io = this.defaultIOForBlockType(typeName);
    const block: FlowBlock = {
      id: blockId,
      sink: typeName === "HumanInteractionBlock",
      name: configuration?.name ?? typeName,
      position: configuration?.position,
      inputs: configuration?.inputs ?? io.inputs,
      outputs: configuration?.outputs ?? io.outputs,
      specificConfiguration: configuration?.specificConfiguration ?? {},
      typeName
    };
    return of(block);
  }

  private defaultIOForBlockType(typeName: string) {
    if (typeName === "SourceBlock") {
      return {
        inputs: [],
        outputs: [{ name: "output", type: "TEXT", multiple: false }]
      };
    }

    if (typeName === "HumanInteractionBlock") {
      return {
        inputs: [{ name: "input", type: "TEXT", multiple: false }],
        outputs: [{ name: "output", type: "TEXT", multiple: false }]
      };
    }

    return {
      inputs: [{ name: "input", type: "TEXT", multiple: false }],
      outputs: [{ name: "output", type: "TEXT", multiple: false }]
    };
  }

  private buildObjectFromSchema(node: any, root: any): any {
    const resolved = this.resolveRef(node, root);
    if (!resolved || typeof resolved !== "object") return {};

    if (resolved.type === "object" || resolved.properties) {
      const result: Record<string, any> = {};
      const props = resolved.properties ?? {};
      for (const [key, propSchema] of Object.entries(props)) {
        result[key] = this.buildValueFromSchema(propSchema, root);
      }
      return result;
    }

    return this.buildValueFromSchema(resolved, root);
  }

  private buildValueFromSchema(node: any, root: any): any {
    const resolved = this.resolveRef(node, root);
    if (!resolved || typeof resolved !== "object") return null;

    if (Object.prototype.hasOwnProperty.call(resolved, "default")) {
      return resolved.default;
    }

    if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
      return resolved.enum[0];
    }

    const type = resolved.type;
    if (type === "string") return "";
    if (type === "boolean") return false;
    if (type === "number" || type === "integer") return 0;
    if (type === "array") return [];
    if (type === "object" || resolved.properties) {
      return this.buildObjectFromSchema(resolved, root);
    }

    return null;
  }

  private resolveRef(node: any, root: any): any {
    if (!node || typeof node !== "object") return node;
    if (!node.$ref) return node;

    const ref = node.$ref as string;
    if (!ref.startsWith("#/")) return node;

    const path = ref.slice(2).split("/");
    let current: any = root;
    for (const segment of path) {
      current = current?.[segment];
      if (current == null) return node;
    }
    return current;
  }
}
