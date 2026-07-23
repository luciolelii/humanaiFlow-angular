import { BiasAnnotationsDescriptor, BlockType, DEFAULT_NODE_CAPABILITIES, FlowBlock } from "@models/flow";
import { BiasCapabilities } from '@models/bias-impact';
import { Observable, of } from "rxjs";
import { BlockDraftContext, BlocksCallServiceBase } from "./block-call.base";

export class BlocksCallServiceFake extends BlocksCallServiceBase {
  private readonly blockTypes: BlockType[] =[
  {
    "type": "HumanInteractionBlock",
    "family": "block",
    "description": "A block that requires human interaction",
    "userInteractive": true,
    "interactionContract": {
      "kind": "single-response",
      "messageField": null,
      "completionField": "output",
      "historyField": null,
      "responseField": "output",
      "supportsPartialResult": false
    },
    "capabilities": DEFAULT_NODE_CAPABILITIES,
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
          "type": "string",
          "x-ui-widget": "textarea",
          "x-ui-placeholder": "Describe the human task",
          "x-ui-accept-variable-as-placeholder": false
        },
        "simulateWith": {
          "$ref": "#/definitions/LLMDescriptor"
        }
      },
      "required": [
        "type",
        "name",
        "actionDescription",
        "simulateWith"
      ],
      "definitions": {
        "LLMDescriptor": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "provider": {
              "type": "string",
              "x-retriever-name": "LLM",
              "x-retriever-url": "/retriever/LLM/providers",
              "x-retriever-owner": "LLMDescriptor"
            },
            "model": {
              "type": "string",
              "x-retriever-name": "LLM",
              "x-retriever-url": "/retriever/LLM/models",
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
    "family": "block",
    "description": "This type represents a LLM node in the workflow manager",
    "userInteractive": false,
    "capabilities": DEFAULT_NODE_CAPABILITIES,
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
          "type": "string",
          "x-ui-widget": "textarea",
          "x-ui-placeholder": "Write the prompt to execute",
          "x-ui-tip": "Use ${{}} to indicate variables, for example: What is the capital of ${{country}}?",
          "x-ui-accept-variable-as-placeholder": true
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
          "properties": {
            "provider": {
              "type": "string",
              "x-retriever-name": "LLM",
              "x-retriever-url": "/retriever/LLM/providers",
              "x-retriever-owner": "LLMDescriptor"
            },
            "model": {
              "type": "string",
              "x-retriever-name": "LLM",
              "x-retriever-url": "/retriever/LLM/models",
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
    "type": "EndBlock",
    "family": "block",
    "description": "Records a terminal outcome for the selected workflow path",
    "userInteractive": false,
    "capabilities": {
      "visualRole": "END",
      "terminal": true,
      "biasAnnotationsAllowed": false,
      "allowsIncomingConnections": true,
      "allowsOutgoingConnections": false,
      "canDependOnOtherNodes": false,
      "canHaveDependentNodes": false
    },
    "configurationType": "EndBlockConfiguration",
    "configurationClass": "it.cnr.isti.workflow.manager.blocks.configurations.EndBlockConfiguration",
    "schema": {
      "$schema": "http://json-schema.org/draft-04/schema#",
      "title": "EndBlockConfiguration",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "EndBlockConfiguration"
          ],
          "default": "EndBlockConfiguration"
        },
        "name": {
          "type": "string"
        },
        "outcomeLabel": {
          "type": "string",
          "x-ui-placeholder": "Outcome label"
        },
        "outcomeCode": {
          "type": "string",
          "x-ui-visible-when": {
            "field": "mode",
            "equals": "__never__"
          }
        },
        "mode": {
          "type": "string",
          "enum": [
            "PATH_END"
          ],
          "default": "PATH_END",
          "x-ui-visible-when": {
            "field": "mode",
            "equals": "__never__"
          }
        }
      },
      "required": [
        "type",
        "name",
        "outcomeLabel",
        "outcomeCode",
        "mode"
      ]
    }
  },
];

  override retrieveAllBlocksTypes(): Observable<BlockType[]> {
    return of(this.blockTypes);
  }

  override retrieveBiasAnnotationsDescriptor(): Observable<BiasAnnotationsDescriptor> {
    return of({
      type: 'BiasAnnotation',
      blockProperty: 'biasAnnotations',
      multiple: true,
      maxItems: 20,
      schema: {
        type: 'object',
        required: ['category', 'severity', 'issue'],
        properties: {
          id: { type: 'string' },
          category: { type: 'string', 'x-ui-label': 'Category', 'x-ui-order': 1 },
          severity: { type: 'string', 'x-ui-label': 'Severity', 'x-ui-order': 2 },
          issue: { type: 'string', maxLength: 2000, 'x-ui-widget': 'textarea', 'x-ui-order': 3 },
          rationale: { type: 'string', maxLength: 4000, 'x-ui-widget': 'textarea', 'x-ui-order': 4 },
          mitigation: { type: 'string', maxLength: 4000, 'x-ui-widget': 'textarea', 'x-ui-order': 5 },
          status: { type: 'string', 'x-ui-order': 6 },
          source: { type: 'string', 'x-ui-order': 7 },
          analysisId: { type: 'string', maxLength: 255, 'x-ui-order': 8 }
        }
      },
      options: {
        category: [{ value: 'AUTOMATION_BIAS', label: 'Automation bias', description: 'Over-reliance on automated decisions.' }],
        severity: [{ value: 'HIGH', label: 'High' }],
        status: [{ value: 'PROPOSED', label: 'Proposed' }],
        source: [{ value: 'MANUAL', label: 'Manual' }]
      },
      defaults: { status: 'PROPOSED', source: 'MANUAL' },
      serverGeneratedFields: ['id']
    });
  }

  override retrieveBiasCapabilities(blockType: string): Observable<BiasCapabilities> {
    return of(this.biasCapabilities(blockType, false));
  }

  override retrieveBiasCapabilitiesForInstance(blockType: string, block: FlowBlock): Observable<BiasCapabilities> {
    const usesLlm = Boolean((block.specificConfiguration as Record<string, unknown>)['useLlm']);
    return of({
      ...this.biasCapabilities(blockType, true),
      activationModes: usesLlm
        ? ['PROMPT_DIRECTIVE', 'INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION']
        : ['INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION']
    });
  }

  override createEmptyBlock(blockType: string, _context?: BlockDraftContext): Observable<FlowBlock> {
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
      name: typeName,
      position: undefined,
      inputs: io.inputs,
      outputs: io.outputs,
      specificConfiguration,
      typeName,
      nodeFamily: 'block'
    };

    return of(block);
  }

  override updateBlock(blockId: string, configuration: any, _context?: BlockDraftContext): Observable<FlowBlock> {
    const typeName = configuration?.typeName ?? "LLMBlock";
    const io = this.defaultIOForBlockType(typeName);
    const descriptor = this.blockTypes.find((item) => item.type === typeName);
    const specificConfiguration = this.sanitizeConfigurationBySchema(
      configuration?.specificConfiguration ?? configuration ?? {},
      (descriptor?.schema as Record<string, unknown> | null) ?? null,
      (descriptor?.schema as Record<string, unknown> | null) ?? null
    );
    const block: FlowBlock = {
      id: blockId,
      name: specificConfiguration?.['name'] ?? configuration?.name ?? typeName,
      position: configuration?.position,
      inputs: configuration?.inputs ?? io.inputs,
      outputs: configuration?.outputs ?? io.outputs,
      specificConfiguration,
      typeName,
      nodeFamily: 'block'
    };
    return of(block);
  }

  private sanitizeConfigurationBySchema(
    configuration: any,
    schemaNode: Record<string, unknown> | null,
    schemaRoot: Record<string, unknown> | null
  ) {
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return {};
    if (!schemaNode || !schemaRoot) return { ...(configuration as Record<string, unknown>) };

    const resolved = this.resolveRef(schemaNode, schemaRoot);
    const schemaRecord = resolved && typeof resolved === 'object' && !Array.isArray(resolved)
      ? resolved as Record<string, unknown>
      : {};
    const properties = schemaRecord['properties'] && typeof schemaRecord['properties'] === 'object' && !Array.isArray(schemaRecord['properties'])
      ? schemaRecord['properties'] as Record<string, unknown>
      : {};

    if (!Object.keys(properties).length) {
      return { ...(configuration as Record<string, unknown>) };
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(configuration as Record<string, unknown>)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      const propertySchema = properties[key] && typeof properties[key] === 'object' && !Array.isArray(properties[key])
        ? properties[key] as Record<string, unknown>
        : null;
      sanitized[key] = this.sanitizeSchemaValue(value, propertySchema, schemaRoot);
    }

    return sanitized;
  }

  private biasCapabilities(blockType: string, instanceSpecific: boolean): BiasCapabilities {
    const configurationDependent = blockType === 'ConditionalBlock' || blockType === 'SwitchBlock';
    const externalSideEffects = blockType === 'HTTPServerCallBlock'
      || blockType === 'MCPAgentBlock'
      || blockType === 'MCPAgentChatBlock';
    const activationModes = externalSideEffects
      ? ['MOCK_RESPONSE']
      : configurationDependent && !instanceSpecific
        ? ['INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION']
        : ['PROMPT_DIRECTIVE', 'INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION'];

    return {
      blockType,
      supported: activationModes.length > 0,
      isolatedExperimentSupported: true,
      fullFlowExperimentSupported: activationModes.length > 0,
      externalSideEffects,
      configurationDependent,
      activationModes
    };
  }

  private sanitizeSchemaValue(
    value: unknown,
    schemaNode: Record<string, unknown> | null,
    schemaRoot: Record<string, unknown> | null
  ): unknown {
    if (!schemaNode || !schemaRoot || value == null) return value;

    const resolved = this.resolveRef(schemaNode, schemaRoot);
    const schemaRecord = resolved && typeof resolved === 'object' && !Array.isArray(resolved)
      ? resolved as Record<string, unknown>
      : {};
    const type = schemaRecord['type'];

    if ((type === 'object' || schemaRecord['properties']) && value && typeof value === 'object' && !Array.isArray(value)) {
      return this.sanitizeConfigurationBySchema(value as Record<string, unknown>, schemaRecord, schemaRoot);
    }

    if (type === 'array' && Array.isArray(value)) {
      const itemSchema = schemaRecord['items'] && typeof schemaRecord['items'] === 'object' && !Array.isArray(schemaRecord['items'])
        ? schemaRecord['items'] as Record<string, unknown>
        : null;
      return value.map((item) => this.sanitizeSchemaValue(item, itemSchema, schemaRoot));
    }

    return value;
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

    if (typeName === "EndBlock") {
      return {
        inputs: [{ name: "input", type: "TEXT", multiple: false }],
        outputs: []
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
