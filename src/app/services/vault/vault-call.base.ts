import { VaultSecret, VaultSecretCreateRequest, VaultSecretUpdateRequest } from '@models/assistant';
import { Observable } from 'rxjs';

export abstract class VaultCallServiceBase {
  abstract listSecrets(): Observable<VaultSecret[]>;
  abstract createSecret(request: VaultSecretCreateRequest): Observable<VaultSecret>;
  abstract updateSecret(id: string, request: VaultSecretUpdateRequest): Observable<VaultSecret>;
  abstract deleteSecret(id: string): Observable<void>;
}

export function mapVaultSecrets(raw: unknown): VaultSecret[] {
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>)['items'] ?? (raw as Record<string, unknown>)['values'] ?? [])
      : [];
  return Array.isArray(items) ? items.map(mapVaultSecret).filter((item) => !!item.id) : [];
}

export function mapVaultSecret(raw: unknown): VaultSecret {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: String(value['id'] ?? value['secretId'] ?? ''),
    label: String(value['label'] ?? ''),
    provider: String(value['provider'] ?? ''),
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    active: value['active'] !== false && value['enabled'] !== false,
    lastUsedAt: typeof value['lastUsedAt'] === 'string' ? value['lastUsedAt'] : undefined,
    maskedPreview: typeof value['maskedPreview'] === 'string' ? value['maskedPreview'] : undefined
  };
}
