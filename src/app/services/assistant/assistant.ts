import { Injectable } from '@angular/core';
import { environment } from '@environment';
import {
  AssistantSessionMessageRequest,
  AssistantSessionRequest
} from '@models/assistant';
import { AssistantCallServiceBase } from './assistant-call.base';

@Injectable({
  providedIn: 'root'
})
export class AssistantService {
  private readonly assistantCall: AssistantCallServiceBase = new environment.assistantCallService();

  getConfig() {
    return this.assistantCall.getConfig();
  }

  listProviders(retrieverUrl: string) {
    return this.assistantCall.listProviders(retrieverUrl);
  }

  listModels(retrieverUrlTemplate: string, provider: string) {
    return this.assistantCall.listModels(retrieverUrlTemplate, provider);
  }

  createSession(request: AssistantSessionRequest) {
    return this.assistantCall.createSession(request);
  }

  submitMessage(sessionId: string, request: AssistantSessionMessageRequest) {
    return this.assistantCall.submitMessage(sessionId, request);
  }

  getCall(callId: string) {
    return this.assistantCall.getCall(callId);
  }

  cancelCall(callId: string) {
    return this.assistantCall.cancelCall(callId);
  }

}
