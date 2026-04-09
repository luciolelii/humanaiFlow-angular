# Guida Utente HumAIn Flow

## Introduzione

HumAIn Flow e un'applicazione web per progettare, validare ed eseguire workflow composti da blocchi logici, connessioni dati e dipendenze di esecuzione.

L'app supporta due modi principali di lavoro:

- costruzione manuale del flow nell'editor visuale
- generazione o modifica del flow tramite assistente

Una volta creato il flow, puoi salvarlo, controllarne gli errori di validazione ed eseguirlo nel tab `Tasks`.

## Accesso all'applicazione

Dopo il login entri nella schermata principale. La barra superiore contiene:

- `Editor`: area in cui si progettano i flow
- `Tasks`: area in cui si consultano ed eseguono le istanze dei flow
- menu utente: operazioni personali come cambio password

Se il tuo account ha accesso ad aree aggiuntive, queste compaiono nel menu utente. Questa guida si concentra sull'uso standard dell'editor e delle esecuzioni.

## Struttura generale dell'interfaccia

### Editor

Nel tab `Editor` trovi tre aree principali:

- pannello sinistro con elenco di `Blocks` e `Containers`
- canvas centrale del workflow
- pannello destro con `Assistant` ed eventuali `Errors`

### Tasks

Nel tab `Tasks` trovi:

- lista delle esecuzioni nella colonna sinistra
- dettaglio della singola esecuzione nella parte centrale

## Concetti base

### Flow

Un flow e la definizione del workflow. Contiene:

- blocchi
- container
- connessioni dati
- dipendenze di esecuzione

### Block

Un block rappresenta un singolo step del workflow. Alcuni esempi tipici:

- blocchi LLM
- blocchi di input o output
- blocchi di interazione umana
- blocchi condizionali

### Container

Un container contiene un `subFlow`, cioe un flow annidato. Serve per raggruppare una parte del workflow in un'unita riutilizzabile o piu leggibile.

Un container senza `subFlow` e considerato incompleto.

### Connessioni dati

Le connessioni standard collegano:

- un output sorgente
- a un input destinazione

Servono per trasferire valori tra nodi.

### Dipendenze di esecuzione

Le dipendenze non trasferiscono dati. Impongono solo un ordine di esecuzione.

Le label visibili sui nodi sono:

- `Depends on`: questo nodo deve aspettare un altro nodo
- `Prerequisite of`: questo nodo sblocca l'esecuzione di un altro

Usa una dependency quando vuoi garantire l'ordine corretto tra due step, ma senza passare un valore in input.

## Creare un flow manualmente

### 1. Aprire l'editor

Vai nel tab `Editor`. Se non hai un flow aperto puoi:

- crearne uno nuovo
- usare l'assistente per generarlo

### 2. Aggiungere blocchi o container

Dal pannello sinistro:

- cerca il tipo di blocco o container
- trascinalo nel canvas

Se il catalogo non e ancora pronto, vedrai un loader al posto del messaggio vuoto.

### 3. Spostare e organizzare i nodi

Puoi:

- trascinare i nodi nel canvas
- selezionare e spostare nodi
- clonare un nodo con l'icona di clone
- eliminare un nodo con l'icona di delete

Quando elimini un nodo, vengono rimosse anche:

- le connessioni dati collegate
- le dependency edges collegate

### 4. Collegare i nodi

Per passare dati:

- collega un output a un input

Per imporre solo ordine di esecuzione:

- collega `Prerequisite of` del nodo sorgente
- a `Depends on` del nodo destinazione

Le connessioni di dependency sono visualizzate in modo diverso dalle connessioni dati, con linea piu fine e tratteggiata.

### 5. Modificare il nome dei nodi

Per i blocchi e i container:

- clicca l'icona matita accanto al nome
- modifica il nome
- conferma con `Save`

### 6. Configurare i parametri

Cliccando su un nodo puoi vedere i suoi parametri.

Per i campi editabili:

- usa il pulsante matita sui parametri
- modifica il valore nel dialog
- salva

Per i testi lunghi:

- se il campo e lungo viene troncato
- puoi aprirlo per intero con l'icona occhio

Nel caso dei subflow in sola lettura, i campi lunghi mantengono comunque l'icona occhio per una lettura completa in readonly.

## Lavorare con i container

### Inserire un subflow

Un container puo ricevere un subflow in piu modi:

- importando un flow
- trascinando dentro una selezione di nodi

Quando un subflow viene sostituito:

- la configurazione strutturale del container viene ricostruita
- i vecchi parametri del subflow precedente non vengono mantenuti

### Importare un flow nel container

