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
            "x-retriever-name": "Flows",
            "x-retriever-url": "/secure-retriever/Flows/subFlow/items",
            "x-retriever-structured-data": true,
            "x-retriever-requires-auth": true,
            "x-retriever-validation-url": "/containers/validate-subflow",
            "default": {
              "blocks": [],
              "containers": [],
              "connections": []
            }
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
        }
      },
      typeName: descriptor?.type ?? containerType,
      nodeFamily: 'container'
    });
  }

  override createContainer(containerId: string, configuration: any): Observable<FlowContainer> {
    const typeName = String(configuration?.typeName ?? configuration?.type ?? 'GenericContainer');
    const specificConfiguration = {
      ...configuration,
      name: typeof configuration?.name === 'string' && configuration.name.length > 0
        ? configuration.name
        : 'Container'
    };

    return of({
      id: containerId,
      name: String(specificConfiguration.name ?? typeName),
      position: undefined,
      inputs: [],
      outputs: [],
      specificConfiguration,
      typeName,
      nodeFamily: 'container'
    });
  }

  override validateContainerSubflow(subFlow: FlowData, _validationUrl?: string | null): Observable<FlowSubflowValidationResult> {
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
