import { HttpClient, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@environment';
import { ExecutionVaultCredential } from '@models/llm-provider';
import { map, Observable } from 'rxjs';
import { ExecutionVaultCredentialsCallServiceBase } from './execution-vault-credentials-call.base';

export class ExecutionVaultCredentialsCallService extends ExecutionVaultCredentialsCallServiceBase {
  private readonly http = inject(HttpClient);

  override listForProvider(provider: string): Observable<ExecutionVaultCredential[]> {
    const params = new HttpParams().set('provider', provider);
    return this.http.get<unknown>(
      `${environment.apiUrl}/secure-retriever/UserSecrets/forProvider/items`,
      { params }
    ).pipe(map((raw) => normalizeCredentials(raw)));
  }
}

function normalizeCredentials(raw: unknown): ExecutionVaultCredential[] {
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>)['items'] ?? (raw as Record<string, unknown>)['values'] ?? [])
      : [];
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const descriptor = value['descriptor'] && typeof value['descriptor'] === 'object'
      ? value['descriptor'] as Record<string, unknown>
      : {};
    const meta = descriptor['meta'] && typeof descriptor['meta'] === 'object'
      ? descriptor['meta'] as Record<string, unknown>
      : {};
    return {
      id: String(value['data'] ?? ''),
      label: String(descriptor['label'] ?? 'Credential'),
      description: typeof descriptor['description'] === 'string' ? descriptor['description'] : undefined,
      provider: String(meta['provider'] ?? '')
    };
  }).filter((item) => item.id.length > 0);
}
