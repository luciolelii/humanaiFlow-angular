import { Injectable } from '@angular/core';
import { environment } from '@environment';
import { AssistantSendMessageRequest } from '@models/assistant';
import { AssistantCallServiceBase } from './assistant-call.base';

@Injectable({
  providedIn: 'root'
})
export class AssistantService {
  private readonly assistantCall: AssistantCallServiceBase = new environment.assistantCallService();

  getConfig() {
    return this.assistantCall.getConfig();
  }

  listModels(retrieverUrl: string) {
    return this.assistantCall.listModels(retrieverUrl);
  }

  createSession(request: { model: string }) {
    return this.assistantCall.createSession(request);
  }

  sendMessage(sessionId: string, request: AssistantSendMessageRequest) {
    return this.assistantCall.sendMessage(sessionId, request);
  }

  getCall(callId: string) {
    return this.assistantCall.getCall(callId);
  }

  getSession(sessionId: string) {
    return this.assistantCall.getSession(sessionId);
  }
}
