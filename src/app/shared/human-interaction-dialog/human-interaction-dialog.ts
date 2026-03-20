import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  HumanInteractionDialogResult,
  HumanInteractionDialogService
} from '@services/dialogs/human-interaction-dialog';

@Component({
  selector: 'app-human-interaction-dialog-host',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './human-interaction-dialog.html'
})
export class HumanInteractionDialogHostComponent {
  private dialog = inject(HumanInteractionDialogService);
  private host = inject(ElementRef<HTMLElement>);
  private lastDialogKey: string | null = null;
  private readonly messagesContainer = viewChild<ElementRef<HTMLElement>>('messagesContainer');

  readonly state = this.dialog.state;
  readonly editing = signal(false);
  readonly displayMessages = computed(() => {
    const state = this.state();
    if (!state) return [];

    const history = Array.isArray(state.history) ? state.history : [];
    const baseMessages = [...history];
    const pendingUserMessage = String(state.pendingUserMessage ?? '').trim();
    if (pendingUserMessage) {
      const lastHistoryMessage = history[history.length - 1];
      if (!(lastHistoryMessage?.role === 'user' && String(lastHistoryMessage.content ?? '').trim() === pendingUserMessage)) {
        baseMessages.push({ role: 'user', content: state.pendingUserMessage! });
      }
    }
    const latestResponse = String(state.latestResponse ?? '').trim();
    if (!latestResponse) return this.deduplicateMessages(baseMessages);

    const shouldAppendAssistant =
      !state.awaitingAssistantResponse ||
      latestResponse !== String(state.assistantResponseBaseline ?? '').trim();
    if (!shouldAppendAssistant) {
      return this.deduplicateMessages(baseMessages);
    }

    const lastMessage = baseMessages[baseMessages.length - 1];
    if (lastMessage?.role === 'assistant' && String(lastMessage.content ?? '').trim() === latestResponse) {
      return this.deduplicateMessages(baseMessages);
    }

    return this.deduplicateMessages([
      ...baseMessages,
      { role: 'assistant' as const, content: state.latestResponse }
    ]);
  });
  draftValue = '';

  constructor() {
    effect(() => {
      const state = this.state();
      if (!state) {
        this.lastDialogKey = null;
        return;
      }
      const dialogKey = `${state.executionId ?? ''}:${state.nodeId ?? ''}:${state.kind}`;
      if (dialogKey !== this.lastDialogKey) {
        this.lastDialogKey = dialogKey;
        this.editing.set(state.kind !== 'chat-session');
        this.draftValue = '';
      }
      queueMicrotask(() => {
        const target = this.host.nativeElement.querySelector('[data-autofocus="true"]') as HTMLElement | null;
        target?.focus();
      });
    });

    effect(() => {
      this.displayMessages();
      this.state()?.isSubmitting;
      this.state()?.isRunning;
      queueMicrotask(() => {
        const container = this.messagesContainer()?.nativeElement;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
      });
    });
  }

  cancel(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.dialog.close(null);
  }

  startEditing(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.editing.set(true);
    queueMicrotask(() => {
      const target = this.host.nativeElement.querySelector('[data-autofocus="true"]') as HTMLElement | null;
      target?.focus();
    });
  }

  backToConfirm(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.editing.set(false);
  }

  setDraftValue(value: string) {
    this.draftValue = value;
  }

  confirmInput(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.closeWith({ mode: 'complete', value: this.state()?.currentInput ?? '' });
  }

  sendEditedOutput(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const value = this.draftValue.trim();
    if (!value) return;
    this.closeWith({ mode: 'complete', value: this.draftValue });
  }

  sendChatMessage(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const value = this.draftValue.trim();
    if (!value) return;
    this.dialog.submit({ mode: 'message', value: this.draftValue });
    this.draftValue = '';
  }

  completeChatSession(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const value = this.draftValue.trim();
    if (!value) return;
    this.dialog.submit({ mode: 'complete', value: this.draftValue });
    this.draftValue = '';
  }

  canSendEditedOutput(): boolean {
    const state = this.state();
    if (state?.isSubmitting || state?.isRunning) return false;
    return this.draftValue.trim().length > 0;
  }

  private deduplicateMessages(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) {
    const deduplicated: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    for (const message of messages) {
      const content = String(message.content ?? '').trim();
      if (!content) continue;
      const last = deduplicated[deduplicated.length - 1];
      if (last?.role === message.role && String(last.content ?? '').trim() === content) {
        continue;
      }
      deduplicated.push({ ...message, content: message.content });
    }
    return deduplicated;
  }

  private closeWith(value: HumanInteractionDialogResult) {
    this.dialog.close(value);
  }
}
