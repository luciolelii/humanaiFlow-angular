import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import {
  AssistantCallPhase,
  AssistantCallState,
  AssistantCallStatus,
  AssistantChatMessage,
  AssistantConfig,
  AssistantDraftPayload,
  AssistantFlowResult,
  AssistantIntent,
  AssistantSendMessageRequest,
  AssistantSessionState,
  AssistantValidationIssue
} from '@models/assistant';
import { environment } from '@environment';
import { map, Observable } from 'rxjs';
import { AssistantCallServiceBase } from './assistant-call.base';

export class AssistantCallService extends AssistantCallServiceBase {
  private readonly http = inject(HttpClient);

  override getConfig(): Observable<AssistantConfig> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/assistant/config`)
      .pipe(map((raw) => mapAssistantConfig(raw)));
  }

  override listModels(retrieverUrl: string): Observable<string[]> {
    const resolvedUrl = resolveAssistantUrl(retrieverUrl);
    return this.http
      .get<unknown>(resolvedUrl)
      .pipe(map((raw) => mapModelList(raw)));
  }

  override createSession(request: {
    model: string;
  }): Observable<AssistantSessionState> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/sessions`, request)
      .pipe(map((raw) => mapAssistantSessionState(raw)));
  }

  override sendMessage(sessionId: string, request: AssistantSendMessageRequest): Observable<{ callId: string }> {
    const encodedId = encodeURIComponent(sessionId);
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/sessions/${encodedId}/messages`, request)
      .pipe(map((raw) => mapSendMessageResponse(raw)));
  }

  override getCall(callId: string): Observable<AssistantCallState> {
    const encodedId = encodeURIComponent(callId);
    return this.http
      .get<unknown>(`${environment.apiUrl}/assistant/calls/${encodedId}`)
      .pipe(map((raw) => mapAssistantCallState(raw)));
  }

  override cancelCall(callId: string): Observable<AssistantCallState> {
    const encodedId = encodeURIComponent(callId);
    return this.http
      .put<unknown>(`${environment.apiUrl}/assistant/calls/${encodedId}/cancel`, {})
      .pipe(map((raw) => mapAssistantCallState(raw)));
  }

  override getSession(sessionId: string): Observable<AssistantSessionState> {
    const encodedId = encodeURIComponent(sessionId);
    return this.http
      .get<unknown>(`${environment.apiUrl}/assistant/sessions/${encodedId}`)
      .pipe(map((raw) => mapAssistantSessionState(raw)));
  }
}

function mapAssistantConfig(raw: unknown): AssistantConfig {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    provider: typeof value['provider'] === 'string' ? value['provider'] : undefined,
    defaultModel: String(value['defaultModel'] ?? ''),
    availableModelsRetrieverUrl: String(value['availableModelsRetrieverUrl'] ?? '')
  };
}

function mapModelList(raw: unknown): string[] {
  const candidate = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (((raw as Record<string, unknown>)['values']
        ?? (raw as Record<string, unknown>)['items']
        ?? (raw as Record<string, unknown>)['data']
        ?? (raw as Record<string, unknown>)['result']
        ?? []) as unknown[])
      : [];

  if (!Array.isArray(candidate)) return [];

  return candidate.map((item) => {
    if (typeof item === 'string') return item;
    const value = (item ?? {}) as Record<string, unknown>;
    return String(value['name'] ?? value['model'] ?? value['value'] ?? '');
  }).filter((item) => item.length > 0);
}

function mapSendMessageResponse(raw: unknown): { callId: string } {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    callId: String(value['callId'] ?? value['id'] ?? '')
  };
}

function mapAssistantCallState(raw: unknown): AssistantCallState {
  const value = (raw ?? {}) as Record<string, unknown>;
  const status = mapCallStatus(value['status']);
  return {
    id: String(value['id'] ?? value['callId'] ?? ''),
    sessionId: String(value['sessionId'] ?? ''),
    status,
    phase: mapCallPhase(value['phase']),
    progressMessage: typeof value['progressMessage'] === 'string' ? value['progressMessage'] : undefined,
    intent: mapIntent(value['intent']),
    errorMessage: typeof value['errorMessage'] === 'string'
      ? value['errorMessage']
      : typeof value['message'] === 'string' && status === 'FAILED'
        ? value['message']
        : undefined,
    flowResult: mapAssistantFlowResult(value['flowResult'])
  };
}

function mapAssistantSessionState(raw: unknown): AssistantSessionState {
  const value = (raw ?? {}) as Record<string, unknown>;

  return {
    id: String(value['id'] ?? value['sessionId'] ?? ''),
    owner: typeof value['owner'] === 'string' ? value['owner'] : undefined,
    selectedModel: String(value['selectedModel'] ?? value['model'] ?? ''),
    messages: mapAssistantMessages(value['messages']),
    currentFlow: mapAssistantDraftPayload(value['currentFlow']),
    currentDraftFlow: mapAssistantDraftPayload(
      value['currentDraftFlow'] ?? value['currentDraft'] ?? value['flow']
    ),
    lastValidationErrors: mapValidationIssues(value['lastValidationErrors'] ?? value['validationErrors']),
    lastCallId: value['lastCallId'] == null ? null : String(value['lastCallId'])
  };
}

function mapAssistantMessages(raw: unknown): AssistantChatMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const value = (item ?? {}) as Record<string, unknown>;
    const normalizedRole = typeof value['role'] === 'string' ? value['role'].toLowerCase() : 'user';
    const role = normalizedRole === 'assistant' || normalizedRole === 'system' ? normalizedRole : 'user';
    return {
      id: String(value['id'] ?? crypto.randomUUID()),
      role,
      content: String(value['content'] ?? value['message'] ?? ''),
      warnings: Array.isArray(value['warnings']) ? value['warnings'].map((warning) => String(warning)) : [],
      validationErrors: mapValidationIssues(value['validationErrors'])
    } as AssistantChatMessage;
  });
}

function mapAssistantFlowResult(raw: unknown): AssistantFlowResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const flow = mapAssistantFlowData(value['flow']);
  if (!hasAssistantFlowData(flow)) return null;
  return {
    name: typeof value['name'] === 'string' ? value['name'] : undefined,
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    flow
  };
}

function mapAssistantDraftPayload(raw: unknown): AssistantDraftPayload | null {
  if (!raw || typeof raw !== 'object') return null;

  const value = raw as Record<string, unknown>;
  const flow = mapAssistantFlowData(
    value['flow']
      ?? value['data']
      ?? value['flowData']
      ?? value['currentFlowData']
      ?? value
  );
  if (!hasAssistantFlowData(flow)) return null;
  return {
    name: String(value['name'] ?? 'Assistant Draft'),
    description: typeof value['description'] === 'string' ? value['description'] : undefined,
    flow
  };
}

function hasAssistantFlowData(flow: AssistantDraftPayload['flow']): boolean {
  return (
    flow.blocks.length > 0 ||
    flow.containers.length > 0 ||
    flow.connections.length > 0 ||
    flow.dependencies.length > 0 ||
    (flow.globalInputs?.length ?? 0) > 0
  );
}

function mapAssistantFlowData(raw: unknown): AssistantDraftPayload['flow'] {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    blocks: Array.isArray(value['blocks']) ? (value['blocks'] as any[]) : [],
    containers: Array.isArray(value['containers']) ? (value['containers'] as any[]) : [],
    connections: Array.isArray(value['connections']) ? (value['connections'] as any[]) : [],
    dependencies: Array.isArray(value['dependencies']) ? (value['dependencies'] as any[]) : [],
    globalInputs: Array.isArray(value['globalInputs']) ? (value['globalInputs'] as any[]) : []
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

function mapCallStatus(raw: unknown): AssistantCallStatus {
  const normalized = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (normalized === 'QUEUED' || normalized === 'RUNNING' || normalized === 'FAILED' || normalized === 'CANCELLED') return normalized;
  return 'COMPLETED';
}

function mapCallPhase(raw: unknown): AssistantCallPhase {
  const normalized = typeof raw === 'string' ? raw.toLowerCase() : '';
  switch (normalized) {
    case 'queued':
    case 'routing':
    case 'planning':
    case 'configuring_blocks':
    case 'connecting_blocks':
    case 'validating':
    case 'fixing':
    case 'explaining':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return normalized;
    default:
      return 'queued';
  }
}

function mapIntent(raw: unknown): AssistantIntent | null {
  const normalized = typeof raw === 'string' ? raw.toLowerCase() : '';
  switch (normalized) {
    case 'draft':
    case 'refine':
    case 'fix':
    case 'explain':
      return normalized;
    default:
      return null;
  }
}

function resolveAssistantUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = environment.apiUrl;
  return `${apiBase}${url.startsWith('/') ? url : `/${url}`}`;
}
