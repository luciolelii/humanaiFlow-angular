import { ExecutionVaultCredential } from '@models/llm-provider';
import { Observable } from 'rxjs';

export abstract class ExecutionVaultCredentialsCallServiceBase {
  abstract listForProvider(provider: string): Observable<ExecutionVaultCredential[]>;
}
