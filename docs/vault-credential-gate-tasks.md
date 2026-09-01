# Vault Credential Gate — Task List

This is the implementation backlog for the flow that blocks an execution until every
`requiredAuthorizations` entry has been satisfied with a Vault secret id.

The feature already works end to end: the UI detects an external LLM provider requirement, shows a
Vault credential selector filtered by that provider, lets the user pick an existing credential or
create a new one, sends its id to `PUT /executions/{executionId}/authorizations` with
`{ "key": "LLMProvider::<provider>::authorization", "value": "<vault-secret-id>" }`, and keeps the
start action disabled until nothing is missing. What follows are the gaps left around that path.

## Status — 1 September 2026

Every task on this list is closed. Nothing here needs picking up again.

- **Backend (BE-1 … BE-5):** implemented, and the questions the frontend depended on are
  answered. See the backend contract note (`vault-credential-gate-backend-contract-2026-09-01.md`,
  supplied by the backend team).
- **Frontend (FE-1 … FE-7, FE-9):** implemented. See
  [vault-credential-gate-frontend.md](vault-credential-gate-frontend.md), which also records two
  deviations from the acceptance criteria below and two follow-ups that fall outside this backlog.
- **FE-8 and FE-10:** cancelled — the backend answers removed the need for them.

The per-task sections below are kept as written, so the acceptance criteria stay readable next to
what was actually delivered.

## How to read this list

- **Order** is the implementation order inside each team. Work the tasks top to bottom.
- The backend track and the frontend track are independent and can run in parallel. The only
  couplings are stated explicitly under *Blocked by* / *Blocks*.
- **P0** — must be closed before the feature is considered shippable.
  **P1** — correctness or maintainability gap, not release-blocking on its own.
  **P2** — UX and robustness polish.
- Task ids match the ones used in the review punchlist, so they are stable across both documents.
  The ids are not the order; the order is the first column.

## Sequencing summary

| Order | Id | Team | Task | Priority | Blocked by | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BE-1 | Backend | Include the authorization fields in the executions groups payload | P0 | — | Done |
| 2 | BE-2 | Backend | Pin down which secret id the authorizations endpoint expects | P0 | — | Done |
| 3 | BE-5 | Backend | Return the updated execution from the authorizations PUT | P1 | — | Done |
| 4 | BE-4 | Backend | Guarantee provider identifier parity across endpoints | P1 | — | Done |
| 5 | BE-3 | Backend | Guarantee the credential listing only returns usable credentials | P1 | — | Done |
| 1 | FE-1 | Frontend | Bring the two new services into the call/fake pattern | P0 | — | Done |
| 2 | FE-2 | Frontend | Never offer a raw API key field for `LLMProvider::` keys | P0 | — | Done |
| 3 | FE-3 | Frontend | Let the backend correct the optimistic "provided" flag | P1 | BE-5 (preferred form) | Done |
| 4 | FE-6 | Frontend | Extract the gate logic and cover it with tests | P1 | FE-2, FE-3 | Done |
| 5 | FE-5 | Frontend | Refresh an execution sitting in INIT | P2 | — | Done |
| 6 | FE-4 | Frontend | Let the user change a credential after picking it | P2 | — | Done |
| 7 | FE-7 | Frontend | Signal the missing credential outside the collapsible aside | P2 | — | Done |

Three further frontend tasks are conditional on backend answers and are listed in their own section
at the end. Do not start them speculatively.

## Backend tasks

### BE-1 — Include the authorization fields in the executions groups payload

- **Status:** Done — the groups payload carries the gate fields; pinned by a backend test.
- **Order:** 1 · **Priority:** P0
- **Blocked by:** — · **Blocks:** FE-8
- **Where:** `GET /executions/groups`

The execution the viewer renders does not come from `GET /executions/{id}`. It comes from the groups
list: `tasks-executor.ts` reads the flattened output of `retrieveTaskExecutionGroups()`, and
`mapExecutionGroup` maps each nested execution through `mapExecution`, which spreads the raw object.
So `requiredAuthorizations`, `missingAuthorizationKeys` and `providedAuthorizations` reach the UI only
if the groups endpoint actually sends them.

If they are absent, both halves of the feature fail silently and in the worst possible direction: the
Vault panel never renders, and the start gate — which reads `missingAuthorizationKeys` — unlocks with
no credential provided.

**Done when**

- The nested executions of `/executions/groups` carry `requiredAuthorizations`,
  `missingAuthorizationKeys` and `providedAuthorizations` with the same shape as
  `GET /executions/{id}`.
