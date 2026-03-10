import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import {
  AssistantDraftPayload,
  AssistantExplainResponse,
  AssistantFlowResponse,
  AssistantValidationIssue
} from '@models/assistant';
import { environment } from '@environment';
import { map, Observable } from 'rxjs';
import { AssistantCallServiceBase } from './assistant-call.base';

export class AssistantCallService extends AssistantCallServiceBase {
  private readonly http = inject(HttpClient);

  override listModels(): Observable<string[]> {
    return this.http
      .get<unknown[]>(`${environment.apiUrl}/retriever/LLM/models`, {
        params: { provider: 'InternalOllama' }
      })
      .pipe(
        map((raw) => (Array.isArray(raw) ? raw : []).map((item) => String(item)))
      );
  }

  override createDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
  }): Observable<AssistantFlowResponse> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/flows/draft`, request)
      .pipe(map((raw) => mapAssistantFlowResponse(raw)));
  }

  override refineDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
  }): Observable<AssistantFlowResponse> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/flows/refine`, request)
      .pipe(map((raw) => mapAssistantFlowResponse(raw)));
  }

  override fixDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
    validationErrors?: AssistantValidationIssue[];
  }): Observable<AssistantFlowResponse> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/flows/fix`, request)
      .pipe(map((raw) => mapAssistantFlowResponse(raw)));
  }

  override explainDraft(request: {
    userPrompt: string;
    model: string;
    flow: AssistantDraftPayload;
  }): Observable<AssistantExplainResponse> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/flows/explain`, request)
      .pipe(map((raw) => mapAssistantExplainResponse(raw)));
  }
}

function mapAssistantFlowResponse(raw: unknown): AssistantFlowResponse {
  const value = (raw ?? {}) as Record<string, unknown>;
  const payload = mapAssistantDraftPayload(value['flow']);
  return {
    flow: payload,
    valid: value['valid'] !== false,
    validationErrors: mapValidationIssues(value['validationErrors']),
    warnings: Array.isArray(value['warnings']) ? value['warnings'].map((item) => String(item)) : [],
    assistantRationale: typeof value['assistantRationale'] === 'string' ? value['assistantRationale'] : undefined,
    repairAttempts: typeof value['repairAttempts'] === 'number' ? value['repairAttempts'] : undefined
  };
}

function mapAssistantExplainResponse(raw: unknown): AssistantExplainResponse {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    explanation: typeof value['explanation'] === 'string'
      ? value['explanation']
      : typeof value['assistantRationale'] === 'string'
        ? value['assistantRationale']
        : '',
    warnings: Array.isArray(value['warnings']) ? value['warnings'].map((item) => String(item)) : []
  };
}

function mapAssistantDraftPayload(raw: unknown): AssistantDraftPayload {
  const value = (raw ?? {}) as Record<string, unknown>;
  const flow = (value['flow'] ?? {}) as Record<string, unknown>;
  return {
    name: String(value['name'] ?? 'Assistant Draft'),
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    flow: {
      blocks: Array.isArray(flow['blocks']) ? (flow['blocks'] as any[]) : [],
      connections: Array.isArray(flow['connections']) ? (flow['connections'] as any[]) : []
    }
  };
}

function mapValidationIssues(raw: unknown): AssistantValidationIssue[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    if (typeof item === 'string') {
      return { message: item };
    }

    const value = (item ?? {}) as Record<string, unknown>;
    return {
      message: String(value['message'] ?? value['error'] ?? 'Validation issue'),
      path: typeof value['path'] === 'string' ? value['path'] : undefined
    };
  });
}
