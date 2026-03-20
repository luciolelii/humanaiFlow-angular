import { Injectable, signal } from '@angular/core';

import { BlockInteractionContractKind } from '@models/flow';

export type HumanInteractionChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type HumanInteractionDialogInput = {
  executionId?: string | null;
  nodeId?: string | null;
  title?: string;
  kind: BlockInteractionContractKind;
  actionDescription?: string;
  currentInput?: string;
  history?: HumanInteractionChatMessage[];
  latestResponse?: string;
  historyField?: string | null;
  responseField?: string | null;
  messageField?: string | null;
  completionField?: string | null;
  pendingUserMessage?: string | null;
  awaitingAssistantResponse?: boolean;
  assistantResponseBaseline?: string;
  isRunning?: boolean;
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit?: (value: HumanInteractionDialogResult) => void;
};

export type HumanInteractionDialogResult = {
  mode: 'message' | 'complete';
  value: string;
};

@Injectable({ providedIn: 'root' })
export class HumanInteractionDialogService {
  private _state = signal<{
    executionId: string | null;
    nodeId: string | null;
    title: string;
    kind: BlockInteractionContractKind;
    actionDescription: string;
    currentInput: string;
    history: HumanInteractionChatMessage[];
    latestResponse: string;
    historyField: string | null;
    responseField: string | null;
    messageField: string | null;
    completionField: string | null;
    pendingUserMessage: string | null;
    awaitingAssistantResponse: boolean;
    assistantResponseBaseline: string;
    isRunning: boolean;
    isSubmitting: boolean;
    submitError: string | null;
    onSubmit: ((value: HumanInteractionDialogResult) => void) | null;
    resolve: (value: HumanInteractionDialogResult | null) => void;
  } | null>(null);

  readonly state = this._state.asReadonly();

  open(input: HumanInteractionDialogInput): Promise<HumanInteractionDialogResult | null> {
    return new Promise((resolve) => {
      this._state.set({
        executionId: input.executionId ?? null,
        nodeId: input.nodeId ?? null,
        title: input.title ?? 'Human interaction',
        kind: input.kind,
        actionDescription: input.actionDescription ?? '',
        currentInput: input.currentInput ?? '',
        history: input.history ?? [],
        latestResponse: input.latestResponse ?? '',
        historyField: input.historyField ?? null,
        responseField: input.responseField ?? null,
        messageField: input.messageField ?? null,
        completionField: input.completionField ?? null,
        pendingUserMessage: input.pendingUserMessage ?? null,
        awaitingAssistantResponse: input.awaitingAssistantResponse === true,
        assistantResponseBaseline: input.assistantResponseBaseline ?? '',
        isRunning: input.isRunning === true,
        isSubmitting: input.isSubmitting === true,
        submitError: input.submitError ?? null,
        onSubmit: input.onSubmit ?? null,
        resolve
      });
    });
  }

  update(input: Partial<Omit<HumanInteractionDialogInput, 'onSubmit'>> & {
    onSubmit?: ((value: HumanInteractionDialogResult) => void) | null;
  }) {
    const state = this._state();
    if (!state) return;

    this._state.set({
      ...state,
      executionId: input.executionId !== undefined ? input.executionId : state.executionId,
      nodeId: input.nodeId !== undefined ? input.nodeId : state.nodeId,
      title: input.title ?? state.title,
      kind: input.kind ?? state.kind,
      actionDescription: input.actionDescription ?? state.actionDescription,
      currentInput: input.currentInput ?? state.currentInput,
      history: input.history ?? state.history,
      latestResponse: input.latestResponse ?? state.latestResponse,
      historyField: input.historyField !== undefined ? input.historyField : state.historyField,
      responseField: input.responseField !== undefined ? input.responseField : state.responseField,
      messageField: input.messageField !== undefined ? input.messageField : state.messageField,
      completionField: input.completionField !== undefined ? input.completionField : state.completionField,
      pendingUserMessage: input.pendingUserMessage !== undefined ? input.pendingUserMessage : state.pendingUserMessage,
      awaitingAssistantResponse: input.awaitingAssistantResponse ?? state.awaitingAssistantResponse,
      assistantResponseBaseline: input.assistantResponseBaseline ?? state.assistantResponseBaseline,
      isRunning: input.isRunning ?? state.isRunning,
      isSubmitting: input.isSubmitting ?? state.isSubmitting,
      submitError: input.submitError !== undefined ? input.submitError : state.submitError,
      onSubmit: input.onSubmit !== undefined ? input.onSubmit : state.onSubmit
    });
  }

  submit(value: HumanInteractionDialogResult) {
    const state = this._state();
    state?.onSubmit?.(value);
  }

  isOpenFor(executionId: string | null | undefined, nodeId: string | null | undefined): boolean {
    const state = this._state();
    if (!state) return false;
    return state.executionId === (executionId ?? null) && state.nodeId === (nodeId ?? null);
  }

  close(value: HumanInteractionDialogResult | null) {
    const state = this._state();
    if (!state) return;
    state.resolve(value);
    this._state.set(null);
  }
}
