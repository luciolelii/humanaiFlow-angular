import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import {
  AssistantChatMessage,
  AssistantConfig,
  AssistantDraftPayload,
  AssistantFlowActionResult,
  AssistantFlowRequest,
  AssistantSessionRequest,
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

  override listProviders(retrieverUrl: string): Observable<string[]> {
    return this.http
      .get<unknown>(resolveAssistantUrl(retrieverUrl))
      .pipe(map((raw) => mapModelList(raw)));
  }

  override listModels(retrieverUrlTemplate: string, provider: string): Observable<string[]> {
    const retrieverUrl = retrieverUrlTemplate.replace('{provider}', encodeURIComponent(provider));
    const resolvedUrl = resolveAssistantUrl(retrieverUrl);
    return this.http
      .get<unknown>(resolvedUrl)
      .pipe(map((raw) => mapModelList(raw)));
  }

  override createSession(request: AssistantSessionRequest): Observable<AssistantSessionState> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/sessions`, request)
      .pipe(map((raw) => mapAssistantSessionState(raw)));
  }

  override draft(request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    return this.runFlowAction('draft', request);
  }

  override refine(request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    return this.runFlowAction('refine', request);
  }

  override fix(request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    return this.runFlowAction('fix', request);
  }

  override explain(request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    return this.runFlowAction('explain', request);
  }

  private runFlowAction(
    action: 'draft' | 'refine' | 'fix' | 'explain',
    request: AssistantFlowRequest
  ): Observable<AssistantFlowActionResult> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/assistant/flows/${action}`, request)
      .pipe(map((raw) => mapAssistantFlowActionResult(raw)));
  }
}

function mapAssistantConfig(raw: unknown): AssistantConfig {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    defaultProvider: String(value['defaultProvider'] ?? value['provider'] ?? ''),
    defaultModel: String(value['defaultModel'] ?? ''),
    availableProvidersRetrieverUrl: String(value['availableProvidersRetrieverUrl'] ?? ''),
    availableModelsRetrieverUrl: String(value['availableModelsRetrieverUrlTemplate'] ?? value['availableModelsRetrieverUrl'] ?? ''),
    defaultPhaseModels: mapPhaseModels(value['defaultPhaseModels'])
  };
}

function mapPhaseModels(raw: unknown) {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    planningModel: typeof value['planningModel'] === 'string' ? value['planningModel'] : undefined,
    jsonModel: typeof value['jsonModel'] === 'string' ? value['jsonModel'] : undefined,
    repairModel: typeof value['repairModel'] === 'string' ? value['repairModel'] : undefined
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

function mapAssistantFlowActionResult(raw: unknown): AssistantFlowActionResult {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const flow = mapAssistantDraftPayload(value['flow'] ?? value['result']);
  const message = typeof value['assistantRationale'] === 'string'
    ? value['assistantRationale']
    : typeof value['explanation'] === 'string'
      ? value['explanation']
      : typeof value['message'] === 'string'
        ? value['message']
        : flow
          ? 'Workflow updated.'
          : 'The assistant completed the request.';

  return {
    flow,
    valid: typeof value['valid'] === 'boolean' ? value['valid'] : undefined,
    validationErrors: mapValidationIssues(value['validationErrors']),
    warnings: Array.isArray(value['warnings']) ? value['warnings'].map((warning) => String(warning)) : [],
    message
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
    blocks: normalizeAssistantFlowNodes(value['blocks'], 'block'),
    containers: normalizeAssistantFlowNodes(value['containers'], 'container'),
    connections: Array.isArray(value['connections']) ? (value['connections'] as any[]) : [],
    dependencies: Array.isArray(value['dependencies']) ? (value['dependencies'] as any[]) : [],
    globalInputs: Array.isArray(value['globalInputs']) ? (value['globalInputs'] as any[]) : [],
    lanes: Array.isArray(value['lanes']) ? (value['lanes'] as any[]) : []
  };
}

function normalizeAssistantFlowNodes(
  raw: unknown,
  nodeFamily: 'block'
): AssistantDraftPayload['flow']['blocks'];
function normalizeAssistantFlowNodes(
  raw: unknown,
  nodeFamily: 'container'
): AssistantDraftPayload['flow']['containers'];
function normalizeAssistantFlowNodes(
  raw: unknown,
  nodeFamily: 'block' | 'container'
): AssistantDraftPayload['flow']['blocks'] | AssistantDraftPayload['flow']['containers'] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((node): node is Record<string, unknown> =>
      !!node && typeof node === 'object' && !Array.isArray(node)
    )
    .map((node) => ({
      ...node,
      nodeFamily,
      specificConfiguration: normalizeAssistantFlowValue(node['specificConfiguration'])
    })) as AssistantDraftPayload['flow']['blocks'] | AssistantDraftPayload['flow']['containers'];
}

function normalizeAssistantFlowValue(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeAssistantFlowValue(item));
  }
  if (!raw || typeof raw !== 'object') return raw;

  const value = raw as Record<string, unknown>;
  if (isAssistantFlowData(value)) {
    return mapAssistantFlowData(value);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeAssistantFlowValue(item)])
  );
}

function isAssistantFlowData(value: Record<string, unknown>): boolean {
  return ['blocks', 'containers', 'connections'].every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
    && (value[key] == null || Array.isArray(value[key]))
  );
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

function resolveAssistantUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = environment.apiUrl;
  return `${apiBase}${url.startsWith('/') ? url : `/${url}`}`;
}
