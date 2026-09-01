import { VaultSecret, VaultSecretCreateRequest, VaultSecretUpdateRequest } from '@models/assistant';
import { Observable, of, throwError } from 'rxjs';
import { VaultCallServiceBase } from './vault-call.base';
import { vaultFakeStore } from './vault-fake-store';

export class VaultCallServiceFake extends VaultCallServiceBase {
  override listSecrets(): Observable<VaultSecret[]> {
    return of(vaultFakeStore.list());
  }

  override createSecret(request: VaultSecretCreateRequest): Observable<VaultSecret> {
    if (!request.value.trim()) return throwError(() => new Error('The credential value is required.'));
    return of(vaultFakeStore.create(request));
  }

  override updateSecret(id: string, request: VaultSecretUpdateRequest): Observable<VaultSecret> {
    try {
      return of(vaultFakeStore.update(id, request));
    } catch (error) {
      return throwError(() => error);
    }
  }

  override deleteSecret(id: string): Observable<void> {
    vaultFakeStore.remove(id);
    return of(void 0);
  }
}
