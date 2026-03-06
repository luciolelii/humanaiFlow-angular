import { HttpClient, HttpParams } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { Observable } from "rxjs";
import { FieldRetrieverCallServiceBase } from "./field-retriever-call.base";

export class FieldRetrieverCallService extends FieldRetrieverCallServiceBase {
  private readonly http = inject(HttpClient);

  private buildParams(context?: Record<string, string>) {
    let params = new HttpParams();
    const entries = Object.entries(context ?? {});

    if (!entries.length) {
      // New API marks `params` as required even when empty.
      return params.set('params', '{}');
    }

    for (const [ctxKey, ctxValue] of entries) {
      params = params.set(`params[${ctxKey}]`, ctxValue);
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
    return this.http.get<string[]>(url, { params });
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
}
