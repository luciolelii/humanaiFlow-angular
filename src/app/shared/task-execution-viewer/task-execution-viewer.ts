import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import {
  areFlowValueKindsCompatible,
  FlowBlock,
  FlowBlockConnection,
  FlowContainer,
  FlowData,
  LLMDescriptor,
  FlowNode,
  FlowNodeDependency, isProbeExecutable,
  normalizeFlowPortValueKinds
} from '@models/flow';
import {
  ExecutionEventLogEntry,
  getTaskExecutionStepNode,
  getExecutionStatusGroup,
  TaskExecution,
  TaskExecutionAuthorizationRequirement,
  TaskExecutionStep
} from '@models/task-execution';
import { activeAnnotationIdsFor, biasInterventionMix, isBiasVariantContext } from '@models/bias-impact';
import { ExecutionVaultCredential, LlmProviderCapability } from '@models/llm-provider';
import { VaultSecret } from '@models/assistant';
import {
  EditableExecutionInput,
  TaskExecutionInputsPanelComponent
} from '@shared/task-execution-inputs-panel/task-execution-inputs-panel';
import { ReteEditor } from '@shared/rete-editor/rete-editor';
import {
  HumanInteractionChatMessage,
  HumanInteractionDialogService
} from '@services/dialogs/human-interaction-dialog';
import { NodeSettingField, NodeSettingsDialogService } from '@services/dialogs/node-settings-dialog';
import { FieldRetriever } from '@services/retriever/field-retriever';
import { TaskExecutionsService } from '@services/task-executions/task-executions';
import { FlowsService } from '@services/flows/flows';
import { ContainersService } from '@services/containers/containers';
import { BlocksService } from '@services/blocks/blocks';
import { LlmProviderService } from '@services/llm-provider/llm-provider';
import { ExecutionVaultCredentialsService } from '@services/llm-provider/execution-vault-credentials';
import { VaultService } from '@services/vault/vault';
import { extractHttpErrorMessage } from '@services/shared/http-error.util';
import {
  BiasRerunDialogService,
  BiasRerunCandidate,
  hasActivatableSubflowBiasProbe
} from '@services/dialogs/bias-rerun-dialog';
import { BiasCompareDialogService } from '@services/dialogs/bias-compare-dialog';
import { BiasComparisonViewStateService } from '@services/bias/bias-comparison-view-state';
import { BiasImpactReportListComponent } from '@shared/bias-impact-report-list/bias-impact-report-list';
import { JsonViewerComponent } from '@shared/json-viewer/json-viewer';
import { catchError, concat, firstValueFrom, Observable, of, take, tap } from 'rxjs';
import {
  ExecutionOutputEntry,
  ExecutionOutputGroup,
  ExecutionIntermediateInputEntry,
  ExecutionIntermediateInputGroup,
  ExecutionLogEntryView,
  stepTitle,
  stepNodeId,
  stringifyOutputValue,
  formatDuration,
  fallbackExecutionLogMessage,
  logLevelClass as _logLevelClass,
  logTypeIcon as _logTypeIcon,
  formatExecutionOutputLabel,
  buildExecutionOutputs,
  buildExecutionOutputGroups,
  buildExecutionIntermediateInputs,
  buildExecutionIntermediateInputGroups,
  buildVisibleExecutionLogs,
  normalizeEditableInputValue,
  planInputSaves,
  preparedInputValue,
  getExecutionInputValues,
  getExecutionOutputValues,
  getConnectedInputs,
  getConnectedOutputs,
  getExecutionErrors,
  hasStoredValue,
  getExecutionWarnings,
  AuthorizationGate,
  VaultAuthorizationEntry,
  buildAuthorizationGate,
  isExecutionStartable,
} from './execution-viewer.utils';
import {
  mergeExecutionStepNode,
  resolveExecutionConnections,
  resolveExecutionDependencies
} from './execution-graph';