- A backend test asserts the fields are present on an execution in `CREATED` that requires an external
  provider credential.
- If the fields will not be added, say so explicitly: FE-8 then becomes P0.

### BE-2 — Pin down which secret id the authorizations endpoint expects

- **Status:** Done — one identifier across all three endpoints. Unblocked FE-9.
- **Order:** 2 · **Priority:** P0
- **Blocked by:** — · **Blocks:** FE-9
- **Where:** `POST /vault/secrets`, `GET /secure-retriever/UserSecrets/forProvider/items`, `PUT /executions/{id}/authorizations`

The credential dropdown is filled from the secure-retriever listing, which exposes the id in the
`data` field of each item. A credential the user has just created returns its id from the vault
endpoint instead. Nothing proves the two are the same value, and the `value` sent to the
authorizations endpoint has to be the one the runtime can resolve.

The frontend currently papers over this with a heuristic (`resolveCreatedCredentialId`): it prefers an
id found in the reloaded listing, falls back to a unique label match, then to the created id. That
code exists only because the contract is unconfirmed and should be deleted once it is.

**Done when**

- It is documented that `POST /vault/secrets` → `id` and the retriever's `data` are the same secret
  identifier, and that this is what the authorizations endpoint accepts.
- If they differ, the authorizations endpoint accepts the identifier the listing exposes, and the
  create response is aligned with it.

### BE-5 — Return the updated execution from the authorizations PUT

- **Status:** Done — the PUT answers with the recomputed execution and rejects unresolvable values with a 400. Unblocked FE-3.
- **Order:** 3 · **Priority:** P1
- **Blocked by:** — · **Blocks:** FE-3 (preferred form)
- **Where:** `PUT /executions/{id}/authorizations`

The frontend call already maps the response through `mapExecution`, and the fake implementation
returns the execution with the key removed from `missingAuthorizationKeys`. If the real endpoint does
the same, the UI can replace the execution in its store from the authoritative response and drop the
optimistic client-side flag entirely (see FE-3).

**Done when**

- The 2xx response body is the full updated execution, with `providedAuthorizations` and
  `missingAuthorizationKeys` already recomputed.
- A rejected value returns 4xx with a message the UI can display, and does not report success.

### BE-4 — Guarantee provider identifier parity across endpoints

- **Status:** Done — parity holds by construction and is pinned across every registered provider.
- **Order:** 4 · **Priority:** P1
- **Blocked by:** — · **Blocks:** —
- **Where:** `GET /llm/providers`, `requiredAuthorizations[].provider`

Whether a requirement gets the Vault selector or falls through to the generic authorization control is
decided by a string comparison: the `name` from `/llm/providers` must equal, case aside, the provider
on the requirement (`requirement.provider`, or the second segment of
`LLMProvider::<provider>::authorization`). A display name on one side and an internal key on the other
silently routes the user to the wrong control.

**Done when**

- Both endpoints emit the same provider identifier, and a backend test pins the pair.
- `requiresCredential` is `true` for every provider that needs a user credential and `false` for the
  internal ones.

### BE-3 — Guarantee the credential listing only returns usable credentials

- **Status:** Done — the listing filters server-side and deliberately exposes no `active` flag. Cancelled FE-10.
- **Order:** 5 · **Priority:** P1
- **Blocked by:** — · **Blocks:** FE-10
- **Where:** `GET /secure-retriever/UserSecrets/forProvider/items`

The item descriptor carries no active/enabled flag, unlike `VaultSecret` from `/vault/secrets`, so the
UI cannot filter and assumes every listed credential is usable. If an inactive or expired key can
appear, the user picks it, the PUT returns 400, and the failure surfaces as a generic error under the
select rather than "this key is inactive".

**Done when**

- Either the endpoint filters out unusable credentials server-side — preferred — or it exposes
  `active` in the descriptor meta, and FE-10 is scheduled.

## Frontend tasks

### FE-1 — Bring the two new services into the call/fake pattern

- **Status:** Done — widened to `VaultService` as well, so credential creation is exercisable in fake mode.
- **Order:** 1 · **Priority:** P0
- **Blocked by:** — · **Blocks:** nothing formally, but it is what makes every other task here
  verifiable locally, so it goes first.
- **Where:** `src/app/services/llm-provider/llm-provider.ts`,
  `src/app/services/llm-provider/execution-vault-credentials.ts`,
  `src/environments/environment.development.ts`

