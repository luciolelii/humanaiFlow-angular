import { HttpClient } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import {
  BlockType,
  FlowContainer,
  FlowData,
  FlowSubflowValidationResult
} from "@models/flow";
import { map, Observable } from "rxjs";
import { ContainersCallServiceBase } from "./container-call.base";

export class ContainersCallService extends ContainersCallServiceBase {
  private readonly http = inject(HttpClient);
  private containerTypesCache: BlockType[] | null = null;

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
      this.toRecord(configuration?.specificConfiguration ?? configuration)
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
              ...(this.toRecord(raw)),
              id: this.toRecord(raw)["id"] ?? containerId
            },
            containerType
          )
        )
      );
  }

  override validateContainerSubflow(subFlow: FlowData, validationUrl?: string | null): Observable<FlowSubflowValidationResult> {
    const resolvedValidationUrl = this.toApiPath(validationUrl) ?? `${environment.apiUrl}/containers/validate-subflow`;
    return this.http
      .post<unknown>(
        resolvedValidationUrl,
        { subFlow }
      )
      .pipe(map((raw) => this.subflowValidationFromApi(raw)));
  }

  private parseCatalogResponse(raw: unknown): BlockType[] {
    const value = this.toRecord(raw);
    const descriptors = value["descriptors"];
    if (!Array.isArray(descriptors)) {
      throw new Error('Invalid container catalog response: expected reduced catalog format with a descriptors array');
    }
    const sharedDefinitions = this.toSchema(value["sharedDefinitions"]);

    return descriptors.map((descriptor) => this.containerTypeFromApi(descriptor, sharedDefinitions));
  }

  private containerTypeFromApi(raw: unknown, sharedDefinitions?: Record<string, unknown> | null): BlockType {
    const value = this.toRecord(raw);
    const schema = this.attachSharedDefinitions(
      this.toSchema(value["schema"] ?? value["configurationSchema"] ?? null),
      sharedDefinitions ?? null
    );

    return {
      type: String(value["type"] ?? value["containerType"] ?? value["name"] ?? "GenericContainer"),
      family: 'container',
      description: String(value["description"] ?? ""),
      userInteractive: Boolean(value["userInteractive"] ?? value["interactive"] ?? false),
      hasExampleBlock: Boolean(value["hasExampleBlock"] ?? value["hasExampleContainer"] ?? false),
      exampleBlockEndpoint: this.toApiPath(value["exampleBlockEndpoint"] ?? value["exampleContainerEndpoint"]),
      configurationType: this.toNullableString(value["configurationType"]),
      configurationClass: this.toNullableString(value["configurationClass"]),
      schema
    };
  }

  private flowContainerFromApi(raw: unknown, fallbackTypeName = "GenericContainer"): FlowContainer {
    const root = this.toRecord(raw);
    const value = this.toRecord(root["container"] ?? root["node"] ?? root["data"] ?? root);
    const specificConfigurationRaw = value["specificConfiguration"] ?? value["configuration"] ?? value["containerConfiguration"] ?? {};
    const specificConfiguration = this.toRecord(specificConfigurationRaw);
    const typeName = String(value["typeName"] ?? value["containerType"] ?? specificConfiguration["typeName"] ?? fallbackTypeName);

    return {
      id: String(value["id"] ?? crypto.randomUUID()),
      name: String(value["name"] ?? specificConfiguration["name"] ?? typeName),
      position: this.toPosition(value["position"]),
      inputs: this.toPorts(value["inputs"]),
      outputs: this.toPorts(value["outputs"]),
      specificConfiguration,
      typeName,
      nodeFamily: 'container'
    };
  }

  private subflowValidationFromApi(raw: unknown): FlowSubflowValidationResult {
    const value = this.toRecord(raw);
    const rawErrors = Array.isArray(value['errors']) ? value['errors'] : [];

    return {
      valid: Boolean(value['valid'] ?? false),
      errors: rawErrors
        .map((item) => this.toRecord(item))
        .map((item) => ({
          entity: this.toNullableString(item['entity']) ?? undefined,
          id: this.toNullableString(item['id']) ?? undefined,
          field: this.toNullableString(item['field']) ?? undefined,
          message: String(item['message'] ?? 'Invalid subflow')
        })),
      openInputs: this.toOpenInputs(value['openInputs']),
      openOutputs: this.toOpenOutputs(value['openOutputs'])
    };
  }

  private toOpenInputs(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => this.toRecord(item))
      .map((item) => {
        const io = this.toRecord(item['io']);
        const port = this.toPorts([Object.keys(io).length ? io : item])[0];
        if (!port) return null;
        return {
          ...port,
          targetBlockId: this.toNullableString(item['targetBlockId'] ?? item['blockId'] ?? item['nodeId']) ?? undefined,
          targetInputName: this.toNullableString(item['targetInputName'] ?? item['inputName'] ?? io['name']) ?? undefined,
          blockId: this.toNullableString(item['blockId'] ?? item['nodeId']) ?? undefined,
          inputName: this.toNullableString(item['inputName'] ?? io['name']) ?? undefined
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  private toOpenOutputs(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => this.toRecord(item))
      .map((item) => {
        const io = this.toRecord(item['io']);
        const port = this.toPorts([Object.keys(io).length ? io : item])[0];
        if (!port) return null;
        return {
          ...port,
          sourceBlockId: this.toNullableString(item['sourceBlockId'] ?? item['blockId'] ?? item['nodeId']) ?? undefined,
          sourceOutputName: this.toNullableString(item['sourceOutputName'] ?? item['outputName'] ?? io['name']) ?? undefined,
          blockId: this.toNullableString(item['blockId'] ?? item['nodeId']) ?? undefined,
          outputName: this.toNullableString(item['outputName'] ?? io['name']) ?? undefined
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  private toPorts(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((port) => this.toRecord(port))
      .filter((port) => typeof port["name"] === "string" && (port["name"] as string).length > 0)
      .map((port) => {
        const type = String(port["type"] ?? "TEXT");
        const multiple = Boolean(port["multiple"] ?? false);
        return {
          ...port,
          name: String(port["name"]),
          type,
          multiple,
          valueKinds: this.toValueKinds(port["valueKinds"], { type, multiple })
        };
      });
  }

  private toValueKinds(raw: unknown, fallback: { type: string; multiple: boolean }) {
    if (!Array.isArray(raw)) {
      return [{ type: fallback.type, multiple: fallback.multiple }];
    }

    const kinds = raw
      .map((item) => this.toRecord(item))
      .filter((item) => typeof item["type"] === "string")
      .map((item) => ({
        type: String(item["type"] ?? fallback.type),
        multiple: Boolean(item["multiple"] ?? false)
      }));

    return kinds.length ? kinds : [{ type: fallback.type, multiple: fallback.multiple }];
  }

  private toPosition(raw: unknown): { x: number; y: number } | undefined {
    const value = this.toRecord(raw);
    const x = value["x"];
    const y = value["y"];
    if (typeof x !== "number" || typeof y !== "number") return undefined;
    return { x, y };
  }

  private toSchema(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  }

  private attachSharedDefinitions(
    schema: Record<string, unknown> | null,
    sharedDefinitions: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!schema) return null;
    if (!sharedDefinitions || !Object.keys(sharedDefinitions).length) return schema;

    return {
      ...schema,
      sharedDefinitions: {
        ...sharedDefinitions,
        ...this.toRecord(schema["sharedDefinitions"])
      }
    };
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private toNullableString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private toApiPath(value: unknown): string | null {
    if (typeof value !== "string" || value.length === 0) return null;
    if (/^https?:\/\//.test(value)) return value;
    return `${environment.apiUrl}${value.startsWith("/") ? value : `/${value}`}`;
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

    const properties = this.toRecord(schema["properties"]);
    for (const key of required) {
      if (normalized[key] !== undefined) continue;
      const propertySchema = this.toRecord(properties[key]);
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
    const explicitType = this.toNullableString(configuration["type"]);
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
    const defaultValue = this.toNullableString(typeSchema["default"]);
    if (defaultValue) return defaultValue;

    const enumValues = Array.isArray(typeSchema["enum"])
      ? typeSchema["enum"].filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (enumValues.length === 1) return enumValues[0];

    return null;
  }
}
