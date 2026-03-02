import { HttpClient, HttpParams } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { Observable } from "rxjs";
import { FieldRetreiverCallServiceBase } from "./field-retreiver-call.base";

export class FieldRetreiverCallService extends FieldRetreiverCallServiceBase {
  private readonly http = inject(HttpClient);

  override retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>
  ): Observable<string[]> {
    const url = `${environment.apiUrl}/retriever/${encodeURIComponent(blockType)}/${encodeURIComponent(key)}`;
    let params = new HttpParams();
    for (const [ctxKey, ctxValue] of Object.entries(context ?? {})) {
      params = params.set(ctxKey, ctxValue);
    }
    return this.http.get<string[]>(url, { params });
  }
}
