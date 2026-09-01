import { Injectable } from '@angular/core';
import { environment } from '@environment';
import { ExecutionVaultCredential } from '@models/llm-provider';
import { Observable } from 'rxjs';
import { ExecutionVaultCredentialsCallServiceBase } from './execution-vault-credentials-call.base';

@Injectable({ providedIn: 'root' })
export class ExecutionVaultCredentialsService {
  executionVaultCredentialsCallService: ExecutionVaultCredentialsCallServiceBase =
    new environment.executionVaultCredentialsCallService();

  listForProvider(provider: string): Observable<ExecutionVaultCredential[]> {
    return this.executionVaultCredentialsCallService.listForProvider(provider);
  }
}