Se il tipo di container lo supporta:

- clicca `Import flow`
- scegli il flow disponibile
- conferma

### Visualizzare il subflow

Se il container contiene un subflow:

- compare il pulsante `View Flow`
- si apre una finestra di anteprima in sola lettura

Da questa vista puoi:

- esplorare il subflow
- aprire i parametri lunghi in readonly con l'icona occhio

## Parametri obbligatori e validazione locale

Se un nodo ha parametri mancanti, compare un indicatore di warning.

Per i blocchi il warning mostra i campi obbligatori mancanti.

Per i container:

- se manca il `subFlow`, viene mostrato solo `Subflow`
- non vengono mostrati come mancanti i campi interni del `FlowData` come `Blocks`, `Connections` o `Dependencies`

Inoltre i campi tecnici di tipo non vengono mostrati come parametri utente. Questo include campi come:

- `type`
- `typeName`
- `containerType`
- `configurationType`
- `configurationClass`

## Uso dell'assistente

L'assistente si trova nel pannello destro dell'editor.

### Modalita create e refine

L'assistente cambia comportamento in base allo stato del flow aperto:

- se non c'e nessun flow aperto, oppure il flow aperto e vuoto, l'assistente lavora in modalita `Create`
- se il flow aperto contiene gia nodi o connessioni, l'assistente lavora in modalita `Refine`

Questo significa che un flow vuoto non blocca la creazione assistita.

### Cosa puoi chiedere all'assistente

Esempi tipici:

- creare un flow da zero
- modificare un flow esistente
- spiegare un flow
- aiutare a correggere problemi di validazione

### Risultato dell'assistente

Quando l'assistente restituisce un draft:

- il flow viene caricato nell'editor
- puoi continuare a modificarlo manualmente
- puoi salvarlo come un flow normale

## Salvataggio del flow

Quando lavori nell'editor, il flow puo essere modificato ma non ancora salvato.

### Salvataggio

Usa il pulsante `Save` nella toolbar del flow.

Il save:

- aggiorna il flow sul backend
- ricalcola la validazione quando necessario

### Rinominare il flow

Il titolo del flow usa azioni esplicite:

- `Save`
- `Cancel`

Non viene piu salvato automaticamente al blur del campo.

## Pannello errori di validazione

Nel pannello destro c'e un'icona dedicata agli errori del flow.

### Quando compare

L'icona:

- e sempre visibile nella rail destra
- e disabilitata se non ci sono errori
- si attiva quando il flow ha errori di validazione

### Come vengono caricati gli errori

Gli errori vengono richiesti dal backend:

- dopo il save, se il flow non e `EXECUTABLE`
- anche all'apertura di un flow gia `DRAFT`

### Cosa mostra il pannello errori

Per ogni errore vengono mostrati:

- codice
- messaggio leggibile

I metadati troppo rumorosi come `entity`, `field` e `id` non vengono mostrati nella card.

### Evidenziazione dei nodi

Se l'errore include nodi correlati:

- questi nodi vengono evidenziati nel canvas

### Validazione stale

Se fai una modifica strutturale senza salvare ancora, il pannello errori mostra un avviso:

- `Validation will be recomputed after save.`

Gli spostamenti puramente grafici dei nodi non contano come modifica strutturale.

## Published e Finalized

Se sei il proprietario del flow puoi vedere due controlli nella toolbar:

- `Published`
- `Finalized`

### Published

Controlla la visibilita del flow.

Puoi:

- pubblicare
- depubblicare

### Finalized

Segna il flow come definitivo e non piu modificabile.

Una volta finalizzato:

- il contenuto del flow diventa read-only
- il flow non puo essere un-finalized
- il flow non puo essere cancellato
- il publish/depublish resta comunque disponibile

## Eseguire un flow

Quando un flow e valido ed eseguibile, puoi usare `Execute`.

### Cosa succede al click su Execute

L'app:

- apre subito il tab `Tasks`
- crea l'esecuzione in background
- mostra un loader finche la nuova execution non e pronta

Questo evita il ritardo percepito prima del cambio tab.

## Lavorare nel tab Tasks

Nel tab `Tasks` hai una lista di esecuzioni sulla sinistra e il dettaglio a destra.

### Lista delle esecuzioni

Ogni elemento mostra:

- nome
- stato
- data/ora
- eventuale badge `Simulated`

### Dettaglio di una esecuzione

Nel dettaglio puoi:

- vedere il grafo in sola lettura
- controllare input richiesti
- leggere output e log
- eseguire azioni come start, simulate, cancel o resume se disponibili

## Input delle esecuzioni

Se un execution step richiede input manuali, li trovi nel pannello dedicato.

