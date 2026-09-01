# Vault credential gate — frontend implementation

Date: 1 September 2026
Frontend status: implemented

This note closes the frontend side of the *Vault Credential Gate* backlog
([vault-credential-gate-tasks.md](vault-credential-gate-tasks.md)), using the answers
given in the backend contract note (`vault-credential-gate-backend-contract-2026-09-01.md`,
supplied by the backend team — not currently committed here).

Build passes, the suite is at 360 passing tests, and the flow was walked through in the
running app in development (fake) mode.

## FE-1 — The credential services follow the call/fake pattern

Three services injected `HttpClient` directly and were absent from the environment
registry, so nothing on this path could be exercised without a live backend. Each now has
a base, an HTTP implementation and a fake, and is registered in both environments:

| Facade | Base | HTTP | Fake |
| --- | --- | --- | --- |
| `LlmProviderService` | `llm-provider-call.base.ts` | `llm-provider-call.ts` | `llm-provider-call.fake.ts` |
| `ExecutionVaultCredentialsService` | `execution-vault-credentials-call.base.ts` | `execution-vault-credentials-call.ts` | `execution-vault-credentials-call.fake.ts` |
| `VaultService` | `vault-call.base.ts` | `vault-call.ts` | `vault-call.fake.ts` |

**Wider than the backlog asked.** The task named only the two LLM services; `VaultService`
was included because credential *creation* goes through it, and without a fake the "add a
new key" half of the feature stayed unreachable locally.

The two fakes share `services/vault/vault-fake-store.ts`, an in-memory vault seeded with
two active `testProvider` credentials, one revoked one, and a `Gemini` one. It reproduces
the server-side rules the backend confirmed under BE-3: the execution listing filters by
owner, by `active` and by provider, and `DELETE` is a soft delete. A credential created
from the assistant panel therefore shows up in the execution picker, as it does against
the real backend.

`CREDENTIAL_ERROR_MESSAGES` moved to `services/vault/credential-error-messages.ts` so the
call service and the assistant can share it without an import cycle through the
environment; `services/vault/vault.ts` re-exports it, so existing imports still resolve.

## FE-2 — A provider key can no longer be paid with a literal value

Classification is now by key prefix: a requirement whose key starts with `LLMProvider::`
always takes the vault path, whatever the provider catalog says or fails to say. It can no
longer fall through to the free-text authorization field, which was inviting the user to
paste the API key itself as the authorization `value`.

**Consequence, and a deviation from the backlog's acceptance criteria.** The catalog no
longer gates the start button. It does not need to: an outstanding requirement blocks the
execution by itself, because the gate reads `missingAuthorizationKeys`. So a failed
`GET /llm/providers` is now a non-blocking notice with a **Retry** action rather than a
hard block, and the same treatment covers a failed credential listing. The execution still
cannot start — for the right reason.

`requiresCredential` is kept for one purpose only: when the catalog is readable and reports
`false` for a provider the execution is nonetheless asking a credential for, the panel says
so instead of hiding the contradiction.

## FE-3 — The gate reopens on the backend's word

Now that BE-5 guarantees the PUT answers with the recomputed `ExecutionView`, the client
uses it: `provideAuthorization` pipes the response into `replaceExecution`, and the
list-wide `refresh()` for that call is gone. The optimistic `providedAuthorizationKeys`
flag has been deleted — the previous failure mode, where a 2xx that the backend still
considered unsatisfied left the start button unlocked for the rest of the execution, no
longer exists.

The 400 reaches the user: `extractHttpErrorMessage` now also reads the RFC 7807 `detail`
field, so the ProblemDetail message the backend writes is what appears under the picker.

## FE-9 — The created-credential heuristic is gone

BE-2 confirmed a single identifier, so `resolveCreatedCredentialId` — which preferred an id
found in the reloaded listing, then a unique label match, then the created id — has been
deleted. A credential created from the panel is submitted with the id the POST returns,
without waiting for the listing to catch up.

## FE-6 — The gate is pure and covered

