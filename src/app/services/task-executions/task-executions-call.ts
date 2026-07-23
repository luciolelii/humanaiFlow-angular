import { HttpClient, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@environment';
import { FlowBlockConnection, FlowData, FlowNodeDependency, LLMDescriptor } from '@models/flow';
import {
  BiasDownstreamImpactEntry,
  BiasImpactExperimentRequest,
  BiasImpactJob,
  BiasImpactJobStatus,
  BiasImpactReport,
  BiasImpactReportKind,
  BiasMockedSideEffect,
  BiasRerunRequest,
  BiasRoutingChangeEntry
} from '@models/bias-impact';
import { ExecutionEventLogEntry, TaskExecution, TaskExecutionGroup } from '@models/task-execution';
import { map, Observable } from 'rxjs';
import { TaskExecutionsCallServiceBase } from './task-executions-call.base';

export class TaskExecutionsCallService extends TaskExecutionsCallServiceBase {
  private readonly http = inject(HttpClient);

  override retrieveAllTaskExecutions(): Observable<TaskExecution[]> {
    return this.http.get<unknown[]>(`${environment.apiUrl}/executions`).pipe(
      map((raw) => Array.isArray(raw) ? raw.map((item) => this.mapExecution(item)) : [])
    );
  }

  override retrieveTaskExecutionGroups(): Observable<TaskExecutionGroup[]> {
    return this.http.get<unknown>(`${environment.apiUrl}/executions/groups`).pipe(
      map((raw) => Array.isArray(raw) ? raw.map((item) => this.mapExecutionGroup(item)) : [])
    );
  }

  override retrieveExecutionEvents(executionId: string): Observable<ExecutionEventLogEntry[]> {
    return this.http.get<ExecutionEventLogEntry[]>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/events`);
  }

  override createTaskExecution(flowId: string): Observable<TaskExecution> {
    return this.http.post<unknown>(`${environment.apiUrl}/executions`, flowId).pipe(
      map((raw) => this.mapExecution(raw))
    );
  }

  override rerunTaskExecution(executionId: string): Observable<TaskExecution> {
    return this.http.post<unknown>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/rerun`, null).pipe(
      map((raw) => this.mapExecution(raw))
    );
  }

  override runBiasImpactExperiment(
    executionId: string,
    stepId: string,
    request: BiasImpactExperimentRequest
  ): Observable<BiasImpactJob> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/steps/${encodeURIComponent(stepId)}/bias-impact`;
    return this.http.post<unknown>(url, request).pipe(map((raw) => this.biasImpactJobFromApi(raw)));
  }

  override getBiasImpactJob(jobId: string): Observable<BiasImpactJob> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/executions/bias-impact-jobs/${encodeURIComponent(jobId)}`)
      .pipe(map((raw) => this.biasImpactJobFromApi(raw)));
  }

  override createBiasedRerun(executionId: string, request: BiasRerunRequest): Observable<TaskExecution> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/bias-rerun`, request)
      .pipe(map((raw) => this.mapExecution(raw)));
  }

  override compareBiasExecutions(
    baselineExecutionId: string,
    biasedExecutionId: string,
    includeRawOutputs: boolean
  ): Observable<BiasImpactReport> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(baselineExecutionId)}/bias-compare/${encodeURIComponent(biasedExecutionId)}`;
    return this.http.post<unknown>(url, null, {
      params: new HttpParams().set('includeRawOutputs', String(includeRawOutputs))
    }).pipe(map((raw) => this.biasImpactReportFromApi(raw)));
  }

  override listBiasImpactReports(executionId: string): Observable<BiasImpactReport[]> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/bias-impact-reports`)
      .pipe(map((raw) => Array.isArray(raw) ? raw.map((item) => this.biasImpactReportFromApi(item)) : []));
  }

  override getBiasImpactReport(reportId: string): Observable<BiasImpactReport> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/executions/bias-impact-reports/${encodeURIComponent(reportId)}`)
      .pipe(map((raw) => this.biasImpactReportFromApi(raw)));
  }

  override deleteTaskExecution(executionId: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}`);
  }

  override startTaskExecution(executionId: string): Observable<TaskExecution> {
    return this.http.put<unknown>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/start`, null).pipe(
      map((raw) => this.mapExecution(raw))
    );
  }

  override simulateTaskExecution(executionId: string, simulator: LLMDescriptor): Observable<TaskExecution> {
    return this.http.put<unknown>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/simulate`, { simulator }).pipe(
      map((raw) => this.mapExecution(raw))
    );
  }

  override cancelTaskExecution(executionId: string): Observable<TaskExecution> {
    return this.http.put<unknown>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/cancel`, null).pipe(
      map((raw) => this.mapExecution(raw))
    );
  }

  override resumeTaskExecution(executionId: string): Observable<TaskExecution> {
    return this.http.put<unknown>(`${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/resume`, null).pipe(
      map((raw) => this.mapExecution(raw))
    );
  }

  override prepareStringInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    value: string
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/text`;
    return this.http.put<unknown>(url, value, {
      headers: { 'Content-Type': 'text/plain' }
    }).pipe(map((raw) => this.mapExecution(raw)));
  }

  override prepareStringArrayInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    values: string[]
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/texts`;
    return this.http.put<unknown>(url, values).pipe(map((raw) => this.mapExecution(raw)));
  }

  override prepareFileInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    file: File
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/file`;
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put<unknown>(url, formData).pipe(map((raw) => this.mapExecution(raw)));
  }

  override prepareFileArrayInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    files: File[]
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/input/${encodeURIComponent(inputName)}/files`;
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return this.http.put<unknown>(url, formData).pipe(map((raw) => this.mapExecution(raw)));
  }

  override prepareGlobalStringInput(
    executionId: string,
    inputName: string,
    value: string
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/globals/${encodeURIComponent(inputName)}`;
    return this.http.put<unknown>(url, JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' }
    }).pipe(map((raw) => this.mapExecution(raw)));
  }

  override prepareGlobalStringArrayInput(
    executionId: string,
    inputName: string,
    values: string[]
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/globals`;
    return this.http.put<unknown>(url, {
      [inputName]: values
    }).pipe(map((raw) => this.mapExecution(raw)));
  }

  override prepareGlobalFileInput(
    executionId: string,
    inputName: string,
    file: File
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/globals/${encodeURIComponent(inputName)}`;
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put<unknown>(url, formData).pipe(map((raw) => this.mapExecution(raw)));
  }

  override prepareGlobalFileArrayInput(
    executionId: string,
    inputName: string,
    files: File[]
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/globals`;
    const formData = new FormData();
    formData.append('key', inputName);
    for (const file of files) {
      formData.append(inputName, file);
    }
    return this.http.put<unknown>(url, formData).pipe(map((raw) => this.mapExecution(raw)));
  }

  override submitInteractionText(
    executionId: string,
    nodeId: string,
    fieldName: string,
    value: string
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/node/${encodeURIComponent(nodeId)}/interaction/${encodeURIComponent(fieldName)}/text`;
    return this.http.put<unknown>(url, value, {
      headers: { 'Content-Type': 'text/plain' }
    }).pipe(map((raw) => this.mapExecution(raw)));
  }

  override provideAuthorization(
    executionId: string,
    key: string,
    value: string
  ): Observable<TaskExecution> {
    const url = `${environment.apiUrl}/executions/${encodeURIComponent(executionId)}/authorizations`;
    return this.http.put<unknown>(url, { key, value }).pipe(map((raw) => this.mapExecution(raw)));
  }

  private mapExecution(raw: unknown): TaskExecution {
    const execution = (raw ?? {}) as TaskExecution & Record<string, any>;
    const context = (execution.context ?? {}) as Record<string, any>;
    const globalInputs = this.normalizeGlobalInputValues(
      context['globalInputs']
      ?? execution['globalInputs']
    );
    const globalInputDescriptors = this.normalizeGlobalInputDescriptors(
      context['globalInputDescriptors']
      ?? execution['globalInputDescriptors']
    );
    const flowSnapshot = this.normalizeFlowSnapshot(
      execution['flowSnapshot']
      ?? execution['flowData']
      ?? context['flowSnapshot']
      ?? context['flowData']
      ?? (execution['flow'] && typeof execution['flow'] === 'object' ? execution['flow'] : null)
    );
    const rawStepConnections =
      execution['stepConnections']
      ?? execution['connections']
      ?? context['stepConnections']
      ?? context['connections']
      ?? flowSnapshot?.connections;
    const stepConnections = rawStepConnections === undefined
      ? undefined
      : this.normalizeStepConnections(rawStepConnections);
    const rawStepDependencies =
      execution['stepDependencies']
      ?? execution['dependencies']
      ?? context['stepDependencies']
      ?? context['dependencies']
      ?? flowSnapshot?.dependencies;
    const stepDependencies = rawStepDependencies === undefined
      ? undefined
      : this.normalizeStepDependencies(rawStepDependencies);

    return {
      ...execution,
      flowSnapshot,
      stepConnections,
      stepDependencies,
      context: {
        ...(context as TaskExecution['context']),
        globalInputs,
        globalInputDescriptors
      } as TaskExecution['context']
    };
  }

  private normalizeFlowSnapshot(raw: unknown): FlowData | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const root = raw as Record<string, unknown>;
    const nested = root['flow'] && typeof root['flow'] === 'object' && !Array.isArray(root['flow'])
      ? root['flow'] as Record<string, unknown>
      : root;
    if (!Array.isArray(nested['blocks']) && !Array.isArray(nested['containers'])) return undefined;
    const blocks = Array.isArray(nested['blocks'])
      ? nested['blocks'].filter((node): node is FlowData['blocks'][number] => !!node && typeof node === 'object')
        .map((node) => ({ ...node, nodeFamily: 'block' as const }))
      : [];
    const containers = Array.isArray(nested['containers'])
      ? nested['containers'].filter((node): node is FlowData['containers'][number] => !!node && typeof node === 'object')
        .map((node) => ({ ...node, nodeFamily: 'container' as const }))
      : [];

    return {
      blocks,
      containers,
      connections: this.normalizeStepConnections(nested['connections']),
      dependencies: this.normalizeStepDependencies(nested['dependencies']),
      globalInputs: Array.isArray(nested['globalInputs']) ? nested['globalInputs'] as FlowData['globalInputs'] : [],
      lanes: Array.isArray(nested['lanes']) ? nested['lanes'] as FlowData['lanes'] : []
    };
  }

  private normalizeStepConnections(raw: unknown): FlowBlockConnection[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const value = item as Record<string, unknown>;
      const sourceId = value['sourceId'] ?? value['sourceNodeId'] ?? value['sourceBlockId'];
      const sourceName = value['sourceName'] ?? value['sourceOutput'] ?? value['outputName'];
      const targetId = value['targetId'] ?? value['targetNodeId'] ?? value['targetBlockId'];
      const targetName = value['targetName'] ?? value['targetInput'] ?? value['inputName'];
      if ([sourceId, sourceName, targetId, targetName].some((part) => typeof part !== 'string' || !part)) return [];
      return [{
        id: String(value['id'] ?? `${sourceId}:${sourceName}->${targetId}:${targetName}:${index}`),
        sourceId: String(sourceId),
        sourceName: String(sourceName),
        targetId: String(targetId),
        targetName: String(targetName)
      }];
    });
  }

  private normalizeStepDependencies(raw: unknown): FlowNodeDependency[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const value = item as Record<string, unknown>;
      const sourceId = value['sourceId'] ?? value['sourceNodeId'];
      const targetId = value['targetId'] ?? value['targetNodeId'];
      if (typeof sourceId !== 'string' || !sourceId || typeof targetId !== 'string' || !targetId) return [];
      return [{ sourceId, targetId }];
    });
  }

  private biasImpactJobFromApi(raw: unknown): BiasImpactJob {
    const value = this.toRecord(raw);
    const status = this.toBiasImpactJobStatus(value['status']);
    const rawReport = value['report'];
    return {
      id: String(value['id'] ?? ''),
      status,
      executionId: String(value['executionId'] ?? ''),
      stepId: String(value['stepId'] ?? ''),
      createdAt: String(value['createdAt'] ?? ''),
      startedAt: this.toNullableString(value['startedAt']),
      completedAt: this.toNullableString(value['completedAt']),
      reportId: this.toNullableString(value['reportId']),
      report: rawReport && typeof rawReport === 'object' ? this.biasImpactReportFromApi(rawReport) : null,
      errorCode: this.toNullableString(value['errorCode']),
      errorMessage: this.toNullableString(value['errorMessage']),
      terminal: value['terminal'] === true || status === 'COMPLETED' || status === 'FAILED'
    };
  }

  private biasImpactReportFromApi(raw: unknown): BiasImpactReport {
    const value = this.toRecord(raw);
    const immediate = this.toRecord(value['immediateImpact']);
    return {
      id: String(value['id'] ?? ''),
      experimentId: String(value['experimentId'] ?? ''),
      kind: this.toBiasImpactReportKind(value['kind']),
      baselineExecutionId: String(value['baselineExecutionId'] ?? ''),
      biasedExecutionId: this.toNullableString(value['biasedExecutionId']),
      nodeId: this.toNullableString(value['nodeId']),
      annotationIds: this.toStringArray(value['annotationIds']),
      repetitions: this.toNumber(value['repetitions'], 0),
      createdAt: String(value['createdAt'] ?? ''),
      rawOutputsIncluded: value['rawOutputsIncluded'] === true,
      immediateImpact: {
        outputChanged: immediate['outputChanged'] === true,
        maximumTextDifference: this.toNumber(immediate['maximumTextDifference'], 0),
        changeRate: this.toNumber(immediate['changeRate'], 0),
        baselineOutput: immediate['baselineOutput'] ?? {},
        biasedOutputs: Array.isArray(immediate['biasedOutputs']) ? immediate['biasedOutputs'] : []
      },
      downstreamImpact: this.toDownstreamImpact(value['downstreamImpact']),
      routingChanges: this.toRoutingChanges(value['routingChanges']),
      mockedSideEffects: this.toMockedSideEffects(value['mockedSideEffects']),
      summary: String(value['summary'] ?? ''),
      warnings: this.toStringArray(value['warnings'])
    };
  }

  private toDownstreamImpact(raw: unknown): BiasDownstreamImpactEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      const value = this.toRecord(item);
      return {
        nodeId: String(value['nodeId'] ?? ''),
        nodeName: String(value['nodeName'] ?? ''),
        baselineStatus: String(value['baselineStatus'] ?? ''),
        biasedStatus: String(value['biasedStatus'] ?? ''),
        changed: value['changed'] === true,
        baselineOutputs: value['baselineOutputs'] ?? {},
        biasedOutputs: value['biasedOutputs'] ?? {}
      };
    });
  }

  private toRoutingChanges(raw: unknown): BiasRoutingChangeEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      const value = this.toRecord(item);
      return {
        nodeId: String(value['nodeId'] ?? ''),
        baselineBranch: String(value['baselineBranch'] ?? ''),
        biasedBranch: String(value['biasedBranch'] ?? '')
      };
    });
  }

  private toMockedSideEffects(raw: unknown): BiasMockedSideEffect[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      const value = this.toRecord(item);
      const kind = String(value['kind'] ?? 'EXTERNAL');
      return {
        nodeId: String(value['nodeId'] ?? ''),
        nodeName: String(value['nodeName'] ?? ''),
        kind: kind === 'HTTP' || kind === 'MCP_AGENT' || kind === 'MCP_AGENT_CHAT' ? kind : 'EXTERNAL'
      };
    });
  }

  private toBiasImpactJobStatus(value: unknown): BiasImpactJobStatus {
    return value === 'RUNNING' || value === 'COMPLETED' || value === 'FAILED' ? value : 'QUEUED';
  }

  private toBiasImpactReportKind(value: unknown): BiasImpactReportKind {
    return value === 'FULL_FLOW' ? value : 'ISOLATED_STEP';
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private mapExecutionGroup(raw: unknown): TaskExecutionGroup {
    const group = (raw ?? {}) as Partial<TaskExecutionGroup> & Record<string, unknown>;
    const executions = Array.isArray(group['executions'])
      ? group['executions'].map((item) => this.mapExecution(item))
      : [];
    const latestExecution = executions.find((execution) => execution.id === group['latestExecutionId'])
      ?? executions[executions.length - 1]
      ?? null;
    const firstExecution = executions.find((execution) => execution.id === group['firstExecutionId'])
      ?? executions[0]
      ?? null;
    const sourceFlowId = this.toNonEmptyString(group['sourceFlowId'])
      ?? this.toNonEmptyString(latestExecution?.sourceFlowId)
      ?? this.toNonEmptyString(latestExecution?.flowId)
      ?? this.toNonEmptyString(group['id'])
      ?? '';

    return {
      id: this.toNonEmptyString(group['id']) ?? sourceFlowId,
      sourceFlowId,
      name: this.toNonEmptyString(group['name']) ?? latestExecution?.name ?? sourceFlowId,
      firstExecutionId: this.toNonEmptyString(group['firstExecutionId']) ?? firstExecution?.id ?? '',
      latestExecutionId: this.toNonEmptyString(group['latestExecutionId']) ?? latestExecution?.id ?? '',
      creationTime: this.toTimestamp(group['creationTime'], firstExecution?.creationTime ?? 0),
      lastExecutionTime: this.toTimestamp(group['lastExecutionTime'], latestExecution?.creationTime ?? 0),
      executionCount: this.toNumber(group['executionCount'], executions.length),
      executions
    };
  }

  private normalizeGlobalInputValues(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return { ...(raw as Record<string, unknown>) };
  }

  private normalizeGlobalInputDescriptors(raw: unknown): NonNullable<TaskExecution['context']['globalInputDescriptors']> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    return Object.entries(raw as Record<string, unknown>)
      .reduce<NonNullable<TaskExecution['context']['globalInputDescriptors']>>((acc, [key, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return acc;
        const record = value as Record<string, unknown>;
        const name = String(record['name'] ?? key).trim();
        if (!name) return acc;

        acc[key] = {
          name,
          kind: String(record['kind'] ?? record['type'] ?? 'TEXT').toUpperCase(),
          value: record['value'] ?? null,
          description: typeof record['description'] === 'string' ? record['description'] : null,
          cleanupPolicy: typeof record['cleanupPolicy'] === 'string' ? record['cleanupPolicy'] : null,
          multiple: Boolean(record['multiple'])
        };
        return acc;
      }, {});
  }

  private toNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private toNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private toTimestamp(value: unknown, fallback: number): number {
    const timestamp = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }

  private toNumber(value: unknown, fallback: number): number {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
}
