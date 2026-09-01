import {
  AssistantConfig,
  AssistantFlowActionResult,
  AssistantFlowRequest,
  AssistantSessionRequest,
  AssistantSessionState
} from '@models/assistant';
import { Observable } from 'rxjs';

export abstract class AssistantCallServiceBase {
  abstract getConfig(): Observable<AssistantConfig>;

  abstract listProviders(retrieverUrl: string): Observable<string[]>;

  abstract listModels(retrieverUrlTemplate: string, provider: string): Observable<string[]>;

  abstract createSession(request: AssistantSessionRequest): Observable<AssistantSessionState>;

  abstract draft(request: AssistantFlowRequest): Observable<AssistantFlowActionResult>;

  abstract refine(request: AssistantFlowRequest): Observable<AssistantFlowActionResult>;

  abstract fix(request: AssistantFlowRequest): Observable<AssistantFlowActionResult>;

  abstract explain(request: AssistantFlowRequest): Observable<AssistantFlowActionResult>;

}
