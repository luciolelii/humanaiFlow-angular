import { Injectable } from '@angular/core';
import {
  AssistantDraftPayload,
  AssistantExplainResponse,
  AssistantFlowResponse,
  AssistantValidationIssue
} from '@models/assistant';
import { environment } from '@environment';
import { AssistantCallServiceBase } from './assistant-call.base';

@Injectable({
  providedIn: 'root'
})
export class AssistantService {
  private readonly assistantCall: AssistantCallServiceBase = new environment.assistantCallService();

  listModels() {
    return this.assistantCall.listModels();
  }

  createDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
  }) {
    return this.assistantCall.createDraft(request);
  }

  refineDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
  }) {
    return this.assistantCall.refineDraft(request);
  }

  fixDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
    validationErrors?: AssistantValidationIssue[];
  }) {
    return this.assistantCall.fixDraft(request);
  }

  explainDraft(request: {
    userPrompt: string;
    model: string;
    flow: AssistantDraftPayload;
  }) {
    return this.assistantCall.explainDraft(request);
  }
}
