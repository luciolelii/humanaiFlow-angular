import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, OnDestroy, signal, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  areFlowValueKindsCompatible,
  FlowBlock,
  FlowBlockConnection,
  FlowContainer,
  FlowData,
  LLMDescriptor,
  FlowNode,
  FlowNodeDependency,
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
import { ContainersService } from '@services/containers/containers';
import { firstValueFrom } from 'rxjs';

type ExecutionOutputEntry = {
  key: string;
  nodeTitle: string;
  outputName: string;
  value: string;
  preview: string;
  isLong: boolean;
  itemLabel: string | null;
};

type ExecutionOutputGroup = {
  nodeTitle: string;
  outputs: ExecutionOutputEntry[];
};

type ExecutionLogEntryView = ExecutionEventLogEntry & {
  messageText: string;
  levelText: string;
};

@Component({
  selector: 'app-task-execution-viewer',
  imports: [CommonModule, ReteEditor, TaskExecutionInputsPanelComponent, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './task-execution-viewer.html',
  styleUrl: './task-execution-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskExecutionViewerComponent implements OnDestroy {
  private static readonly EVENTS_POLL_INTERVAL_MS = 5000;
  private static readonly OUTPUT_PREVIEW_LIMIT = 80;
  private taskExecutionsService = inject(TaskExecutionsService);
  private humanInteractionDialog = inject(HumanInteractionDialogService);
  private settingsDialog = inject(NodeSettingsDialogService);
  private fieldRetriever = inject(FieldRetriever);
  private containersService = inject(ContainersService);
  private lastExecutionId: string | null = null;
  private lastExecutionStatus: string | null = null;
  private static readonly SIMULATOR_PROVIDER_RETRIEVER_URL = '/retriever/LLM/providers';
  private static readonly SIMULATOR_MODEL_RETRIEVER_URL = '/retriever/LLM/models';
  readonly execution = input<TaskExecution | null>(null);
  readonly contextAsideOpen = signal(true);
  readonly activeAsideTab = signal<'inputs' | 'logs' | 'output'>('inputs');
  readonly startInProgress = signal(false);
  readonly simulateInProgress = signal(false);
  readonly cancelInProgress = signal(false);
  readonly resumeInProgress = signal(false);
  readonly savingInputs = signal<Record<string, boolean>>({});
  readonly savingErrors = signal<Record<string, string>>({});
  readonly pendingTextInputs = signal<Record<string, string | string[]>>({});
  readonly pendingAuthorizationValues = signal<Record<string, string>>({});
  readonly savingAuthorizations = signal<Record<string, boolean>>({});
  readonly authorizationErrors = signal<Record<string, string>>({});
  readonly outputPreviewModal = signal<ExecutionOutputEntry | null>(null);
  readonly executionLogs = signal<ExecutionEventLogEntry[]>([]);
  readonly logsLoading = signal(false);
  readonly logsError = signal<string | null>(null);
  @ViewChild('logsScrollViewport') private logsScrollViewport?: ElementRef<HTMLDivElement>;

  constructor() {
    effect(() => {
      const executionId = this.execution()?.id ?? null;
      if (executionId === this.lastExecutionId) return;
      this.lastExecutionId = executionId;
      this.lastExecutionStatus = String(this.execution()?.context.status ?? '').toUpperCase() || null;
      this.pendingAuthorizationValues.set({});
      this.savingAuthorizations.set({});
      this.authorizationErrors.set({});
      this.activeAsideTab.set('inputs');
      this.outputPreviewModal.set(null);
      this.executionLogs.set([]);
      this.logsError.set(null);
      this.logsLoading.set(false);
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
      const nextIsRunning = String(step?.status ?? '').toUpperCase() === 'RUNNING';
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

  readonly authorizationRequirements = computed<TaskExecutionAuthorizationRequirement[]>(() => {
    const execution = this.execution();
    if (!execution?.requiredAuthorizations) return [];

    const required = execution.requiredAuthorizations;
    const entries = Array.isArray(required) ? required : Object.values(required);
    return entries
      .filter((entry): entry is TaskExecutionAuthorizationRequirement => !!entry && typeof entry.key === 'string')
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.key.localeCompare(b.key));
  });

  readonly missingAuthorizationRequirements = computed<TaskExecutionAuthorizationRequirement[]>(() => {
    const missingKeys = new Set(this.execution()?.missingAuthorizationKeys ?? []);
    return this.authorizationRequirements().filter((requirement) => missingKeys.has(requirement.key));
  });

  readonly executionFlowData = computed<FlowData>(() => {
    const executionStatusGroup = getExecutionStatusGroup(this.execution()?.context.status);
    const contextInputs = this.execution()?.context.inputs ?? {};
    const contextResults = this.execution()?.context.result ?? {};
    const contextErrors = this.execution()?.context.errors ?? {};
    const contextWarnings = this.execution()?.context.warnings ?? {};
    const waitingSteps = this.execution()?.context.waitingSteps ?? [];
    const steps = this.stepsArray();
    const blocks: FlowBlock[] = [];
    const containers: FlowContainer[] = [];

    for (const [index, step] of steps.entries()) {
      const stepNode = getTaskExecutionStepNode(step);
      if (!stepNode) continue;

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
          __executionStatusGroup: executionStatusGroup,
          __isWaitingStep: waitingSteps.includes(step.id),
          __executionInputs: this.getExecutionInputValues(step, contextInputs),
          __connectedInputs: this.getConnectedInputs(step),
          __executionOutputs: this.getExecutionOutputValues(step, contextResults),
          __connectedOutputs: this.getConnectedOutputs(step),
          __hasDependencyInputConnection: this.hasIncomingDependency(step.id),
          __hasDependantOutputConnection: this.hasOutgoingDependency(step.id),
          __executionErrors: this.getExecutionErrors(step.id, contextErrors),
          __executionWarnings: this.getExecutionWarnings(step.id, contextWarnings),
          __stepResultData: step.result ?? null,
          __executionPartialResult: this.execution()?.context.partialResult ?? null
        },
        position: stepNode.position ?? {
          x: 120 + (index % 3) * 340,
          y: 100 + Math.floor(index / 3) * 220
        }
      };

      if (executionNode.nodeFamily === 'container') {
        containers.push(executionNode);
      } else {
        blocks.push(executionNode);
      }
    }

    const connections = this.getExecutionConnections(steps);
    const dependencies = this.getExecutionDependencies();
    return {
      blocks,
      containers,
      connections,
      dependencies,
      globalInputs: []
    };
  });

  readonly formattedDuration = computed(() => {
    const context = this.execution()?.context;
    if (!context?.startTime || !context?.endTime) return '-';
    return this.formatDuration(context.startTime, context.endTime);
  });

  readonly executionOutputTabEnabled = computed(() => {
    const status = String(this.execution()?.context.status ?? '').toUpperCase();
    return status === 'SUCCESS' || status === 'COMPLETED';
  });

  readonly executionOutputs = computed<ExecutionOutputEntry[]>(() => {
    const steps = this.execution()?.context.steps ?? {};
    const resultMap = this.execution()?.context.result ?? {};

    return Object.entries(resultMap)
      .flatMap(([key, rawValue]) => {
        const label = this.formatExecutionOutputLabel(key, steps);
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];

        return values.map((item, index) => {
          const value = this.stringifyOutputValue(item);
          const isLong = value.length > TaskExecutionViewerComponent.OUTPUT_PREVIEW_LIMIT;
          const isArrayItem = Array.isArray(rawValue);
          return {
            key: isArrayItem ? `${key}:${index}` : key,
            nodeTitle: label.nodeTitle,
            outputName: label.outputName,
            value,
            preview: isLong ? `${value.slice(0, TaskExecutionViewerComponent.OUTPUT_PREVIEW_LIMIT)}...` : value,
            isLong,
            itemLabel: isArrayItem ? `Item ${index + 1}` : null
          };
        });
      })
      .sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle) || a.outputName.localeCompare(b.outputName));
  });

  readonly executionOutputGroups = computed<ExecutionOutputGroup[]>(() => {
    const groups = new Map<string, ExecutionOutputEntry[]>();

    for (const output of this.executionOutputs()) {
      if (!groups.has(output.nodeTitle)) {
        groups.set(output.nodeTitle, []);
      }
      groups.get(output.nodeTitle)!.push(output);
    }

    return Array.from(groups.entries())
      .map(([nodeTitle, outputs]) => ({
        nodeTitle,
        outputs
      }))
      .sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle));
  });

  readonly inputsReadOnly = computed(() => {
    const status = this.execution()?.context.status;
    return getExecutionStatusGroup(status) !== 'INIT';
  });

  readonly visibleExecutionLogs = computed<ExecutionLogEntryView[]>(() =>
    [...this.executionLogs()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => ({
        ...entry,
        messageText: String(entry.message ?? '').trim() || this.fallbackExecutionLogMessage(entry),
        levelText: String(entry.level ?? 'INFO').toUpperCase()
      }))
  );

  readonly canCancelExecution = computed(() => {
    const status = String(this.execution()?.context.status ?? '').toUpperCase();
    return !this.cancelInProgress() && (status === 'RUNNING' || status === 'WAITING');
  });

  readonly canResumeExecution = computed(() => {
    const status = String(this.execution()?.context.status ?? '').toUpperCase();
    return !this.resumeInProgress() && status === 'SUSPENDED';
  });

  readonly canStartExecution = computed(() => {
    const execution = this.execution();
    if (!execution) return false;
    if ((execution.missingAuthorizationKeys?.length ?? 0) > 0) return false;

    const statusGroup = getExecutionStatusGroup(execution.context.status);
    if (statusGroup !== 'INIT') return false;

    const status = String(execution.context.status ?? '').toUpperCase();
    if (status !== 'CREATED' && status !== 'READY') return false;

    const globalInputs = execution.context.globalInputs ?? {};
    const globalInputDescriptors = execution.context.globalInputDescriptors ?? {};
    for (const [descriptorKey, descriptor] of Object.entries(globalInputDescriptors)) {
      const inputName = String(descriptor?.name ?? descriptorKey).trim();
      if (!inputName) return false;

      const value = Object.prototype.hasOwnProperty.call(globalInputs, inputName)
        ? globalInputs[inputName]
        : descriptor?.value;
      if (!this.isInputSet(value, Boolean(descriptor?.multiple))) return false;
    }

    for (const step of Object.values(execution.context.steps ?? {})) {
      for (const input of step.inputs ?? []) {
        if (input.registered) continue;

        const inputName = input.descriptor?.name;
        if (!inputName) continue;

        const key = `${step.id}:${inputName}`;
        const value = Object.prototype.hasOwnProperty.call(execution.context.inputs ?? {}, key)
          ? execution.context.inputs[key]
          : input.value;

        if (!this.isInputSet(value, Boolean(input.descriptor?.multiple))) return false;
      }
    }

    return true;
  });

  readonly canSimulateExecution = computed(() => {
    return this.execution()?.simulationAvailable === true && this.canStartExecution() && !this.simulateInProgress();
  });

  readonly isSimulatedExecution = computed(() => this.execution()?.interactionSimulationEnabled === true);
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
        value: pendingValue ?? this.normalizeEditableInputValue(rawValue, Boolean(descriptor?.multiple))
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
          title: this.stepTitle(step),
          subtitle: inputName,
          type: String(input.descriptor?.type ?? 'TEXT').toUpperCase(),
          multiple: Boolean(input.descriptor?.multiple),
          value: pendingValue ?? this.normalizeEditableInputValue(rawValue, Boolean(input.descriptor?.multiple))
        });
      }
    }

    return entries.sort((a, b) => a.title.localeCompare(b.title) || a.subtitle.localeCompare(b.subtitle));
  });

  toggleContextAside() {
    this.contextAsideOpen.update((open) => !open);
  }

  selectAsideTab(tab: 'inputs' | 'logs' | 'output') {
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

  startExecution() {
    const executionId = this.execution()?.id;
    if (!executionId || !this.canStartExecution() || this.startInProgress()) return;

    this.startInProgress.set(true);
    this.taskExecutionsService.startExecution(executionId).subscribe({
      next: () => this.startInProgress.set(false),
      error: () => this.startInProgress.set(false)
    });
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
    const executionId = this.execution()?.id;
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

  onTextInputChange(input: EditableExecutionInput, value: string | string[]) {
    if (this.inputsReadOnly()) return;
    this.pendingTextInputs.update((current) => ({ ...current, [input.key]: value }));
    this.savingErrors.update((current) => {
      const next = { ...current };
      delete next[input.key];
      return next;
    });
  }

  submitTextInput(input: EditableExecutionInput) {
    if (this.inputsReadOnly()) return;
    const executionId = this.execution()?.id;
    if (!executionId) return;
    this.sendPreparedTextInput(input, executionId);
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
    this.taskExecutionsService.provideAuthorization(executionId, requirement.key, value).subscribe({
      next: () => {
        this.pendingAuthorizationValues.update((current) => {
          const next = { ...current };
          delete next[requirement.key];
          return next;
        });
        this.clearAuthorizationSaving(requirement.key);
      },
      error: () => this.setAuthorizationError(requirement.key, 'Failed to save authorization')
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

  private sendPreparedTextInput(input: EditableExecutionInput, executionId: string) {
    if (this.inputsReadOnly() || this.execution()?.id !== executionId) return;

    const value = this.pendingTextInputs()[input.key] ?? this.normalizeEditableInputValue(input.value, input.multiple);
    this.setInputSaving(input.key, true);
    const normalizedValues = (Array.isArray(value) ? value : [String(value)])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const request$ = input.scope === 'global'
      ? (
        input.multiple
          ? this.taskExecutionsService.prepareGlobalStringArrayInput(
            executionId,
            input.inputName,
            normalizedValues
          )
          : this.taskExecutionsService.prepareGlobalStringInput(
            executionId,
            input.inputName,
            String(Array.isArray(value) ? value[0] ?? '' : value)
          )
      )
      : (
        input.multiple
          ? this.taskExecutionsService.prepareStringArrayInput(
            executionId,
            input.nodeId!,
            input.inputName,
            normalizedValues
          )
          : this.taskExecutionsService.prepareStringInput(
            executionId,
            input.nodeId!,
            input.inputName,
            String(Array.isArray(value) ? value[0] ?? '' : value)
          )
      );

    request$.subscribe({
      next: () => {
        this.pendingTextInputs.update((current) => {
          const next = { ...current };
          delete next[input.key];
          return next;
        });
        this.clearInputSaving(input.key);
      },
      error: () => this.setInputError(input.key, 'Failed to update input')
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
    const element = this.logsScrollViewport?.nativeElement;
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

  private stringifyOutputValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private fallbackExecutionLogMessage(entry: ExecutionEventLogEntry): string {
    const type = String(entry.type ?? '').trim();
    if (type) {
      return type.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
    }
    return 'Execution event';
  }

  logLevelClass(level: string | null | undefined): string {
    const normalized = String(level ?? '').toUpperCase();
    if (normalized === 'ERROR') return 'execution-log-level-error';
    if (normalized === 'WARN' || normalized === 'WARNING') return 'execution-log-level-warn';
    return 'execution-log-level-info';
  }

  logTypeIcon(type: string | null | undefined): string {
    const normalized = String(type ?? '').toUpperCase();
    if (normalized.includes('FAILED') || normalized.includes('ERROR')) return 'error';
    if (normalized.includes('WAITING') || normalized.includes('PAUSED')) return 'pause_circle';
    if (normalized.includes('COMPLETED') || normalized.includes('SUCCESS')) return 'check_circle';
    if (normalized.includes('HTTP')) return 'language';
    if (normalized.includes('LLM')) return 'smart_toy';
    if (normalized.includes('MCP_SESSION')) return 'hub';
    return 'schedule';
  }

  private formatExecutionOutputLabel(
    key: string,
    steps: Record<string, TaskExecutionStep>
  ): { nodeTitle: string; outputName: string } {
    const separatorIndex = key.indexOf(':');
    if (separatorIndex < 0) {
      return { nodeTitle: 'Execution output', outputName: key };
    }

    const nodeId = key.slice(0, separatorIndex);
    const outputName = key.slice(separatorIndex + 1);
    const step = steps[nodeId];
    const nodeName = this.stepTitle(step).trim();

    return {
      nodeTitle: nodeName || key,
      outputName: outputName || 'Execution output'
    };
  }

  private formatDuration(startTime: number, endTime: number): string {
    const diffMs = Math.max(0, endTime - startTime);
    const totalSeconds = Math.floor(diffMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    if (totalSeconds < 60) {
      return `${totalSeconds} sec`;
    }

    if (totalMinutes < 60) {
      const seconds = totalSeconds % 60;
      return seconds > 0 ? `${totalMinutes} min ${seconds} sec` : `${totalMinutes} min`;
    }

    if (totalHours < 24) {
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${totalHours} h ${minutes} min` : `${totalHours} h`;
    }

    const hours = totalHours % 24;
    return hours > 0 ? `${totalDays} gg ${hours} h` : `${totalDays} gg`;
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
          sourceId: this.stepNodeId(source.sourceStep),
          sourceName: source.sourceOutputName,
          targetId: this.stepNodeId(targetStep),
          targetName: input.descriptor.name
        });
      }
    }

    return connections;
  }

  private getExecutionConnections(steps: TaskExecutionStep[]): FlowBlockConnection[] {
    const explicitConnections = this.execution()?.stepConnections;
    if (explicitConnections?.length) {
      return explicitConnections.map((connection) => ({
        id: String(connection.id),
        sourceId: String(connection.sourceId),
        sourceName: String(connection.sourceName),
        targetId: String(connection.targetId),
        targetName: String(connection.targetName)
      }));
    }

    return this.inferConnections(steps);
  }

  private getExecutionDependencies(): FlowNodeDependency[] {
    return (this.execution()?.stepDependencies ?? []).map((dependency) => ({
      sourceId: String(dependency.sourceId),
      targetId: String(dependency.targetId)
    }));
  }

  private hasIncomingDependency(stepId: string): boolean {
    return (this.execution()?.stepDependencies ?? []).some((dependency) => String(dependency.targetId) === stepId);
  }

  private hasOutgoingDependency(stepId: string): boolean {
    return (this.execution()?.stepDependencies ?? []).some((dependency) => String(dependency.sourceId) === stepId);
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

  private getExecutionInputValues(
    step: TaskExecutionStep,
    contextInputs: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const input of step.inputs ?? []) {
      const inputName = input.descriptor?.name;
      if (!inputName) continue;

      const key = `${step.id}:${inputName}`;
      if (Object.prototype.hasOwnProperty.call(contextInputs, key)) {
        result[inputName] = contextInputs[key];
        continue;
      }

      if (input.set || input.registered || input.value != null) {
        result[inputName] = input.value;
      }
    }

    return result;
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

  private getConnectedInputs(step: TaskExecutionStep): string[] {
    return (step.inputs ?? [])
      .filter((input) => input.registered)
      .map((input) => input.descriptor?.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  }

  private getExecutionOutputValues(
    step: TaskExecutionStep,
    contextResults: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const output of step.outputs ?? []) {
      const outputName = output.descriptor?.name;
      if (!outputName) continue;

      const key = `${step.id}:${outputName}`;
      if (Object.prototype.hasOwnProperty.call(contextResults, key)) {
        result[outputName] = contextResults[key];
      }
    }

    return result;
  }

  private getConnectedOutputs(step: TaskExecutionStep): string[] {
    return (step.outputs ?? [])
      .filter((output) => output.connected)
      .map((output) => output.descriptor?.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  }

  private getExecutionErrors(
    stepId: string,
    contextErrors: Record<string, unknown>
  ): string[] {
    const raw = contextErrors[stepId];
    if (typeof raw === 'string' && raw.trim().length > 0) return [raw];
    if (Array.isArray(raw)) {
      return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    }
    return [];
  }

  private getExecutionWarnings(
    stepId: string,
    contextWarnings: Record<string, string>
  ): string[] {
    const raw = contextWarnings[stepId];
    return raw && raw.trim().length > 0 ? [raw] : [];
  }

  private isInputSet(value: unknown, multiple = false): boolean {
    if (multiple) {
      if (!Array.isArray(value)) return false;
      return value.some((item) => typeof item === 'string' ? item.trim().length > 0 : item != null);
    }
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  private normalizeEditableInputValue(value: unknown, multiple: boolean): string | string[] {
    if (multiple) {
      if (Array.isArray(value)) {
        return value.map((item) => this.stringifyEditableInputItem(item));
      }
      if (value == null) {
        return [''];
      }
      return [this.stringifyEditableInputItem(value)];
    }

    if (value == null) return '';
    return this.stringifyEditableInputItem(value);
  }

  private stringifyEditableInputItem(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private stepTitle(step: TaskExecutionStep | null | undefined): string {
    return getTaskExecutionStepNode(step)?.name?.trim() || step?.id || 'Step';
  }

  private stepNodeId(step: TaskExecutionStep | null | undefined): string {
    return getTaskExecutionStepNode(step)?.id || step?.id || '';
  }
}
