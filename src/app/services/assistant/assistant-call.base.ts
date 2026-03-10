import {
  AssistantDraftPayload,
  AssistantExplainResponse,
  AssistantFlowResponse,
  AssistantValidationIssue
} from '@models/assistant';
import { Observable } from 'rxjs';

export abstract class AssistantCallServiceBase {
  abstract listModels(): Observable<string[]>;

  abstract createDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
  }): Observable<AssistantFlowResponse>;

  abstract refineDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
  }): Observable<AssistantFlowResponse>;

  abstract fixDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
    validationErrors?: AssistantValidationIssue[];
  }): Observable<AssistantFlowResponse>;

  abstract explainDraft(request: {
    userPrompt: string;
    model: string;
    flow: AssistantDraftPayload;
  }): Observable<AssistantExplainResponse>;
}
