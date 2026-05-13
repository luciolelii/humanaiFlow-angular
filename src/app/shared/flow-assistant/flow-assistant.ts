import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { environment } from '@environment';
import {
  AssistantCallPhase,
  AssistantCallState,
  AssistantChatMessage,
  AssistantConfig,
  AssistantDraftPayload,
  AssistantFlowResult,
  AssistantSessionState
} from '@models/assistant';
import { Flow } from '@models/flow';
import { AssistantService } from '@services/assistant/assistant';
import { Authorization } from '@services/authorization/authorization';
import { AssistantSessionStore } from '@stores/assistant-session-store';
import { EditorStateHolder } from '@stores/flow-editor';
import { finalize, interval, Subscription, switchMap, take } from 'rxjs';

@Component({
  selector: 'app-flow-assistant',
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './flow-assistant.html',
  styleUrl: './flow-assistant.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowAssistant implements OnInit, OnDestroy {
  @ViewChild('assistantScroll') assistantScrollElement?: ElementRef<HTMLDivElement>;

  private readonly assistant = inject(AssistantService);
  private readonly editorState = inject(EditorStateHolder);
  private readonly authorization = inject(Authorization);
  private readonly sessionStore = inject(AssistantSessionStore);
  private pollSubscription: Subscription | null = null;
  private initialized = false;
  private activeFlowKey: string | null = null;
  private lastAutoScrollKey = '';
  private readonly createModalFlowKey = `__assistant:create-modal:${crypto.randomUUID()}`;

  readonly assistantConfig = signal<AssistantConfig | null>(null);
  readonly variant = input<'aside' | 'create-modal'>('aside');
  readonly sessionState = signal<AssistantSessionState | null>(null);
  readonly currentCall = signal<AssistantCallState | null>(null);
  readonly localMessages = signal<AssistantChatMessage[]>([]);
  readonly models = signal<string[]>([]);
  readonly modelsLoading = signal(false);
  readonly modelsError = signal<string | null>(null);
  readonly sessionLoading = signal(false);
  readonly requestPending = signal(false);
  readonly prompt = signal('');
  readonly createPromptSubmitted = signal(false);
  readonly selectedModel = signal('');
  readonly modelPickerOpen = signal(false);
  readonly quickPromptsOpen = signal(true);
  readonly editorHasOpenFlow = computed(() => !!this.currentFlow());
  readonly editorHasNonEmptyFlow = computed(() => this.hasMeaningfulFlow(this.currentFlow()));
  readonly sessionHasDraft = computed(() => !!this.currentDraft());
  readonly canOfferCreate = computed(() => !this.editorHasNonEmptyFlow() && !this.sessionHasDraft());
  readonly canOfferFix = computed(() => !this.canOfferCreate() && (this.sessionState()?.lastValidationErrors?.length ?? 0) > 0);
  readonly isCreateModal = computed(() => this.variant() === 'create-modal');
  readonly createModalProgressOnly = computed(() =>
    this.isCreateModal() && this.createPromptSubmitted()
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
    return [...baseMessages, ...this.localMessages()];
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
  }

  ngOnInit(): void {
    this.bootstrapAssistant();
  }

  ngOnDestroy(): void {
    if (this.activeFlowKey) {
      this.persistSnapshot(this.activeFlowKey);
    }
    this.stopPolling();
  }

  selectModel(model: string) {
    if (!model || model === this.selectedModel()) return;
    this.selectedModel.set(model);
    void this.openSession(model);
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
    const sessionId = this.sessionState()?.id;
    if (!content || this.assistantBusy() || !sessionId) return;

    if (this.isCreateModal()) this.createPromptSubmitted.set(true);
    this.requestPending.set(true);
    this.prompt.set('');
    this.localMessages.set([
      {
        id: crypto.randomUUID(),
        role: 'user',
        content
      }
    ]);
    this.persistSnapshot();

    this.assistant.sendMessage(sessionId, { message: content }).pipe(
      take(1)
    ).subscribe({
      next: ({ callId }) => {
        this.requestPending.set(false);
        this.currentCall.set({
          id: callId,
          sessionId,
          status: 'QUEUED',
          phase: 'queued'
        });
        this.persistSnapshot();
        this.startPolling(callId, sessionId);
      },
      error: (err) => {
        console.error('Assistant send message failed', err);
        this.requestPending.set(false);
        this.createPromptSubmitted.set(false);
        this.pushLocalAssistantMessage('The assistant request failed.');
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
        this.loadModelsAndSession(config);
      },
      error: (err) => {
        console.error('Assistant config loading failed', err);
        this.sessionLoading.set(false);
        this.modelsError.set('Unable to load assistant configuration.');
      }
    });
  }

  private loadModelsAndSession(config: AssistantConfig) {
    this.modelsLoading.set(true);
    const resolvedUrl = this.resolveAssistantModelsUrl(config.availableModelsRetrieverUrl);
    this.assistant.listModels(config.availableModelsRetrieverUrl).pipe(
      take(1),
      finalize(() => this.modelsLoading.set(false))
    ).subscribe({
      next: (models) => {
        this.models.set(models);
        const selectedModel = config.defaultModel || models[0] || '';
        this.selectedModel.set(selectedModel);
        if (!selectedModel) {
          this.sessionLoading.set(false);
          this.modelsError.set('No assistant model is available.');
          return;
        }
        this.activeFlowKey = this.isCreateModal()
          ? this.createModalFlowKey
          : this.resolveFlowKey(this.currentFlow()?.id ?? null);
        this.initialized = true;
        if (this.isCreateModal()) {
          void this.openSession(selectedModel, this.activeFlowKey);
          return;
        }
        void this.restoreSessionForFlow(this.activeFlowKey);
      },
      error: (err) => {
        console.error('Assistant model loading failed', err);
        this.sessionLoading.set(false);
        this.modelsError.set(
          `Unable to load assistant models from ${resolvedUrl}.`
        );
      }
    });
  }

  private async openSession(model: string, flowKey = this.activeFlowKey ?? this.resolveFlowKey(this.currentFlow()?.id ?? null)) {
    this.stopPolling();
    this.currentCall.set(null);
    this.localMessages.set([]);
    this.sessionLoading.set(true);

    this.assistant.createSession({ model }).pipe(
      take(1),
      finalize(() => this.sessionLoading.set(false))
    ).subscribe({
      next: (session) => {
        this.applySessionState(session);
        this.persistSnapshot(flowKey);
      },
      error: (err) => {
        console.error('Assistant session creation failed', err);
        this.pushLocalAssistantMessage('Unable to create an assistant session.');
      }
    });
  }

  private startPolling(callId: string, sessionId: string) {
    this.stopPolling();
    this.pollSubscription = interval(500).pipe(
      switchMap(() => this.assistant.getCall(callId))
    ).subscribe({
      next: (callState) => {
        this.currentCall.set(callState);
        this.persistSnapshot();
        if (callState.status === 'COMPLETED' || callState.status === 'FAILED') {
          this.stopPolling();
          if (callState.status === 'COMPLETED' && callState.flowResult?.flow) {
            this.syncDraftToEditor(this.flowResultToDraft(callState.flowResult));
          }
          void this.reloadSession(sessionId, callState.status === 'FAILED' ? callState.errorMessage : undefined);
        }
      },
      error: (err) => {
        console.error('Assistant call polling failed', err);
        this.stopPolling();
        this.pushLocalAssistantMessage('Polling the assistant call failed.');
      }
    });
  }

  private async reloadSession(sessionId: string, failureMessage?: string) {
    this.assistant.getSession(sessionId).pipe(
      take(1)
    ).subscribe({
      next: (session) => {
        this.applySessionState(session);
        this.currentCall.set(null);
        this.persistSnapshot();
        if (failureMessage) {
          this.createPromptSubmitted.set(false);
          this.pushLocalAssistantMessage(failureMessage);
        }
      },
      error: (err) => {
        console.error('Assistant session refresh failed', err);
        this.currentCall.set(null);
        this.pushLocalAssistantMessage('Unable to refresh the assistant session.');
      }
    });
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

    void this.editorState.openDocument(nextFlow, { skipDirtyCheck: false }).then((opened) => {
      if (!opened) {
        this.pushLocalAssistantMessage('The draft is ready, but I did not load it because the current flow has unsaved changes.');
        return;
      }
      this.editorState.loadAssistantFlow(nextFlow, { markDirty: true });
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

  private flowResultToDraft(result: AssistantFlowResult): AssistantDraftPayload {
    const currentFlow = this.currentFlow();
    return {
      name: result.name ?? currentFlow?.name ?? 'Assistant Draft',
      description: result.description ?? currentFlow?.description,
      flow: result.flow
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
        ? (this.isCreateModal() ? 'Describe the workflow you want to create.' : 'Select a model, then ask me to create a new workflow.')
        : 'Select a model, then ask me to refine, fix, or explain the current workflow.'
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
      const model = this.selectedModel();
      if (!model) {
        this.sessionLoading.set(false);
        return;
      }
      void this.openSession(model, flowKey);
      return;
    }

    this.prompt.set(snapshot.prompt);
    this.modelPickerOpen.set(snapshot.modelPickerOpen);
    this.quickPromptsOpen.set(snapshot.quickPromptsOpen);
    this.localMessages.set(snapshot.localMessages);
    this.currentCall.set(null);
    if (snapshot.selectedModel) {
      this.selectedModel.set(snapshot.selectedModel);
    }
    if (snapshot.sessionState) {
      this.sessionState.set(snapshot.sessionState);
    } else {
      this.sessionState.set(null);
    }

    if (!snapshot.sessionId) {
      const model = this.selectedModel();
      if (!model) {
        this.sessionLoading.set(false);
        return;
      }
      void this.openSession(model, flowKey);
      return;
    }

    this.sessionLoading.set(true);
    this.assistant.getSession(snapshot.sessionId).pipe(
      take(1),
      finalize(() => this.sessionLoading.set(false))
    ).subscribe({
      next: (session) => {
        this.applySessionState(session, {
          clearLocalMessages: false,
          syncDraftToEditor: true
        });
      },
      error: (err) => {
        console.error('Assistant session restore failed', err);
        const model = this.selectedModel();
        if (!model) return;
        void this.openSession(model, flowKey);
      }
    });
  }

  private resolveFlowKey(flowId: string | null | undefined): string {
    return this.sessionStore.flowKey(flowId);
  }

  private persistSnapshot(flowKey = this.activeFlowKey ?? this.resolveFlowKey(this.currentFlow()?.id ?? null)) {
    this.sessionStore.setSnapshot(flowKey, {
      sessionId: this.sessionState()?.id ?? null,
      selectedModel: this.selectedModel(),
      prompt: this.prompt(),
      modelPickerOpen: this.modelPickerOpen(),
      quickPromptsOpen: this.quickPromptsOpen(),
      localMessages: this.localMessages(),
      currentCall: this.currentCall(),
      sessionState: this.sessionState()
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
    }
  }

  private resolveAssistantModelsUrl(url: string): string {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;

    const apiBase = environment.apiUrl;
    if (/^https?:\/\//i.test(apiBase)) {
      return new URL(url, `${apiBase.replace(/\/+$/, '')}/`).toString();
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const normalizedBase = apiBase.startsWith('/') ? apiBase : `/${apiBase}`;
    return new URL(url, `${origin}${normalizedBase.replace(/\/+$/, '')}/`).toString();
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