### Modalita di salvataggio degli input

Gli input non vengono piu inviati automaticamente on blur.

Ora il comportamento e:

- modifichi il valore
- il draft resta locale
- premi `Save` per inviarlo

Questo vale anche per campi multipli.

## Blocchi Human Interaction

I blocchi di interazione umana possono richiedere conferma o inserimento manuale.

### Dialog di interazione

Quando il nodo lo richiede, si apre un dialog dedicato.

Nel caso non-chat puoi:

- confermare l'input corrente
- modificare la risposta
- inviare con `Send Output`

Nel caso chat puoi:

- continuare la conversazione
- inviare una risposta finale

### Invio reale al backend

I pulsanti di invio effettuano una chiamata reale al backend. In particolare:

- `Send Output`
- `Confirm Input`
- invio messaggi chat
- invio risposta finale

passano attraverso l'endpoint di interaction dell'esecuzione.

## Visualizzazione dei task node

Nel viewer di esecuzione:

- i container mostrano il pulsante `View Subflow`
- le dependency ports vengono mostrate solo se effettivamente connesse
- i testi lunghi possono essere aperti in readonly

Se un prompt o un parametro contiene placeholder:

- quando il valore runtime e disponibile, il preview puo mostrarlo risolto
- se il valore non e ancora pronto, il placeholder originale resta visibile

## Output delle esecuzioni

Gli output sono raggruppati per nodo.

### Struttura della vista output

Per ogni nodo trovi:

- titolo del nodo
- elenco dei singoli output

Se un output supera la lunghezza prevista:

- viene troncato
- puoi aprirlo interamente con l'icona occhio

### Output array

Se la response e un array:

- non viene mostrata come blob unico
- viene espansa in entry separate, come `Item 1`, `Item 2`, eccetera

## Logs delle esecuzioni

Nel tab dei log:

- il contenuto scorre automaticamente in basso durante il refresh
- viene mostrato il testo leggibile
- il blocco JSON raw dei dettagli non viene piu visualizzato

## Caricamento di blocchi, container e schemi

### Catalogo blocchi e container

Nel pannello sinistro:

- se il catalogo e in caricamento, compare un loader
- non viene mostrato `No blocks found` o `No containers found` durante il fetch iniziale

### Caricamento schema del nodo

Se clicchi un nodo e lo schema non e ancora disponibile:

- il nodo mostra un loader (`Loading block...` o `Loading container...`)
- il click puo forzare un retry del caricamento

Questo e utile quando i type descriptor arrivano in cache solo dopo il mount del nodo.

## Connessioni e selezione

Le connessioni, sia dati sia dependency, possono essere selezionate.

Quando una connessione e selezionata:

- viene evidenziata
- compare l'icona `x` per eliminarla
- puoi anche usare `Delete` o `Backspace`

Cliccando nel vuoto del canvas:

- la connessione viene deselezionata

## Suggerimenti pratici

- salva spesso dopo modifiche strutturali
- controlla il pannello errori prima di eseguire
- usa `Connections` per passare dati e `Dependencies` solo per imporre ordine
- usa i container per isolare parti riutilizzabili del flow
- se un nodo sembra incompleto, controlla i parametri mancanti prima di eseguire
- se un testo e troncato, usa l'icona occhio invece di allargare il nodo

## Problemi comuni

### Vedo un loader invece dei blocchi nella sidebar

Il catalogo blocchi o container e ancora in caricamento. Attendi che il backend restituisca i type descriptor.

### Un nodo sembra vuoto quando lo apro

Lo schema del tipo potrebbe non essere ancora disponibile. Cliccando il nodo l'app puo ritentare automaticamente il caricamento.

### Un container risulta incompleto

Verifica che abbia un `Subflow`. Un container senza subflow viene considerato mancante.

### Il flow resta DRAFT dopo il save

Apri il pannello errori di validazione. Il flow puo essere stato salvato ma non essere ancora eseguibile.

### Non vedo una risposta intera nei task

Se il valore e lungo o e stato troncato, usa l'icona occhio per aprire il contenuto completo in readonly.

## Conclusione

HumAIn Flow permette di lavorare sia in modo visuale sia assistito. Il percorso tipico consigliato e:

1. creare o aprire un flow
2. costruirlo manualmente o con l'assistente
3. salvare
4. correggere eventuali errori di validazione
5. eseguire il flow dal tab `Tasks`
6. monitorare input, output e log fino al completamento

Se vuoi distribuire questa guida agli utenti finali, puoi condividerla direttamente come documento markdown oppure convertirla in PDF o pagina documentazione interna.
