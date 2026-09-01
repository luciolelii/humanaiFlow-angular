import { Injectable } from '@angular/core';
import { environment } from '@environment';
import {
  AssistantFlowRequest,
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

  draft(request: AssistantFlowRequest) {
    return this.assistantCall.draft(request);
  }

  refine(request: AssistantFlowRequest) {
    return this.assistantCall.refine(request);
  }

  fix(request: AssistantFlowRequest) {
    return this.assistantCall.fix(request);
  }

  explain(request: AssistantFlowRequest) {
    return this.assistantCall.explain(request);
  }

}
