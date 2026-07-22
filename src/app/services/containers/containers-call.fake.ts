import { BlockType, FlowContainer, FlowData, FlowSubflowValidationResult } from "@models/flow";
import { BiasCapabilities } from "@models/bias-impact";
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

  override retrieveBiasCapabilities(containerType: string): Observable<BiasCapabilities> {
    return of(this.biasCapabilities(containerType));
  }

  override retrieveBiasCapabilitiesForInstance(containerType: string, _container: FlowContainer): Observable<BiasCapabilities> {
    return of(this.biasCapabilities(containerType));
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
          connections: [],
          dependencies: []
        }
      },
      typeName: descriptor?.type ?? containerType,
      nodeFamily: 'container'
    });
  }

  override createContainer(containerId: string, configuration: any): Observable<FlowContainer> {
    const typeName = String(configuration?.typeName ?? configuration?.type ?? 'GenericContainer');
    const configurationType = this.resolveConfigurationType(typeName, configuration);
    const specificConfiguration = {
      ...configuration,
      type: configurationType,
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

  private biasCapabilities(containerType: string): BiasCapabilities {
    return {
      blockType: containerType,
      supported: true,
      isolatedExperimentSupported: false,
      fullFlowExperimentSupported: true,
      externalSideEffects: false,
      configurationDependent: false,
      activationModes: ['INPUT_TRANSFORMATION', 'OUTPUT_TRANSFORMATION']
    };
  }

  private resolveConfigurationType(containerType: string, configuration: Record<string, unknown>) {
    const explicitType = configuration['type'];
    if (typeof explicitType === 'string' && explicitType.length > 0) {
      return explicitType;
    }

    const descriptor = this.containerTypes.find((candidate) => candidate.type === containerType);
    const schemaType = this.resolveConfigurationTypeFromSchema(descriptor?.schema);
    if (schemaType) return schemaType;

    return descriptor?.configurationType ?? 'GenericContainerConfiguration';
  }

  private resolveConfigurationTypeFromSchema(schema: Record<string, unknown> | null | undefined) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;

    const properties = schema['properties'];
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;

    const typeProperty = (properties as Record<string, unknown>)['type'];
    if (!typeProperty || typeof typeProperty !== 'object' || Array.isArray(typeProperty)) return null;

    const typeSchema = typeProperty as Record<string, unknown>;
    if (typeof typeSchema['default'] === 'string' && typeSchema['default'].length > 0) {
      return typeSchema['default'];
    }

    const enumValues = Array.isArray(typeSchema['enum'])
      ? typeSchema['enum'].filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [];
    if (enumValues.length === 1) return enumValues[0];

    return null;
  }
}
