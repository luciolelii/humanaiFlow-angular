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

  override retrieveAllContainerTypes(): Observable<BlockType[]> {
    return this.http
      .get<unknown[]>(`${environment.apiUrl}/containers/types`)
      .pipe(
        map((raw) => (Array.isArray(raw) ? raw.map((value) => this.containerTypeFromApi(value)) : []))
      );
  }

  override createEmptyContainer(containerType: string): Observable<FlowContainer> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/containers/types/${encodeURIComponent(containerType)}/example`)
      .pipe(map((raw) => this.flowContainerFromApi(raw, containerType)));
  }

  override validateContainerSubflow(subFlow: FlowData): Observable<FlowSubflowValidationResult> {
    return this.http
      .post<unknown>(
        `${environment.apiUrl}/containers/types/GenericContainer/validate-subflow`,
        { subFlow }
      )
      .pipe(map((raw) => this.subflowValidationFromApi(raw)));
  }

  private containerTypeFromApi(raw: unknown): BlockType {
    const value = this.toRecord(raw);
    return {
      type: String(value["type"] ?? value["containerType"] ?? value["name"] ?? "GenericContainer"),
      family: 'container',
      description: String(value["description"] ?? ""),
      userInteractive: Boolean(value["userInteractive"] ?? value["interactive"] ?? false),
      hasExampleBlock: Boolean(value["hasExampleBlock"] ?? false),
      exampleBlockEndpoint: this.toApiPath(value["exampleBlockEndpoint"]),
      configurationType: this.toNullableString(value["configurationType"]),
      configurationClass: this.toNullableString(value["configurationClass"]),
      schema: this.toSchema(value["schema"] ?? value["configurationSchema"] ?? null)
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
      openInputs: this.toPorts(value['openInputs']).map((port) => ({
        ...port,
        targetBlockId: this.toNullableString(this.toRecord(port)['targetBlockId']) ?? undefined,
        targetInputName: this.toNullableString(this.toRecord(port)['targetInputName']) ?? undefined,
        blockId: this.toNullableString(this.toRecord(port)['blockId']) ?? undefined,
        inputName: this.toNullableString(this.toRecord(port)['inputName']) ?? undefined
      })),
      openOutputs: this.toPorts(value['openOutputs']).map((port) => ({
        ...port,
        sourceBlockId: this.toNullableString(this.toRecord(port)['sourceBlockId']) ?? undefined,
        sourceOutputName: this.toNullableString(this.toRecord(port)['sourceOutputName']) ?? undefined,
        blockId: this.toNullableString(this.toRecord(port)['blockId']) ?? undefined,
        outputName: this.toNullableString(this.toRecord(port)['outputName']) ?? undefined
      }))
    };
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
}
