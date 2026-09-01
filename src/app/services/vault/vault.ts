import { Injectable } from '@angular/core';
import { environment } from '@environment';
import { VaultSecret, VaultSecretCreateRequest, VaultSecretUpdateRequest } from '@models/assistant';
import { Observable } from 'rxjs';
import { VaultCallServiceBase } from './vault-call.base';

export { CREDENTIAL_ERROR_MESSAGES } from './credential-error-messages';

@Injectable({ providedIn: 'root' })
export class VaultService {
  vaultCallService: VaultCallServiceBase = new environment.vaultCallService();

  listSecrets(): Observable<VaultSecret[]> {
    return this.vaultCallService.listSecrets();
  }

  createSecret(request: VaultSecretCreateRequest): Observable<VaultSecret> {
    return this.vaultCallService.createSecret(request);
  }

  updateSecret(id: string, request: VaultSecretUpdateRequest): Observable<VaultSecret> {
    return this.vaultCallService.updateSecret(id, request);
  }

  deleteSecret(id: string): Observable<void> {
    return this.vaultCallService.deleteSecret(id);
  }
}
