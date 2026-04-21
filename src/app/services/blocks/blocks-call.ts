import { BlockType, FlowBlock } from "@models/flow";
import { HttpClient, HttpParams } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { catchError, map, Observable, of, switchMap, take, throwError } from "rxjs";
import { BlockDraftContext, BlocksCallServiceBase } from "./block-call.base";

export class BlocksCallService extends BlocksCallServiceBase {
  private readonly http = inject(HttpClient);
  private blockTypesCache: BlockType[] | null = null;

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
          this.toRecord(configuration?.specificConfiguration ?? configuration),
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
                  ...(this.toRecord(raw)),
                  id: this.toRecord(raw)["id"] ?? blockId
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
    const value = this.toRecord(raw);
    const descriptors = value["descriptors"];
    if (!Array.isArray(descriptors)) {
      throw new Error('Invalid block catalog response: expected reduced catalog format with a descriptors array');
    }
    const sharedDefinitions = this.toSchema(value["sharedDefinitions"]);

    return descriptors.map((descriptor) => this.blockTypeFromApi(descriptor, sharedDefinitions));
  }

  private blockTypeFromApi(raw: unknown, sharedDefinitions?: Record<string, unknown> | null): BlockType {
    const value = this.toRecord(raw);
    const schema = this.attachSharedDefinitions(
      this.toSchema(value["schema"] ?? value["configurationSchema"] ?? null),
      sharedDefinitions ?? null
    );

    return {
      type: String(value["type"] ?? value["blockType"] ?? value["name"] ?? "LLMBlock"),
      family: 'block',
      description: String(value["description"] ?? ""),
      userInteractive: Boolean(value["userInteractive"] ?? value["interactive"] ?? false),
      interactionContract: this.toInteractionContract(value["interactionContract"]),
      hasExampleBlock: Boolean(value["hasExampleBlock"] ?? false),
      exampleBlockEndpoint: this.toApiPath(value["exampleBlockEndpoint"]),
      configurationType: this.toNullableString(value["configurationType"]),
      configurationClass: this.toNullableString(value["configurationClass"]),
      schema
    };
  }

  private flowBlockFromApi(raw: unknown, fallbackTypeName = "LLMBlock", fallbackConfig?: Record<string, unknown>): FlowBlock {
    const root = this.toRecord(raw);
    const value = this.toRecord(root["block"] ?? root["node"] ?? root["data"] ?? root);
    const specificConfigurationRaw = value["specificConfiguration"] ?? value["configuration"] ?? value["blockConfiguration"] ?? fallbackConfig ?? {};
    const specificConfiguration = this.toRecord(specificConfigurationRaw);
    const typeName = String(value["typeName"] ?? value["blockType"] ?? specificConfiguration["typeName"] ?? fallbackTypeName);
    const io = this.defaultIOForBlockType(typeName);

    return {
      id: String(value["id"] ?? crypto.randomUUID()),
      name: String(value["name"] ?? specificConfiguration["name"] ?? typeName),
      position: this.toPosition(value["position"]),
      inputs: this.toPorts(value["inputs"], io.inputs),
      outputs: this.toPorts(value["outputs"], io.outputs),
      specificConfiguration,
      typeName,
      nodeFamily: 'block'
    };
  }

  private toPorts(raw: unknown, fallback: Array<{ name: string; type: string; multiple: boolean }>) {
    if (!Array.isArray(raw)) return fallback;
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
    const resolvedRecord = this.toRecord(resolved);
    const properties = this.toRecord(resolvedRecord["properties"]);

    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = this.buildValueFromSchema(propSchema, root);
    }
    return result;
  }

  private buildValueFromSchema(node: unknown, root: unknown): unknown {
    const resolved = this.resolveRef(node, root);
    const value = this.toRecord(resolved);

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
    const schemaRecord = this.toRecord(resolved);
    const properties = this.toRecord(schemaRecord["properties"]);
    if (!Object.keys(properties).length) {
      return { ...configuration };
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(configuration)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      const propertySchema = this.toRecord(properties[key]);
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
    const schemaRecord = this.toRecord(resolved);
    const type = schemaRecord["type"];

    if ((type === "object" || schemaRecord["properties"]) && value && typeof value === "object" && !Array.isArray(value)) {
      return this.sanitizeConfigurationBySchema(this.toRecord(value), schemaRecord, schemaRoot);
    }

    if (type === "array" && Array.isArray(value)) {
      const itemSchema = this.toRecord(schemaRecord["items"]);
      return value.map((item) => this.sanitizeSchemaValue(item, itemSchema, schemaRoot));
    }

    return value;
  }

  private resolveRef(node: unknown, root: unknown): unknown {
    const value = this.toRecord(node);
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
