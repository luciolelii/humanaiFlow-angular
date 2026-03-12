import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
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
  AssistantSessionState
} from '@models/assistant';
import { Flow } from '@models/flow';
import { AssistantService } from '@services/assistant/assistant';
import { Authorization } from '@services/authorization/authorization';
import { EditorStateHolder } from '@stores/flow-editor';
import { finalize, take } from 'rxjs';

@Component({
  selector: 'app-flow-assistant',
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './flow-assistant.html',
  styleUrl: './flow-assistant.css'
})
export class FlowAssistant implements OnInit, OnDestroy {
  private readonly assistant = inject(AssistantService);
  private readonly editorState = inject(EditorStateHolder);
  private readonly authorization = inject(Authorization);
  private pollTick: ReturnType<typeof setInterval> | null = null;

  readonly assistantConfig = signal<AssistantConfig | null>(null);
  readonly sessionState = signal<AssistantSessionState | null>(null);
  readonly currentCall = signal<AssistantCallState | null>(null);
  readonly localMessages = signal<AssistantChatMessage[]>([]);
  readonly models = signal<string[]>([]);
  readonly modelsLoading = signal(false);
  readonly modelsError = signal<string | null>(null);
  readonly sessionLoading = signal(false);
  readonly prompt = signal('');
  readonly selectedModel = signal('');
  readonly modelPickerOpen = signal(false);
  readonly quickPromptsOpen = signal(true);

  readonly initialSystemMessage: AssistantChatMessage = {
    id: 'assistant-system-welcome',
    role: 'system',
    content: 'Select a model, then ask me to create, refine, fix, or explain a workflow.'
  };

  readonly displayedMessages = computed(() => {
    const baseMessages = this.sessionState()?.messages?.length
      ? this.sessionState()!.messages
      : [this.initialSystemMessage];
    return [...baseMessages, ...this.localMessages()];
  });
  readonly assistantBusy = computed(() => {
    const status = this.currentCall()?.status;
    return this.sessionLoading() || status === 'QUEUED' || status === 'RUNNING';
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
    if (!phase) {
      return this.sessionLoading() ? 'Preparing assistant session...' : '';
    }
    return this.phaseText(phase);
  });
  readonly busyDetail = computed(() => {
    if (this.sessionLoading()) {
      return 'Loading assistant configuration, models, and chat session...';
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
  readonly starterPrompts = [
    'Create a flow that classifies incoming tickets and sends urgent ones to a human',
    'Modify the current flow to add a review step after the LLM block',
    'Fix the problems in this flow',
    'Explain why this flow is not valid'
  ];

  ngOnInit(): void {
    this.bootstrapAssistant();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  selectModel(model: string) {
    if (!model || model === this.selectedModel()) return;
    this.selectedModel.set(model);
    void this.openSession(model);
  }

  useStarter(prompt: string) {
    this.prompt.set(prompt);
  }

  toggleQuickPrompts() {
    this.quickPromptsOpen.update((value) => !value);
  }

  toggleModelPicker() {
    this.modelPickerOpen.update((value) => !value);
  }

  submitPrompt() {
    const content = this.prompt().trim();
    const sessionId = this.sessionState()?.id;
    if (!content || this.assistantBusy() || !sessionId) return;

    this.prompt.set('');
    this.localMessages.set([
      {
        id: crypto.randomUUID(),
        role: 'user',
        content
      }
    ]);

    this.assistant.sendMessage(sessionId, { message: content }).pipe(
      take(1)
    ).subscribe({
      next: ({ callId }) => {
        this.currentCall.set({
          id: callId,
          sessionId,
          status: 'QUEUED',
          phase: 'queued'
        });
        this.startPolling(callId, sessionId);
      },
      error: (err) => {
        console.error('Assistant send message failed', err);
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
        void this.openSession(selectedModel);
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

  private async openSession(model: string) {
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
      },
      error: (err) => {
        console.error('Assistant session creation failed', err);
        this.pushLocalAssistantMessage('Unable to create an assistant session.');
      }
    });
  }

  private startPolling(callId: string, sessionId: string) {
    this.stopPolling();
    this.pollTick = setInterval(() => {
      this.assistant.getCall(callId).pipe(
        take(1)
      ).subscribe({
        next: (callState) => {
          this.currentCall.set(callState);
          if (callState.status === 'COMPLETED' || callState.status === 'FAILED') {
            this.stopPolling();
            void this.reloadSession(sessionId, callState.status === 'FAILED' ? callState.errorMessage : undefined);
          }
        },
        error: (err) => {
          console.error('Assistant call polling failed', err);
          this.stopPolling();
          this.pushLocalAssistantMessage('Polling the assistant call failed.');
        }
      });
    }, 500);
  }

  private async reloadSession(sessionId: string, failureMessage?: string) {
    this.assistant.getSession(sessionId).pipe(
      take(1)
    ).subscribe({
      next: (session) => {
        this.applySessionState(session);
        this.currentCall.set(null);
        if (failureMessage) {
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

  private applySessionState(session: AssistantSessionState) {
    const normalizedSession = session.messages.length
      ? session
      : {
        ...session,
        messages: [this.initialSystemMessage]
      };

    this.sessionState.set(normalizedSession);
    this.selectedModel.set(normalizedSession.selectedModel || this.selectedModel());
    this.localMessages.set([]);
    this.syncDraftToEditor(normalizedSession.currentDraftFlow);
  }

  private syncDraftToEditor(draft: AssistantDraftPayload | null) {
    if (!draft) return;

    const currentFlow = this.currentFlow();
    const nextFlow = this.toEditorFlow(draft, currentFlow);

    if (currentFlow?.id) {
      this.editorState.loadAssistantFlow(nextFlow, { markDirty: true });
      return;
    }

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

  private pushLocalAssistantMessage(content: string) {
    const filtered = this.localMessages().filter((message) => message.role !== 'assistant');
    this.localMessages.set([
      ...filtered,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content
      }
    ]);
  }

  private stopPolling() {
    if (this.pollTick) {
      clearInterval(this.pollTick);
      this.pollTick = null;
    }
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
}
