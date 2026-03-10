import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AssistantChatMessage,
  AssistantDraftPayload,
  AssistantEditorDraft,
  AssistantFlowResponse,
  AssistantIntent,
  AssistantValidationIssue
} from '@models/assistant';
import { Flow } from '@models/flow';
import { AssistantService } from '@services/assistant/assistant';
import { Authorization } from '@services/authorization/authorization';
import { EditorStateHolder } from '@stores/flow-editor';
import { finalize, take } from 'rxjs';

@Component({
  selector: 'app-flow-assistant',
  imports: [CommonModule, FormsModule],
  templateUrl: './flow-assistant.html',
  styleUrl: './flow-assistant.css'
})
export class FlowAssistant implements OnInit {
  private readonly assistant = inject(AssistantService);
  private readonly editorState = inject(EditorStateHolder);
  private readonly authorization = inject(Authorization);

  readonly models = signal<string[]>([]);
  readonly modelsLoading = signal(false);
  readonly modelsError = signal<string | null>(null);
  readonly selectedModel = signal('');
  readonly modelPickerOpen = signal(true);
  readonly assistantBusy = signal(false);
  readonly currentIntent = signal<AssistantIntent | null>(null);
  readonly lastValidationErrors = signal<AssistantValidationIssue[]>([]);
  readonly prompt = signal('');
  readonly quickPromptsOpen = signal(true);
  readonly messages = signal<AssistantChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'system',
      content: 'Select a model, then ask me to create, refine, fix, or explain a workflow.'
    }
  ]);

  readonly currentFlow = this.editorState.currentFlow;
  readonly draftDirty = this.editorState.isDirty;
  readonly currentDraft = computed(() => this.toAssistantDraft(this.currentFlow()));
  readonly starterPrompts = [
    'Create a flow that classifies incoming tickets and sends urgent ones to a human',
    'Modify the current flow to add a review step after the LLM block',
    'Fix the problems in this flow',
    'Explain why this flow is not valid'
  ];

  ngOnInit(): void {
    this.loadModels();
  }

  selectModel(model: string) {
    this.selectedModel.set(model);
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
    const userPrompt = this.prompt().trim();
    if (!userPrompt || this.assistantBusy() || !this.selectedModel()) return;

    this.prompt.set('');
    this.pushMessage({
      role: 'user',
      content: userPrompt
    });

    const clarification = this.maybeClarify(userPrompt);
    if (clarification) {
      this.pushMessage({
        role: 'assistant',
        content: clarification
      });
      return;
    }

    const intent = this.determineIntent(userPrompt);
    this.currentIntent.set(intent);
    this.assistantBusy.set(true);

    if (intent === 'explain') {
      const draft = this.currentDraft();
      if (!draft) {
        this.pushMessage({
          role: 'assistant',
          content: 'Open or generate a flow first, then I can explain it in detail.',
          intent
        });
        this.assistantBusy.set(false);
        return;
      }

      this.assistant.explainDraft({
        userPrompt,
        model: this.selectedModel(),
        flow: draft
      }).pipe(
        take(1),
        finalize(() => this.assistantBusy.set(false))
      ).subscribe({
        next: (response) => {
          this.pushMessage({
            role: 'assistant',
            content: response.explanation || 'I analyzed the current flow.',
            intent,
            warnings: response.warnings
          });
        },
        error: (err) => this.pushAssistantError(err, intent)
      });
      return;
    }

    const draft = this.currentDraft();
    const maxRepairAttempts = intent === 'fix' ? 2 : 1;
    const request$ = intent === 'draft' || !draft
      ? this.assistant.createDraft({
        userPrompt,
        model: this.selectedModel(),
        maxRepairAttempts
      })
      : intent === 'fix'
        ? this.assistant.fixDraft({
          userPrompt,
          model: this.selectedModel(),
          maxRepairAttempts,
          flow: draft,
          validationErrors: this.lastValidationErrors()
        })
        : this.assistant.refineDraft({
          userPrompt,
          model: this.selectedModel(),
          maxRepairAttempts,
          flow: draft
        });

    request$.pipe(
      take(1),
      finalize(() => this.assistantBusy.set(false))
    ).subscribe({
      next: (response) => void this.applyAssistantFlowResponse(response, intent),
      error: (err) => this.pushAssistantError(err, intent)
    });
  }

  private loadModels() {
    this.modelsLoading.set(true);
    this.modelsError.set(null);

    this.assistant.listModels().pipe(
      take(1),
      finalize(() => this.modelsLoading.set(false))
    ).subscribe({
      next: (models) => {
        this.models.set(models);
        if (!this.selectedModel() && models.length) {
          this.selectedModel.set(models[0]);
        }
      },
      error: (err) => {
        console.error('Assistant model loading failed', err);
        this.modelsError.set('Unable to load internal assistant models.');
      }
    });
  }

  private determineIntent(prompt: string): AssistantIntent {
    const normalized = prompt.toLowerCase();
    const hasDraft = !!this.currentDraft();

    if (/explain|what does|spiega|cosa fa|why/i.test(normalized)) return 'explain';
    if (/fix|repair|problem|invalid|error|errore|bug/i.test(normalized)) return 'fix';
    if (!hasDraft) return 'draft';
    if (/create new|new flow|from scratch|nuovo flow/i.test(normalized)) return 'draft';
    return 'refine';
  }

  private maybeClarify(prompt: string): string | null {
    const normalized = prompt.trim();
    if (normalized.split(/\s+/).length >= 4) return null;
    if (this.currentDraft()) return null;
    return 'The request is too short to generate a useful flow. Tell me in one sentence what the workflow should do.';
  }

  private async applyAssistantFlowResponse(response: AssistantFlowResponse, intent: AssistantIntent) {
    this.lastValidationErrors.set(response.validationErrors);

    const currentFlow = this.currentFlow();
    const nextFlow = this.toEditorFlow(response, currentFlow, intent);
    const isReplacingDocument = intent === 'draft' && currentFlow?.id !== nextFlow.id;
    if (isReplacingDocument) {
      const opened = await this.editorState.openDocument(nextFlow);
      if (!opened) {
        this.pushMessage({
          role: 'assistant',
          content: 'The new draft is ready, but I did not load it because the current flow has unsaved changes.',
          intent
        });
        return;
      }
    }

    this.editorState.loadAssistantFlow(nextFlow, { markDirty: true });

    const summary = [
      response.assistantRationale || this.defaultAssistantSummary(intent, response.valid),
      response.valid ? 'The draft is valid.' : 'The draft still has validation errors.'
    ].filter(Boolean).join(' ');

    this.pushMessage({
      role: 'assistant',
      content: summary,
      intent,
      warnings: response.warnings,
      validationErrors: response.validationErrors
    });
  }

  private toEditorFlow(response: AssistantFlowResponse, currentFlow: Flow | null, intent: AssistantIntent): Flow {
    const shouldReuseCurrentId = !!currentFlow && intent !== 'draft';
    const nextId = shouldReuseCurrentId
      ? currentFlow!.id
      : `${EditorStateHolder.ASSISTANT_DRAFT_PREFIX}${crypto.randomUUID()}`;

    return {
      id: nextId,
      name: response.flow.name,
      description: response.flow.description,
      data: response.flow.flow,
      status: response.valid ? 'EXECUTABLE' : 'DRAFT',
      visibility: currentFlow?.visibility ?? 'PRIVATE',
      author: currentFlow?.author ?? this.authorization.loggedInUser()?.username ?? 'assistant',
      createdAt: currentFlow?.createdAt ?? new Date(),
      updatedAt: new Date(),
      published: currentFlow?.published,
      finalized: currentFlow?.finalized
    };
  }

  private toAssistantDraft(flow: Flow | null): AssistantDraftPayload | null {
    if (!flow) return null;
    return {
      name: flow.name,
      description: flow.description,
      flow: flow.data
    };
  }

  private defaultAssistantSummary(intent: AssistantIntent, valid: boolean): string {
    if (intent === 'draft') {
      return valid
        ? 'I created a new workflow draft.'
        : 'I created an initial draft, but it still needs corrections.';
    }
    if (intent === 'fix') {
      return valid
        ? 'I fixed the current workflow.'
        : 'I tried to fix the workflow, but there are still unresolved issues.';
    }
    return 'I updated the current workflow based on your request.';
  }

  private pushAssistantError(err: unknown, intent: AssistantIntent) {
    console.error('Assistant request failed', err);
    this.pushMessage({
      role: 'assistant',
      content: 'The assistant request failed.',
      intent
    });
  }

  private pushMessage(message: Omit<AssistantChatMessage, 'id'>) {
    this.messages.update((messages) => [
      ...messages,
      {
        ...message,
        id: crypto.randomUUID()
      }
    ]);
  }
}
