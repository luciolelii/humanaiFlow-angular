import { BiasActivationMode, BiasAnnotationOption, BiasAnnotationsDescriptor, BlockType, FlowBlock } from "@models/flow";
import { BiasCapabilities } from '@models/bias-impact';
import { HttpClient, HttpParams } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { catchError, map, Observable, of, switchMap, take, throwError } from "rxjs";
import { BlockDraftContext, BlocksCallServiceBase } from "./block-call.base";
import { attachSharedDefinitions, toApiPath, toNullableString, toPorts, toPosition, toRecord, toSchema, toValueKinds } from "@services/shared/flow-node-mapping";

export class BlocksCallService extends BlocksCallServiceBase {
  private readonly http = inject(HttpClient);
  private blockTypesCache: BlockType[] | null = null;
  private readonly biasCapabilitiesCache = new Map<string, BiasCapabilities>();

  override retrieveAllBlocksTypes(): Observable<BlockType[]> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/blocks/types/catalog`)
      .pipe(
        map((raw) => this.parseCatalogResponse(raw)),
        map((types) => {
          this.blockTypesCache = types;
          return types;
        })
      );
  }

  override retrieveBiasAnnotationsDescriptor(): Observable<BiasAnnotationsDescriptor> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/blocks/bias-annotations/descriptor`)
      .pipe(map((raw) => this.biasAnnotationsDescriptorFromApi(raw)));
  }

  override retrieveBiasCapabilities(blockType: string): Observable<BiasCapabilities> {
    const cached = this.biasCapabilitiesCache.get(blockType);
    if (cached) return of(cached);

    return this.http
      .get<unknown>(`${environment.apiUrl}/blocks/types/${encodeURIComponent(blockType)}/bias-capabilities`)
      .pipe(
        map((raw) => this.biasCapabilitiesFromApi(raw, blockType)),
        map((capabilities) => {
          this.biasCapabilitiesCache.set(blockType, capabilities);
          return capabilities;
        })
      );
  }

  override retrieveBiasCapabilitiesForInstance(blockType: string, block: FlowBlock): Observable<BiasCapabilities> {
    return this.http
      .post<unknown>(
        `${environment.apiUrl}/blocks/types/${encodeURIComponent(blockType)}/bias-capabilities`,
        block
      )
      .pipe(map((raw) => this.biasCapabilitiesFromApi(raw, blockType)));
  }

  override createEmptyBlock(blockType: string, context?: BlockDraftContext): Observable<FlowBlock> {
    return this.getBlockTypesForCreate().pipe(
      take(1),
      switchMap((types) => {
        const descriptor = types.find((type) => type.type === blockType);
        const exampleEndpoint = this.resolveExampleEndpoint(blockType, descriptor);

        if (exampleEndpoint) {
          return this.http
            .get<unknown>(exampleEndpoint)
            .pipe(map((raw) => this.flowBlockFromApi(raw, descriptor?.type ?? blockType)));
        }

        const configuration = descriptor
          ? this.buildObjectFromSchema(descriptor.schema, descriptor.schema)
          : {};
        const payload = this.buildBlockConfigurationPayload(blockType, configuration);

        return this.http
          .post<unknown>(`${environment.apiUrl}/blocks`, payload, {
            params: this.toDraftContextParams(context)
          })
          .pipe(map((raw) => this.flowBlockFromApi(raw, descriptor?.type ?? blockType, payload)));
      })
    );
  }

  override updateBlock(blockId: string, configuration: any, context?: BlockDraftContext): Observable<FlowBlock> {
    const blockType = String(configuration?.typeName ?? configuration?.type ?? "LLMBlock");
    return this.getBlockTypesForCreate().pipe(
      take(1),
      switchMap((types) => {
        const descriptor = types.find((type) => type.type === blockType);
        const payload = this.buildBlockConfigurationPayload(
          blockType,
          toRecord(configuration?.specificConfiguration ?? configuration),
          descriptor?.schema ?? null
        );

        return this.http
          .post<unknown>(`${environment.apiUrl}/blocks`, payload, {
            params: this.toDraftContextParams(context, blockId)
          })
          .pipe(
            map((raw) => {
              if (!raw || typeof raw !== "object") {
                throw new Error(`Invalid updateBlock response for ${blockType}`);
              }
              return raw;
            }),
            map((raw) =>
              this.flowBlockFromApi(
                {
                  ...(toRecord(raw)),
                  id: toRecord(raw)["id"] ?? blockId
                },
                blockType,
                payload
              )
            )
          );
      }),
      catchError((error) => throwError(() => this.toUpdateBlockError(error, blockType)))
    );
  }

  private getBlockTypesForCreate(): Observable<BlockType[]> {
    if (this.blockTypesCache) {
      return of(this.blockTypesCache);
    }
    return this.retrieveAllBlocksTypes();
  }

  private parseCatalogResponse(raw: unknown): BlockType[] {
    const value = toRecord(raw);
    const descriptors = value["descriptors"];
    if (!Array.isArray(descriptors)) {
      throw new Error('Invalid block catalog response: expected reduced catalog format with a descriptors array');
    }
    const sharedDefinitions = toSchema(value["sharedDefinitions"]);

    return descriptors.map((descriptor) => this.blockTypeFromApi(descriptor, sharedDefinitions));
  }

  private blockTypeFromApi(raw: unknown, sharedDefinitions?: Record<string, unknown> | null): BlockType {
    const value = toRecord(raw);
    const schema = attachSharedDefinitions(
      toSchema(value["schema"] ?? value["configurationSchema"] ?? null),
      sharedDefinitions ?? null
    );

    return {
      type: String(value["type"] ?? value["blockType"] ?? value["name"] ?? "LLMBlock"),
      family: 'block',
      description: String(value["description"] ?? ""),
      userInteractive: Boolean(value["userInteractive"] ?? value["interactive"] ?? false),
      interactionContract: this.toInteractionContract(value["interactionContract"]),
      hasExampleBlock: Boolean(value["hasExampleBlock"] ?? false),
      exampleBlockEndpoint: toApiPath(value["exampleBlockEndpoint"]),
      configurationType: toNullableString(value["configurationType"]),
      configurationClass: toNullableString(value["configurationClass"]),
      schema
    };
  }

  private flowBlockFromApi(raw: unknown, fallbackTypeName = "LLMBlock", fallbackConfig?: Record<string, unknown>): FlowBlock {
    const root = toRecord(raw);
    const value = toRecord(root["block"] ?? root["node"] ?? root["data"] ?? root);
    const specificConfigurationRaw = value["specificConfiguration"] ?? value["configuration"] ?? value["blockConfiguration"] ?? fallbackConfig ?? {};
    const specificConfiguration = toRecord(specificConfigurationRaw);
    const typeName = String(value["typeName"] ?? value["blockType"] ?? specificConfiguration["typeName"] ?? fallbackTypeName);
    const io = this.defaultIOForBlockType(typeName);

    return {
      id: String(value["id"] ?? crypto.randomUUID()),
      name: String(value["name"] ?? specificConfiguration["name"] ?? typeName),
      position: toPosition(value["position"]),
      inputs: toPorts(value["inputs"], io.inputs),
      outputs: toPorts(value["outputs"], io.outputs),
      specificConfiguration,
      typeName,
      nodeFamily: 'block',
      biasAnnotations: Array.isArray(value["biasAnnotations"])
        ? value["biasAnnotations"] as FlowBlock["biasAnnotations"]
        : []
    };
  }

  private biasAnnotationsDescriptorFromApi(raw: unknown): BiasAnnotationsDescriptor {
    const value = toRecord(raw);
    const rawOptions = toRecord(value["options"]);
    const options: Record<string, BiasAnnotationOption[]> = {};
    for (const [field, entries] of Object.entries(rawOptions)) {
      if (!Array.isArray(entries)) continue;
      options[field] = entries
        .map((entry) => toRecord(entry))
        .filter((entry) => typeof entry["value"] === "string")
        .map((entry) => ({
          value: String(entry["value"]),
          label: String(entry["label"] ?? entry["value"]),
          description: typeof entry["description"] === "string" ? entry["description"] : undefined
        }));
    }

    const maxItems = Number(value["maxItems"]);
    return {
      type: String(value["type"] ?? ""),
      blockProperty: String(value["blockProperty"] ?? "biasAnnotations"),
      multiple: value["multiple"] !== false,
      maxItems: Number.isFinite(maxItems) && maxItems >= 0 ? maxItems : null,
      schema: toRecord(value["schema"]),
      options,
      defaults: toRecord(value["defaults"]),
      serverGeneratedFields: Array.isArray(value["serverGeneratedFields"])
        ? value["serverGeneratedFields"].map(String)
        : []
    };
  }

  private biasCapabilitiesFromApi(raw: unknown, fallbackBlockType: string): BiasCapabilities {
    const value = toRecord(raw);
    const activationModes = Array.isArray(value['activationModes'])
      ? value['activationModes']
        .filter((mode): mode is string => typeof mode === 'string')
        .map((mode) => mode as BiasActivationMode)
      : [];

    return {
      blockType: String(value['blockType'] ?? fallbackBlockType),
      supported: value['supported'] === true,
      isolatedExperimentSupported: value['isolatedExperimentSupported'] === true,
      fullFlowExperimentSupported: value['fullFlowExperimentSupported'] === true,
      externalSideEffects: value['externalSideEffects'] === true,
      configurationDependent: value['configurationDependent'] === true,
      activationModes
    };
  }

  private toInteractionContract(raw: unknown): BlockType["interactionContract"] {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    const kind = typeof value["kind"] === "string" && value["kind"].trim().length > 0
      ? value["kind"].trim()
      : null;
    if (!kind) return null;

    const asNullableString = (input: unknown) =>
      typeof input === "string" && input.trim().length > 0 ? input.trim() : null;

    return {
      kind,
      messageField: asNullableString(value["messageField"]),
      completionField: asNullableString(value["completionField"]),
      historyField: asNullableString(value["historyField"]),
      responseField: asNullableString(value["responseField"]),
      supportsPartialResult: value["supportsPartialResult"] === true
    };
  }

  private buildBlockConfigurationPayload(
    blockType: string,
    configuration: Record<string, unknown>,
    schema?: Record<string, unknown> | null
  ) {
    const { typeName: _ignoreTypeName, ...rawConfiguration } = configuration;
    const sanitized = this.sanitizeConfigurationBySchema(rawConfiguration, schema ?? null, schema ?? null);
    return {
      ...sanitized,
      name: typeof sanitized["name"] === "string" && sanitized["name"].length > 0
        ? sanitized["name"]
        : blockType
    };
  }

  private toDraftContextParams(context?: BlockDraftContext, blockId?: string) {
    let params = new HttpParams();
    const flowId = typeof context?.flowId === 'string' && context.flowId.trim().length > 0
      ? context.flowId.trim()
      : null;
    const replacesBlockId = typeof context?.replacesBlockId === 'string' && context.replacesBlockId.trim().length > 0
      ? context.replacesBlockId.trim()
      : (typeof blockId === 'string' && blockId.trim().length > 0 ? blockId.trim() : null);

    if (flowId) {
      params = params.set('flowId', flowId);
    }
    if (replacesBlockId) {
      params = params.set('replacesBlockId', replacesBlockId);
    }

    return params;
  }

  private resolveExampleEndpoint(typeName: string, descriptor?: BlockType): string {
    if (descriptor?.hasExampleBlock && descriptor.exampleBlockEndpoint) {
      return descriptor.exampleBlockEndpoint;
    }
    return `${environment.apiUrl}/blocks/types/${encodeURIComponent(typeName)}/example`;
  }

  private toUpdateBlockError(error: unknown, blockType: string): Error {
    if (error instanceof Error) {
      return new Error(`updateBlock failed for ${blockType}: ${error.message}`);
    }
    return new Error(`updateBlock failed for ${blockType}`);
  }

  private defaultIOForBlockType(typeName: string) {
    if (typeName === "SourceBlock") {
      return {
        inputs: [],
        outputs: [{ name: "output", type: "TEXT", multiple: false }]
      };
    }

    return {
      inputs: [{ name: "input", type: "TEXT", multiple: false }],
      outputs: [{ name: "output", type: "TEXT", multiple: false }]
    };
  }

  private buildObjectFromSchema(node: unknown, root: unknown): Record<string, unknown> {
    const resolved = this.resolveRef(node, root);
    const resolvedRecord = toRecord(resolved);
    const properties = toRecord(resolvedRecord["properties"]);

    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = this.buildValueFromSchema(propSchema, root);
    }
    return result;
  }

  private buildValueFromSchema(node: unknown, root: unknown): unknown {
    const resolved = this.resolveRef(node, root);
    const value = toRecord(resolved);

    if (Object.prototype.hasOwnProperty.call(value, "default")) {
      return value["default"];
    }

    const enumValues = value["enum"];
    if (Array.isArray(enumValues) && enumValues.length > 0) {
      return enumValues[0];
    }

    const type = value["type"];
    if (type === "string") return "";
    if (type === "boolean") return false;
    if (type === "number" || type === "integer") return 0;
    if (type === "array") return [];
    if (type === "object" || Object.prototype.hasOwnProperty.call(value, "properties")) {
      return this.buildObjectFromSchema(value, root);
    }

    return null;
  }

  private sanitizeConfigurationBySchema(
    configuration: Record<string, unknown>,
    schemaNode: Record<string, unknown> | null,
    schemaRoot: Record<string, unknown> | null
  ): Record<string, unknown> {
    if (!schemaNode || !schemaRoot) return { ...configuration };

    const resolved = this.resolveRef(schemaNode, schemaRoot);
    const schemaRecord = toRecord(resolved);
    const properties = toRecord(schemaRecord["properties"]);
    if (!Object.keys(properties).length) {
      return { ...configuration };
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(configuration)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      const propertySchema = toRecord(properties[key]);
      sanitized[key] = this.sanitizeSchemaValue(value, propertySchema, schemaRoot);
    }

    return sanitized;
  }

  private sanitizeSchemaValue(
    value: unknown,
    schemaNode: Record<string, unknown> | null,
    schemaRoot: Record<string, unknown> | null
  ): unknown {
    if (!schemaNode || !schemaRoot || value == null) return value;

    const resolved = this.resolveRef(schemaNode, schemaRoot);
    const schemaRecord = toRecord(resolved);
    const type = schemaRecord["type"];

    if ((type === "object" || schemaRecord["properties"]) && value && typeof value === "object" && !Array.isArray(value)) {
      return this.sanitizeConfigurationBySchema(toRecord(value), schemaRecord, schemaRoot);
    }

    if (type === "array" && Array.isArray(value)) {
      const itemSchema = toRecord(schemaRecord["items"]);
      return value.map((item) => this.sanitizeSchemaValue(item, itemSchema, schemaRoot));
    }

    return value;
  }

  private resolveRef(node: unknown, root: unknown): unknown {
    const value = toRecord(node);
    const ref = value["$ref"];
    if (typeof ref !== "string" || !ref.startsWith("#/")) return node;

    const path = ref.slice(2).split("/");
    let current: unknown = root;
    for (const segment of path) {
      if (!current || typeof current !== "object" || Array.isArray(current)) return node;
      current = (current as Record<string, unknown>)[segment];
    }
    return current ?? node;
  }
}
