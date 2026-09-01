import { Injectable } from '@angular/core';
import { environment } from '@environment';
import { LlmProviderCapability } from '@models/llm-provider';
import { Observable } from 'rxjs';
import { LlmProviderCallServiceBase } from './llm-provider-call.base';

@Injectable({ providedIn: 'root' })
export class LlmProviderService {
  llmProviderCallService: LlmProviderCallServiceBase = new environment.llmProviderCallService();

  listCapabilities(): Observable<LlmProviderCapability[]> {
    return this.llmProviderCallService.listCapabilities();
  }
}
