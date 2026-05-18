import {
  AssistantCallState,
  AssistantConfig,
  AssistantSendMessageRequest,
  AssistantSessionState
} from '@models/assistant';
import { Observable } from 'rxjs';

export abstract class AssistantCallServiceBase {
  abstract getConfig(): Observable<AssistantConfig>;

  abstract listModels(retrieverUrl: string): Observable<string[]>;

  abstract createSession(request: {
    model: string;
  }): Observable<AssistantSessionState>;

  abstract sendMessage(sessionId: string, request: AssistantSendMessageRequest): Observable<{ callId: string }>;

  abstract getCall(callId: string): Observable<AssistantCallState>;

  abstract cancelCall(callId: string): Observable<AssistantCallState>;

  abstract getSession(sessionId: string): Observable<AssistantSessionState>;
}
