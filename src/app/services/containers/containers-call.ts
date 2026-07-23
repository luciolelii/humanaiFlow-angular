import { HttpClient } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import {
  BiasActivationMode,
  BlockType,
  FlowContainer,
  FlowData,
  FlowSubflowValidationResult
} from "@models/flow";
import { BiasCapabilities } from "@models/bias-impact";
import { map, Observable, of } from "rxjs";
import { ContainersCallServiceBase } from "./container-call.base";
import { attachSharedDefinitions, toApiPath, toNodeCapabilities, toNullableString, toPorts, toPosition, toRecord, toSchema, toValueKinds } from "@services/shared/flow-node-mapping";

export class ContainersCallService extends ContainersCallServiceBase {
  private readonly http = inject(HttpClient);
  private containerTypesCache: BlockType[] | null = null;
  private readonly biasCapabilitiesCache = new Map<string, BiasCapabilities>();

  override retrieveAllContainerTypes(): Observable<BlockType[]> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/containers/types/catalog`)
      .pipe(
        map((raw) => this.parseCatalogResponse(raw)),
        map((types) => {
          this.containerTypesCache = types;
          return types;
        })
      );
  }

  override retrieveBiasCapabilities(containerType: string): Observable<BiasCapabilities> {
    const cached = this.biasCapabilitiesCache.get(containerType);
    if (cached) return of(cached);

    return this.http
      .get<unknown>(`${environment.apiUrl}/containers/types/${encodeURIComponent(containerType)}/bias-capabilities`)
      .pipe(
        map((raw) => this.biasCapabilitiesFromApi(raw, containerType)),
        map((capabilities) => {
          this.biasCapabilitiesCache.set(containerType, capabilities);
          return capabilities;
        })
      );
  }

  override retrieveBiasCapabilitiesForInstance(containerType: string, container: FlowContainer): Observable<BiasCapabilities> {
    return this.http
      .post<unknown>(
        `${environment.apiUrl}/containers/types/${encodeURIComponent(containerType)}/bias-capabilities`,
        container
      )
      .pipe(map((raw) => this.biasCapabilitiesFromApi(raw, containerType)));
  }

  override createEmptyContainer(containerType: string): Observable<FlowContainer> {
    const descriptor = this.containerTypesCache?.find((candidate) => candidate.type === containerType);
    const exampleEndpoint = this.resolveExampleEndpoint(containerType, descriptor);

    return this.http
      .get<unknown>(exampleEndpoint)
      .pipe(map((raw) => this.flowContainerFromApi(raw, containerType)));
  }

  override createContainer(containerId: string, configuration: any): Observable<FlowContainer> {
    const containerType = String(configuration?.typeName ?? configuration?.type ?? "GenericContainer");
    const payload = this.buildContainerConfigurationPayload(
      containerType,
      toRecord(configuration?.specificConfiguration ?? configuration)
    );

    return this.http
      .post<unknown>(`${environment.apiUrl}/containers`, payload)
      .pipe(
        map((raw) => {
          if (!raw || typeof raw !== "object") {
            throw new Error(`Invalid createContainer response for ${containerType}`);
          }
          return raw;
        }),
        map((raw) =>
          this.flowContainerFromApi(
            {
              ...(toRecord(raw)),
              id: toRecord(raw)["id"] ?? containerId
            },
            containerType
          )
        )
      );
  }

  override validateContainerSubflow(subFlow: FlowData, validationUrl?: string | null): Observable<FlowSubflowValidationResult> {
    const resolvedValidationUrl = toApiPath(validationUrl) ?? `${environment.apiUrl}/containers/validate-subflow`;
    return this.http
      .post<unknown>(
        resolvedValidationUrl,
        { subFlow }
      )
      .pipe(map((raw) => this.subflowValidationFromApi(raw)));
  }

  private parseCatalogResponse(raw: unknown): BlockType[] {
    const value = toRecord(raw);
    const descriptors = value["descriptors"];
    if (!Array.isArray(descriptors)) {
      throw new Error('Invalid container catalog response: expected reduced catalog format with a descriptors array');
    }
    const sharedDefinitions = toSchema(value["sharedDefinitions"]);

    return descriptors.map((descriptor) => this.containerTypeFromApi(descriptor, sharedDefinitions));
  }

  private containerTypeFromApi(raw: unknown, sharedDefinitions?: Record<string, unknown> | null): BlockType {
    const value = toRecord(raw);
    const schema = attachSharedDefinitions(
      toSchema(value["schema"] ?? value["configurationSchema"] ?? null),
      sharedDefinitions ?? null
    );

    return {
      type: String(value["type"] ?? value["containerType"] ?? value["name"] ?? "GenericContainer"),
      family: 'container',
      description: String(value["description"] ?? ""),
      userInteractive: Boolean(value["userInteractive"] ?? value["interactive"] ?? false),
      hasExampleBlock: Boolean(value["hasExampleBlock"] ?? value["hasExampleContainer"] ?? false),
      exampleBlockEndpoint: toApiPath(value["exampleBlockEndpoint"] ?? value["exampleContainerEndpoint"]),
      configurationType: toNullableString(value["configurationType"]),
      configurationClass: toNullableString(value["configurationClass"]),
      schema,
      capabilities: toNodeCapabilities(value["capabilities"])
    };
  }

  private flowContainerFromApi(raw: unknown, fallbackTypeName = "GenericContainer"): FlowContainer {
    const root = toRecord(raw);
    const value = toRecord(root["container"] ?? root["node"] ?? root["data"] ?? root);
    const specificConfigurationRaw = value["specificConfiguration"] ?? value["configuration"] ?? value["containerConfiguration"] ?? {};
    const specificConfiguration = toRecord(specificConfigurationRaw);
    const typeName = String(value["typeName"] ?? value["containerType"] ?? specificConfiguration["typeName"] ?? fallbackTypeName);

    return {
      id: String(value["id"] ?? crypto.randomUUID()),
      name: String(value["name"] ?? specificConfiguration["name"] ?? typeName),
      position: toPosition(value["position"]),
      inputs: toPorts(value["inputs"]),
      outputs: toPorts(value["outputs"]),
      specificConfiguration,
      typeName,
      nodeFamily: 'container',
      ...(value["capabilities"] == null ? {} : { capabilities: toNodeCapabilities(value["capabilities"]) }),
      biasAnnotations: Array.isArray(value["biasAnnotations"])
        ? value["biasAnnotations"] as FlowContainer["biasAnnotations"]
        : []
    };
  }

  private biasCapabilitiesFromApi(raw: unknown, fallbackContainerType: string): BiasCapabilities {
    const value = toRecord(raw);
    const activationModes = Array.isArray(value['activationModes'])
      ? value['activationModes']
        .filter((mode): mode is string => typeof mode === 'string')
        .map((mode) => mode as BiasActivationMode)
      : [];

    return {
      blockType: String(value['containerType'] ?? fallbackContainerType),
      supported: value['supported'] === true,
      isolatedExperimentSupported: value['isolatedExperimentSupported'] === true,
      fullFlowExperimentSupported: value['fullFlowExperimentSupported'] === true,
      externalSideEffects: value['externalSideEffects'] === true,
      configurationDependent: value['configurationDependent'] === true,
      activationModes
    };
  }

  private subflowValidationFromApi(raw: unknown): FlowSubflowValidationResult {
    const value = toRecord(raw);
    const rawErrors = Array.isArray(value['errors']) ? value['errors'] : [];

    return {
      valid: Boolean(value['valid'] ?? false),
      errors: rawErrors
        .map((item) => toRecord(item))
        .map((item) => ({
          entity: toNullableString(item['entity']) ?? undefined,
          id: toNullableString(item['id']) ?? undefined,
          field: toNullableString(item['field']) ?? undefined,
          message: String(item['message'] ?? 'Invalid subflow')
        })),
      openInputs: this.toOpenInputs(value['openInputs']),
      openOutputs: this.toOpenOutputs(value['openOutputs'])
    };
  }

  private toOpenInputs(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => toRecord(item))
      .map((item) => {
        const io = toRecord(item['io']);
        const port = toPorts([Object.keys(io).length ? io : item])[0];
        if (!port) return null;
        return {
          ...port,
          targetBlockId: toNullableString(item['targetBlockId'] ?? item['blockId'] ?? item['nodeId']) ?? undefined,
          targetInputName: toNullableString(item['targetInputName'] ?? item['inputName'] ?? io['name']) ?? undefined,
          blockId: toNullableString(item['blockId'] ?? item['nodeId']) ?? undefined,
          inputName: toNullableString(item['inputName'] ?? io['name']) ?? undefined
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  private toOpenOutputs(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => toRecord(item))
      .map((item) => {
        const io = toRecord(item['io']);
        const port = toPorts([Object.keys(io).length ? io : item])[0];
        if (!port) return null;
        return {
          ...port,
          sourceBlockId: toNullableString(item['sourceBlockId'] ?? item['blockId'] ?? item['nodeId']) ?? undefined,
          sourceOutputName: toNullableString(item['sourceOutputName'] ?? item['outputName'] ?? io['name']) ?? undefined,
          blockId: toNullableString(item['blockId'] ?? item['nodeId']) ?? undefined,
          outputName: toNullableString(item['outputName'] ?? io['name']) ?? undefined
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  private resolveExampleEndpoint(typeName: string, descriptor?: BlockType): string {
    if (descriptor?.hasExampleBlock && descriptor.exampleBlockEndpoint) {
      return descriptor.exampleBlockEndpoint;
    }
    return `${environment.apiUrl}/containers/types/${encodeURIComponent(typeName)}/example`;
  }

  private buildContainerConfigurationPayload(containerType: string, configuration: Record<string, unknown>) {
    const { typeName: _ignoreTypeName, ...sanitized } = configuration;
    const normalized = this.normalizeConfigurationWithSchema(containerType, sanitized);
    const configurationType = this.resolveConfigurationType(containerType, normalized);
    return {
      ...normalized,
      type: configurationType,
      name: typeof normalized["name"] === "string" && normalized["name"].length > 0
        ? normalized["name"]
        : containerType
    };
  }

  private normalizeConfigurationWithSchema(containerType: string, configuration: Record<string, unknown>) {
    const normalized = { ...configuration };
    const descriptor = this.containerTypesCache
      ?.find((candidate) => candidate.type === containerType);
    const schema = descriptor?.schema;
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return normalized;
    }

    const required = Array.isArray(schema["required"])
      ? schema["required"].filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (!required.length) return normalized;

    const properties = toRecord(schema["properties"]);
    for (const key of required) {
      if (normalized[key] !== undefined) continue;
      const propertySchema = toRecord(properties[key]);
      const defaultValue = propertySchema["default"];
      if (typeof defaultValue === "boolean" || typeof defaultValue === "number" || typeof defaultValue === "string") {
        normalized[key] = defaultValue;
        continue;
      }
      if (propertySchema["type"] === "boolean") {
        normalized[key] = false;
      }
    }

    return normalized;
  }

  private resolveConfigurationType(containerType: string, configuration: Record<string, unknown>) {
    const explicitType = toNullableString(configuration["type"]);
    if (explicitType) return explicitType;

    const descriptor = this.containerTypesCache
      ?.find((candidate) => candidate.type === containerType);
    const schemaType = this.resolveConfigurationTypeFromSchema(descriptor?.schema);
    if (schemaType) return schemaType;

    return descriptor?.configurationType ?? "GenericContainerConfiguration";
  }

  private resolveConfigurationTypeFromSchema(schema: Record<string, unknown> | null | undefined) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;

    const properties = schema["properties"];
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;

    const typeProperty = (properties as Record<string, unknown>)["type"];
    if (!typeProperty || typeof typeProperty !== "object" || Array.isArray(typeProperty)) return null;

    const typeSchema = typeProperty as Record<string, unknown>;
    const defaultValue = toNullableString(typeSchema["default"]);
    if (defaultValue) return defaultValue;

    const enumValues = Array.isArray(typeSchema["enum"])
      ? typeSchema["enum"].filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (enumValues.length === 1) return enumValues[0];

    return null;
  }
}
