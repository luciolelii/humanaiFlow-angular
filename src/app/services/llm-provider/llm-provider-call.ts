import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@environment';
import { LlmProviderCapability } from '@models/llm-provider';
import { map, Observable } from 'rxjs';
import { LlmProviderCallServiceBase } from './llm-provider-call.base';

export class LlmProviderCallService extends LlmProviderCallServiceBase {
  private readonly http = inject(HttpClient);

  override listCapabilities(): Observable<LlmProviderCapability[]> {
    return this.http.get<unknown>(`${environment.apiUrl}/llm/providers`).pipe(
      map((raw) => {
        if (!Array.isArray(raw)) return [];
        return raw
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            name: String(item['name'] ?? '').trim(),
            requiresCredential: item['requiresCredential'] === true
          }))
          .filter((item) => item.name.length > 0);
      })
    );
  }
}
