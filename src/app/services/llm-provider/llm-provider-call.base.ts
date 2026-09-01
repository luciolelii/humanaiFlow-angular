import { LlmProviderCapability } from '@models/llm-provider';
import { Observable } from 'rxjs';

export abstract class LlmProviderCallServiceBase {
  abstract listCapabilities(): Observable<LlmProviderCapability[]>;
}