`buildAuthorizationGate` and `isExecutionStartable` are pure functions in
`execution-viewer.utils.ts`; the component is down to
`canStartExecution = !isSubflowExecution() && isExecutionStartable(execution, gate)`.

`execution-viewer.utils.spec.ts` pins: a required credential blocks the start and providing
it unblocks; a `LLMProvider::` key stays on the vault path with `requiresCredential: null`
when the catalog is unavailable, and never becomes a runtime requirement; a non-credential
authorization (an `HTTPServerCall` header) does go to the literal-value panel;
`requiredAuthorizations` as a map behaves like the array form; unset inputs and a status
outside INIT both keep the execution unstartable.

## FE-5 — A refresh is no longer dropped

`refresh()` queues a follow-up instead of returning early when one is already in flight.
Executions in `CREATED`/`READY` are still not polled, but no mutation's refresh is lost any
more — and the authorization path no longer depends on one at all (FE-3).

## FE-4 — A provided credential stays visible and changeable

A satisfied vault requirement now renders as a compact row: provider, the label of the
credential answering it (resolved from `providedAuthorizations` against the loaded listing,
with a neutral fallback when the value cannot be matched), and a **Change** action that
reopens the select with a freshly reloaded list. **Cancel** returns to the settled row. The
start button stays enabled throughout, because the credential already in force remains
valid until a new one is chosen.

## FE-7 — The gate is visible outside the collapsible aside

A banner above the execution graph, in the style of the existing CANCELLED and SUSPENDED
notices, names the providers whose credential is missing and opens the aside on the inputs
tab. The play button's tooltip and aria-label name them too.

## FE-8, FE-10 — Cancelled

BE-1 confirmed `/executions/groups` carries the gate fields, so there is no reason to
refetch the displayed execution from `GET /executions/{id}`. BE-3 confirmed the credential
listing is filtered server-side and deliberately exposes no `active` flag, so there is
nothing to filter client-side.

## Fake-mode fixes found while verifying

- The `READY` execution `74ec477f-b04e-494c-80cc-968a40527bef` now carries a
  `LLMProvider::testProvider::authorization` requirement, so the whole gate can be walked
  in fake mode. The pre-existing fixture that had one was in `ERROR`, where the start
  button is unreachable anyway.
- `provideAuthorization` in the fake **mutated the execution in place** and returned the
  same object. The reference never changed, so no computed propagated the update and the
  UI stayed stale no matter what the frontend did. It now returns a fresh object, the way
  an HTTP boundary does. Other mutating methods of the fake still mutate in place and have
  the same latent problem — see the follow-ups below.
- The fake now rejects an empty value or a key the execution does not require with a 400
  carrying a `detail`, mirroring the contract BE-5 describes, so the error path is
  exercisable locally.

## Verified in the running app

Development configuration, execution `74ec477f-b04e-494c-80cc-968a40527bef` (`READY`):

| Step | Play | Tooltip | Banner | Picker | Settled row |
| --- | --- | --- | --- | --- | --- |
| initial | disabled | `Missing provider credential: testProvider` | shown | shown | — |
| existing credential picked | enabled | `Start execution` | gone | gone | shown |
| **Change** clicked | enabled | `Start execution` | gone | shown | — |
| new key created in the panel | enabled | `Start execution` | gone | gone | shown, labelled with the new key |

The select offered only the two active `testProvider` credentials; the revoked fixture
credential was correctly absent.

## Follow-ups

Neither is part of this backlog; both are worth a ticket.

- **The assistant panel has the defect this backlog fixed in the execution panel.** In
  `flow-assistant.html` the inline **Add credential** button is still rendered only when
  `!compatibleCredentials().length`, so once a provider has one credential the user cannot
  create another from there. The credentials section lower down the panel is unaffected.
- **In-place mutation in the rest of `task-executions-call.fake.ts`.** Every other mutating
  method returns the same object reference it just mutated, which means fake mode can show
  stale state after an input is saved or an interaction submitted. Only
  `provideAuthorization` was fixed here, to keep this change scoped.
