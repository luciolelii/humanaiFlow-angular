import { BlockType, FlowContainer, FlowData, FlowSubflowValidationResult } from "@models/flow";
import { Observable, of } from "rxjs";
import { ContainersCallServiceBase } from "./container-call.base";

export class ContainersCallServiceFake extends ContainersCallServiceBase {
  private readonly containerTypes: BlockType[] = [
    {
      type: "GenericContainer",
      family: "container",
      description: "Container node with an embedded validated subflow",
      userInteractive: false,
      configurationType: "GenericContainerConfiguration",
      configurationClass: "it.cnr.isti.workflow.manager.blocks.configurations.GenericContainerConfiguration",
      schema: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "title": "GenericContainerConfiguration",
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "type": {
            "type": "string",
            "enum": ["GenericContainerConfiguration"],
            "default": "GenericContainerConfiguration"
          },
          "name": {
            "type": "string",
            "default": "Container"
          },
          "subFlow": {
            "type": "object",
            "default": {
              "blocks": [],
              "containers": [],
              "connections": []
            }
          },
          "publicInputs": {
            "type": "array",
            "default": []
          },
          "publicOutputs": {
            "type": "array",
            "default": []
          }
        },
        "required": ["type", "name"]
      }
    }
  ];

  override retrieveAllContainerTypes(): Observable<BlockType[]> {
    return of(this.containerTypes);
  }

  override createEmptyContainer(containerType: string): Observable<FlowContainer> {
    const descriptor = this.containerTypes.find((container) => container.type === containerType);
    return of({
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      name: String((descriptor?.schema as any)?.properties?.name?.default ?? containerType),
      position: undefined,
      inputs: [],
      outputs: [],
      specificConfiguration: {
        type: "GenericContainerConfiguration",
        name: "Container",
        subFlow: {
          blocks: [],
          containers: [],
          connections: []
        },
        publicInputs: [],
        publicOutputs: []
      },
      typeName: descriptor?.type ?? containerType,
      nodeFamily: 'container'
    });
  }

  override validateContainerSubflow(subFlow: FlowData): Observable<FlowSubflowValidationResult> {
    const blocks = Array.isArray(subFlow?.blocks) ? subFlow.blocks : [];
    const containers = Array.isArray(subFlow?.containers) ? subFlow.containers : [];

    if (!blocks.length && !containers.length) {
      return of({
        valid: false,
        errors: [{ entity: 'flow', field: 'blocks', message: 'Subflow cannot be empty' }],
        openInputs: [],
        openOutputs: []
      });
    }

    const nestedContainer = containers.find((container) => container?.typeName === 'GenericContainer');
    if (nestedContainer) {
      return of({
        valid: false,
        errors: [{
          entity: 'container',
          id: nestedContainer.id,
          field: 'type',
          message: 'Nested GenericContainer nodes are not supported'
        }],
        openInputs: [],
        openOutputs: []
      });
    }

    return of({
      valid: true,
      errors: [],
      openInputs: [],
      openOutputs: []
    });
  }
}
