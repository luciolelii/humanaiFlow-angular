import { HttpClient, HttpParams } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { map, Observable, of } from "rxjs";
import { FieldRetrieverCallServiceBase } from "./field-retriever-call.base";

export class FieldRetrieverCallService extends FieldRetrieverCallServiceBase {
  private readonly http = inject(HttpClient);

  override retrieveValues(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ): Observable<string[]> {
    const { url, params } = this.resolveRequest(blockType, key, context, retrieverUrl);
    return this.http.get<unknown>(url, { params }).pipe(
      map((raw) => this.normalizeStringList(raw))
    );
  }

  override isFieldRequired(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null
  ): Observable<boolean> {
    const requiredRetrieverUrl = this.appendRequiredSuffix(retrieverUrl);
    const { url, params } = this.resolveRequest(blockType, key, context, requiredRetrieverUrl, true);
    return this.http.get<boolean>(url, { params });
  }

  override retrieveSchema(
    schemaUrl: string,
    context?: Record<string, string>
  ): Observable<Record<string, unknown> | null> {
    const resolvedUrl = this.resolveApiUrl(schemaUrl);
    if (!resolvedUrl) {
      return of(null);
    }

    const parsed = this.parseUrl(resolvedUrl);
    let params = parsed.params;

    if (context && Object.keys(context).length > 0) {
      for (const [ctxKey, ctxValue] of Object.entries(context)) {
        params = params.set(ctxKey, ctxValue);
      }
    }

    return this.http.get<unknown>(parsed.url, { params }).pipe(
      map((raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null))
    );
  }

  private resolveRequest(
    blockType: string,
    key: string,
    context?: Record<string, string>,
    retrieverUrl?: string | null,
    isRequired = false
  ) {
    const fallbackUrl = `${environment.apiUrl}/retriever/${encodeURIComponent(blockType)}/${encodeURIComponent(key)}${isRequired ? '/required' : ''}`;
    const baseUrl = this.resolveApiUrl(retrieverUrl) ?? fallbackUrl;
    const parsed = this.parseUrl(baseUrl);
    let params = parsed.params;

    if (context && Object.keys(context).length > 0) {
      for (const [ctxKey, ctxValue] of Object.entries(context)) {
        params = params.set(ctxKey, ctxValue);
      }
    }

    return {
      url: parsed.url,
      params
    };
  }

  private resolveApiUrl(rawUrl?: string | null): string | null {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null;
    if (/^https?:\/\//.test(rawUrl)) return rawUrl;
    return `${environment.apiUrl}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
  }

  private parseUrl(rawUrl: string) {
    const [url, queryString] = rawUrl.split('?', 2);
    let params = new HttpParams();

    if (queryString) {
      const searchParams = new URLSearchParams(queryString);
      for (const [key, value] of searchParams.entries()) {
        params = params.append(key, value);
      }
    }

    return { url, params };
  }

  private appendRequiredSuffix(rawUrl?: string | null): string | null {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null;
    const [path, queryString] = rawUrl.split('?', 2);
    const normalizedPath = path.endsWith('/required') ? path : `${path}/required`;
    return queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
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
