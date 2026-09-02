import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, EventEmitter, inject, input, OnDestroy, OnInit, Output, signal, ViewChild } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  AssistantCallPhase,
  AssistantCallState,
  AssistantChatMessage,
  AssistantConfig,
  AssistantDraftPayload,
  AssistantFlowActionResult,
  AssistantLlmSelection,
  AssistantSessionMessageRequest,
  AssistantSessionState,
  VaultSecret
} from '@models/assistant';
import { Flow } from '@models/flow';
import { AssistantService } from '@services/assistant/assistant';
import { CREDENTIAL_ERROR_MESSAGES, VaultService } from '@services/vault/vault';
import { Authorization } from '@services/authorization/authorization';
import { AssistantSessionStore } from '@stores/assistant-session-store';
import { EditorStateHolder } from '@stores/flow-editor';
import { finalize, firstValueFrom, interval, Subscription, switchMap, take } from 'rxjs';

@Component({
  selector: 'app-flow-assistant',
  imports: [CommonModule, FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './flow-assistant.html',
  styleUrl: './flow-assistant.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowAssistant implements OnInit, OnDestroy {
  @Output() cancellableCallChange = new EventEmitter<boolean>();
  @ViewChild('assistantScroll') assistantScrollElement?: ElementRef<HTMLDivElement>;

  private readonly assistant = inject(AssistantService);
  private readonly vault = inject(VaultService);
  private readonly editorState = inject(EditorStateHolder);
  private readonly authorization = inject(Authorization);
  private readonly sessionStore = inject(AssistantSessionStore);
  private pollSubscription: Subscription | null = null;
  private initialized = false;
  private activeFlowKey: string | null = null;
  private lastAutoScrollKey = '';
  private lastCancellableCallState = false;
  private skipDestroySnapshot = false;
  private readonly createModalFlowKey = AssistantSessionStore.CREATE_MODAL_FLOW_KEY;
  private static readonly STANDARD_ASSISTANT_ERROR = 'Something went wrong while processing your workflow request. Please try again.';

  readonly assistantConfig = signal<AssistantConfig | null>(null);
  readonly variant = input<'aside' | 'create-modal'>('aside');
  readonly sessionState = signal<AssistantSessionState | null>(null);
  readonly currentCall = signal<AssistantCallState | null>(null);
  readonly localMessages = signal<AssistantChatMessage[]>([]);
  readonly models = signal<string[]>([]);
  readonly providers = signal<string[]>([]);
  readonly providersLoading = signal(false);
  readonly providersError = signal<string | null>(null);
  readonly modelsLoading = signal(false);
  readonly modelsError = signal<string | null>(null);
  readonly sessionLoading = signal(false);
  readonly requestPending = signal(false);
  readonly prompt = signal('');
  readonly createPromptSubmitted = signal(false);
  readonly selectedModel = signal('');
  readonly useDefaultConfiguration = signal(true);
  readonly selectedProvider = signal('');
  readonly phaseModels = signal<AssistantLlmSelection['phaseModels']>(undefined);
  readonly credentials = signal<VaultSecret[]>([]);
  readonly credentialsLoading = signal(false);
  readonly credentialsError = signal<string | null>(null);
  readonly selectedCredentialId = signal('');
  readonly credentialsPanelOpen = signal(false);
  readonly credentialFormOpen = signal(false);
  readonly credentialSaving = signal(false);
  readonly editingCredentialId = signal<string | null>(null);
  readonly credentialLabel = signal('');
  readonly credentialProvider = signal('');
  readonly credentialDescription = signal('');
  readonly credentialValue = signal('');
  readonly advancedModelsOpen = signal(false);
  readonly modelPickerOpen = signal(false);
  readonly quickPromptsOpen = signal(true);
  readonly assistantErrorMessage = signal<string | null>(null);
  readonly lastFailedPrompt = signal<string | null>(null);
  readonly lastSubmittedPrompt = signal('');
  readonly editorHasOpenFlow = computed(() => !!this.currentFlow());
  readonly editorHasNonEmptyFlow = computed(() => this.hasMeaningfulFlow(this.currentFlow()));
  readonly sessionHasDraft = computed(() => !!this.currentDraft());
  readonly canOfferCreate = computed(() => !this.editorHasNonEmptyFlow() && !this.sessionHasDraft());
  readonly canOfferFix = computed(() => !this.canOfferCreate() && (this.sessionState()?.lastValidationErrors?.length ?? 0) > 0);
  readonly isCreateModal = computed(() => this.variant() === 'create-modal');
  readonly createModalProgressOnly = computed(() =>
    this.isCreateModal() && this.createPromptSubmitted()
  );
  readonly refineProgressOnly = computed(() =>
    !this.isCreateModal() && !this.canOfferCreate() && this.assistantBusy()
  );
  readonly progressOnlyMode = computed(() =>
    this.createModalProgressOnly() || this.refineProgressOnly()
  );
  readonly canRetryLastPrompt = computed(() =>
    !this.assistantBusy() && !!this.lastFailedPrompt() && !!this.sessionState()?.id
  );
  readonly assistantModeLabel = computed(() => this.canOfferCreate() ? 'Create with assistant' : 'Refine with assistant');
  readonly assistantModeDescription = computed(() => {
    if (this.canOfferCreate()) {
      return 'No flow is open, so the assistant is in create mode and can draft a new workflow.';
    }
    if (this.canOfferFix()) {
      return 'A flow is already attached, so use the assistant to refine, fix, or explain it.';
    }
    return 'A flow is already open or attached to this session, so create mode is not offered here.';
  });
  readonly promptPlaceholder = computed(() =>
    this.canOfferCreate()
      ? 'Ask the assistant to create a new workflow'
      : 'Ask the assistant to refine, fix, or explain the current workflow'
  );
  readonly starterPrompts = computed(() => {
    if (this.canOfferCreate()) {
      return [
        'Create a flow that classifies incoming tickets and sends urgent ones to a human',
        'Create a flow that downloads a file, indexes it, and then queries it',
        'Create a recruiter workflow that reviews a CV and produces a final assessment'
      ];
    }

    const prompts = [
      'Modify the current flow to add a review step after the LLM block',
      'Explain this flow and describe what each branch does'
    ];

    if (this.canOfferFix()) {
      prompts.unshift('Fix the problems in this flow');
    }

    return prompts;
  });

  readonly displayedMessages = computed(() => {
    const baseMessages = this.sessionState()?.messages?.length
      ? this.sessionState()!.messages
      : [this.systemWelcomeMessage()];
    return [...baseMessages, ...this.localMessages()]
      .filter((message) => !this.isTechnicalAssistantFailureMessage(message));
  });
  readonly assistantBusy = computed(() => {
    const status = this.currentCall()?.status;
    return this.sessionLoading() || this.requestPending() || status === 'QUEUED' || status === 'RUNNING';
  });
  readonly activePhase = computed<AssistantCallPhase | null>(() => {
    const call = this.currentCall();
    return call ? call.phase : null;
  });
  readonly activePhaseLabel = computed(() => {
    const phase = this.activePhase();
    return phase ? this.phaseText(phase) : null;
  });
  readonly callProgressMessage = computed(() => this.currentCall()?.progressMessage ?? '');
  readonly busyHeadline = computed(() => {
    const phase = this.activePhase();
    if (this.requestPending()) {
      return 'Sending request...';
    }
    if (!phase) {
      if (this.sessionLoading()) return 'Preparing assistant session...';
      if (this.createModalProgressOnly()) return 'Finalizing flow...';
      return '';
    }
    return this.phaseText(phase);
  });
  readonly busyDetail = computed(() => {
    if (this.requestPending()) {
      return 'Preparing the assistant run.';
    }
    if (this.sessionLoading()) {
      return 'Loading assistant configuration, models, and chat session...';
    }
    if (this.createModalProgressOnly() && !this.currentCall()) {
      return 'The draft is almost ready.';
    }
    if (!this.currentCall()) return '';
    return this.callProgressMessage() || 'The backend may perform multiple internal steps before returning the updated conversation and flow.';
  });
  readonly progressSteps = [
    { phase: 'queued', label: 'Queued...' },
    { phase: 'routing', label: 'Routing your request...' },
    { phase: 'planning', label: 'Planning workflow blocks...' },
    { phase: 'configuring_blocks', label: 'Configuring blocks...' },
    { phase: 'connecting_blocks', label: 'Connecting blocks...' },
    { phase: 'validating', label: 'Validating flow...' },
    { phase: 'fixing', label: 'Repairing invalid flow...' },
    { phase: 'explaining', label: 'Explaining current flow...' }
  ] as const;
  readonly activeProgressIndex = computed(() => {
    const phase = this.activePhase();
    if (!phase) return -1;
    return this.progressSteps.findIndex((step) => step.phase === phase);
  });
  readonly currentFlow = this.editorState.currentFlow;
  readonly currentDraft = computed(() => this.sessionState()?.currentDraftFlow ?? null);
  readonly configurationLocked = computed(() => !!this.sessionState()?.id);
  readonly providerNeedsCredential = computed(() =>
    !!this.selectedProvider().trim() && !this.isInternalProvider(this.selectedProvider())
  );
  readonly compatibleCredentials = computed(() => {
    const provider = this.selectedProvider().trim().toLowerCase();
    if (!provider) return [];
    return this.credentials().filter((credential) =>
      credential.active && credential.provider.trim().toLowerCase() === provider
    );
  });
  readonly customConfigurationValid = computed(() =>
    !!this.selectedProvider().trim()
      && !!this.selectedModel().trim()
      && (!this.providerNeedsCredential() || this.compatibleCredentials().some(
        (credential) => credential.id === this.selectedCredentialId()
      ))
  );
  readonly configurationValid = computed(() =>
    this.useDefaultConfiguration() || this.customConfigurationValid()
  );

  constructor() {
    effect(() => {
      const messages = this.displayedMessages();
      const lastMessageId = messages[messages.length - 1]?.id ?? '';
      const busy = this.assistantBusy();
      const nextKey = `${messages.length}:${lastMessageId}:${busy ? '1' : '0'}`;
      if (nextKey === this.lastAutoScrollKey) return;
      this.lastAutoScrollKey = nextKey;
      this.scheduleScrollToLatestMessage();
    });

    effect(() => {
      if (this.isCreateModal()) return;
      const flowKey = this.resolveFlowKey(this.currentFlow()?.id ?? null);
      if (!this.initialized || this.activeFlowKey === flowKey) return;

      const previousFlowKey = this.activeFlowKey;
      if (previousFlowKey) {
        this.persistSnapshot(previousFlowKey);
      }

      this.activeFlowKey = flowKey;
      void this.restoreSessionForFlow(flowKey);
    });

    effect(() => {
      const nextState = this.hasCancellableCall();
      if (this.lastCancellableCallState === nextState) return;
      this.lastCancellableCallState = nextState;
      this.cancellableCallChange.emit(nextState);
    });
  }

  ngOnInit(): void {
    this.bootstrapAssistant();
  }

  ngOnDestroy(): void {
    if (this.activeFlowKey && !this.skipDestroySnapshot) {
      this.persistSnapshot(this.activeFlowKey);
    }
    this.stopPolling();
  }

  selectModel(model: string) {
    if (this.configurationLocked()) return;
    this.selectedModel.set(model);
    this.persistSnapshot();
  }

  setUseDefaultConfiguration(useDefault: boolean) {
    if (this.configurationLocked()) return;
    this.useDefaultConfiguration.set(useDefault);
    this.modelsError.set(null);
    if (!useDefault) {
      void this.loadProviders();
    }
    this.persistSnapshot();
  }

  selectProvider(provider: string) {
    if (this.configurationLocked()) return;
    this.selectedProvider.set(provider);
    this.selectedModel.set('');
    this.selectedCredentialId.set('');
    this.models.set([]);
    this.modelsError.set(null);
    if (provider) void this.loadModels(provider);
    if (provider) void this.loadCredentials();
    this.persistSnapshot();
  }

  selectCredential(credentialId: string) {
    if (this.configurationLocked()) return;
    this.selectedCredentialId.set(credentialId);
  }

  toggleCredentialsPanel() {
    this.credentialsPanelOpen.update((open) => !open);
    if (this.credentialsPanelOpen()) {
      void this.loadCredentials();
      void this.loadProviders();
    }
  }

  openCredentialForm(provider = this.selectedProvider()) {
    if (this.configurationLocked()) return;
    this.editingCredentialId.set(null);
    this.credentialLabel.set('');
    this.credentialProvider.set(provider);
    this.credentialDescription.set('');
    this.credentialValue.set('');
    this.credentialsError.set(null);
    this.credentialsPanelOpen.set(true);
    this.credentialFormOpen.set(true);
  }

  editCredential(credential: VaultSecret) {
    this.editingCredentialId.set(credential.id);
    this.credentialLabel.set(credential.label);
    this.credentialProvider.set(credential.provider);
    this.credentialDescription.set(credential.description ?? '');
    this.credentialValue.set('');
    this.credentialsError.set(null);
    this.credentialsPanelOpen.set(true);
    this.credentialFormOpen.set(true);
  }

  saveCredential() {
    const label = this.credentialLabel().trim();
    const provider = this.credentialProvider().trim();
    const description = this.credentialDescription().trim();
    const value = this.credentialValue();
    const editingId = this.editingCredentialId();
    if (!label || !provider || (!editingId && !value.trim()) || this.credentialSaving()) return;

    this.credentialSaving.set(true);
    this.credentialsError.set(null);
    const request = editingId
      ? this.vault.updateSecret(editingId, {
        label,
        description: description || undefined,
        ...(value.trim() ? { value } : {})
      })
      : this.vault.createSecret({ label, provider, description: description || undefined, value });

    request.pipe(finalize(() => {
      this.credentialSaving.set(false);
      this.credentialValue.set('');
    })).subscribe({
      next: (credential) => {
        this.credentialFormOpen.set(false);
        this.editingCredentialId.set(null);
        if (credential.active && this.sameProvider(credential.provider, this.selectedProvider())) {
          this.selectedCredentialId.set(credential.id);
        }
        void this.loadCredentials();
      },
      error: (err) => this.credentialsError.set(this.backendErrorMessage(err))
    });
  }

  setCredentialActive(credential: VaultSecret, active: boolean) {
    if (this.credentialSaving()) return;
    this.credentialSaving.set(true);
    this.credentialsError.set(null);
    this.vault.updateSecret(credential.id, { active }).pipe(
      finalize(() => this.credentialSaving.set(false))
    ).subscribe({
      next: () => {
        if (!active && this.selectedCredentialId() === credential.id) this.selectedCredentialId.set('');
        void this.loadCredentials();
      },
      error: (err) => this.credentialsError.set(this.backendErrorMessage(err))
    });
  }

  setPhaseModel(phase: keyof NonNullable<AssistantLlmSelection['phaseModels']>, model: string) {
    if (this.configurationLocked()) return;
    this.phaseModels.update((current) => ({ ...current, [phase]: model || undefined }));
    this.persistSnapshot();
  }

  toggleAdvancedModels() {
    this.advancedModelsOpen.update((value) => !value);
    this.persistSnapshot();
  }

  useStarter(prompt: string) {
    this.prompt.set(prompt);
    this.persistSnapshot();
  }

  toggleQuickPrompts() {
    this.quickPromptsOpen.update((value) => !value);
    this.persistSnapshot();
  }

  toggleModelPicker() {
    this.modelPickerOpen.update((value) => !value);
    this.persistSnapshot();
  }

  submitPrompt() {
    const content = this.prompt().trim();
    this.sendPrompt(content);
  }

  retryLastPrompt() {
    const failedPrompt = this.lastFailedPrompt()?.trim() ?? '';
    if (!failedPrompt) return;
    this.sendPrompt(failedPrompt);
  }

  canRetryFromMessage(message: AssistantChatMessage): boolean {
    return message.role === 'assistant'
      && this.canRetryLastPrompt()
      && this.canonicalAssistantErrorContent(message.content)
      === this.canonicalAssistantErrorContent(FlowAssistant.STANDARD_ASSISTANT_ERROR);
  }

  hasCancellableCall(): boolean {
    return this.isActiveCall(this.currentCall());
  }

  async cancelActiveCall(): Promise<boolean> {
    const call = this.currentCall();
    if (!this.isActiveCall(call)) {
      this.requestPending.set(false);
      this.createPromptSubmitted.set(false);
      return true;
    }

    this.stopPolling();
    this.requestPending.set(false);

    try {
      const cancelledCall = await firstValueFrom(this.assistant.cancelCall(call.id).pipe(take(1)));
      this.currentCall.set(cancelledCall);
      this.createPromptSubmitted.set(false);
      this.persistSnapshot();

      const session = await firstValueFrom(this.assistant.getSession(cancelledCall.sessionId || call.sessionId).pipe(take(1)));
      this.applySessionState(session, { syncDraftToEditor: false });
      this.currentCall.set(null);
      this.persistSnapshot();
      return true;
    } catch (err) {
      console.error('Assistant call cancel failed', err);
      this.currentCall.set(call);
      this.beginPolling(call.id);
      this.assistantErrorMessage.set('Unable to cancel the assistant request.');
      this.persistSnapshot();
      return false;
    }
  }

  clearActiveSnapshot() {
    const flowKey = this.activeFlowKey ?? this.resolveFlowKey(this.currentFlow()?.id ?? null);
    this.clearSnapshot(flowKey);
  }

  private sendPrompt(content: string) {
    const normalizedContent = content.trim();
    if (!normalizedContent || this.assistantBusy() || !this.configurationValid()) return;

    if (!this.sessionState()?.id) {
      void this.openSession(normalizedContent);
      return;
    }

    this.submitAssistantMessage(normalizedContent);
  }

  private submitAssistantMessage(normalizedContent: string) {
    const sessionId = this.sessionState()?.id;
    if (!sessionId) return;

    if (this.isCreateModal()) this.createPromptSubmitted.set(true);
    this.requestPending.set(true);
    this.assistantErrorMessage.set(null);
    this.lastSubmittedPrompt.set(normalizedContent);
    this.prompt.set('');
    this.localMessages.set([
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: normalizedContent
      }
    ]);
    this.persistSnapshot();

    const flow = this.assistantFlowForRequest();
    const request: AssistantSessionMessageRequest = {
      message: normalizedContent,
      ...(flow ? { flow } : {})
    };

    this.assistant.submitMessage(sessionId, request).pipe(take(1)).subscribe({
      next: (accepted) => {
        this.requestPending.set(false);
        this.beginPolling(accepted.callId);
      },
      error: (err) => {
        console.error('Assistant message submission failed', err);
        this.requestPending.set(false);
        this.discardFailedSession();
        this.handleAssistantErrorWithRetry(normalizedContent, this.backendErrorMessage(err));
      }
    });
  }

  private beginPolling(callId: string) {
    this.stopPolling();
    this.pollSubscription = interval(1000).pipe(
      switchMap(() => this.assistant.getCall(callId))
    ).subscribe({
      next: (call) => {
        this.currentCall.set(call);
        this.persistSnapshot();

        if (call.status === 'COMPLETED') {
          this.stopPolling();
          this.applyFlowActionResult(call.actionResult ?? {
            flow: null,
            validationErrors: [],
            warnings: [],
            message: 'The assistant completed the request.'
          });
          this.createPromptSubmitted.set(false);
          this.persistSnapshot();
          return;
        }

        if (call.status === 'FAILED') {
          this.stopPolling();
          this.discardFailedSession();
          this.handleAssistantErrorWithRetry(this.lastSubmittedPrompt(), call.errorMessage || undefined);
          return;
        }

        if (call.status === 'CANCELLED') {
          this.stopPolling();
          this.createPromptSubmitted.set(false);
        }
      },
      error: (err) => {
        console.error('Assistant call polling failed', err);
        this.stopPolling();
        this.discardFailedSession();
        this.handleAssistantErrorWithRetry(this.lastSubmittedPrompt(), this.backendErrorMessage(err));
      }
    });
  }

  private bootstrapAssistant() {
    this.sessionLoading.set(true);
    this.modelsError.set(null);
    this.assistant.getConfig().pipe(
      take(1)
    ).subscribe({
      next: (config) => {
        this.assistantConfig.set(config);
        this.initializeConfiguration(config);
        void this.loadCredentials();
      },
      error: (err) => {
        console.error('Assistant config loading failed', err);
        this.sessionLoading.set(false);
        this.modelsError.set('Unable to load assistant configuration.');
      }
    });
  }

  private initializeConfiguration(_config: AssistantConfig) {
    this.activeFlowKey = this.isCreateModal()
      ? this.createModalFlowKey
      : this.resolveFlowKey(this.currentFlow()?.id ?? null);
    this.initialized = true;
    void this.restoreSessionForFlow(this.activeFlowKey);
  }

  private loadProviders() {
    const config = this.assistantConfig();
    if (!config?.availableProvidersRetrieverUrl) return;
    this.providersLoading.set(true);
    this.providersError.set(null);
    this.assistant.listProviders(config.availableProvidersRetrieverUrl).pipe(
      take(1),
      finalize(() => this.providersLoading.set(false))
    ).subscribe({
      next: (providers) => this.providers.set(providers),
      error: (err) => this.providersError.set(this.backendErrorMessage(err))
    });
  }

  private loadModels(provider: string) {
    const config = this.assistantConfig();
    if (!config?.availableModelsRetrieverUrl) return;
    this.modelsLoading.set(true);
    this.modelsError.set(null);
    this.assistant.listModels(config.availableModelsRetrieverUrl, provider).pipe(
      take(1),
      finalize(() => this.modelsLoading.set(false))
    ).subscribe({
      next: (models) => {
        this.models.set(models);
        if (!models.length) this.modelsError.set('No models are available for the selected provider.');
      },
      error: (err) => this.modelsError.set(this.backendErrorMessage(err))
    });
  }

  private loadCredentials() {
    this.credentialsLoading.set(true);
    this.credentialsError.set(null);
    this.vault.listSecrets().pipe(
      take(1),
      finalize(() => this.credentialsLoading.set(false))
    ).subscribe({
      next: (credentials) => {
        this.credentials.set(credentials);
        const selectedId = this.selectedCredentialId();
        if (selectedId && !credentials.some((credential) => credential.id === selectedId && credential.active)) {
          this.selectedCredentialId.set('');
        }
      },
      error: (err) => this.credentialsError.set(this.backendErrorMessage(err))
    });
  }

  private llmSelection(): AssistantLlmSelection | undefined {
    if (this.useDefaultConfiguration()) return undefined;
    const provider = this.selectedProvider().trim();
    const model = this.selectedModel().trim();
    if (!provider || !model) return undefined;
    const phaseModels = this.phaseModels();
    const populatedPhases = phaseModels && Object.values(phaseModels).some(Boolean)
      ? phaseModels
      : undefined;
    const credentialId = this.selectedCredentialId();
    return {
      provider,
      model,
      ...(this.providerNeedsCredential() && credentialId ? { credentialId } : {}),
      ...(populatedPhases ? { phaseModels: populatedPhases } : {})
    };
  }

  private sessionRequest() {
    const llmSelection = this.llmSelection();
    return llmSelection ? { llmSelection } : {};
  }

  private assistantFlowForRequest(): AssistantDraftPayload | undefined {
    const draft = this.currentDraft();
    if (draft) return draft;
    const flow = this.currentFlow();
    if (!flow) return undefined;
    return { name: flow.name, description: flow.description, flow: flow.data };
  }

  private applyFlowActionResult(result: AssistantFlowActionResult) {
    const message: AssistantChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: result.message,
      warnings: result.warnings,
      validationErrors: result.validationErrors
    };
    this.localMessages.update((messages) => [...messages, message]);

    if (!result.flow) return;
    const session = this.sessionState();
    if (session) {
      this.sessionState.set({
        ...session,
        currentFlow: result.flow,
        currentDraftFlow: result.flow,
        lastValidationErrors: result.validationErrors
      });
    }
    this.syncDraftToEditor(result.flow);
  }

  private discardFailedSession() {
    this.stopPolling();
    this.currentCall.set(null);
    this.sessionState.set(null);
  }

  private backendErrorMessage(error: unknown): string {
    const value = error as { error?: unknown; message?: unknown; status?: unknown };
    const payload = value?.error;
    if (typeof payload === 'string' && payload.trim()) return payload;
    if (payload && typeof payload === 'object') {
      const body = payload as Record<string, unknown>;
      for (const key of ['message', 'error', 'detail', 'title']) {
        if (typeof body[key] === 'string' && body[key].trim()) return body[key] as string;
      }
    }
    const statusMessage = CREDENTIAL_ERROR_MESSAGES[Number(value?.status)];
    if (statusMessage) return statusMessage;
    if (typeof value?.message === 'string' && value.message.trim()) return value.message;
    return FlowAssistant.STANDARD_ASSISTANT_ERROR;
  }

  private isInternalProvider(provider: string): boolean {
    return provider.trim().toLowerCase() === 'internalollama';
  }

  private sameProvider(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }

  private async openSession(
    promptToSend?: string,
    flowKey = this.activeFlowKey ?? this.resolveFlowKey(this.currentFlow()?.id ?? null)
  ) {
    this.stopPolling();
    this.currentCall.set(null);
    this.localMessages.set([]);
    this.sessionLoading.set(true);

    this.assistant.createSession(this.sessionRequest()).pipe(
      take(1),
      finalize(() => this.sessionLoading.set(false))
    ).subscribe({
      next: (session) => {
        this.applySessionState(session);
        this.persistSnapshot(flowKey);
        if (promptToSend) this.submitAssistantMessage(promptToSend);
      },
      error: (err) => {
        console.error('Assistant session creation failed', err);
        const message = this.backendErrorMessage(err);
        this.assistantErrorMessage.set(message);
        this.pushLocalAssistantMessage(message);
      }
    });
  }

  private handleAssistantErrorWithRetry(
    promptForRetry: string,
    message = FlowAssistant.STANDARD_ASSISTANT_ERROR
  ) {
    const normalizedPrompt = String(promptForRetry ?? '').trim();
    this.createPromptSubmitted.set(false);
    this.assistantErrorMessage.set(message);
    this.lastFailedPrompt.set(normalizedPrompt || null);
    this.pushLocalAssistantMessage(message);
    this.persistSnapshot();
  }

  private applySessionState(session: AssistantSessionState, options?: { clearLocalMessages?: boolean; syncDraftToEditor?: boolean }) {
    const normalizedSession = session.messages.length
      ? session
      : {
        ...session,
        messages: [this.systemWelcomeMessage()]
      };

    this.sessionState.set(normalizedSession);
    this.selectedModel.set(normalizedSession.selectedModel || this.selectedModel());
    if (options?.clearLocalMessages !== false) {
      this.localMessages.set([]);
    }
    if (options?.syncDraftToEditor !== false) {
      this.syncDraftToEditor(normalizedSession.currentFlow ?? normalizedSession.currentDraftFlow);
    }
    this.persistSnapshot();
  }

  private syncDraftToEditor(draft: AssistantDraftPayload | null) {
    if (!draft) return;

    const currentFlow = this.currentFlow();
    const nextFlow = this.toEditorFlow(draft, currentFlow);

    if (currentFlow?.id) {
      this.editorState.loadAssistantFlow(nextFlow, { markDirty: true });
      return;
    }

    const currentFlowKey = this.activeFlowKey ?? this.resolveFlowKey(currentFlow?.id ?? null);
    const nextFlowKey = this.resolveFlowKey(nextFlow.id);
    this.persistSnapshot(currentFlowKey);
    this.sessionStore.cloneSnapshot(currentFlowKey, nextFlowKey);
    const shouldClearCreateModalSnapshot = currentFlowKey === this.createModalFlowKey;

    void this.editorState.openDocument(nextFlow, { skipDirtyCheck: false }).then((opened) => {
      if (!opened) {
        this.pushLocalAssistantMessage('The draft is ready, but I did not load it because the current flow has unsaved changes.');
        return;
      }
      this.editorState.loadAssistantFlow(nextFlow, { markDirty: true });
      if (shouldClearCreateModalSnapshot) {
        this.clearSnapshot(currentFlowKey);
      }
    });
  }

  private toEditorFlow(draft: AssistantDraftPayload, currentFlow: Flow | null): Flow {
    const nextId = currentFlow?.id ?? `${EditorStateHolder.ASSISTANT_DRAFT_PREFIX}${crypto.randomUUID()}`;

    return {
      id: nextId,
      name: draft.name,
      description: draft.description,
      data: draft.flow,
      status: 'DRAFT',
      visibility: currentFlow?.visibility ?? 'PRIVATE',
      author: currentFlow?.author ?? this.authorization.loggedInUser()?.username ?? 'assistant',
      createdAt: currentFlow?.createdAt ?? new Date(),
      updatedAt: new Date(),
      published: currentFlow?.published,
      finalized: currentFlow?.finalized
    };
  }

  private pushLocalAssistantMessage(content: string) {
    const normalizedContent = this.normalizeAssistantMessageContent(content);
    const filtered = this.localMessages().filter((message) => message.role !== 'assistant');
    if (this.sessionHasAssistantMessage(normalizedContent)) {
      this.localMessages.set(filtered);
      this.persistSnapshot();
      return;
    }

    this.localMessages.set([
      ...filtered,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: normalizedContent
      }
    ]);
    this.persistSnapshot();
  }

  private sessionHasAssistantMessage(content: string): boolean {
    if (!content) return false;
    const canonicalContent = this.canonicalAssistantErrorContent(content);
    return (this.sessionState()?.messages ?? []).some((message) =>
      message.role === 'assistant' && this.assistantMessagesOverlap(
        canonicalContent,
        this.canonicalAssistantErrorContent(message.content)
      )
    );
  }

  private assistantMessagesOverlap(left: string, right: string): boolean {
    if (!left || !right) return false;
    return left === right || left.includes(right) || right.includes(left);
  }

  private normalizeAssistantMessageContent(content: string): string {
    return String(content ?? '').trim().replace(/\s+/g, ' ');
  }

  private isTechnicalAssistantFailureMessage(message: AssistantChatMessage): boolean {
    return message.role === 'assistant'
      && /^the assistant request failed:/i.test(this.normalizeAssistantMessageContent(message.content));
  }

  private canonicalAssistantErrorContent(content: string): string {
    return this.normalizeAssistantMessageContent(content)
      .replace(/^the assistant request failed:\s*/i, '')
      .replace(/\s+"/g, ' "')
      .replace(/"\s+/g, '" ')
      .toLowerCase();
  }

  private systemWelcomeMessage(): AssistantChatMessage {
    return {
      id: 'assistant-system-welcome',
      role: 'system',
      content: this.canOfferCreate()
        ? (this.isCreateModal() ? 'Describe the workflow you want to create.' : 'Use the default configuration or choose a provider and model, then ask me to create a new workflow.')
        : 'Use the default configuration or choose a provider and model, then ask me to refine, fix, or explain the current workflow.'
    };
  }

  private async restoreSessionForFlow(flowKey: string) {
    this.stopPolling();
    this.currentCall.set(null);

    const snapshot = this.sessionStore.getSnapshot(flowKey);
    if (!snapshot) {
      this.prompt.set('');
      this.modelPickerOpen.set(false);
      this.quickPromptsOpen.set(true);
      this.sessionState.set(null);
      this.localMessages.set([]);
      this.assistantErrorMessage.set(null);
      this.lastFailedPrompt.set(null);
      this.lastSubmittedPrompt.set('');
      this.useDefaultConfiguration.set(true);
      this.selectedProvider.set('');
      this.selectedModel.set('');
      this.phaseModels.set(undefined);
      this.advancedModelsOpen.set(false);
      this.sessionLoading.set(false);
      return;
    }

    this.prompt.set(snapshot.prompt);
    this.modelPickerOpen.set(snapshot.modelPickerOpen);
    this.quickPromptsOpen.set(snapshot.quickPromptsOpen);
    this.localMessages.set(snapshot.localMessages);
    this.currentCall.set(snapshot.currentCall);
    this.assistantErrorMessage.set(snapshot.assistantErrorMessage);
    this.lastFailedPrompt.set(snapshot.lastFailedPrompt);
    this.lastSubmittedPrompt.set(snapshot.lastSubmittedPrompt);
    this.createPromptSubmitted.set(this.isCreateModal() && this.isActiveCall(snapshot.currentCall));
    this.useDefaultConfiguration.set(snapshot.useDefaultConfiguration);
    this.selectedProvider.set(snapshot.selectedProvider);
    this.selectedModel.set(snapshot.selectedModel);
    this.phaseModels.set(snapshot.phaseModels);
    this.advancedModelsOpen.set(snapshot.advancedModelsOpen);
    this.sessionState.set(snapshot.sessionState ?? null);

    if (!this.useDefaultConfiguration() && this.selectedProvider()) {
      void this.loadProviders();
      void this.loadModels(this.selectedProvider());
    }

    if (this.isActiveCall(snapshot.currentCall)) {
      this.sessionLoading.set(false);
      this.beginPolling(snapshot.currentCall!.id);
      return;
    }

    const sessionId = snapshot.sessionId ?? snapshot.sessionState?.id ?? null;
    if (!sessionId) {
      this.sessionLoading.set(false);
      return;
    }

    this.sessionLoading.set(true);
    this.assistant.getSession(sessionId).pipe(
      take(1),
      finalize(() => this.sessionLoading.set(false))
    ).subscribe({
      next: (session) => {
        this.applySessionState(session, { clearLocalMessages: false, syncDraftToEditor: false });
      },
      error: (err) => {
        console.error('Assistant session refresh failed', err);
      }
    });
  }

  private resolveFlowKey(flowId: string | null | undefined): string {
    return this.sessionStore.flowKey(flowId);
  }

  private clearSnapshot(flowKey: string) {
    if (flowKey === this.activeFlowKey) {
      this.skipDestroySnapshot = true;
    }
    this.sessionStore.clearSnapshot(flowKey);
  }

  private persistSnapshot(flowKey = this.activeFlowKey ?? this.resolveFlowKey(this.currentFlow()?.id ?? null)) {
    this.sessionStore.setSnapshot(flowKey, {
      sessionId: this.sessionState()?.id ?? null,
      selectedModel: this.selectedModel(),
      useDefaultConfiguration: this.useDefaultConfiguration(),
      selectedProvider: this.selectedProvider(),
      phaseModels: this.phaseModels(),
      advancedModelsOpen: this.advancedModelsOpen(),
      prompt: this.prompt(),
      modelPickerOpen: this.modelPickerOpen(),
      quickPromptsOpen: this.quickPromptsOpen(),
      localMessages: this.localMessages(),
      currentCall: this.currentCall(),
      sessionState: this.sessionState(),
      assistantErrorMessage: this.assistantErrorMessage(),
      lastFailedPrompt: this.lastFailedPrompt(),
      lastSubmittedPrompt: this.lastSubmittedPrompt()
    });
  }

  private scheduleScrollToLatestMessage() {
    queueMicrotask(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => this.scrollToLatestMessage());
        return;
      }
      setTimeout(() => this.scrollToLatestMessage(), 0);
    });
  }

  private scrollToLatestMessage() {
    const container = this.assistantScrollElement?.nativeElement;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }

  private stopPolling() {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = null;
  }

  private phaseText(phase: AssistantCallPhase): string {
    switch (phase) {
      case 'queued':
        return 'Queued...';
      case 'routing':
        return 'Routing your request...';
      case 'planning':
        return 'Planning workflow blocks...';
      case 'configuring_blocks':
        return 'Configuring blocks...';
      case 'connecting_blocks':
        return 'Connecting blocks...';
      case 'validating':
        return 'Validating flow...';
      case 'fixing':
        return 'Repairing invalid flow...';
      case 'explaining':
        return 'Explaining current flow...';
      case 'completed':
        return 'Finalizing flow...';
      case 'failed':
        return 'Assistant request failed.';
      case 'cancelled':
        return 'Assistant request cancelled.';
    }
  }

  private isActiveCall(call: AssistantCallState | null): call is AssistantCallState {
    return !!call && (call.status === 'QUEUED' || call.status === 'RUNNING');
  }

  private hasMeaningfulFlow(flow: Flow | null): boolean {
    if (!flow) return false;
    const data = flow.data;
    return (data.blocks?.length ?? 0) > 0
      || (data.containers?.length ?? 0) > 0
      || (data.connections?.length ?? 0) > 0
      || (data.dependencies?.length ?? 0) > 0;
  }
}
