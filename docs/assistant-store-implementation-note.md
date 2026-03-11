# Assistant Store Implementation Note

This note captures the proposed implementation approach for making the assistant panel state persistent even when the right-side assistant aside is closed.

The goal is to preserve:

- backend assistant session
- current call progress
- chat messages
- selected model
- current draft flow
- validation state
- panel open/closed state

without relying on the component instance staying mounted.

## Main Idea

Introduce a dedicated root store for the assistant, separate from the UI component.

Recommended name:

- `AssistantStateHolder`

Recommended scope:

- `providedIn: 'root'`

This store becomes the single source of truth for:

- assistant config
- model list
- selected model
- session state
- current call state
- progress state
- draft flow returned by the backend
- validation errors
- assistant panel visibility

The `FlowAssistant` component should become mostly a UI shell bound to the store.

## Why This Is Needed

Right now, if the panel lifecycle is coupled to the component lifecycle, closing the assistant risks losing:

- session id
- polling state
- transient progress
- local chat state

That makes the assistant behave like a disposable widget instead of a real chat client.

The assistant should instead behave like a persistent workspace tool.

## State That Should Move Into The Store

These values should live in `AssistantStateHolder`:

- `assistantConfig`
- `models`
- `modelsLoading`
- `modelsError`
- `selectedModel`
- `sessionId`
- `sessionState`
- `currentCall`
- `assistantBusy`
- `callStatus`
- `callPhase`
- `callProgressMessage`
- `conversationMessages`
- `currentDraftFlow`
- `lastValidationErrors`
- `panelOpen`

These values may remain local to the component if desired:

- `prompt`
- `modelPickerOpen`
- `quickPromptsOpen`

If preserving draft input text across close/reopen is desired, `prompt` should also move into the store.

## Responsibilities Of The Store

The store should own:

1. assistant bootstrap
2. config loading
3. model loading
4. session creation
5. message sending
6. call polling
7. session refresh after completion
8. synchronization with the flow editor
9. panel open/close state

The component should not own backend orchestration anymore.

## Recommended Public Store API

Suggested methods:

- `initialize()`
- `openPanel()`
- `closePanel()`
- `togglePanel()`
- `selectModel(model: string)`
- `sendMessage(message: string)`
- `refreshSession()`
- `reset()`

Suggested computed/read-only state:

- `assistantConfig`
- `models`
- `selectedModel`
- `panelOpen`
- `sessionState`
- `conversationMessages`
- `currentDraftFlow`
- `lastValidationErrors`
- `currentCall`
- `assistantBusy`
- `callPhase`
- `callProgressMessage`

## Polling Strategy

Polling should live in the store, not in the component.

Requirements:

- start polling after `POST /assistant/sessions/{sessionId}/messages`
- keep polling while status is:
  - `QUEUED`
  - `RUNNING`
- stop polling immediately on:
  - `COMPLETED`
  - `FAILED`
- refresh session state when the call completes
- do not stop polling just because the panel is visually closed

Closing the panel must not interrupt an in-flight assistant call.

## UI Behavior

The right-side assistant should be treated as:

- a collapsible aside
- not a disposable component state container

Recommended behavior:

- when closed, only the panel visibility changes
- when reopened, the user sees the same assistant session state
- if a call is in progress, reopening shows the live current progress state

## Integration With Flow Editor

The store should remain responsible for mapping the assistant draft flow into `EditorStateHolder`.

This synchronization should happen when session state changes and includes a new `currentFlow` or `currentDraftFlow`.

The assistant store should push the backend-provided draft into the editor state, but the backend session remains the source of truth for assistant conversation state.

## Recommended Separation

Use two layers:

1. `AssistantStateHolder`
   Owns state, side effects, session lifecycle, polling, and editor synchronization.

2. `FlowAssistant`
   Reads signals from the store and emits user actions back into the store.

This keeps UI simple and avoids growing the component into a stateful orchestration object.

## Open Decisions Before Implementation

These should be confirmed before implementation:

1. Should the typed but unsent prompt survive panel close/reopen?
2. Should changing model always create a brand-new backend session?
3. Should reopening the panel automatically refresh session state?
4. Should assistant state survive route changes, or only stay alive while the app remains open?

## Recommended Implementation Order

1. Introduce `AssistantStateHolder`
2. Move current assistant signals into the store
3. Move bootstrap/config/models/session logic into the store
4. Move polling into the store
5. Move editor synchronization into the store
6. Refactor `FlowAssistant` into a thin UI component
7. Bind `FlowEditor` collapse/expand behavior to store `panelOpen`
8. Verify close/reopen while:
   - idle
   - loading config
   - polling active call
   - after completed draft

## Expected Outcome

After this refactor:

- the assistant behaves like a persistent chat client
- the panel can be closed and reopened without losing context
- backend session state stays aligned with UI state
- the UI becomes easier to maintain