@Component({
  selector: 'app-task-execution-viewer',
  imports: [CommonModule, FormsModule, ReteEditor, TaskExecutionInputsPanelComponent, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatSelectModule, BiasImpactReportListComponent, JsonViewerComponent],
  templateUrl: './task-execution-viewer.html',
  styleUrl: './task-execution-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskExecutionViewerComponent implements OnDestroy {
  private static readonly EVENTS_POLL_INTERVAL_MS = 5000;
  private taskExecutionsService = inject(TaskExecutionsService);
  private flowsService = inject(FlowsService);
  private humanInteractionDialog = inject(HumanInteractionDialogService);
  private settingsDialog = inject(NodeSettingsDialogService);
  private fieldRetriever = inject(FieldRetriever);
  private containersService = inject(ContainersService);
  private blocksService = inject(BlocksService);
  private llmProviderService = inject(LlmProviderService);
  private executionVaultCredentials = inject(ExecutionVaultCredentialsService);
  private vaultService = inject(VaultService);
  private biasRerunDialog = inject(BiasRerunDialogService);
  private biasCompareDialog = inject(BiasCompareDialogService);
  private biasComparisonViewState = inject(BiasComparisonViewStateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private lastExecutionId: string | null = null;
  private lastExecutionStatus: string | null = null;
  private static readonly SIMULATOR_PROVIDER_RETRIEVER_URL = '/retriever/LLM/providers';
  private static readonly SIMULATOR_MODEL_RETRIEVER_URL = '/retriever/LLM/models';
  readonly execution = input<TaskExecution | null>(null);
  readonly parentExecution = input<TaskExecution | null>(null);
  readonly parentContainerStep = input<TaskExecutionStep | null>(null);
  readonly contextAsideOpen = signal(true);
  readonly isFullscreen = signal(false);
  readonly activeAsideTab = signal<'inputs' | 'intermediate' | 'logs' | 'output' | 'bias-reports'>('inputs');
  readonly startInProgress = signal(false);
  readonly simulateInProgress = signal(false);
  readonly biasRerunOpening = signal(false);
  readonly cancelInProgress = signal(false);
  readonly resumeInProgress = signal(false);
  readonly savingInputs = signal<Record<string, boolean>>({});
  readonly savingErrors = signal<Record<string, string>>({});
  readonly pendingTextInputs = signal<Record<string, string | string[]>>({});

  /** Edited but not yet sent, so the panel can offer one Save for the lot. */
  readonly pendingInputKeys = computed(() => Object.keys(this.pendingTextInputs()));
  /** Set when the single request carrying every edited global fails; cleared on the next edit. */
  readonly globalSaveError = signal<string | null>(null);

  readonly pendingAuthorizationValues = signal<Record<string, string>>({});
  readonly savingAuthorizations = signal<Record<string, boolean>>({});
  readonly authorizationErrors = signal<Record<string, string>>({});
  readonly llmProviderCapabilities = signal<LlmProviderCapability[]>([]);
  readonly llmProviderCapabilitiesLoading = signal(false);
  readonly llmProviderCapabilitiesError = signal<string | null>(null);
  readonly llmCredentialOptions = signal<Record<string, ExecutionVaultCredential[]>>({});
  readonly llmCredentialLoading = signal<Record<string, boolean>>({});
  readonly llmCredentialErrors = signal<Record<string, string>>({});
  /** Satisfied requirements the user reopened to pick a different credential. */
  readonly editingAuthorizationKeys = signal<Record<string, boolean>>({});
  readonly credentialFormOpen = signal(false);
  readonly credentialFormProvider = signal('');
  readonly credentialFormLabel = signal('');
  readonly credentialFormDescription = signal('');
  readonly credentialFormValue = signal('');
  readonly credentialFormSaving = signal(false);
  readonly credentialFormError = signal<string | null>(null);
  readonly outputPreviewModal = signal<ExecutionOutputEntry | null>(null);
  readonly intermediateInputPreviewModal = signal<ExecutionIntermediateInputEntry | null>(null);
  readonly executionLogs = signal<ExecutionEventLogEntry[]>([]);
  readonly sourceFlowData = signal<FlowData | null>(null);
  readonly sourceFlowLoading = signal(false);
  readonly logsLoading = signal(false);
  readonly logsError = signal<string | null>(null);
  private readonly logsScrollViewport = viewChild<ElementRef<HTMLDivElement>>('logsScrollViewport');
  private sourceFlowRequestVersion = 0;
  private readonly sourceFlowCache = new Map<string, FlowData>();
  private readonly requestedCredentialProviders = new Set<string>();

  constructor() {
    effect(() => {
      const executionId = this.execution()?.id ?? null;
      if (executionId === this.lastExecutionId) return;
      this.lastExecutionId = executionId;
      this.lastExecutionStatus = String(this.execution()?.context.status ?? '').toUpperCase() || null;
      this.pendingAuthorizationValues.set({});
      this.savingAuthorizations.set({});
      this.authorizationErrors.set({});
      this.llmCredentialOptions.set({});
      this.llmCredentialLoading.set({});
      this.llmCredentialErrors.set({});
      this.editingAuthorizationKeys.set({});
      this.requestedCredentialProviders.clear();
      this.credentialFormOpen.set(false);
      this.credentialFormError.set(null);
      this.loadLlmProviderCapabilities();
      this.activeAsideTab.set('inputs');
      this.outputPreviewModal.set(null);
      this.intermediateInputPreviewModal.set(null);
      this.executionLogs.set([]);
      this.logsError.set(null);
      this.logsLoading.set(false);
    });

    // Credentials follow the gate, not the provider catalog: a requirement needs a
    // vault secret whether or not the catalog could be read.
    effect(() => {
      for (const provider of this.authorizationGate().missingProviders) {
        this.loadLlmCredentialsOnce(provider);
      }
    });

    effect(() => {
      const execution = this.execution();
      const requestVersion = ++this.sourceFlowRequestVersion;
      const embeddedFlow = execution?.flowSnapshot ?? null;
      if (embeddedFlow) {
        this.sourceFlowData.set(embeddedFlow);
        this.sourceFlowLoading.set(false);
        return;
      }

      if (Array.isArray(execution?.stepConnections)) {
        this.sourceFlowData.set(null);
        this.sourceFlowLoading.set(false);
        return;
      }

      const flowId = String(execution?.sourceFlowId ?? execution?.flowId ?? '').trim();
      if (!flowId) {
        this.sourceFlowData.set(null);
        this.sourceFlowLoading.set(false);
        return;
      }

      const cached = this.sourceFlowCache.get(flowId);
      if (cached) {
        this.sourceFlowData.set(cached);
        this.sourceFlowLoading.set(false);
        return;
      }

      this.sourceFlowData.set(null);
      this.sourceFlowLoading.set(true);
      this.flowsService.getFlowById(flowId).pipe(take(1)).subscribe({
        next: (flow) => {
          if (requestVersion !== this.sourceFlowRequestVersion) return;
          this.sourceFlowCache.set(flowId, flow.data);
          this.sourceFlowData.set(flow.data);
          this.sourceFlowLoading.set(false);
        },
        error: () => {
          if (requestVersion !== this.sourceFlowRequestVersion) return;
          this.sourceFlowData.set(null);
          this.sourceFlowLoading.set(false);
        }
      });
    });

    effect(() => {
      if (!this.executionOutputTabEnabled() && this.activeAsideTab() === 'output') {
        this.activeAsideTab.set('inputs');
      }
    });

    effect(() => {
      const status = String(this.execution()?.context.status ?? '').toUpperCase();
      if (!status) return;

      const becameSuccessful =
        (status === 'SUCCESS' || status === 'COMPLETED') &&
        this.lastExecutionStatus !== status &&
        this.lastExecutionStatus !== 'SUCCESS' &&
        this.lastExecutionStatus !== 'COMPLETED';

      if (becameSuccessful && this.executionOutputTabEnabled()) {
        this.activeAsideTab.set('output');
      }

      this.lastExecutionStatus = status;
    });

    effect((onCleanup) => {
      const execution = this.execution();
      const executionId = execution?.id ?? null;
      if (!executionId || !execution) return;

      this.fetchExecutionLogs(executionId);

      const statusGroup = getExecutionStatusGroup(execution.context.status);
      if (statusGroup !== 'RUNNING' && statusGroup !== 'PAUSED') return;

      const timer = setInterval(() => {
        this.fetchExecutionLogs(executionId);
      }, TaskExecutionViewerComponent.EVENTS_POLL_INTERVAL_MS);

      onCleanup(() => clearInterval(timer));
    });

    effect(() => {
      this.executionLogs();
      this.logsLoading();
      queueMicrotask(() => this.scrollLogsToBottom());
    });

    effect(() => {
      const dialogState = this.humanInteractionDialog.state();
      const execution = this.execution();
      if (!dialogState || !execution) return;
      if (dialogState.executionId !== execution.id || !dialogState.nodeId) return;

      const executionStatus = String(execution.context.status ?? '').toUpperCase();
      if (executionStatus === 'CANCELLED' || executionStatus === 'SUSPENDED' || execution.interactionSimulationEnabled === true) {
        this.humanInteractionDialog.close(null);
        return;
      }

      const step = execution.context.steps?.[dialogState.nodeId];
      const stepStatus = String(step?.status ?? '').toUpperCase();
      if (dialogState.kind !== 'chat-session' && stepStatus !== 'WAITING_FOR_INTERACTION') {
        this.humanInteractionDialog.close(null);
        return;
      }
      const stepResult = step?.result && typeof step.result === 'object' ? step.result as Record<string, unknown> : {};
      const finalResult = execution.context.result ?? {};
      const partialResult = execution.context.partialResult ?? {};

      const historyField = dialogState.historyField || (dialogState.kind === 'chat-session' ? 'history' : null);
      const responseField = dialogState.responseField || (dialogState.kind === 'chat-session' ? 'response' : null);
      const historyKey = historyField ? `${dialogState.nodeId}:${historyField}` : null;
      const responseKey = responseField ? `${dialogState.nodeId}:${responseField}` : null;

      const rawHistory = historyField
        ? partialResult[historyKey ?? '']
          ?? finalResult[historyKey ?? '']
          ?? stepResult[historyField]
        : undefined;
      const rawResponse = responseField
        ? partialResult[responseKey ?? '']
          ?? finalResult[responseKey ?? '']
          ?? stepResult[responseField]
        : undefined;

      const nextHistory = this.toDialogHistory(rawHistory);
      const nextLatestResponse = typeof rawResponse === 'string' ? rawResponse : '';
      const nextIsRunning = stepStatus === 'RUNNING';
      const historyHasPendingUser = !!dialogState.pendingUserMessage
        && nextHistory.some((message) =>
          message.role === 'user' && String(message.content ?? '').trim() === String(dialogState.pendingUserMessage ?? '').trim()
        );
      const nextPendingUserMessage = historyHasPendingUser ? null : dialogState.pendingUserMessage;
      const nextAwaitingAssistantResponse = dialogState.awaitingAssistantResponse
        && nextLatestResponse.trim().length > 0
        && nextLatestResponse.trim() !== String(dialogState.assistantResponseBaseline ?? '').trim()
        ? false
        : dialogState.awaitingAssistantResponse;
      const sameHistory = JSON.stringify(dialogState.history) === JSON.stringify(nextHistory);
      const sameLatestResponse = dialogState.latestResponse === nextLatestResponse;
      const sameIsRunning = dialogState.isRunning === nextIsRunning;
      const samePendingUserMessage = dialogState.pendingUserMessage === nextPendingUserMessage;
      const sameAwaitingAssistantResponse = dialogState.awaitingAssistantResponse === nextAwaitingAssistantResponse;
      if (sameHistory && sameLatestResponse && sameIsRunning && samePendingUserMessage && sameAwaitingAssistantResponse) return;

      this.humanInteractionDialog.update({
        history: nextHistory,
        latestResponse: nextLatestResponse,
        pendingUserMessage: nextPendingUserMessage,
        awaitingAssistantResponse: nextAwaitingAssistantResponse,
        isRunning: nextIsRunning
      });
    });
  }

  readonly stepsArray = computed(() =>
    Object.values(this.execution()?.context.steps ?? {})
  );

  readonly authorizationGate = computed<AuthorizationGate>(() =>
    buildAuthorizationGate(this.execution(), {
      capabilities: this.llmProviderCapabilities(),
      loading: this.llmProviderCapabilitiesLoading(),
      failed: !!this.llmProviderCapabilitiesError()
    })
  );

  /** Credentials still to choose, plus the settled ones the user reopened. */
  readonly pendingVaultAuthorizations = computed<VaultAuthorizationEntry[]>(() => {
    const gate = this.authorizationGate();
    const editing = this.editingAuthorizationKeys();
    return [
      ...gate.vault,
      ...gate.satisfiedVault.filter((entry) => editing[entry.requirement.key])
    ];
  });

  /** Credentials already accepted, kept on screen so they can be reviewed or changed. */
  readonly settledVaultAuthorizations = computed<VaultAuthorizationEntry[]>(() => {
    const editing = this.editingAuthorizationKeys();
    return this.authorizationGate().satisfiedVault.filter((entry) => !editing[entry.requirement.key]);
  });

  readonly runtimeAuthorizationRequirements = computed(() => this.authorizationGate().runtime);

  readonly executionFlowData = computed<FlowData>(() => {
    const executionStatusGroup = getExecutionStatusGroup(this.execution()?.context.status);
    const contextInputs = this.execution()?.context.inputs ?? {};
    const contextResults = this.execution()?.context.result ?? {};
    const contextErrors = this.execution()?.context.errors ?? {};
    const contextWarnings = this.execution()?.context.warnings ?? {};
    const waitingSteps = this.execution()?.context.waitingSteps ?? [];
    const biasContext = this.execution()?.biasExecutionContext ?? null;
    const globalInputsValue = this.execution()?.context.globalInputs ?? {};
    const executionVariablesValue = this.execution()?.context.executionVariables ?? {};
    const projectContextValue = this.execution()?.context.projectContext ?? {};
    const executionName = this.execution()?.name ?? null;
    const steps = this.stepsArray();
    const execution = this.execution();
    const sourceFlow = execution?.flowSnapshot ?? this.sourceFlowData();
    const useSourceGraphFallback = !Array.isArray(execution?.stepConnections);
    const connections = this.getExecutionConnections(steps, sourceFlow);
    const dependencies = this.getExecutionDependencies(steps, sourceFlow);
    const blocks: FlowBlock[] = [];
    const containers: FlowContainer[] = [];
    const renderedNodeIds = new Set<string>();

    for (const [index, step] of steps.entries()) {
      const stepNode = mergeExecutionStepNode(step, sourceFlow);
      if (!stepNode) continue;
      const connectedInputs = Array.from(new Set([
        ...getConnectedInputs(step),
        ...connections
          .filter((connection) => connection.targetId === stepNode.id)
          .map((connection) => connection.targetName)
      ]));
      const connectedOutputs = Array.from(new Set([
        ...getConnectedOutputs(step),
        ...connections
          .filter((connection) => connection.sourceId === stepNode.id)
          .map((connection) => connection.sourceName)
      ]));

      const executionNode: FlowNode = {
        ...stepNode,
        nodeFamily: this.isContainerExecutionNode(stepNode) ? 'container' : 'block',
        specificConfiguration: {
          ...(stepNode.specificConfiguration ?? {}),
          __executionId: this.execution()?.id ?? null,
          __executionNodeId: step.id,
          __executionStatus: this.execution()?.context.status ?? null,
          __interactionSimulationEnabled: this.execution()?.interactionSimulationEnabled === true,
          __stepStatus: step.status,
          // Which iteration a container is on, so a node that is visibly working can say what it
          // is working on rather than only that it is.
          __containerIterationIndex: typeof step.containerIterationIndex === 'number'
            ? step.containerIterationIndex
            : null,
          __stepSkipReason: step.skipReason ?? null,
          __stepSimulated: step.simulated === true,
          __stepUserInteractive: stepNode.userInteractive === true,
          __executionStatusGroup: executionStatusGroup,
          __isWaitingStep: waitingSteps.includes(step.id),
          __executionInputs: getExecutionInputValues(step, contextInputs),
          __connectedInputs: connectedInputs,
          __executionOutputs: getExecutionOutputValues(step, contextResults),
          __connectedOutputs: connectedOutputs,
          __hasDependencyInputConnection: dependencies.some(
            (dependency) => dependency.targetId === stepNode.id
          ),
          __hasDependantOutputConnection: dependencies.some(
            (dependency) => dependency.sourceId === stepNode.id
          ),
          __executionErrors: getExecutionErrors(step.id, contextErrors),
          __executionWarnings: getExecutionWarnings(step.id, contextWarnings),
          __stepResultData: step.result ?? null,
          __executionPartialResult: this.execution()?.context.partialResult ?? null,
          __biasActiveAnnotationIds: activeAnnotationIdsFor(biasContext, step.id),
          __globalInputs: globalInputsValue,
          __executionVariables: executionVariablesValue,
          __projectContext: projectContextValue,
          __executionName: executionName
        },
        position: stepNode.position ?? {
          x: 120 + (index % 3) * 340,
          y: 100 + Math.floor(index / 3) * 220
        }
      };
      renderedNodeIds.add(executionNode.id);

      if (executionNode.nodeFamily === 'container') {
        containers.push(executionNode);
      } else {
        blocks.push(executionNode);
      }
    }

    for (const sourceNode of useSourceGraphFallback
      ? [...(sourceFlow?.blocks ?? []), ...(sourceFlow?.containers ?? [])]
      : []) {
      if (renderedNodeIds.has(sourceNode.id)) continue;

      const connectedInputs = (sourceFlow?.connections ?? [])
        .filter((connection) => connection.targetId === sourceNode.id)
        .map((connection) => connection.targetName);
      const connectedOutputs = (sourceFlow?.connections ?? [])
        .filter((connection) => connection.sourceId === sourceNode.id)
        .map((connection) => connection.sourceName);
      const executionNode: FlowNode = {
        ...sourceNode,
        specificConfiguration: {
          ...(sourceNode.specificConfiguration ?? {}),
          __executionId: this.execution()?.id ?? null,
          __executionNodeId: sourceNode.id,
          __executionStatus: this.execution()?.context.status ?? null,
          __executionStatusGroup: executionStatusGroup,
          __stepStatus: 'SKIPPED',
          __isWaitingStep: false,
          __executionInputs: {},
          __connectedInputs: connectedInputs,
          __executionOutputs: {},
          __connectedOutputs: connectedOutputs,
          __hasDependencyInputConnection: this.hasIncomingDependency(sourceNode.id),
          __hasDependantOutputConnection: this.hasOutgoingDependency(sourceNode.id),
          __executionErrors: [],
          __executionWarnings: [],
          __stepResultData: null,
          __executionPartialResult: this.execution()?.context.partialResult ?? null,
          __biasActiveAnnotationIds: activeAnnotationIdsFor(biasContext, sourceNode.id),
          __globalInputs: globalInputsValue,
          __executionVariables: executionVariablesValue,
          __projectContext: projectContextValue,
          __executionName: executionName
        }
      };

      if (executionNode.nodeFamily === 'container') {
        containers.push(executionNode);
      } else {
        blocks.push(executionNode);
      }
    }

    return {
      blocks,
      containers,
      connections,
      dependencies,
      globalInputs: sourceFlow?.globalInputs ?? [],
      lanes: sourceFlow?.lanes ?? []
    };
  });

  /**
   * Where a flow's answer actually lands when its last block is wired into an End node: the flow
   * result is built only from unconnected outputs, so that connection moves the value here. Without
   * surfacing it the run looks like it produced nothing.
   */
  readonly outcomes = computed(() => this.execution()?.context.outcomes ?? []);

  /**
   * Open by default: this is the flow's answer, and it was invisible until now. Collapsing gives
   * the graph its height back when the payload is a long document.
   */
  readonly outcomesOpen = signal(true);

  /** Ids, simulator descriptors and probe internals are diagnostics: useful, but not the headline. */
  readonly headerDetailsOpen = signal(false);

  readonly biasVariantLabel = computed(() => {
    switch (biasInterventionMix(this.execution()?.biasExecutionContext)) {
      case 'MIXED': return 'Bias + mitigation';
      case 'MITIGATION': return 'Mitigation variant';
      case 'BIAS': return 'Bias variant';
      // A variant with nothing recorded as active: say so rather than pick one of the two.
      default: return 'Bias variant (unspecified)';
    }
  });

  toggleHeaderDetails() {
    this.headerDetailsOpen.update((open) => !open);
  }

  /** Kept in the header so the conclusion is still readable while collapsed. */
  readonly outcomeCodes = computed(() => this.outcomes().map((outcome) => outcome.code).join(', '));

  toggleOutcomes() {
    this.outcomesOpen.update((open) => !open);
  }

  readonly hasOutcomePayload = computed(() =>
    this.outcomes().some((outcome) => outcome.payload !== null && outcome.payload !== undefined));

  /**
   * A text payload is shown as text, not through the JSON tree: the common case is a generated
   * document - an email, a report - and the tree would quote it and collapse its line breaks.
   */
  isTextPayload(payload: unknown): payload is string {
    return typeof payload === 'string';
  }

  stepNameForOutcome(stepId: string): string {
    return this.execution()?.context.steps?.[stepId]?.node?.name ?? stepId;
  }

  readonly formattedDuration = computed(() => {
    const context = this.execution()?.context;
    if (!context?.startTime || !context?.endTime) return '-';
    return formatDuration(context.startTime, context.endTime);
  });

  readonly executionOutputTabEnabled = computed(() => {
    const status = String(this.execution()?.context.status ?? '').toUpperCase();
    return status === 'SUCCESS' || status === 'COMPLETED';
  });

  readonly executionOutputs = computed<ExecutionOutputEntry[]>(() =>
    buildExecutionOutputs(this.execution())
  );

  readonly executionOutputGroups = computed<ExecutionOutputGroup[]>(() =>
    buildExecutionOutputGroups(this.executionOutputs())
  );

  readonly executionIntermediateInputs = computed<ExecutionIntermediateInputEntry[]>(() =>
    buildExecutionIntermediateInputs(this.execution())
  );

  readonly executionIntermediateInputGroups = computed<ExecutionIntermediateInputGroup[]>(() =>
    buildExecutionIntermediateInputGroups(this.executionIntermediateInputs())
  );

  readonly inputsReadOnly = computed(() => {
    const status = this.execution()?.context.status;
    return getExecutionStatusGroup(status) !== 'INIT';
  });

  readonly visibleExecutionLogs = computed<ExecutionLogEntryView[]>(() =>
    buildVisibleExecutionLogs(this.executionLogs())
  );

  readonly canCancelExecution = computed(() => {
    const target = this.isSubflowExecution() ? this.parentExecution() : this.execution();
    const status = String(target?.context.status ?? '').toUpperCase();
    return !this.cancelInProgress() && (status === 'RUNNING' || status === 'WAITING');
  });
  readonly startExecutionTooltip = computed(() => {
    const gate = this.authorizationGate();
    if (gate.missingProviders.length) return `Missing provider credential: ${gate.missingProviders.join(', ')}`;
    if (gate.runtime.length) return 'Missing provider authorization';
    return 'Start execution';
  });

  readonly cancelExecutionTooltip = computed(() =>
    this.isSubflowExecution() ? 'Cancel parent execution' : 'Cancel execution'
  );

  readonly canResumeExecution = computed(() => {
    if (this.isSubflowExecution()) return false;
    const status = String(this.execution()?.context.status ?? '').toUpperCase();
    return !this.resumeInProgress() && status === 'SUSPENDED';
  });

  readonly canStartExecution = computed(() =>
    !this.isSubflowExecution() && isExecutionStartable(this.execution(), this.authorizationGate())
  );

  readonly canSimulateExecution = computed(() => {
    return !this.isSubflowExecution()
      && this.execution()?.simulationAvailable === true
      && this.canStartExecution()
      && !this.simulateInProgress();
  });

  readonly isSubflowExecution = computed(() => this.execution()?.executionKind === 'SUBFLOW');
  readonly isSimulatedExecution = computed(() => this.execution()?.interactionSimulationEnabled === true);
  /**
   * The backend sets a bias context on *every* execution, defaulting to NORMAL, so the presence of
   * the object says nothing - only the mode does. Testing for presence marked every run a bias
   * variant, and also offered the bias comparison on any plain rerun.
   */
  readonly isBiasVariant = computed(() => isBiasVariantContext(this.execution()?.biasExecutionContext));
  readonly canCreateBiasedRerun = computed(() =>
    !this.isSubflowExecution()
    && getExecutionStatusGroup(this.execution()?.context.status) === 'FINAL'
    && !this.biasRerunOpening()
  );
  readonly canCompareBiasExecution = computed(() =>
    !this.isSubflowExecution()
    && this.isBiasVariant()
    && !!this.execution()?.rerunOfExecutionId
    && getExecutionStatusGroup(this.execution()?.context.status) === 'FINAL'
  );
  readonly subflowIterationIndex = computed<number | null>(() => {
    const executionIndex = this.execution()?.parentIterationIndex;
    if (typeof executionIndex === 'number') return executionIndex;
    const stepIndex = this.parentContainerStep()?.containerIterationIndex;
    return typeof stepIndex === 'number' ? stepIndex : null;
  });
  readonly simulationDescriptorLabel = computed(() => {
    const descriptor = this.execution()?.interactionSimulationDescriptor;
    if (!descriptor) return null;

    const provider = String(descriptor.provider ?? '').trim();
    const model = String(descriptor.model ?? '').trim();
    if (!provider && !model) return null;
    if (!provider) return model;
    if (!model) return provider;
    return `${provider} / ${model}`;
  });

  readonly editableInputs = computed<EditableExecutionInput[]>(() => {
    const missingGlobalInputNames = new Set(this.execution()?.missingGlobalInputKeys ?? []);
    const execution = this.execution();
    if (!execution) return [];

    const entries: EditableExecutionInput[] = [];
    const contextInputs = execution.context.inputs ?? {};
    const contextGlobalInputs = execution.context.globalInputs ?? {};
    const globalInputDescriptors = execution.context.globalInputDescriptors ?? {};

    for (const [descriptorKey, descriptor] of Object.entries(globalInputDescriptors)) {
      const inputName = String(descriptor?.name ?? descriptorKey).trim();
      if (!inputName) continue;

      const key = `global:${inputName}`;
      const rawValue = Object.prototype.hasOwnProperty.call(contextGlobalInputs, inputName)
        ? contextGlobalInputs[inputName]
        : descriptor?.value;
      const pendingValue = this.pendingTextInputs()[key];

      entries.push({
        key,
        scope: 'global',
        nodeId: null,
        inputName,
        title: 'Flow',
        subtitle: inputName,
        type: String(descriptor?.kind ?? 'TEXT').toUpperCase(),
        multiple: Boolean(descriptor?.multiple),
        // The backend's own answer, and it reports what is stored - so an unsaved edit does not
        // make an input look satisfied.
        provided: !missingGlobalInputNames.has(inputName),
        value: pendingValue ?? normalizeEditableInputValue(rawValue, Boolean(descriptor?.multiple))
      });
    }

    for (const step of Object.values(execution.context.steps ?? {})) {
      for (const input of step.inputs ?? []) {
        if (input.registered) continue;

        const inputName = input.descriptor?.name;
        if (!inputName) continue;

        const key = `${step.id}:${inputName}`;
        const rawValue = Object.prototype.hasOwnProperty.call(contextInputs, key)
          ? contextInputs[key]
          : input.value;
        const pendingValue = this.pendingTextInputs()[key];

        entries.push({
          key,
          scope: 'node',
          nodeId: step.id,
          inputName,
          title: stepTitle(step),
          subtitle: inputName,
          type: String(input.descriptor?.type ?? 'TEXT').toUpperCase(),
          multiple: Boolean(input.descriptor?.multiple),
          // No per-input flag from the backend here, so judge the stored value, ignoring pending.
          provided: hasStoredValue(rawValue),
          value: pendingValue ?? normalizeEditableInputValue(rawValue, Boolean(input.descriptor?.multiple))
        });
      }
    }

    return entries.sort((a, b) => a.title.localeCompare(b.title) || a.subtitle.localeCompare(b.subtitle));
  });

  /** Brings the credential picker on screen from the banner above the graph. */
  openAuthorizationPanel() {
    this.contextAsideOpen.set(true);
    this.activeAsideTab.set('inputs');
  }

  toggleContextAside() {
    this.contextAsideOpen.update((open) => !open);
  }

  toggleFullscreen() {
    this.isFullscreen.update((fullscreen) => !fullscreen);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.isFullscreen()) {
      this.isFullscreen.set(false);
    }
  }

  selectAsideTab(tab: 'inputs' | 'intermediate' | 'logs' | 'output' | 'bias-reports') {
    if (tab === 'output' && !this.executionOutputTabEnabled()) return;
    this.activeAsideTab.set(tab);
  }

  openOutputPreview(output: ExecutionOutputEntry, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!output.isLong) return;
    this.outputPreviewModal.set(output);
  }

  outputPreviewTitle(output: ExecutionOutputEntry | null): string {
    if (!output) return 'Output';
    return output.nodeTitle;
  }

  outputPreviewSubtitle(output: ExecutionOutputEntry | null): string {
    if (!output) return '';
    return output.outputName;
  }

  closeOutputPreview(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.outputPreviewModal.set(null);
  }

  openIntermediateInputPreview(input: ExecutionIntermediateInputEntry, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!input.isLong) return;
    this.intermediateInputPreviewModal.set(input);
  }

  intermediateInputPreviewTitle(input: ExecutionIntermediateInputEntry | null): string {
    if (!input) return 'Intermediate input';
    return input.nodeTitle;
  }

  intermediateInputPreviewSubtitle(input: ExecutionIntermediateInputEntry | null): string {
    if (!input) return '';
    const itemLabel = input.itemLabel ? ` · ${input.itemLabel}` : '';
    return `${input.inputName}${itemLabel}`;
  }

  closeIntermediateInputPreview(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.intermediateInputPreviewModal.set(null);
  }

  startExecution() {
    const executionId = this.execution()?.id;
    if (!executionId || !this.canStartExecution() || this.startInProgress()) return;

    this.startInProgress.set(true);
    this.taskExecutionsService.startExecution(executionId).subscribe({
      next: () => this.startInProgress.set(false),
      error: () => this.startInProgress.set(false)
    });
  }

  llmCredentialOptionsFor(entry: VaultAuthorizationEntry): ExecutionVaultCredential[] {
    return this.llmCredentialOptions()[entry.provider.toLowerCase()] ?? [];
  }

  llmCredentialLoadingFor(entry: VaultAuthorizationEntry): boolean {
    return this.llmCredentialLoading()[entry.provider.toLowerCase()] === true;
  }

  llmCredentialErrorFor(entry: VaultAuthorizationEntry): string | null {
    return this.llmCredentialErrors()[entry.provider.toLowerCase()] ?? null;
  }

  selectedLlmCredentialFor(entry: VaultAuthorizationEntry): string {
    return this.pendingAuthorizationValues()[entry.requirement.key] ?? '';
  }

  authorizationSavingFor(entry: VaultAuthorizationEntry): boolean {
    return this.savingAuthorizations()[entry.requirement.key] === true;
  }

  authorizationErrorFor(entry: VaultAuthorizationEntry): string | null {
    return this.authorizationErrors()[entry.requirement.key] ?? null;
  }

  /** Label of the credential currently answering a satisfied requirement, when it can be resolved. */
  providedCredentialLabel(entry: VaultAuthorizationEntry): string {
    const provided = this.execution()?.providedAuthorizations?.[entry.requirement.key];
    const credentialId = typeof provided === 'string' ? provided : '';
    const match = this.llmCredentialOptionsFor(entry).find((item) => item.id === credentialId);
    return match?.label ?? 'Credential provided';
  }

  selectLlmCredential(entry: VaultAuthorizationEntry, credentialId: string) {
    if (!this.llmCredentialOptionsFor(entry).some((item) => item.id === credentialId)) return;
    this.applyLlmCredential(entry, credentialId);
  }

  changeVaultAuthorization(entry: VaultAuthorizationEntry) {
    this.editingAuthorizationKeys.update((current) => ({ ...current, [entry.requirement.key]: true }));
    this.reloadLlmCredentials(entry.provider);
  }

  cancelVaultAuthorizationChange(entry: VaultAuthorizationEntry) {
    this.editingAuthorizationKeys.update((current) => {
      const next = { ...current };
      delete next[entry.requirement.key];
      return next;
    });
  }

  retryLlmCredentials(entry: VaultAuthorizationEntry) {
    this.reloadLlmCredentials(entry.provider);
  }

  retryLlmProviderCapabilities() {
    this.loadLlmProviderCapabilities();
  }

  private applyLlmCredential(entry: VaultAuthorizationEntry, credentialId: string) {
    if (!credentialId) return;
    this.onAuthorizationValueChange(entry.requirement, credentialId);
    this.submitAuthorization(entry.requirement);
  }

  openVaultCredentialForm(provider: string) {
    this.credentialFormError.set(null);
    this.credentialFormProvider.set(provider);
    this.credentialFormLabel.set('');
    this.credentialFormDescription.set('');
    this.credentialFormValue.set('');
    this.credentialFormOpen.set(true);
  }

  closeVaultCredentialForm() {
    this.credentialFormOpen.set(false);
    this.credentialFormValue.set('');
    this.credentialFormError.set(null);
  }

  saveExecutionCredential() {
    const provider = this.credentialFormProvider().trim();
    const label = this.credentialFormLabel().trim();
    const value = this.credentialFormValue();
    if (!provider || !label || !value.trim() || this.credentialFormSaving()) return;
    this.credentialFormSaving.set(true);
    this.vaultService.createSecret({
      provider,
      label,
      description: this.credentialFormDescription().trim() || undefined,
      value
    }).pipe(take(1)).subscribe({
      next: (credential) => {
        this.credentialFormSaving.set(false);
        this.credentialFormValue.set('');
        this.credentialFormOpen.set(false);
        this.credentialFormError.set(null);
        this.reloadLlmCredentials(provider);

        // The vault id is the same id the authorizations endpoint takes, so the new
        // credential can answer the requirement without waiting for the listing.
        if (!credential.active) return;
        const entry = this.pendingVaultAuthorizations().find((item) =>
          item.provider.toLowerCase() === provider.toLowerCase()
        );
        if (entry) this.applyLlmCredential(entry, credential.id);
      },
      error: (error) => {
        this.credentialFormSaving.set(false);
        this.credentialFormValue.set('');
        this.credentialFormError.set(this.executionErrorMessage(error));
      }
    });
  }

  private loadLlmProviderCapabilities() {
    if (!this.execution()?.id) return;
    this.llmProviderCapabilitiesLoading.set(true);
    this.llmProviderCapabilitiesError.set(null);
    this.llmProviderService.listCapabilities().pipe(take(1)).subscribe({
      next: (capabilities) => {
        this.llmProviderCapabilities.set(capabilities);
        this.llmProviderCapabilitiesLoading.set(false);
      },
      error: (error) => {
        this.llmProviderCapabilitiesLoading.set(false);
        this.llmProviderCapabilitiesError.set(this.executionErrorMessage(error));
      }
    });
  }

  private loadLlmCredentialsOnce(provider: string) {
    const key = provider.trim().toLowerCase();
    if (!key || this.requestedCredentialProviders.has(key)) return;
    this.requestedCredentialProviders.add(key);
    this.loadLlmCredentials(provider).subscribe();
  }

  private reloadLlmCredentials(provider: string) {
    const key = provider.trim().toLowerCase();
    if (!key) return;
    this.requestedCredentialProviders.add(key);
    this.llmCredentialErrors.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    this.loadLlmCredentials(provider).subscribe();
  }

  private loadLlmCredentials(provider: string): Observable<ExecutionVaultCredential[]> {
    const key = provider.trim().toLowerCase();
    if (!key) return of([]);
    this.llmCredentialLoading.update((current) => ({ ...current, [key]: true }));
    return this.executionVaultCredentials.listForProvider(provider).pipe(
      take(1),
      tap({
        next: (credentials) => {
          this.llmCredentialOptions.update((current) => ({ ...current, [key]: credentials }));
          this.llmCredentialLoading.update((current) => ({ ...current, [key]: false }));
        },
        error: (error: unknown) => {
          this.llmCredentialLoading.update((current) => ({ ...current, [key]: false }));
          this.llmCredentialErrors.update((current) => ({ ...current, [key]: this.executionErrorMessage(error) }));
        }
      })
    );
  }

  private executionErrorMessage(error: unknown): string {
    return extractHttpErrorMessage(error as any)
      ?? (typeof (error as { message?: unknown })?.message === 'string'
        && (error as { message: string }).message.trim()
        ? (error as { message: string }).message
        : 'Unable to load or save the provider credential.');
  }

  async simulateExecution() {
    const executionId = this.execution()?.id;
    if (!executionId || !this.canSimulateExecution()) return;

    const simulator = await this.openSimulationSettings();
    if (!simulator) return;

    this.simulateInProgress.set(true);
    this.taskExecutionsService.simulateExecution(executionId, simulator).subscribe({
      next: () => this.simulateInProgress.set(false),
      error: () => this.simulateInProgress.set(false)
    });
  }

  cancelExecution() {
    const executionId = this.isSubflowExecution()
      ? this.parentExecution()?.id
      : this.execution()?.id;
    if (!executionId || !this.canCancelExecution()) return;

    this.cancelInProgress.set(true);
    this.taskExecutionsService.cancelExecution(executionId).subscribe({
      next: () => {
        this.cancelInProgress.set(false);
        this.humanInteractionDialog.close(null);
      },
      error: () => this.cancelInProgress.set(false)
    });
  }

  resumeExecution() {
    const executionId = this.execution()?.id;
    if (!executionId || !this.canResumeExecution()) return;

    this.resumeInProgress.set(true);
    this.taskExecutionsService.resumeExecution(executionId).subscribe({
      next: () => this.resumeInProgress.set(false),
      error: () => this.resumeInProgress.set(false)
    });
  }

  async openBiasedRerunDialog() {
    const execution = this.execution();
    if (!execution || !this.canCreateBiasedRerun()) return;
    this.biasRerunOpening.set(true);
    try {
      const candidates = await this.biasRerunCandidates();
      if (!candidates.length) return;
      this.biasRerunDialog.open({
        executionId: execution.id,
        candidates,
        onCreated: (variant) => {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { executionId: variant.id },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        }
      });
    } finally {
      this.biasRerunOpening.set(false);
    }
  }

  openCompareDialog() {
    const execution = this.execution();
    const baselineExecutionId = execution?.rerunOfExecutionId;
    if (!execution || !baselineExecutionId || !this.canCompareBiasExecution()) return;

    this.biasCompareDialog.open({
      baselineExecutionId,
      biasedExecutionId: execution.id
    });
  }

  isBiasHighlightActive(): boolean {
    return this.biasComparisonViewState.activeView() !== null;
  }

  clearBiasHighlight() {
    this.biasComparisonViewState.clear();
  }

  onTextInputChange(input: EditableExecutionInput, value: string | string[]) {
    if (this.inputsReadOnly()) return;
    this.globalSaveError.set(null);
    this.pendingTextInputs.update((current) => ({ ...current, [input.key]: value }));
    this.savingErrors.update((current) => {
      const next = { ...current };
      delete next[input.key];
      return next;
    });
  }

  /** Saves one input, over the same requests the Save bar uses - a global batch of exactly one. */
  submitTextInput(input: EditableExecutionInput) {
    if (this.inputsReadOnly()) return;
    const executionId = this.execution()?.id;
    if (!executionId) return;
    const request$ = input.scope === 'global'
      ? this.bulkGlobalRequest([input],
          { [input.inputName]: preparedInputValue(input, this.pendingTextInputs()[input.key]) },
          executionId)
      : this.singleInputRequest(input, executionId);
    request$.subscribe();
  }

  onFileInputChange(input: EditableExecutionInput, files: File[]) {
    if (this.inputsReadOnly()) return;
    const executionId = this.execution()?.id;
    if (!executionId || !files.length) return;

    this.setInputSaving(input.key, true);
    const request$ = input.scope === 'global'
      ? (
        input.multiple
          ? this.taskExecutionsService.prepareGlobalFileArrayInput(executionId, input.inputName, files)
          : this.taskExecutionsService.prepareGlobalFileInput(executionId, input.inputName, files[0])
      )
      : (
        input.multiple
          ? this.taskExecutionsService.prepareFileArrayInput(executionId, input.nodeId!, input.inputName, files)
          : this.taskExecutionsService.prepareFileInput(executionId, input.nodeId!, input.inputName, files[0])
      );

    request$.subscribe({
      next: () => this.clearInputSaving(input.key),
      error: () => this.setInputError(input.key, 'Failed to upload file')
    });
  }

  onAuthorizationValueChange(requirement: TaskExecutionAuthorizationRequirement, value: string) {
    this.pendingAuthorizationValues.update((current) => ({ ...current, [requirement.key]: value }));
    this.authorizationErrors.update((current) => {
      const next = { ...current };
      delete next[requirement.key];
      return next;
    });
  }

  submitAuthorization(requirement: TaskExecutionAuthorizationRequirement) {
    const executionId = this.execution()?.id;
    if (!executionId) return;

    const value = (this.pendingAuthorizationValues()[requirement.key] ?? '').trim();
    if (!value) return;

    this.setAuthorizationSaving(requirement.key, true);
    // The endpoint answers with the recomputed execution, which the service puts back
    // into the store, so the gate reopens on the backend's word rather than a guess.
    this.taskExecutionsService.provideAuthorization(executionId, requirement.key, value).subscribe({
      next: () => {
        this.pendingAuthorizationValues.update((current) => {
          const next = { ...current };
          delete next[requirement.key];
          return next;
        });
        this.editingAuthorizationKeys.update((current) => {
          const next = { ...current };
          delete next[requirement.key];
          return next;
        });
        this.clearAuthorizationSaving(requirement.key);
      },
      error: (error: unknown) => this.setAuthorizationError(
        requirement.key,
        extractHttpErrorMessage(error as any) ?? 'Failed to save authorization'
      )
    });
  }

  private setInputSaving(key: string, saving: boolean) {
    this.savingInputs.update((current) => ({ ...current, [key]: saving }));
    if (saving) {
      this.savingErrors.update((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  private clearInputSaving(key: string) {
    this.savingInputs.update((current) => ({ ...current, [key]: false }));
    this.savingErrors.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  private setInputError(key: string, message: string) {
    this.savingInputs.update((current) => ({ ...current, [key]: false }));
    this.savingErrors.update((current) => ({ ...current, [key]: message }));
  }

  ngOnDestroy() {
  }

  private setAuthorizationSaving(key: string, saving: boolean) {
    this.savingAuthorizations.update((current) => ({ ...current, [key]: saving }));
    if (saving) {
      this.authorizationErrors.update((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  private clearAuthorizationSaving(key: string) {
    this.savingAuthorizations.update((current) => ({ ...current, [key]: false }));
    this.authorizationErrors.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  private setAuthorizationError(key: string, message: string) {
    this.savingAuthorizations.update((current) => ({ ...current, [key]: false }));
    this.authorizationErrors.update((current) => ({ ...current, [key]: message }));
  }

  /**
   * Saves every edited input.
   *
   * <p>The globals go in a single bulk request, and the node inputs follow one at a time. Firing a
   * request per input in parallel had them all mutating the same execution at once, and the values
   * the user had just typed could come back missing.
   */
  submitAllTextInputs() {
    if (this.inputsReadOnly()) return;
    const executionId = this.execution()?.id;
    if (!executionId) return;

    const plan = planInputSaves(this.editableInputs(), this.pendingTextInputs());
    const steps: Observable<unknown>[] = [];
    if (plan.globals.length) {
      steps.push(this.bulkGlobalRequest(plan.globals, plan.globalValues, executionId));
    }
    for (const input of plan.nodeInputs) {
      steps.push(this.singleInputRequest(input, executionId));
    }
    if (!steps.length) return;

    // Sequential: one request at a time on one execution, which is the whole point of the change.
    concat(...steps).subscribe();
  }

  /** One request for every edited global, so they cannot overwrite one another. */
  private bulkGlobalRequest(
    globals: EditableExecutionInput[],
    values: Record<string, string | string[]>,
    executionId: string
  ): Observable<unknown> {
    this.globalSaveError.set(null);
    globals.forEach((input) => this.setInputSaving(input.key, true));

    return this.taskExecutionsService.prepareGlobalInputs(executionId, values).pipe(
      tap(() => globals.forEach((input) => {
        this.clearPendingInput(input.key);
        this.clearInputSaving(input.key);
      })),
      // One request, so either every global was saved or none was: one message says that, where
      // the same text on each field implied as many separate problems as there were inputs.
      catchError(() => {
        globals.forEach((input) => this.clearInputSaving(input.key));
        this.globalSaveError.set('Could not save the global inputs, so none of them were saved.');
        return of(null);
      })
    );
  }

  /** A node input still goes one at a time: there is no bulk endpoint per step. */
  private singleInputRequest(input: EditableExecutionInput, executionId: string): Observable<unknown> {
    const value = preparedInputValue(input, this.pendingTextInputs()[input.key]);
    this.setInputSaving(input.key, true);
    const request$ = Array.isArray(value)
      ? this.taskExecutionsService.prepareStringArrayInput(executionId, input.nodeId!, input.inputName, value)
      : this.taskExecutionsService.prepareStringInput(executionId, input.nodeId!, input.inputName, value);

    return request$.pipe(
      tap(() => {
        this.clearPendingInput(input.key);
        this.clearInputSaving(input.key);
      }),
      catchError(() => {
        this.setInputError(input.key, 'Failed to update input');
        return of(null);
      })
    );
  }

  private clearPendingInput(key: string) {
    this.pendingTextInputs.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  private async openSimulationSettings(): Promise<LLMDescriptor | null> {
    const providerOptions = await this.loadSimulationOptions(
      'providers',
      {},
      TaskExecutionViewerComponent.SIMULATOR_PROVIDER_RETRIEVER_URL
    );
    if (!providerOptions.length) {
      return null;
    }

    const defaultProvider = providerOptions[0].value;
    const initialModelOptions = await this.loadSimulationOptions(
      'models',
      { provider: defaultProvider },
      TaskExecutionViewerComponent.SIMULATOR_MODEL_RETRIEVER_URL
    );

    const buildFields = (providers: { label: string; value: string; }[], models: { label: string; value: string; }[]): NodeSettingField[] => [
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        options: providers,
        required: true,
        autofocus: true
      },
      {
        key: 'model',
        label: 'Model',
        type: 'select',
        options: models,
        required: true
      }
    ];

    const result = await this.settingsDialog.open({
      title: 'Simulation Settings',
      fields: buildFields(providerOptions, initialModelOptions),
      initial: {
        provider: defaultProvider,
        model: initialModelOptions[0]?.value ?? ''
      },
      onValuesChange: async (draft) => {
        const provider = String(draft['provider'] ?? '').trim();
        const modelOptions = provider
          ? await this.loadSimulationOptions(
            'models',
            { provider },
            TaskExecutionViewerComponent.SIMULATOR_MODEL_RETRIEVER_URL
          )
          : [];

        return {
          fields: buildFields(providerOptions, modelOptions),
          initial: {
            provider,
            model: modelOptions[0]?.value ?? ''
          }
        };
      }
    });

    if (!result) return null;

    const provider = String(result['provider'] ?? '').trim();
    const model = String(result['model'] ?? '').trim();
    if (!provider || !model) {
      return null;
    }

    return { provider, model };
  }

  private fetchExecutionLogs(executionId: string) {
    this.logsLoading.set(true);
    this.logsError.set(null);
    this.taskExecutionsService.retrieveExecutionEvents(executionId).subscribe({
      next: (events) => {
        if (this.execution()?.id !== executionId) return;
        this.executionLogs.set(Array.isArray(events) ? events : []);
        this.logsLoading.set(false);
      },
      error: () => {
        if (this.execution()?.id !== executionId) return;
        this.logsError.set('Unable to load execution logs.');
        this.logsLoading.set(false);
      }
    });
  }

  private isContainerExecutionNode(stepNode: FlowNode): boolean {
    if (stepNode.nodeFamily === 'container') return true;

    const subFlow = (stepNode.specificConfiguration as Record<string, unknown> | null | undefined)?.['subFlow'];
    if (subFlow && typeof subFlow === 'object' && !Array.isArray(subFlow)) return true;

    return !!this.containersService.peekContainerType(stepNode.typeName);
  }

  private scrollLogsToBottom() {
    const element = this.logsScrollViewport()?.nativeElement;
    if (!element || this.activeAsideTab() !== 'logs') return;
    element.scrollTop = element.scrollHeight;
  }

  private async loadSimulationOptions(
    key: string,
    context: Record<string, string>,
    retrieverUrl: string
  ): Promise<Array<{ label: string; value: string }>> {
    const values = await firstValueFrom(
      this.fieldRetriever.retrieveValues('LLM', key, context, retrieverUrl)
    );

    return values.map((value) => ({
      label: value,
      value
    }));
  }

  logLevelClass(level: string | null | undefined): string {
    return _logLevelClass(level);
  }

  logTypeIcon(type: string | null | undefined): string {
    return _logTypeIcon(type);
  }

  private inferConnections(steps: TaskExecutionStep[]) {
    const connections: FlowData['connections'] = [];
    const indexedSteps = steps.map((step, index) => ({ step, index }));

    for (const targetEntry of indexedSteps) {
      const targetStep = targetEntry.step;
      for (const input of targetStep.inputs ?? []) {
        if (!input.registered) continue;

        const candidates = indexedSteps
          .filter(({ step }) => step.id !== targetStep.id)
          .flatMap((sourceEntry) =>
            (sourceEntry.step.outputs ?? [])
              .filter((output) => output.connected)
              .filter((output) =>
                areFlowValueKindsCompatible(
                  normalizeFlowPortValueKinds(output.descriptor),
                  normalizeFlowPortValueKinds(input.descriptor)
                )
              )
              .map((output) => ({
                sourceStep: sourceEntry.step,
                sourceIndex: sourceEntry.index,
                sourceOutputName: output.descriptor.name
              }))
          );

        if (!candidates.length) continue;

        const source = this.pickBestConnectionCandidate(candidates, targetEntry.index);
        const id = `${source.sourceStep.id}_${source.sourceOutputName}_${targetStep.id}_${input.descriptor.name}`;
        if (connections.some((connection) => connection.id === id)) continue;

        connections.push({
          id,
          sourceId: stepNodeId(source.sourceStep),
          sourceName: source.sourceOutputName,
          targetId: stepNodeId(targetStep),
          targetName: input.descriptor.name
        });
      }
    }

    return connections;
  }

  private getExecutionConnections(
    steps: TaskExecutionStep[],
    sourceFlow: FlowData | null
  ): FlowBlockConnection[] {
    return resolveExecutionConnections(
      this.execution(),
      steps,
      sourceFlow,
      this.inferConnections(steps)
    );
  }

  private getExecutionDependencies(
    steps = this.stepsArray(),
    sourceFlow = this.execution()?.flowSnapshot ?? this.sourceFlowData()
  ): FlowNodeDependency[] {
    return resolveExecutionDependencies(this.execution(), steps, sourceFlow);
  }

  private hasIncomingDependency(stepId: string): boolean {
    return this.getExecutionDependencies().some((dependency) => String(dependency.targetId) === stepId);
  }

  private async biasRerunCandidates(): Promise<BiasRerunCandidate[]> {
    const candidates = this.stepsArray().flatMap((step): Array<{ nodeId: string; nodeName: string; node: FlowNode }> => {
      const node = mergeExecutionStepNode(
        step,
        this.execution()?.flowSnapshot ?? this.sourceFlowData()
      );
      if (!node) return [];

      if (this.isContainerExecutionNode(node)) {
        return hasActivatableSubflowBiasProbe(node)
          ? [{ nodeId: step.id, nodeName: node.name || step.id, node: { ...node, nodeFamily: 'container' } }]
          : [];
      }

      const block = node as FlowBlock;
      const annotations = (block.biasAnnotations ?? []).filter((annotation) => isProbeExecutable(annotation.biasProbe) || isProbeExecutable(annotation.mitigationProbe));
      return annotations.length ? [{ nodeId: step.id, nodeName: node.name || step.id, node: { ...block, biasAnnotations: annotations } }] : [];
    });

    const resolved = await Promise.all(candidates.map(async (candidate) => {
      const capabilities = await firstValueFrom(
        candidate.node.nodeFamily === 'container'
          ? this.containersService.retrieveBiasCapabilities(candidate.node.typeName)
          : this.blocksService.retrieveBiasCapabilities(candidate.node.typeName)
      );
      if (!capabilities.fullFlowExperimentSupported) return null;
      return {
        nodeId: candidate.nodeId,
        nodeName: candidate.nodeName,
        annotations: candidate.node.nodeFamily === 'container' ? [] : candidate.node.biasAnnotations ?? [],
        capabilities,
        activationKind: candidate.node.nodeFamily === 'container' ? 'SUBFLOW' : 'ANNOTATIONS'
      } satisfies BiasRerunCandidate;
    }));
    return resolved.filter((candidate): candidate is BiasRerunCandidate => candidate !== null);
  }

  private hasOutgoingDependency(stepId: string): boolean {
    return this.getExecutionDependencies().some((dependency) => String(dependency.sourceId) === stepId);
  }

  private pickBestConnectionCandidate(
    candidates: Array<{ sourceStep: TaskExecutionStep; sourceIndex: number; sourceOutputName: string }>,
    targetIndex: number
  ) {
    const previousCandidates = candidates
      .filter((candidate) => candidate.sourceIndex < targetIndex)
      .sort((left, right) => right.sourceIndex - left.sourceIndex);

    if (previousCandidates.length) {
      return previousCandidates[0];
    }

    return [...candidates].sort((left, right) => left.sourceIndex - right.sourceIndex)[0];
  }

  private toDialogHistory(rawHistory: unknown): HumanInteractionChatMessage[] {
    if (!Array.isArray(rawHistory)) return [];

    return rawHistory
      .map((entry) => {
        if (typeof entry === 'string') {
          return this.parseChatHistoryLine(entry);
        }
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const role = record['role'];
        const content = record['content'] ?? record['message'] ?? record['text'];
        if ((role !== 'user' && role !== 'assistant' && role !== 'system') || typeof content !== 'string') {
          return null;
        }
        return { role, content };
      })
      .filter((entry): entry is HumanInteractionChatMessage => entry != null);
  }

  private parseChatHistoryLine(rawLine: string): HumanInteractionChatMessage | null {
    const line = rawLine.trim();
    if (!line) return null;

    const prefixed = line.match(/^\[(USER|ASSISTANT|SYSTEM)\]\s*([\s\S]*)$/i);
    if (prefixed) {
      const role = prefixed[1].toLowerCase() as 'user' | 'assistant' | 'system';
      return {
        role,
        content: prefixed[2] ?? ''
      };
    }

    return {
      role: 'assistant',
      content: line
    };
  }

}
