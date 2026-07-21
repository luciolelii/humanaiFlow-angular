# Piano di implementazione — Bias annotations & Impact experiments

Questo documento traduce lo spec funzionale ricevuto in un piano di task concreto, ancorato ai pattern e ai file già presenti nel progetto. Non è una riscrittura dello spec: dove lo spec dice "fai X", qui si dice "estendi il file Y nel modo Z".

> **Aggiornamento 21 luglio 2026**: le 24 domande poste al backend (§17) hanno tutte risposta in `bias-frontend-api-clarifications-2026-07-21.md`. Il contratto è ora hardenato e definitivo su questi punti; §1-§16 sono stati aggiornati di conseguenza. I cambi più rilevanti rispetto alle ipotesi iniziali: **l'esperimento isolato è asincrono** (job + polling, non risposta diretta col report), **`MOCK_RESPONSE` usa `mockOutputs` tipizzati** e non più `instruction`, la **capability ha anche una variante POST istanza-specifica** (`configurationDependent`), e lo **schema di `BiasImpactReport` ha nomi di campo definitivi** diversi da quelli ipotizzati (`kind` non `experimentType`, `biasedOutputs`/`biasedStatus` non `variantOutputs`/`variantStatus`, nuovo campo `mockedSideEffects[]`). Il vecchio §17 (domande) è stato sostituito da un §17 "Contratto confermato" con i punti chiave per area.

## 0. Punto di partenza reale (non ripartire da zero)

Nel repo esiste già un primo pezzo della feature, che va **esteso**, non duplicato:

- Modello: `BiasAnnotation`, `BiasAnnotationOption`, `BiasAnnotationsDescriptor` in `src/app/models/flow.ts` (righe 89-116). `FlowBlock.biasAnnotations` già presente (riga 120). `FlowContainer` non ha il campo (corretto, i container non supportano bias).
- API: `GET /blocks/bias-annotations/descriptor` già implementata in `src/app/services/blocks/blocks-call.ts` (`retrieveBiasAnnotationsDescriptor`, righe 24-28) con parsing in `biasAnnotationsDescriptorFromApi`.
- Componente editor completo: `src/app/shared/bias-annotations/{bias-annotations.ts,.html,.css,.spec.ts}` — legge il descriptor, costruisce i campi da `x-ui-*`, gestisce CRUD delle annotazioni con modale inline (add/edit/remove), mostra badge category/severity/status/source, mappa errori backend su campo tramite `BIAS_ERROR_CODES` + `serverError(index, field)` (righe ~19-22 e ~159-174).
- Montaggio nel canvas: `<app-bias-annotations>` è già agganciato in `generic-node.html` (non in `container-node.html` — il vincolo "solo blocchi" è già rispettato).
- Pattern di errore campo-per-campo dal backend: `FlowValidationError` + `normalizeFlowValidationErrors()` in `flow.ts` (righe 154-185), popolato da `EditorStateHolder` (`src/app/stores/flow-editor.ts`).
- Rerun (non biased) già esistente: `TaskExecutionsCallService`/facade `src/app/services/task-executions/task-executions.ts` (`rerunExecution`, righe ~69-79), usato da `tasks-executor.ts` (righe ~115-120).

**Cosa manca e va costruito** (oggetto di questo piano): `behavioralProbe` sull'annotazione, endpoint di capability, esperimento isolato, biased rerun full-flow, confronto, report (viewer + lista persistita), badge canvas evoluti, gestione side-effect, stati d'errore dedicati.

Non duplicare: il form engine schema-driven, il pattern di errore per campo, il pattern dialog a signal, il facade a 3 livelli (`base`/reale/`fake`) e il componente `bias-annotations` vanno **riusati e ampliati**, non ricreati.

---

## 1. Modelli TypeScript

**File da modificare:** `src/app/models/flow.ts`
- Estendere `BiasAnnotation` con `behavioralProbe?: BehavioralProbe`.
- Aggiungere:
  ```ts
  export type BiasActivationMode =
    | 'PROMPT_DIRECTIVE' | 'INPUT_TRANSFORMATION' | 'OUTPUT_TRANSFORMATION'
    | 'ROUTING_OVERRIDE' | 'MOCK_RESPONSE' | string;

  export type BehavioralProbe = {
    activationMode?: BiasActivationMode;
    instruction?: string;
    targetInputs?: string[];
    expectedImpact?: string;
    /** Solo per MOCK_RESPONSE: mappa output-name → valore mock, tipizzata su block.outputs.
     *  Contratto confermato (§A.5 delle risposte backend): NON usare più `instruction` come
     *  risposta mock per annotazioni nuove — il backend continua a leggerla solo per compatibilità
     *  con dati salvati prima dell'hardening. */
    mockOutputs?: Record<string, unknown>;
  };
  ```
  (colocati con `BiasAnnotation`, stesso file, stessa logica del dato esistente). Nessun flag `probeConfigured` lato backend: un'annotazione ha probe eseguibile quando `behavioralProbe != null`, ha `activationMode`, e — per tutte le modalità tranne `MOCK_RESPONSE` — `instruction` non vuota, oppure — per `MOCK_RESPONSE` — `mockOutputs` completi. Questa condizione va derivata lato FE (helper `isProbeExecutable(probe)`), non letta da un campo.

