import { Injectable, signal } from '@angular/core';

import { BlockInteractionContractKind } from '@models/flow';

export type HumanInteractionChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type HumanInteractionDialogInput = {
  title?: string;
  kind: BlockInteractionContractKind;
  actionDescription?: string;
  currentInput?: string;
  history?: HumanInteractionChatMessage[];
  latestResponse?: string;
  messageField?: string | null;
  completionField?: string | null;
};

export type HumanInteractionDialogResult = {
  mode: 'message' | 'complete';
  value: string;
};

@Injectable({ providedIn: 'root' })
export class HumanInteractionDialogService {
  private _state = signal<{
    title: string;
    kind: BlockInteractionContractKind;
    actionDescription: string;
    currentInput: string;
    history: HumanInteractionChatMessage[];
    latestResponse: string;
    messageField: string | null;
    completionField: string | null;
    resolve: (value: HumanInteractionDialogResult | null) => void;
  } | null>(null);

  readonly state = this._state.asReadonly();

  open(input: HumanInteractionDialogInput): Promise<HumanInteractionDialogResult | null> {
    return new Promise((resolve) => {
      this._state.set({
        title: input.title ?? 'Human interaction',
        kind: input.kind,
        actionDescription: input.actionDescription ?? '',
        currentInput: input.currentInput ?? '',
        history: input.history ?? [],
        latestResponse: input.latestResponse ?? '',
        messageField: input.messageField ?? null,
        completionField: input.completionField ?? null,
        resolve
      });
    });
  }

  close(value: HumanInteractionDialogResult | null) {
    const state = this._state();
    if (!state) return;
    state.resolve(value);
    this._state.set(null);
  }
}
