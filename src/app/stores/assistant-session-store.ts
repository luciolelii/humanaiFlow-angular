import { Injectable } from '@angular/core';
import { AssistantCallState, AssistantChatMessage, AssistantSessionState } from '@models/assistant';

export type AssistantSessionSnapshot = {
  sessionId: string | null;
  selectedModel: string;
  prompt: string;
  modelPickerOpen: boolean;
  quickPromptsOpen: boolean;
  localMessages: AssistantChatMessage[];
  currentCall: AssistantCallState | null;
  sessionState: AssistantSessionState | null;
};

@Injectable({ providedIn: 'root' })
export class AssistantSessionStore {
  private static readonly NO_FLOW_KEY = '__assistant:no-flow__';
  private static readonly STORAGE_KEY = 'assistant-session-store:v1';
  private static readonly STORAGE_TARGETS: Array<'localStorage' | 'sessionStorage'> = ['localStorage', 'sessionStorage'];
  private readonly snapshots = new Map<string, AssistantSessionSnapshot>();

  constructor() {
    this.hydrateFromStorage();
  }

  flowKey(flowId: string | null | undefined): string {
    return flowId && flowId.length > 0 ? flowId : AssistantSessionStore.NO_FLOW_KEY;
  }

  getSnapshot(flowKey: string): AssistantSessionSnapshot | null {
    const snapshot = this.snapshots.get(flowKey);
    return snapshot ? structuredClone(snapshot) : null;
  }

  setSnapshot(flowKey: string, snapshot: AssistantSessionSnapshot) {
    this.snapshots.set(flowKey, structuredClone(snapshot));
    this.persistToStorage();
  }

  cloneSnapshot(fromFlowKey: string, toFlowKey: string) {
    const snapshot = this.snapshots.get(fromFlowKey);
    if (!snapshot) return;
    this.snapshots.set(toFlowKey, structuredClone(snapshot));
    this.persistToStorage();
  }

  private hydrateFromStorage() {
    const raw = this.readStoredPayload();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return;
      const root = parsed as Record<string, unknown>;
      const snapshots = root['snapshots'];
      if (!snapshots || typeof snapshots !== 'object') return;

      for (const [flowKey, rawSnapshot] of Object.entries(snapshots as Record<string, unknown>)) {
        const normalized = this.normalizeSnapshot(rawSnapshot);
        if (!normalized) continue;
        this.snapshots.set(flowKey, normalized);
      }
    } catch {
      this.clearStoredPayload();
    }
  }

  private normalizeSnapshot(rawSnapshot: unknown): AssistantSessionSnapshot | null {
    if (!rawSnapshot || typeof rawSnapshot !== 'object') return null;
    const snapshot = rawSnapshot as Record<string, unknown>;

    return {
      sessionId: typeof snapshot['sessionId'] === 'string' ? snapshot['sessionId'] : null,
      selectedModel: typeof snapshot['selectedModel'] === 'string' ? snapshot['selectedModel'] : '',
      prompt: typeof snapshot['prompt'] === 'string' ? snapshot['prompt'] : '',
      modelPickerOpen: snapshot['modelPickerOpen'] === true,
      quickPromptsOpen: snapshot['quickPromptsOpen'] !== false,
      localMessages: Array.isArray(snapshot['localMessages'])
        ? (snapshot['localMessages'] as AssistantChatMessage[])
        : [],
      currentCall: snapshot['currentCall'] && typeof snapshot['currentCall'] === 'object'
        ? (snapshot['currentCall'] as AssistantCallState)
        : null,
      sessionState: snapshot['sessionState'] && typeof snapshot['sessionState'] === 'object'
        ? (snapshot['sessionState'] as AssistantSessionState)
        : null
    };
  }

  private persistToStorage() {
    if (typeof window === 'undefined') return;

    const payload = JSON.stringify({
      snapshots: Object.fromEntries(this.snapshots.entries())
    });

    for (const target of AssistantSessionStore.STORAGE_TARGETS) {
      try {
        window[target].setItem(AssistantSessionStore.STORAGE_KEY, payload);
      } catch {
        // Ignore storage write errors (quota, private mode, unavailable storage).
      }
    }
  }

  private readStoredPayload(): string | null {
    if (typeof window === 'undefined') return null;

    for (const target of AssistantSessionStore.STORAGE_TARGETS) {
      try {
        const value = window[target].getItem(AssistantSessionStore.STORAGE_KEY);
        if (value) return value;
      } catch {
        // Ignore storage read errors and keep trying the next target.
      }
    }
    return null;
  }

  private clearStoredPayload() {
    if (typeof window === 'undefined') return;

    for (const target of AssistantSessionStore.STORAGE_TARGETS) {
      try {
        window[target].removeItem(AssistantSessionStore.STORAGE_KEY);
      } catch {
        // Ignore storage cleanup errors.
      }
    }
  }
}
