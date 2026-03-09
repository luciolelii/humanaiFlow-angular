import { BlockType, FlowBlock } from "@models/flow";
import { HttpClient } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { map, Observable, of, switchMap, take } from "rxjs";
import { BlocksCallServiceBase } from "./block-call.base";

export class BlocksCallService extends BlocksCallServiceBase {
  private readonly http = inject(HttpClient);
  private blockTypesCache: BlockType[] | null = null;

  override retrieveAllBlocksTypes(): Observable<BlockType[]> {
    return this.http
      .get<unknown[]>(`${environment.apiUrl}/blocks/types`)
      .pipe(
        map((raw) => (Array.isArray(raw) ? raw.map((value) => this.blockTypeFromApi(value)) : [])),
        map((types) => {
          this.blockTypesCache = types;
          return types;
        })
      );
  }

  override createEmptyBlock(blockType: string): Observable<FlowBlock> {
    return this.getBlockTypesForCreate().pipe(
      take(1),
      switchMap((types) => {
        const descriptor = types.find((type) => type.type === blockType);
        const configuration = descriptor
          ? this.buildObjectFromSchema(descriptor.schema, descriptor.schema)
          : {};
        const payload = this.buildBlockConfigurationPayload(blockType, configuration);

        return this.http
          .post<unknown>(`${environment.apiUrl}/blocks`, payload)
          .pipe(map((raw) => this.flowBlockFromApi(raw, descriptor?.type ?? blockType, payload)));
      })
    );
  }

  override updateBlock(blockId: string, configuration: any): Observable<FlowBlock> {
    const blockType = String(configuration?.typeName ?? configuration?.type ?? "LLMBlock");
    const payload = this.buildBlockConfigurationPayload(
      blockType,
      this.toRecord(configuration?.specificConfiguration ?? configuration)
    );

    return this.http
      .post<unknown>(`${environment.apiUrl}/blocks`, payload)
      .pipe(
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
  }

  private getBlockTypesForCreate(): Observable<BlockType[]> {
    if (this.blockTypesCache) {
      return of(this.blockTypesCache);
    }
    return this.retrieveAllBlocksTypes();
  }

  private blockTypeFromApi(raw: unknown): BlockType {
    const value = this.toRecord(raw);
    return {
      type: String(value["type"] ?? value["blockType"] ?? value["name"] ?? "LLMBlock"),
      description: String(value["description"] ?? ""),
      userInteractive: Boolean(value["userInteractive"] ?? value["interactive"] ?? false),
      configurationType: this.toNullableString(value["configurationType"]),
      configurationClass: this.toNullableString(value["configurationClass"]),
      schema: this.toSchema(value["schema"] ?? value["configurationSchema"] ?? null)
    };
  }

  private flowBlockFromApi(raw: unknown, fallbackTypeName = "LLMBlock", fallbackConfig?: Record<string, unknown>): FlowBlock {
    const root = this.toRecord(raw);
    const value = this.toRecord(root["block"] ?? root["data"] ?? root);
    const specificConfigurationRaw = value["specificConfiguration"] ?? value["configuration"] ?? value["blockConfiguration"] ?? fallbackConfig ?? {};
    const specificConfiguration = this.toRecord(specificConfigurationRaw);
    const typeName = String(value["typeName"] ?? value["blockType"] ?? specificConfiguration["typeName"] ?? fallbackTypeName);
    const io = this.defaultIOForBlockType(typeName);

    return {
      id: String(value["id"] ?? crypto.randomUUID()),
      sink: typeof value["sink"] === "boolean" ? value["sink"] : typeName === "HumanInteractionBlock",
      name: String(value["name"] ?? specificConfiguration["name"] ?? typeName),
      position: this.toPosition(value["position"]),
      inputs: this.toPorts(value["inputs"], io.inputs),
      outputs: this.toPorts(value["outputs"], io.outputs),
      specificConfiguration,
      typeName
    };
  }

  private toPorts(raw: unknown, fallback: Array<{ name: string; type: string; multiple: boolean }>) {
    if (!Array.isArray(raw)) return fallback;
    return raw
      .map((port) => this.toRecord(port))
      .filter((port) => typeof port["name"] === "string" && (port["name"] as string).length > 0)
      .map((port) => ({
        name: String(port["name"]),
        type: String(port["type"] ?? "TEXT"),
        multiple: Boolean(port["multiple"] ?? false)
      }));
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

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private toNullableString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private buildBlockConfigurationPayload(blockType: string, configuration: Record<string, unknown>) {
    const { typeName: _ignoreTypeName, ...sanitized } = configuration;
    return {
      ...sanitized,
      name: typeof sanitized["name"] === "string" && sanitized["name"].length > 0
        ? sanitized["name"]
        : blockType
    };
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
