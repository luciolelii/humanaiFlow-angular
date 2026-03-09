import { HttpClient, HttpParams } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { map, Observable } from "rxjs";
import { FieldRetrieverCallServiceBase } from "./field-retriever-call.base";

export class FieldRetrieverCallService extends FieldRetrieverCallServiceBase {
  private readonly http = inject(HttpClient);

  private buildParams(context?: Record<string, string>) {
    let params = new HttpParams();
    const entries = Object.entries(context ?? {});
    for (const [ctxKey, ctxValue] of entries) {
      params = params.set(ctxKey, ctxValue);
    }

    return params;
  }

  override retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>
  ): Observable<string[]> {
    const url = `${environment.apiUrl}/retriever/${encodeURIComponent(blockType)}/${encodeURIComponent(key)}`;
    const params = this.buildParams(context);
    return this.http.get<unknown>(url, { params }).pipe(
      map((raw) => this.normalizeStringList(raw))
    );
  }

  override isFieldRequired(
    blockType: string,
    key: string,
    context?: Record<string, string>
  ): Observable<boolean> {
    const url = `${environment.apiUrl}/retriever/${encodeURIComponent(blockType)}/${encodeURIComponent(key)}/required`;
    const params = this.buildParams(context);
    return this.http.get<boolean>(url, { params });
  }

  private normalizeStringList(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw.filter((item): item is string => typeof item === 'string');
    }

    if (!raw || typeof raw !== 'object') {
      return [];
    }

    const payload = raw as Record<string, unknown>;
    const candidate =
      payload['values'] ??
      payload['items'] ??
      payload['data'] ??
      payload['result'] ??
      [];

    if (!Array.isArray(candidate)) {
      return [];
    }

    return candidate.filter((item): item is string => typeof item === 'string');
  }
}