**File nuovo:** `src/app/models/bias-impact.ts` — dominio "esperimenti/report", separato da `flow.ts` (che descrive la struttura statica del flow) e da `task-execution.ts` (che descrive l'esecuzione):
- `BiasCapabilities` (`blockType`, `supported`, `isolatedExperimentSupported`, `fullFlowExperimentSupported`, `externalSideEffects`, `configurationDependent`, `activationModes: BiasActivationMode[]`). Tutti i booleani e `activationModes` sono **sempre presenti** (mai assenti, `activationModes` è `[]` quando `supported: false`) — non usare l'assenza di un campo come indicatore.
- `ExternalSideEffectPolicy = 'BLOCK' | 'MOCK' | 'REQUIRE_CONFIRMATION'`.
- `BiasImpactExperimentRequest` (`annotationIds`, `repetitions`, `includeRawOutputs`, `externalSideEffectPolicy`, `confirmExternalSideEffects`).
- `BiasRerunActivation` (`nodeId`, `annotationIds`), `BiasRerunRequest` (`activations`, `externalSideEffectPolicy`, `confirmExternalSideEffects`).
- `BiasExecutionContext` (`experimentId`, `mode`, `activeAnnotationIdsByNode: Record<string,string[]>`, `externalSideEffectPolicy`, `externalSideEffectsConfirmed`).
- `BiasImpactJob` — **nuovo**, la POST dell'esperimento isolato è asincrona (§C, risposta backend #9) e risponde `202` con questo body, da pollare:
  ```ts
  export type BiasImpactJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

  export type BiasImpactJob = {
    id: string;
    status: BiasImpactJobStatus;
    executionId: string;
    stepId: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    reportId: string | null;
    report: BiasImpactReport | null;
    errorCode: string | null;
    errorMessage: string | null;
    terminal: boolean;
  };
  ```
  `report`/`reportId` valorizzati solo in `COMPLETED`; `errorCode`/`errorMessage` solo in `FAILED`. `terminal` distingue lo stato finale senza dover confrontare stringhe di `status` in più punti.
- `BiasImpactReport` — schema definitivo confermato dal backend (§F, risposta #17), nomi di campo **diversi** dalle ipotesi iniziali:
  ```ts
  export type BiasImpactReportKind = 'ISOLATED_STEP' | 'FULL_FLOW';

  export type BiasImpactReport = {
    id: string;
    experimentId: string;
    kind: BiasImpactReportKind;
    baselineExecutionId: string;
    biasedExecutionId: string | null;   // null per ISOLATED_STEP
    nodeId: string | null;              // null in un report full-flow con più nodi biased
    annotationIds: string[];
    repetitions: number;
    createdAt: string;
    rawOutputsIncluded: boolean;
    immediateImpact: BiasImmediateImpact;
    downstreamImpact: BiasDownstreamImpactEntry[];  // normalmente vuoto per un esperimento isolato
    routingChanges: BiasRoutingChangeEntry[];
    mockedSideEffects: BiasMockedSideEffect[];       // nuovo, non previsto nell'ipotesi iniziale
    summary: string;
    warnings: string[];
  };
  ```
  Liste e mappe non sono mai `null` (se `rawOutputsIncluded` è `false`, sono vuote). `changeRate` e `maximumTextDifference` sono sempre numeri, mai `null`.
- `BiasImmediateImpact` (`outputChanged: boolean`, `maximumTextDifference: number`, `changeRate: number`, `baselineOutput: unknown`, `biasedOutputs: unknown[]`) — **non** `variantOutputs` come ipotizzato.
  - `changeRate` = numero di output variant diversi dalla baseline / numero di variant (nel full-flow c'è una sola variant ⇒ vale `0.0` o `1.0`).
  - `maximumTextDifference` = massima distanza di Levenshtein normalizzata (0–1) fra la rappresentazione testuale della mappa baseline e quella di ciascuna mappa variant; anche output non testuali vengono rappresentati come testo per questa metrica — non è una distanza semantica.
- `BiasDownstreamImpactEntry` (`nodeId`, `nodeName`, `baselineStatus`, `biasedStatus`, `changed`, `baselineOutputs`, `biasedOutputs`) — **non** `variantStatus`/`variantOutput`.
- `BiasRoutingChangeEntry` (`nodeId`, `baselineBranch`, `biasedBranch`).
- `BiasMockedSideEffect` — **nuovo** (`nodeId`, `nodeName`, `kind: 'HTTP' | 'MCP_AGENT' | 'MCP_AGENT_CHAT' | 'EXTERNAL'`); riflette anche gli eventi di audit `BIAS_SIDE_EFFECT_MOCKED` nell'esecuzione.
- `BiasImpactReportSummary`: **non confermato** dal backend uno schema "leggero" distinto per la lista — l'unica cosa confermata è che `GET /executions/{executionId}/bias-impact-reports` non è paginato, è ordinato per `createdAt` decrescente e include i report dove l'id richiesto compare come baseline o come variante. Trattare provvisoriamente il tipo di ritorno come `BiasImpactReport[]` e verificare in integrazione se il payload di lista è davvero completo o un sottoinsieme; non introdurre un tipo `Summary` finché non è confermato che i campi differiscono.
- Costanti errori (vedi §3): `BIAS_PROBE_ERROR_CODES`, `BIAS_EXPERIMENT_ERROR_CODES`.

**File da modificare:** `src/app/models/task-execution.ts` — aggiungere `biasExecutionContext?: BiasExecutionContext` a `TaskExecution` (import da `bias-impact.ts`). Campo opzionale ⇒ retrocompatibile con esecuzioni esistenti. Confermato: `rerunOfExecutionId` è valorizzato con l'id della baseline anche per una bias variant; `biasExecutionContext` aggiunge experiment id/modalità/attivazioni/policy ma non sostituisce il lineage ordinario (§D, risposta #14).

---

## 2. API service layer

Seguire lo schema a 3 livelli già in uso (`*-call.base.ts` astratto, `*-call.ts` reale con `HttpClient`, `*-call.fake.ts`, selezione via `environment.ts`, facade pubblico a `signal`).

**Estendere `BlocksCallService`** (dominio "blocchi" — l'endpoint è sotto `/blocks/types/{type}/...`):
- `BlockCallServiceBase` (`src/app/services/blocks/block-call.base.ts`): aggiungere **due** metodi, confermati come livelli distinti dal backend (§B, risposta #7):
  - `retrieveBiasCapabilities(blockType: string): Observable<BiasCapabilities>` → `GET /blocks/types/{type}/bias-capabilities`, vista generale del tipo, cacheabile per tipo/versione backend.
  - `retrieveBiasCapabilitiesForInstance(blockType: string, block: FlowBlock): Observable<BiasCapabilities>` → `POST /blocks/types/{type}/bias-capabilities` con nel body il blocco già configurato; restituisce le capability effettive dell'istanza. **Non cacheabile** (dipende dalla configurazione corrente del blocco).
  - Quando la risposta GET ha `configurationDependent: true`, l'editor probe (§4) **deve** richiamare la POST prima di mostrare le activation mode definitive (caso tipico: Conditional/Switch con o senza LLM configurato).
- `BlocksCallService` (`blocks-call.ts`): implementare entrambe le chiamate, con parsing analogo a `biasAnnotationsDescriptorFromApi`. Cache in-memory solo per la GET, per `blockType` (stesso pattern di `blockTypesCache`), invalidata solo per sessione; la POST non va mai cachata.
- `BlocksCallServiceFake`: risposta finta plausibile per entrambe (inclusa una combinazione con `configurationDependent: true` per esercitare il path POST nei test/demo).
- Facade `src/app/services/blocks/blocks.ts`: esporre entrambi i metodi con lo stesso stile delle altre chiamate (signal cache per la vista di tipo, pass-through per la vista di istanza).

**Estendere `TaskExecutionsCallService`** (dominio "esecuzioni" — tutti gli endpoint sono sotto `/executions/...`, coerente con `rerunExecution` già presente):
- `TaskExecutionsCallServiceBase`: aggiungere
  - `runBiasImpactExperiment(executionId, stepId, request: BiasImpactExperimentRequest): Observable<BiasImpactJob>` → `POST /executions/{executionId}/steps/{stepId}/bias-impact`. **Confermato asincrono** (§C, risposta #9): risponde `202 Accepted` con un `BiasImpactJob`, non con il report. Il ritorno non è più `Observable<BiasImpactReport>`.
  - `getBiasImpactJob(jobId): Observable<BiasImpactJob>` → `GET /executions/bias-impact-jobs/{jobId}` — **nuovo metodo**, per il polling.
  - `createBiasedRerun(executionId, request: BiasRerunRequest): Observable<TaskExecution>` → `POST /executions/{executionId}/bias-rerun`
  - `compareBiasExecutions(baselineExecutionId, biasedExecutionId, includeRawOutputs: boolean): Observable<BiasImpactReport>` → `POST /executions/{baselineExecutionId}/bias-compare/{biasedExecutionId}?includeRawOutputs=...`. Confermato idempotente sulla chiave `(baselineExecutionId, biasedExecutionId, owner, includeRawOutputs)` (§E, risposta #15): richieste ripetute con lo stesso `includeRawOutputs` restituiscono lo stesso report/id; un `includeRawOutputs` diverso produce un report canonico distinto — nessuna gestione client-side di "già esistente", il backend se ne occupa.
  - `listBiasImpactReports(executionId): Observable<BiasImpactReport[]>` → `GET /executions/{executionId}/bias-impact-reports` (non paginato, ordine `createdAt` decrescente — vedi nota su `BiasImpactReportSummary` in §1).
  - `getBiasImpactReport(reportId): Observable<BiasImpactReport>` → `GET /executions/bias-impact-reports/{reportId}`
- Implementare nei tre livelli (`task-executions-call.ts`, `.fake.ts`) seguendo il mapping raw→modello già in uso per `TaskExecution`. La fake di `runBiasImpactExperiment` deve simulare la sequenza `QUEUED → RUNNING → COMPLETED` in più chiamate a `getBiasImpactJob`, non risolvere subito, per esercitare davvero il polling nei test.
- Facade `src/app/services/task-executions/task-executions.ts`: aggiungere i metodi pubblici accanto a `rerunExecution`, stesso stile (`catchError`/`finalize`/`tap` per refresh post-mutazione). Aggiungere:
  - un signal di stato "in corso" dedicato per evitare doppio submit (vedi §5/§6), analogo a `simulateInProgress`;
  - un metodo `pollBiasImpactJob(jobId): Observable<BiasImpactJob>` che incapsula il polling: intervallo 1–2s con backoff fino a 5s, `timeout` breve (10–15s) su ogni singola GET (non sulla durata totale del job — quella non ha un limite lato client, la chiamata LLM sottostante può durare a lungo), si ferma quando `job.terminal === true`. Non implementare il polling ad-hoc nel dialog (§5): un solo punto di verità nel facade.

**Gestione errori specifici** direttamente nel facade (non nell'interceptor globale, che gestisce solo 401/5xx — un 409 passa inalterato). Il body 409 è `application/problem+json` con un contratto applicativo stabile in `errors[]` (`code`, `entity`, `id`, `field`, `message`, `relatedNodeIds`) — confermato in §G, risposta #22. Mappare la risposta 409 di `runBiasImpactExperiment`/`createBiasedRerun` leggendo `errors[0].code` in un errore tipizzato (`{ reason: 'SIDE_EFFECT_BLOCKED' | 'CONFIRMATION_REQUIRED', message }`), così i dialog possono mostrare il messaggio corretto invece del toast generico:
- `BIAS_SIDE_EFFECT_BLOCKED` → `reason: 'SIDE_EFFECT_BLOCKED'` (policy `BLOCK`);
- `BIAS_SIDE_EFFECT_CONFIRMATION_REQUIRED` → `reason: 'CONFIRMATION_REQUIRED'` (`REQUIRE_CONFIRMATION` senza conferma esplicita).

**Regola generale d'integrazione** (dalla nota finale del backend): la UI deve pilotare il controllo di flusso solo su `errors[].code`, mai fare parsing euristico di `detail`/`message`/`summary`/`warnings` — questi restano testo da mostrare.

---

## 3. Validazione ed error handling condiviso

- Estendere la lista di codici gestiti in `bias-annotations.ts` (attualmente `BIAS_ERROR_CODES`) o spostarla in `bias-impact.ts` come costante condivisa. Codici probe già ipotizzati (non smentiti, il backend conferma che i nuovi codici si aggiungono "a quelli già esistenti", §G risposta #23): `BIAS_PROBE_MODE_REQUIRED`, `BIAS_PROBE_INSTRUCTION_REQUIRED`, `BIAS_PROBE_MODE_UNSUPPORTED`, `BIAS_PROBE_TARGET_INPUT_NOT_FOUND`, `DUPLICATE_BIAS_ANNOTATION_ID`, `TOO_MANY_BIAS_ANNOTATIONS`, `BIAS_FIELD_TOO_LONG`. **Confermati e da aggiungere**, specifici dei `mockOutputs` tipizzati: `BIAS_PROBE_MOCK_OUTPUTS_REQUIRED`, `BIAS_PROBE_MOCK_OUTPUT_NOT_FOUND`, `BIAS_PROBE_MOCK_OUTPUT_TYPE_MISMATCH`. Tutti arrivano con lo stesso contratto `errors[]` (`field`/`code`/`entity`/`id`/`message`/`relatedNodeIds`), sfruttabile dal meccanismo di mapping errore→campo già esistente.
- Estendere `serverError(index, field)` in `bias-annotations.ts` per matchare anche path tipo `biasAnnotations[0].behavioralProbe.instruction` e `biasAnnotations[0].behavioralProbe.mockOutputs.<key>` (stesso meccanismo regex, pattern più lungo).
- Riuso di `FlowValidationError`/`normalizeFlowValidationErrors` per tutti gli errori legati al salvataggio del blocco (compreso il probe) — **nessun modello di errore parallelo**.
- **Nuovi codici per esperimento/compare** (non passano per `normalizeFlowValidationErrors`, sono errori di operazione non di validazione form — gestirli nei rispettivi dialog/azioni, §5/§6/§8):
  - esperimento isolato: step non trovato → `404 BIAS_STEP_NOT_FOUND`; baseline non in stato finale → `400 BIAS_BASELINE_NOT_FINAL` (controlli eseguiti prima della creazione del job, quindi arrivano sulla POST iniziale, non durante il polling);
  - compare full-flow: history diversa → `400 BIAS_EXECUTION_HISTORY_MISMATCH`; baseline o variante non finale → `400 BIAS_EXECUTION_NOT_FINAL`; esecuzione indicata come variante che non è una bias variant → `400 BIAS_EXECUTION_NOT_VARIANT`;
  - dettaglio report: `403` = nessun principal autenticato valido; `404 BIAS_REPORT_NOT_FOUND` = report inesistente o non appartenente all'owner autenticato (l'esistenza di report di altri owner non viene mai rivelata — un 404 va mostrato identico in entrambi i casi, non provare a distinguerli in UI).
- Toast (`NotificationService.show`, `src/app/services/notifications/notification.ts`) per esiti brevi: avvio/fine esperimento, creazione rerun, esito compare. Errori di form (probe, esperimento) restano inline, mai solo toast.

---

## 4. Editor annotazioni + Behavioral probe

- **Non creare un nuovo editor annotazioni**: estendere `src/app/shared/bias-annotations/*` esistente.
- **Nuovo componente dedicato** (per rispettare la separazione richiesta in §12 dello spec): `src/app/shared/behavioral-probe-editor/{behavioral-probe-editor.ts,.html,.css,.spec.ts}`, montato dentro la modale di add/edit annotazione già presente in `bias-annotations.html` (righe ~42-72), non un dialog separato.
  - Input: `blockType`, `blockInputs` (da `FlowBlock.inputs`), `blockOutputs` (da `FlowBlock.outputs`, serve per `ROUTING_OVERRIDE`), `probe` (two-way).
  - Al mount, se `blockType` è noto: `BlocksService.retrieveBiasCapabilities(blockType)`. Se la risposta ha `configurationDependent: true` (caso tipico: Conditional/Switch con o senza LLM configurato), richiamare **anche** `retrieveBiasCapabilitiesForInstance(blockType, block)` col blocco corrente e usare quella risposta come definitiva per popolare `activationModes` — la GET da sola non basta in questo caso (§B, risposta #7). Se `supported === false`, mostrare nota informativa ("annotabile ma non può pilotare un esperimento") e disabilitare l'editing del probe (l'annotazione resta comunque salvabile senza probe); `activationModes` sarà `[]` (sempre presente, mai assente).
  - Popolare il select `activationMode` solo con i valori presenti in `activationModes`.
  - Rendering condizionale per modalità:
    - `PROMPT_DIRECTIVE` → textarea `instruction`.
    - `INPUT_TRANSFORMATION` → textarea `instruction` + multiselect `targetInputs` (opzioni = nomi di `blockInputs`) + nota "`${original}` rappresenta il valore originale, unico placeholder supportato; se assente dal template l'istruzione viene anteposta al valore originale". Confermato (§A, risposta #3): su porte `multiple: true` la trasformazione si applica a ogni elemento testuale separatamente, il risultato resta una collezione; elementi non testuali non vengono convertiti né concatenati.
    - `OUTPUT_TRANSFORMATION` → textarea `instruction` (template) + stessa nota su `${original}` e sullo stesso fallback (istruzione anteposta se il placeholder manca).
    - `ROUTING_OVERRIDE` → select singolo sui nomi di `blockOutputs` (branch del Conditional/Switch); `instruction` deve contenere esattamente il nome dell'output/branch selezionato (confermato §A risposta #6, nessun endpoint branch dedicato).
    - `MOCK_RESPONSE` → **non** una textarea su `instruction`. Confermato (§A, risposta #5): un editor chiave/valore per `mockOutputs`, una riga per ogni output di `blockOutputs`, con input tipizzato secondo il tipo dell'output (nome, tipo e cardinalità devono corrispondere). Nessun campo libero: se `blockOutputs` cambia, il set di chiavi visualizzate cambia di conseguenza. `instruction` per questa modalità resta `null`/non usata dal nuovo editor (il backend la legge solo per annotazioni salvate prima dell'hardening — mostrarla in sola lettura se presente su un'annotazione esistente, mai scriverla per annotazioni nuove o modificate).
  - Campo `expectedImpact`: textarea sempre visibile, puramente descrittivo, con nota esplicita "non modifica l'esecuzione".
- In `bias-annotations.html`, nella card di riepilogo di ogni annotazione, aggiungere un indicatore "ha probe eseguibile" (badge extra accanto a category/severity/status/source, stesso stile `.bias-badge`).
- `id` resta omesso lato client per nuove annotazioni (comportamento già presente, verificare che sia mantenuto anche con probe).

---

## 5. Esperimento isolato ("Measure bias impact")

- Punto di innesto azione: dove il blocco è visualizzato in un'esecuzione conclusa — `src/app/shared/nodes/task-step-node/task-step-node.ts` o pannello azioni di `task-execution-viewer.ts`. Condizioni di visibilità: esecuzione baseline in stato finale, blocco con ≥1 annotazione con `behavioralProbe`, `capabilities.isolatedExperimentSupported === true` (richiedere le capability per il `blockType` del nodo, con caching).
- Dialog: seguire il pattern **servizio Injectable a signal + Promise** come `src/app/services/dialogs/node-settings-dialog.ts` (non `MatDialog`, non usato nel progetto). Nuovo file `src/app/services/dialogs/bias-impact-experiment-dialog.ts` + host component `src/app/shared/bias-impact-experiment-dialog/...`, montato in `app.ts` insieme agli altri host dialog.
  - Contenuto: multiselect annotazioni del blocco (solo quelle con probe), stepper ripetizioni 1–10 (default 3), checkbox `includeRawOutputs` (default true), selettore side-effect policy (componente condiviso, vedi §7).
- Stato di submit: signal dedicato (`biasExperimentInProgress`) per bloccare doppio submit e mostrare stato non ambiguo (spinner + testo, non solo disabled), stesso stile di `simulateInProgress`/`startInProgress` in `task-execution-viewer.ts`.
- **Flusso confermato asincrono** (§C, risposta #9 — cambio rispetto all'ipotesi iniziale di risposta diretta col report):
  1. `runBiasImpactExperiment(...)` → `202` con un `BiasImpactJob` in stato `QUEUED`/`RUNNING`.
  2. Il dialog passa il `jobId` al facade `pollBiasImpactJob(jobId)` (§2) e resta in stato "in corso" mostrando `job.status` (testo, non solo spinner: "in coda" / "in esecuzione") finché `job.terminal !== true`.
  3. Su `COMPLETED`: chiudere il dialog e aprire `job.report` nel viewer condiviso (§9) — **non** rifare una `getBiasImpactReport`, il job lo include già.
  4. Su `FAILED`: mostrare `job.errorMessage` inline nel dialog (non un toast generico), con `job.errorCode` disponibile per eventuale distinzione di stato futura.
  5. Se il componente viene chiuso/navigato via prima del completamento, il polling va annullato (unsubscribe) ma il job **resta persistito lato backend** (superstite a un riavvio del servizio) — prevedere che l'utente possa ritrovare il risultato nella lista report (§10) anche se ha chiuso il dialog troppo presto.
- Gestione 409 sulla POST iniziale (side effect bloccato o conferma richiesta, prima ancora che il job venga creato): mostrare l'errore inline nel dialog stesso, non come toast generico (vedi §3/§7). Gestione `404 BIAS_STEP_NOT_FOUND` / `400 BIAS_BASELINE_NOT_FINAL` sulla stessa POST: toast + chiusura dialog (sono precondizioni verificate prima della creazione del job, non richiedono retry via polling).

---

## 6. Biased rerun full-flow ("Create biased rerun")

- Azione nella pagina esecuzione conclusa (`task-execution-viewer.ts` / `tasks-executor.ts`, accanto al rerun normale già esistente).
- Nuovo dialog `src/app/services/dialogs/bias-rerun-dialog.ts` + host, stesso pattern. Contenuto: selezione multipla di blocchi del flow (solo quelli con `fullFlowExperimentSupported` e ≥1 annotazione con probe), per ciascun blocco selezionato multiselect delle sue annotazioni eseguibili, selettore side-effect policy condiviso.
- Costruzione payload: `activations: [{ nodeId, annotationIds }]` da quanto selezionato.
- Chiamata: `TaskExecutionsService.createBiasedRerun(executionId, request)` (nuovo metodo, §2).
- Dopo la creazione: navigare alla nuova esecuzione **riusando esattamente** il flusso di navigazione già usato da `rerunExecution` in `tasks-executor.ts` (righe ~115-120) — stesso query param `executionId`.
- Nella vista della nuova esecuzione, se `execution.biasExecutionContext` è presente:
  - badge "Bias variant";
  - `experimentId` in evidenza;
  - riferimento alla baseline (`rerunOfExecutionId`/baseline id) e alle annotazioni attive (`activeAnnotationIdsByNode`);
  - nessuna modifica al lifecycle di input mancanti/autorizzazioni/avvio: il componente deve limitarsi a *mostrare* il contesto, riusando gli stessi guard (`canStartExecution`, ecc.) già presenti.
- Il frontend non applica mai comportamento biased: nessuna logica di "simulazione" del bias lato client, solo visualizzazione del contesto restituito dal backend.
- Retrocompatibilità: tutto il rendering legato a `biasExecutionContext` deve essere condizionale (`*ngIf`/`@if`) — un'esecuzione senza il campo deve renderizzare esattamente come oggi.

---

## 7. Side effect policy (trasversale a §5 e §6)

- Nuovo componente condiviso di sola presentazione, es. `src/app/shared/side-effect-policy-selector/{...}`, usato sia nel dialog esperimento isolato sia nel dialog rerun (evita duplicazione di markup/logica).
  - Radio/select `BLOCK` (default) / `MOCK` / `REQUIRE_CONFIRMATION`.
  - Se `capabilities.externalSideEffects === true`, mostrare un warning evidente (riuso visivo del pattern `.llm-warning-wrap` già presente in `generic-node.html`, adattato a banner statico invece che hover-tooltip).
  - `MOCK` selezionato → nota informativa "le chiamate HTTP/MCP non verranno realmente invocate".
  - `REQUIRE_CONFIRMATION` selezionato → step di conferma esplicito prima del submit (riusare `src/app/services/dialogs/confirm-dialog.ts`), testo che descrive che verranno effettuate chiamate reali; solo dopo conferma impostare `confirmExternalSideEffects: true` nel payload.
- Gestione 409 sia in `bias-impact-experiment-dialog` sia in `bias-rerun-dialog`: leggere l'errore tipizzato prodotto dal facade (§2) e mostrare messaggio specifico ("side effect bloccati dalla policy" / "conferma richiesta") **mai** un errore generico.

---

## 8. Confronto full-flow ("Compare with baseline")

- Azione visibile su una bias variant quando raggiunge stato finale (`getExecutionStatusGroup(status) === 'FINAL'` e `biasExecutionContext` presente) — stesso punto UI delle altre azioni execution-level in `task-execution-viewer.ts`.
- Chiamata `TaskExecutionsService.compareBiasExecutions(baselineExecutionId, biasedExecutionId, true)`. Confermato idempotente (§E, risposta #15): premere di nuovo "Compare" sulla stessa coppia restituisce lo stesso report/id, quindi non serve un guard client-side contro il doppio click oltre al normale disabled-durante-la-chiamata — non genera duplicati.
- Nessun calcolo di diff lato frontend: il report ricevuto è il contratto canonico, va solo passato al viewer (§9).
- Errori gestiti come da §3: history diversa → `BIAS_EXECUTION_HISTORY_MISMATCH`, non finale → `BIAS_EXECUTION_NOT_FINAL`, non è una variante → `BIAS_EXECUTION_NOT_VARIANT`; messaggio inline dal `detail`/`errors[].message` del backend, nessun calcolo/parsing lato client.

---

## 9. Report viewer (componente riutilizzabile)

Struttura a componenti separati (coerente con §12 dello spec, evita monolite):

- `src/app/shared/json-viewer/{json-viewer.ts,.html,.css,.spec.ts}` — **nuovo**, non esiste nulla di simile nel progetto oggi (l'unico precedente è `stringifyOutputValue` + preview modal testuale in `execution-viewer.utils.ts`/`task-execution-viewer.ts`). Albero collassabile ricorsivo per oggetti/array, riusabile ovunque serva mostrare output strutturati.
- `src/app/shared/bias-output-diff/{...}` — **nuovo**, output baseline e varianti affiancati, con fallback su `json-viewer` per valori complessi e testo semplice per stringhe.
- `src/app/shared/bias-impact-report-viewer/{...}` — **nuovo**, componente "shell" con le sezioni, sui nomi di campo definitivi del contratto (§1/§F):
  - Header: `kind` (`ISOLATED_STEP`/`FULL_FLOW`), `createdAt`, `baselineExecutionId`, `biasedExecutionId` (mostrato solo se non `null` — sempre `null` per `ISOLATED_STEP`), `experimentId`, `nodeId` (può essere `null` in un report full-flow con più nodi biased: in tal caso non mostrare un singolo nodo ma l'elenco derivato da `downstreamImpact`/`routingChanges`), `annotationIds`, `repetitions`, `summary`, `warnings` (sempre visibili, con testo esplicito sulla non-determinismo di LLM/servizi esterni).
  - "Immediate impact": badge `outputChanged`, `changeRate` in percentuale (sempre un numero, mai `null` — nel full-flow vale sempre 0% o 100%), `maximumTextDifference` come valore 0–1 con nota che è una distanza testuale (Levenshtein normalizzata), non semantica, calcolata anche su output non testuali, `bias-output-diff` fra `baselineOutput` e ciascun elemento di `biasedOutputs`.
  - "Downstream impact": tabella/lista da `downstreamImpact[]` (`nodeName`, `nodeId`, `baselineStatus`/`biasedStatus`, `changed`, `bias-output-diff` fra `baselineOutputs`/`biasedOutputs`), toggle "mostra solo i nodi cambiati". Sezione tipicamente vuota per un esperimento isolato (normale, non un bug/errore di caricamento).
  - "Routing changes": da `routingChanges[]` (`nodeId`, `baselineBranch`, `biasedBranch`), rappresentazione visiva della differenza (es. frecce/evidenziazione, niente di complesso — un piccolo componente dedicato o markup inline con classi CSS).
  - "Mocked side effects" — **nuova sezione**, non prevista nell'ipotesi iniziale (§F/§G, risposta #24): lista da `mockedSideEffects[]` (`nodeName`, `nodeId`, `kind` con badge distinti per `HTTP`/`MCP_AGENT`/`MCP_AGENT_CHAT`/`EXTERNAL`), visibile solo quando l'array non è vuoto, con nota che gli stessi eventi sono auditabili nell'esecuzione come `BIAS_SIDE_EFFECT_MOCKED`.
  - Se `rawOutputsIncluded === false`: mostrare una nota che le mappe/liste raw sono vuote per scelta (non un errore di caricamento), invece di renderizzare sezioni vuote senza spiegazione.
- Questo componente è l'unico usato sia per l'esito diretto di un esperimento isolato/rerun (§5/§6/§8) sia per l'apertura di un report persistito (§10) — nessuna duplicazione di viewer.

---

## 10. Report persistiti

- `src/app/shared/bias-impact-report-list/{...}` — **nuovo**, nuova sezione/tab "Bias impact reports" nella pagina di dettaglio esecuzione.
  - Innesto: `task-execution-viewer.ts` ha già un layout a tab (`activeAsideTab = signal<'inputs'|'intermediate'|'logs'|'output'>`) — estendere l'union type con `'bias-reports'` e aggiungere il case corrispondente in `selectAsideTab()`/template.
  - Caricamento: `listBiasImpactReports(executionId)` — funziona sia per baseline sia per variante (nessuna distinzione UI necessaria). Confermato (§F, risposta #20): l'endpoint **non è paginato** (nessun controllo di paginazione da costruire in UI, caricamento in un solo colpo), ordinato per `createdAt` decrescente lato backend (non riordinare lato client), e include i report dove l'id richiesto compare come baseline **o** come variante — chiamandolo sulla baseline si vedono quindi sia i suoi report isolati sia i confronti full-flow con le relative varianti, senza bisogno di chiamate separate.
  - Riga lista: data, `kind` (`ISOLATED_STEP`/`FULL_FLOW`), `summary`, `nodeId` (se non `null`), numero di `annotationIds`, indicatore changed/unchanged (da `immediateImpact.outputChanged`), link al dettaglio.
  - Apertura dettaglio: `getBiasImpactReport(reportId)` → passa il risultato al `bias-impact-report-viewer` (§9). Gestire `404 BIAS_REPORT_NOT_FOUND`/`403` con lo **stesso** stato inline nel viewer ("report non trovato o non accessibile") — il backend non distingue "non esiste" da "non è tuo" per non rivelare l'esistenza di report di altri owner, quindi la UI non deve provare a distinguerli nemmeno visivamente. Nessun redirect silenzioso.

---

## 11. Canvas

- `src/app/shared/nodes/generic-node/{generic-node.ts,.html,.css}` (mai `container-node.*`):
  - Nuovo badge d'angolo (non esiste un sistema badge overlay oggi, solo tooltip hover su errori/warning) che mostra il numero di annotazioni quando `biasAnnotations.length > 0`.
  - Indicatore più marcato (icona/colore diverso) se almeno un'annotazione ha `behavioralProbe`.
  - Tooltip: riuso della tecnica CSS `:hover` già usata per `.llm-warning-tooltip`, contenuto "N annotazioni, severity massima: X".
- Vista esecuzione/variante/report attivo (`task-step-node.ts`, eventualmente `rete-editor.ts` per gli archi):
  - Nuovo stato condiviso leggero (es. `BiasComparisonViewStateService`, `providedIn: 'root'`, un signal col report/variant correntemente "in evidenza") da cui i nodi/archi leggono per sapere se evidenziarsi.
  - Nodi con bias attivo: letti da `execution.biasExecutionContext.activeAnnotationIdsByNode`.
  - Nodi downstream cambiati: da `report.downstreamImpact[].changed`.
  - Archi coinvolti in un cambio di routing: da `report.routingChanges[]`, evidenziati nel layer di connessione di `rete-editor.ts`.
  - Azione esplicita "torna alla vista normale" che resetta lo stato condiviso.
  - Piccola legenda vicino alla toolbar del canvas quando lo stato di evidenziazione è attivo (mai colore/semantica implicita senza spiegazione).

---

## 12. Stati ed error handling — checklist di verifica trasversale

Da verificare esplicitamente componente per componente (non un task a sé, ma criterio di accettazione per ciascuna feature sopra):

| Stato | Dove | Trattamento |
|---|---|---|
| Caricamento descriptor/capability | editor annotazioni, editor probe | spinner/skeleton, non bloccare tutta la pagina |
| Capability istanza-specifica (`configurationDependent: true`) | editor probe | fetch POST aggiuntivo prima di mostrare le activation mode definitive, spinner sul select nel frattempo |
| Capability non supportata | editor probe | nota informativa, non errore |
| Baseline non conclusa | azione "Measure bias impact" | azione disabilitata + tooltip motivazione |
| Step non trovato (`BIAS_STEP_NOT_FOUND`) | esperimento isolato | toast + chiusura dialog |
| Job `QUEUED`/`RUNNING` | esperimento isolato | polling in corso, stato testuale esplicito (non solo spinner), submit bloccato |
| Job `FAILED` | esperimento isolato | `errorMessage` inline nel dialog, non toast generico |
| Annotazione senza probe | multiselect esperimento | esclusa/disabilitata dalla selezione |
| Side effect bloccato (`BIAS_SIDE_EFFECT_BLOCKED`, 409) | entrambi i dialog | messaggio inline specifico, non toast generico |
| Conferma richiesta (`BIAS_SIDE_EFFECT_CONFIRMATION_REQUIRED`, 409) | entrambi i dialog | step di conferma esplicito, non errore bloccante |
| Variant non conclusa (`BIAS_EXECUTION_NOT_FINAL`) | azione "Compare with baseline" | azione disabilitata + tooltip |
| Baseline/variant history diverse (`BIAS_EXECUTION_HISTORY_MISMATCH`) | compare | messaggio inline dal backend, non calcolato lato client |
| Esecuzione non è una variante (`BIAS_EXECUTION_NOT_VARIANT`) | compare | messaggio inline dal backend |
| Report non trovato/accessibile (`404 BIAS_REPORT_NOT_FOUND` o `403`) | report viewer/list | stesso stato inline nel viewer per entrambi i casi (il backend non li distingue apposta) |
| `mockedSideEffects` non vuoto | report viewer | sezione dedicata visibile, mai solo un warning generico |
| Timeout/errore rete | tutte le chiamate nuove (incluso il polling) | toast + possibilità di retry; sulla singola GET di polling, un timeout non deve interrompere il ciclo — ritentare al prossimo intervallo |

---

## 13. Struttura file (riepilogo)

```
src/app/models/
  flow.ts                        (esteso: BehavioralProbe, BiasActivationMode)
  bias-impact.ts                 (nuovo: capabilities, experiment, report, execution context)
  task-execution.ts              (esteso: biasExecutionContext)

src/app/services/blocks/
  block-call.base.ts             (esteso: retrieveBiasCapabilities GET + retrieveBiasCapabilitiesForInstance POST)
  blocks-call.ts / .fake.ts       (esteso)
  blocks.ts                       (esteso, facade)

src/app/services/task-executions/
  task-executions-call.base.ts   (esteso: 6 nuovi metodi, incluso getBiasImpactJob per il polling)
  task-executions-call.ts/.fake.ts (esteso; fake simula QUEUED→RUNNING→COMPLETED su più poll)
  task-executions.ts              (esteso, facade + signal stato in-progress + pollBiasImpactJob)

src/app/services/dialogs/
  bias-impact-experiment-dialog.ts   (nuovo)
  bias-rerun-dialog.ts               (nuovo)

src/app/services/bias/
  bias-comparison-view-state.ts      (nuovo, stato evidenziazione canvas)

src/app/shared/
  bias-annotations/                  (esteso: badge probe, error codes)
  behavioral-probe-editor/           (nuovo)
  side-effect-policy-selector/       (nuovo)
  bias-impact-experiment-dialog/     (nuovo, host component)
  bias-rerun-dialog/                 (nuovo, host component)
  bias-impact-report-viewer/         (nuovo)
  bias-impact-report-list/           (nuovo)
  bias-output-diff/                  (nuovo)
  json-viewer/                       (nuovo)
  nodes/generic-node/                (esteso: badge canvas)
  nodes/task-step-node/               (esteso: azioni esperimento/compare, evidenziazione)
  task-execution-viewer/              (esteso: tab report, azioni, badge variant)
  rete-editor/ / utilities/rete-editor.ts (esteso: evidenziazione archi)

app.ts                               (esteso: montaggio nuovi dialog host)
```

---

## 14. Ordine di implementazione consigliato (dipendenze)

- [x] 1. Modelli (§1) — blocca tutto il resto.
- [x] 2. API service layer (§2) + error handling condiviso (§3).
- [x] 3. Behavioral probe editor (§4) — dipende solo da 1-2, sbloccabile e testabile in isolamento.
- [x] 4. `json-viewer` + `bias-output-diff` + `bias-impact-report-viewer` (§9) — componenti "foglia", nessuna dipendenza da esperimenti/rerun, si possono sviluppare in parallelo al punto 3 con dati mock.
- [x] 5. Esperimento isolato (§5) + side-effect selector (§7) — dipende da 2 e da 4 (apre il viewer al termine).
- [x] 6. Biased rerun full-flow (§6) — dipende da 2 e 7, riusa 4 per la visualizzazione del contesto.
- [ ] 7. Confronto (§8) — dipende da 2, 4, 6 (serve una variant conclusa).
- [ ] 8. Report persistiti (§10) — dipende da 2, 4.
- [ ] 9. Canvas (§11) — dipende da 1 (modello) e può procedere in parallelo dal punto 3 in poi; l'evidenziazione avanzata dipende da 6/7/8 (serve un report/contesto reale da mostrare).
- [ ] 10. Checklist stati/errori (§12) — verifica trasversale finale su tutte le feature.
- [ ] 11. Test (vedi §15) — scritti insieme a ciascun punto, non solo alla fine.
- [ ] 12. Build/lint/test complessivi.

---

## 15. Test

Seguire convenzioni esistenti: **Vitest** + `TestBed`, spec co-locati, `HttpTestingController` per i service `-call`, mock via `vi.fn()`/signal fittizi (vedi `bias-annotations.spec.ts`, `blocks-call.spec.ts`, `blocks.spec.ts` come riferimento diretto).

- Service: test per ognuno degli 8 nuovi metodi API (`retrieveBiasCapabilities`, `retrieveBiasCapabilitiesForInstance`, `runBiasImpactExperiment`, `getBiasImpactJob`, `createBiasedRerun`, `compareBiasExecutions`, `listBiasImpactReports`, `getBiasImpactReport`) — verificare URL, metodo HTTP, payload, mapping risposta, mapping errore 409. Test dedicato per `pollBiasImpactJob` (facade): sequenza `QUEUED → RUNNING → COMPLETED` con fake timer, verifica che si fermi su `terminal: true` e che un timeout su una singola GET non interrompa il ciclo.
- Componenti: `behavioral-probe-editor` (rendering condizionale per ogni `activationMode` incluso l'editor `mockOutputs` per `MOCK_RESPONSE`, nota `${original}`, capability non supportata, fetch POST quando `configurationDependent: true`), `bias-impact-experiment-dialog` (validazione, doppio-submit guard, polling job con stato `QUEUED`/`RUNNING`/`FAILED`, gestione 409 sulla POST iniziale) e `bias-rerun-dialog` (validazione, doppio-submit guard, gestione 409), `bias-impact-report-viewer` (rendering di tutte le sezioni coi nomi di campo definitivi — `kind`, `biasedOutputs`, `biasedStatus`, `mockedSideEffects` — percentuali, badge), `bias-impact-report-list` (loading/empty/error, nessuna paginazione), `json-viewer` (expand/collapse), badge canvas su `generic-node` (presente solo su blocchi, non su container).
- Estendere `bias-annotations.spec.ts` esistente con i nuovi codici errore e la sotto-sezione probe.
- Almeno un test "flusso API principale" end-to-end a livello di facade (annotazione con probe → capability → esperimento isolato → apertura report), con i `-call.fake.ts` o mock, per soddisfare il criterio di accettazione relativo.
- Chiudere con `ng lint`, `ng test`, `ng build` (comandi standard del progetto) prima di considerare il lavoro completo.

---

## 16. Criteri di accettazione (checklist finale, da spec §13)

- [ ] Categorie e activation mode provengono dal backend (nessun hardcoding).
- [ ] Un blocco può avere più annotazioni.
- [ ] Il form del probe cambia dinamicamente in base alla modalità.
- [ ] Le capability impediscono combinazioni non supportate.
- [ ] È possibile lanciare un esperimento isolato, con polling del job asincrono fino a `COMPLETED`/`FAILED` e apertura del report al termine.
- [ ] `MOCK_RESPONSE` usa l'editor `mockOutputs` tipizzato, non una textarea su `instruction`.
- [ ] È possibile creare e avviare un full-flow biased rerun.
- [ ] I side effect richiedono la policy prevista (default BLOCK, warning se `externalSideEffects: true`, conferma esplicita per REQUIRE_CONFIRMATION).
- [ ] Baseline e variant possono essere confrontate.
- [ ] I report persistiti sono consultabili (lista + dettaglio).
- [ ] Il canvas distingue nodi annotati, nodi con bias attivo, nodi downstream modificati, archi coinvolti in cambi di routing.
- [ ] Nessun container presenta controlli bias (badge o editor).
- [ ] Loading, empty state ed errori sono gestiti per ogni chiamata nuova (vedi tabella §12).
- [ ] Test unitari dei componenti nuovi/estesi + test del flusso API principale.
- [ ] `ng lint`, `ng test`, `ng build` passano.
- [ ] Retrocompatibilità verificata: flow/esecuzioni senza `biasAnnotations`/`biasExecutionContext` si comportano esattamente come oggi.

## 17. Contratto confermato dal backend (21 luglio 2026)

Fonte: `bias-frontend-api-clarifications-2026-07-21.md`. Le 24 domande poste in origine (elenco storico rimosso da qui, sostituito da questo riepilogo) hanno tutte risposta; i dettagli tecnici sono già incorporati in §1-§16. Riepilogo per area, con solo le decisioni che cambiano qualcosa rispetto all'ipotesi iniziale segnalate come tali:

### A. Descriptor annotazioni e behavioral probe
- Descriptor globale confermato; compatibilità runtime va presa dal capability endpoint (§B), non dal descriptor.
- Nessun flag `probeConfigured`: eseguibilità derivata lato FE da `behavioralProbe != null` + `activationMode` + (`instruction` non vuota, o `mockOutputs` completi per `MOCK_RESPONSE`).
- `targetInputs` su porte multiple: trasformazione applicata elemento per elemento, risultato resta collezione; elementi non testuali non convertiti.
- Unico placeholder: `${original}`, sia in `INPUT_TRANSFORMATION` sia in `OUTPUT_TRANSFORMATION`; se assente, l'istruzione viene anteposta al valore originale.
- **Cambio rispetto all'ipotesi**: `MOCK_RESPONSE` non usa `instruction` come risposta simulata, usa `behavioralProbe.mockOutputs` (mappa tipizzata su `block.outputs`). `instruction` resta letta dal backend solo per compatibilità con dati pre-hardening.
- `ROUTING_OVERRIDE`: opzioni da `block.outputs`, nessun endpoint branch dedicato; `instruction` = nome esatto dell'output/branch.

### B. Capability endpoint
- **Cambio rispetto all'ipotesi**: esistono due livelli, non uno solo — `GET /blocks/types/{type}/bias-capabilities` (vista di tipo, cacheabile) e `POST /blocks/types/{type}/bias-capabilities` (vista di istanza, blocco configurato nel body). Quando `configurationDependent: true` la UI deve usare la POST prima di mostrare le activation mode definitive (es. Conditional/Switch con o senza LLM).
- `supported: false` ⇒ `activationModes` sempre presente e sempre `[]`; tutti gli altri booleani sempre presenti.

### C. Esperimento isolato
- **Cambio rispetto all'ipotesi**: la POST è **asincrona**, risponde `202` con un `BiasImpactJob`, non con il report. Polling su `GET /executions/bias-impact-jobs/{jobId}` ogni 1-2s con backoff a 5s; timeout HTTP breve (10-15s) sulla singola chiamata, non sulla durata del job. Job persistiti e rimessi in coda dopo un riavvio del servizio.
- Report persistito automaticamente al completamento del job.
- I rilanci isolati si accumulano (job/experiment/report distinti per ogni POST), non si sovrascrivono.
- Errori pre-job: `404 BIAS_STEP_NOT_FOUND` (step non trovato), `400 BIAS_BASELINE_NOT_FINAL` (baseline non in stato finale).

### D. Biased rerun full-flow
- Lifecycle identico a un rerun normale, confermato senza differenze.
- `rerunOfExecutionId` valorizzato anche per la bias variant; `biasExecutionContext` aggiunge experiment id/modalità/attivazioni/policy senza sostituire il lineage.

### E. Confronto full-flow
- **Cambio rispetto all'ipotesi**: confermato idempotente sulla chiave `(baselineExecutionId, biasedExecutionId, owner, includeRawOutputs)` — ripetere la richiesta restituisce stesso report/id; `includeRawOutputs` diverso produce un report canonico distinto.
- Errori: `400 BIAS_EXECUTION_HISTORY_MISMATCH` (history diversa), `400 BIAS_EXECUTION_NOT_FINAL` (non finale), `400 BIAS_EXECUTION_NOT_VARIANT` (non è una bias variant).

### F. Report — forma dati e persistenza
- **Cambio rispetto all'ipotesi**: schema definitivo di `BiasImpactReport` con nomi di campo diversi da quelli ipotizzati — vedi §1 per lo schema completo (`kind`, `biasedOutputs`, `biasedStatus`, nuovo `mockedSideEffects[]`).
- `changeRate` = variant diverse dalla baseline / totale variant (full-flow: sempre 0.0 o 1.0). `maximumTextDifference` sempre un double 0-1, mai `null`, è Levenshtein normalizzata sulla rappresentazione testuale (non una distanza semantica).
- Lista report (`GET /executions/{executionId}/bias-impact-reports`): non paginata, ordinata per `createdAt` decrescente, include i report dove l'id compare come baseline o come variante.
- Dettaglio report: `403` = nessun principal autenticato; `404 BIAS_REPORT_NOT_FOUND` = non esiste o non è dell'owner (indistinguibili di proposito, per non rivelare report di altri owner).

### G. Errori e side effect
- 409 in `application/problem+json` con contratto stabile `errors[]` (`code`/`entity`/`id`/`field`/`message`/`relatedNodeIds`): `BIAS_SIDE_EFFECT_BLOCKED` (policy `BLOCK`), `BIAS_SIDE_EFFECT_CONFIRMATION_REQUIRED` (conferma mancante).
- Errori di validazione probe sullo stesso contratto `errors[]`; nuovi codici per i mock tipizzati: `BIAS_PROBE_MOCK_OUTPUTS_REQUIRED`, `BIAS_PROBE_MOCK_OUTPUT_NOT_FOUND`, `BIAS_PROBE_MOCK_OUTPUT_TYPE_MISMATCH`.
- **Cambio rispetto all'ipotesi**: i side effect mockati non restano un warning generico — il report ha `mockedSideEffects[]` tipizzato (`nodeId`, `nodeName`, `kind` ∈ `HTTP`/`MCP_AGENT`/`MCP_AGENT_CHAT`/`EXTERNAL`), auditabile anche come evento `BIAS_SIDE_EFFECT_MOCKED` nell'esecuzione.

**Regola di integrazione (dalla nota finale del backend)**: il frontend deve usare `errors[].code` per il controllo di flusso, i capability endpoint per costruire le opzioni, e il report come fonte canonica del confronto. `detail`, `summary` e `warnings` sono testi da mostrare, mai valori su cui basare logica applicativa.