Both services inject `HttpClient` directly instead of going through a `*-call.base` abstraction with a
fake, and neither is registered in the development environment alongside `taskExecutionsCallService`
and the others. In fake mode `GET /llm/providers` therefore always fails, the panel parks on its error
branch, and the whole Vault path cannot be exercised without a live backend — even though
`task-executions-call.fake.ts` already ships a fixture whose execution requires
`LLMProvider::testProvider::authorization`.

**Done when**

- `LlmProviderCallServiceBase` + `…Fake` and `ExecutionVaultCredentialsCallServiceBase` + `…Fake`
  exist, following the shape of the existing call services.
- Both are registered in `environment.development.ts`.
- The fake capability list marks `testProvider` as `requiresCredential: true` and the fake listing
  returns at least two credentials for it, so selection, creation and the gate can all be walked
  through in fake mode.

### FE-2 — Never offer a raw API key field for `LLMProvider::` keys

- **Status:** Done, with a deviation: the provider catalog no longer gates the start at all, because an outstanding requirement already does.
- **Order:** 2 · **Priority:** P0
- **Blocked by:** — · **Blocks:** FE-6
- **Where:** `runtimeAuthorizationRequirements` in `task-execution-viewer.ts`,
  `task-execution-inputs-panel.html`

A requirement reaches the Vault selector only once the capability list confirms its provider requires
a credential. Whenever that check cannot be satisfied — the capability request failed, the provider is
absent from the list, or the naming drifted (BE-4) — the requirement falls through to
`runtimeAuthorizationRequirements` and is rendered as a free password field. The user is then invited
to paste the API key itself as the authorization `value`, which is exactly what the Vault indirection
exists to prevent.

The free-text control stays correct for genuine runtime authorizations. It is only wrong for
`LLMProvider::` keys.

**Done when**

- `runtimeAuthorizationRequirements` excludes every requirement whose key starts with
  `LLMProvider::`, regardless of capability state.
- When capabilities are unavailable, the Vault section renders with an explicit error and a retry
  action, and the execution stays blocked.
- The start tooltip explains that state rather than naming a provider.

### FE-3 — Let the backend correct the optimistic "provided" flag

- **Status:** Done in the preferred form — the PUT response replaces the execution and the optimistic flag is gone.
- **Order:** 3 · **Priority:** P1
- **Blocked by:** BE-5 for the preferred form · **Blocks:** FE-6
- **Where:** `providedAuthorizationKeys`, set in `submitAuthorization`, read in
  `missingAuthorizationRequirements`

The flag exists so a satisfied requirement stops blocking the start immediately, without waiting for a
refresh that may never come (see FE-5). It is cleared only when the displayed execution id changes.
So if the backend accepts the PUT with a 2xx but keeps reporting the key in
`missingAuthorizationKeys`, the panel stays hidden and the start button stays unlocked for the rest of
that execution.

**Done when**

- Preferred, once BE-5 lands: `submitAuthorization` uses the execution returned by the PUT to replace
  the entry in the store, and the optimistic flag is removed altogether.
- Otherwise: a key is dropped from the flag map when an execution fetched *after* the PUT resolved
  still lists it as missing, so the backend gets the last word.

### FE-6 — Extract the gate logic and cover it with tests

- **Status:** Done — `buildAuthorizationGate` and `isExecutionStartable` are pure and covered by six cases.
- **Order:** 4 · **Priority:** P1
- **Blocked by:** FE-2, FE-3 — do this after them so the tests are written once, against final
  behaviour · **Blocks:** —
- **Where:** `canStartExecution`, `missingLlmAuthorizationRequirements`,
  `runtimeAuthorizationRequirements` in `task-execution-viewer.ts` →
  `src/app/shared/task-execution-viewer/execution-viewer.utils.ts`

The gate is the point of the feature and nothing asserts it. The component has no spec, and
instantiating it is awkward because the rete editor throws under the test environment, as
`flow-editor.spec.ts` shows. The service layer is covered (`vault.spec.ts`, `llm-provider.spec.ts`,
`execution-vault-credentials.spec.ts`); the decision logic is not.

**Done when**

- Requirement classification and the start predicate are pure functions in
  `execution-viewer.utils.ts`, taking an execution plus a capability list, and the component only
  calls them.
- `execution-viewer.utils.spec.ts` covers: a required external credential blocks the start; providing
  it unblocks; a requirement whose provider has `requiresCredential: false` does not block; a failed
  capability load keeps the execution blocked and never produces a free-text requirement; and
  `requiredAuthorizations` given as an array behaves like the map form.

### FE-5 — Refresh an execution sitting in INIT

