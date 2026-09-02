import {
  AssistantCallAccepted,
  AssistantCallState,
  AssistantConfig,
  AssistantSessionMessageRequest,
  AssistantSessionRequest,
  AssistantSessionState
} from '@models/assistant';
import { Observable } from 'rxjs';

export abstract class AssistantCallServiceBase {
  abstract getConfig(): Observable<AssistantConfig>;

  abstract listProviders(retrieverUrl: string): Observable<string[]>;

  abstract listModels(retrieverUrlTemplate: string, provider: string): Observable<string[]>;

  abstract createSession(request: AssistantSessionRequest): Observable<AssistantSessionState>;

  abstract getSession(sessionId: string): Observable<AssistantSessionState>;

  abstract submitMessage(sessionId: string, request: AssistantSessionMessageRequest): Observable<AssistantCallAccepted>;

  abstract getCall(callId: string): Observable<AssistantCallState>;

  abstract cancelCall(callId: string): Observable<AssistantCallState>;
}
