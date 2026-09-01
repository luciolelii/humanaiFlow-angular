import { LlmProviderCapability } from '@models/llm-provider';
import { Observable, of } from 'rxjs';
import { LlmProviderCallServiceBase } from './llm-provider-call.base';

export class LlmProviderCallServiceFake extends LlmProviderCallServiceBase {
  override listCapabilities(): Observable<LlmProviderCapability[]> {
    return of([
      { name: 'InternalOllama', requiresCredential: false },
      { name: 'testProvider', requiresCredential: true },
      { name: 'Gemini', requiresCredential: true }
    ]);
  }
}
