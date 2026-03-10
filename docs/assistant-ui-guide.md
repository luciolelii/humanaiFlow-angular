# HumainFlow Assistant UI Guide

## Goal

Build the UI as a real assistance chatbot for workflow management. The user opens the assistant, chooses the internal model first, and then starts a conversation to:

- create a new flow
- modify an existing flow
- resolve flow problems
- ask for an explanation of the current flow

The frontend should not generate workflows directly. It should behave like a chat assistant, while the backend remains the source of truth for workflow generation, refinement, fixing, and explanation.

## Architectural Principle

- The assistant must feel like a chatbot, not like a form wizard.
- Model selection is the first interaction when the assistant opens.
- After model selection, the experience is a single conversational thread.
- Backend assistant is the orchestration layer.
- Flow validation stays server-side.
- Saving still uses the existing `/flows` endpoints.

This separation keeps the UI simple and avoids duplicating workflow rules in the browser while preserving a chat-first UX.

## Relevant Existing Backend APIs

### Block catalog and dynamic configuration

- `GET /blocks/types`
  Returns available block types, descriptions, configuration class names, JSON schema, and example endpoints.

- `GET /blocks/types/{type}/example`
  Returns a scaffold block for a given type.

- `GET /retriever/LLM/models?provider=InternalOllama`
  Returns available models for the internal Ollama provider used by the assistant.

### Existing flow CRUD

- `POST /flows`
  Persists a new validated flow.

- `PUT /flows/{id}`
  Updates an existing validated flow.

## New Assistant Backend APIs

All endpoints are authenticated like the rest of the flow API and always use the internal provider `InternalOllama`.

### `POST /assistant/flows/draft`

Create a new flow draft from natural language.

Request:

```json
{
  "userPrompt": "Create a flow that classifies a ticket and sends urgent ones to a human reviewer",
  "model": "llama3.1:8b",
  "maxRepairAttempts": 1
}
```

Response:

```json
{
  "flow": {
    "name": "Ticket classification with urgent review",
    "description": "Classify incoming tickets and route urgent ones to a human",
    "flow": {
      "blocks": [],
      "connections": []
    }
  },
  "valid": true,
  "validationErrors": [],
  "warnings": [],
  "assistantRationale": "Uses an LLM block for classification and a human interaction block for urgent cases.",
  "repairAttempts": 0
}
```

### `POST /assistant/flows/refine`

Modify an existing flow based on a conversational instruction.

Request:

```json
{
  "userPrompt": "Add a human approval step after the decision when risk is high",
  "model": "llama3.1:8b",
  "maxRepairAttempts": 1,
  "flow": {
    "name": "Existing flow",
    "description": "Current description",
    "flow": {
      "blocks": [],
      "connections": []
    }
  }
}
```

### `POST /assistant/flows/fix`

Repair an invalid flow. The frontend can pass validation errors returned by the backend or let the backend recompute them.

### `POST /assistant/flows/explain`

Generate a natural-language explanation for the current flow. This is useful for:

- a chat answer after draft generation
- an “Explain this flow” side panel
- onboarding and debugging

## Expected UI Behaviors

### Main interaction pattern

1. User opens the assistant drawer or page.
2. UI immediately asks for the internal model selection.
3. Once the model is selected, the chat becomes available.
4. User writes a free-form request.
5. UI decides which assistant action to trigger:
   - `/assistant/flows/draft` for creation
   - `/assistant/flows/refine` for modification
   - `/assistant/flows/fix` for problem resolution
   - `/assistant/flows/explain` for explanation
6. UI renders in the same chat thread:
   - assistant answer
   - workflow graph preview
   - validation state
7. User continues the conversation until the draft is acceptable.
8. Once the user accepts the draft, UI saves it with `/flows`.

### Suggested chat intents

- Create a new flow from scratch
- Modify the current flow
- Fix validation or execution issues
- Explain what the current flow does
- Ask clarifying questions before acting

### Suggested UX rule

If the user request is too ambiguous, ask one short clarifying question in chat before calling the backend. Examples:

- “Which internal model should I use for the LLM blocks?”
- “Should the final step be automatic or human-reviewed?”

Do not ask many questions up front. Prefer generating a reasonable draft and letting the user refine it.

## Recommended Layout

### Desktop

- Left panel: assistant chat
- Center: workflow canvas/editor
- Right panel: selected node details or assistant explanation

### Mobile

- Tab or drawer layout
- Chat and canvas must be easy to switch between

## Assistant Opening State

The first state of the assistant should be minimal:

- title of the assistant
- short text explaining that it can create, modify, and fix workflows
- internal model selector
- disabled chat input until a model is selected

Once the model is chosen, the user can immediately type requests like:

- "Create a flow that classifies incoming tickets and sends urgent ones to a human"
- "Modify the current flow to add a review step after the LLM block"
- "Fix the problems in this flow"
- "Explain why this flow is not valid"

## State Model the UI Should Maintain

- `conversationMessages`
- `currentDraftFlow`
- `selectedModel`
- `assistantBusy`
- `lastValidationErrors`
- `draftDirty`
- `currentIntent`

## Workflow Rendering Expectations

The UI should always render the `flow` returned by the assistant exactly as received. Do not try to rebuild block IO or infer hidden defaults client-side.

If a node needs richer configuration editing, use the schema from `/blocks/types` and the example block endpoint to scaffold forms.

## Editing Strategy

Use the assistant as the primary entry point and the graph editor as the secondary precision tool.

- Conversational editing through the assistant endpoints should be the main workflow.
- Direct graph editing should remain available for exact manual control.
- The user should be able to switch between chat and graph editing without losing state.

## Guardrails

- Never assume a flow returned by the assistant is valid without checking the `valid` flag.
- Always surface `validationErrors` in the UI when present.
- Save only after the user confirms the draft.
- Keep the selected internal model visible to the user.

## Intent Routing

The UI can infer the action from chat context and current editor state:

- If there is no current draft and the user asks for a workflow, call `/assistant/flows/draft`.
- If there is a current draft and the user asks to change it, call `/assistant/flows/refine`.
- If the current draft is invalid or the user explicitly asks to solve issues, call `/assistant/flows/fix`.
- If the user asks what the flow does, call `/assistant/flows/explain`.

This routing can be rule-based in the UI at first. It does not need an extra classifier.

## Recommended First UI Milestone

1. Open assistant with mandatory internal model selector
2. Single chat thread for create, modify, fix, and explain
3. Intent routing to the assistant endpoints
4. Canvas rendering of the returned flow
5. Validation error rendering in chat and near the graph
6. Save button using `/flows`

## Product Direction

The assistant should feel like a workflow copilot presented as a support chatbot. It should:

- propose structured workflows
- explain tradeoffs clearly
- keep changes incremental
- avoid surprising the user with destructive rewrites