- **Status:** Done — a refresh requested during an in-flight one is queued instead of dropped.
- **Order:** 5 · **Priority:** P2
- **Blocked by:** — · **Blocks:** —
- **Where:** `updatePollingState` and `refresh` in
  `src/app/services/task-executions/task-executions.ts`

Polling starts only when some execution is `RUNNING`, so an execution in `CREATED` or `READY` is never
re-fetched on its own. Its only refresh is the one `withRefreshAndErrorHandling` fires after a
mutation, and `refresh()` returns early while another refresh is in flight, so that one can be
dropped. Nothing in the current UI depends on it any more, but a change made to the execution
elsewhere — a global input, a requirement added server-side — stays invisible until the user
reselects it.

**Done when**

- Either the selected execution is polled while in INIT, or a refresh requested during an in-flight
  one is queued instead of discarded.

### FE-4 — Let the user change a credential after picking it

- **Status:** Done — a settled requirement shows provider, credential label and a Change action.
- **Order:** 6 · **Priority:** P2
- **Blocked by:** — · **Blocks:** —
- **Where:** the Vault section in `task-execution-viewer.html`, driven by
  `missingLlmAuthorizationRequirements`

The section renders from the *missing* requirements, so the moment a credential is accepted it
disappears. Between that point and starting the execution there is no way to see which credential is
in use, or to swap it.

**Done when**

- A satisfied requirement stays visible as a compact row: provider, credential label, and a change
  action that reopens the select and re-submits on a new pick.

### FE-7 — Signal the missing credential outside the collapsible aside

- **Status:** Done — banner above the graph, and the play tooltip names the providers.
- **Order:** 7 · **Priority:** P2
- **Blocked by:** — · **Blocks:** —
- **Where:** the `contextAsideOpen` guard in `task-execution-viewer.html`

The Vault section lives inside the context aside. It is open by default, but a user who collapsed it
sees only a disabled play button — with a tooltip naming the provider, which is a hover away rather
than on the page.

**Done when**

- A banner above the graph, in the style of the existing CANCELLED and SUSPENDED notices, names the
  missing provider and opens the aside on the inputs tab when clicked.

## Conditional frontend follow-ups

Start each of these only once its trigger is confirmed.

### FE-8 — Fetch the displayed execution from the single-execution endpoint

- **Status:** Cancelled by BE-1.
- **Trigger:** BE-1 comes back negative — the groups payload will not carry the authorization fields.
- **Priority if triggered:** P0
- **Where:** `tasks-executor.ts`, `retrieveExecution` in `task-executions.ts`

Load the selected execution through `retrieveExecution(id)` and render the viewer from that, keeping
the groups list as the source for the sidebar only.

### FE-9 — Delete the created-credential id heuristic

- **Status:** Done — the heuristic is deleted; the created id goes straight to the submit.
- **Trigger:** BE-2 confirms both endpoints expose the same secret id.
- **Priority if triggered:** P2
- **Where:** `resolveCreatedCredentialId` in `task-execution-viewer.ts`

Remove the helper and pass the created id straight to the authorization submit.

### FE-10 — Filter unusable credentials client-side

- **Status:** Cancelled by BE-3.
- **Trigger:** BE-3 exposes `active` instead of filtering server-side.
- **Priority if triggered:** P1
- **Where:** `normalizeCredentials` in `execution-vault-credentials.ts`,
  `ExecutionVaultCredential` in `models/llm-provider.ts`

Add the flag to the model, drop inactive entries in the mapper, and cover it in
`execution-vault-credentials.spec.ts`.

## Baseline — already implemented

Everything below is done, built and covered by the existing suite. It is the boundary of this
backlog.

- The Vault selector, filtered per provider, and the `PUT /executions/{id}/authorizations` call with
  the requirement key echoed verbatim and the vault secret id as `value`.
- The start gate: `canStartExecution` refuses to start while any requirement is unsatisfied, or while
  the provider capability list is loading or failed.
- **Add credential** stays reachable once the provider already has credentials, so a new key can
  always be created from the execution panel.
- A freshly created credential is applied after the options reload settles, instead of being dropped
  by a guard reading a stale list.
- `providedAuthorizationKeys` is written on a successful PUT, and the filter lives in
  `missingAuthorizationRequirements` so the Vault panel and the runtime authorizations share one
  source of truth.
- The start button's tooltip and aria-label name the provider whose credential is missing.
- Credential save failures render on the form; the shared 400/401/409 copy lives in
  `CREDENTIAL_ERROR_MESSAGES` in `services/vault/vault.ts`; all UI strings are English.
- Service specs: `vault.spec.ts`, `llm-provider.spec.ts`, `execution-vault-credentials.spec.ts`.
