import { ExecutionVaultCredential } from '@models/llm-provider';
import { Observable, of } from 'rxjs';
import { vaultFakeStore } from '@services/vault/vault-fake-store';
import { ExecutionVaultCredentialsCallServiceBase } from './execution-vault-credentials-call.base';

export class ExecutionVaultCredentialsCallServiceFake extends ExecutionVaultCredentialsCallServiceBase {
  override listForProvider(provider: string): Observable<ExecutionVaultCredential[]> {
    return of(vaultFakeStore.listActiveByProvider(provider).map((secret) => ({
      id: secret.id,
      label: secret.label,
      description: secret.description,
      provider: secret.provider
    })));
  }
}
