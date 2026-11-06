# matteOS

Apri **Task** nella barra laterale di T3 e scegli il progetto. Kanban e Lista mostrano gli stessi task. La lista segue la priorità della roadmap. Dal dettaglio puoi cambiare la priorità, mentre trascinare una scheda fra colonne modifica il suo stato.

Per concentrarti sulla Kanban puoi chiudere la sidebar a sinistra e la chat a destra, indipendentemente. Su desktop **Chat roadmap** ricorda la tua scelta; se lo spazio è poco, alterna task e conversazione senza perdere la bozza.

**Contesto** conserva scopo, decisioni e vincoli del progetto. Puoi scrivere direttamente oppure usare **Aggiungi da file** per accodare testo o Markdown alla bozza. Rivedi il contenuto e premi **Salva** per condividerlo con la chat di progetto e con le chat dei task. Il testo che avevi salvato sotto **Roadmap** nel fork si trova già qui. Per recuperare appunti dal vecchio matteOS, seleziona i file che vuoi condividere.

**Roadmap** raccoglie obiettivi e prossimi passi. La chat a fianco riceve roadmap, contesto e tutti i task nell’ordine scelto a ogni turno ordinario. Chiedile di valutare priorità, dipendenze e attività da svolgere in parallelo. Puoi rivedere le proposte nella conversazione e aggiornare la roadmap o i task. Se un’altra finestra modifica lo stesso campo mentre scrivi, puoi confrontare il testo salvato con la tua bozza prima di scegliere.

Da Kanban o Lista scegli **Nuovo task**. Scrivi un titolo e, in **Descrizione**, l’obiettivo, i vincoli o i criteri di riuscita. Puoi scegliere lo stato iniziale e creare il task con **⌘ Invio** su Mac o **Ctrl Invio**. La descrizione compare sotto il titolo del task e si può modificare anche dopo: ogni conversazione collegata riceve il testo salvato, insieme a roadmap e contesto del progetto.

Nel dettaglio del task scegli il checkout o un worktree dedicato prima di aprire **Nuova conversazione**. Scrivi il primo messaggio nella normale chat T3. Le altre conversazioni del task potranno usare lo stesso worktree quando sarà pronto. Il dettaglio mostra branch, percorso del worktree e conversazioni; puoi riaprire una bozza da qui o ritrovare un thread nella barra sinistra. Nel pannello delle informazioni del thread, il link **Task** riapre il dettaglio. La chat a destra della board rimane dedicata alla roadmap. Eliminare il task conserva i thread avviati e i file del worktree.

## Dove conservare le informazioni private

Per ogni progetto privato, apri **Task**, seleziona il progetto e salva obiettivi, vincoli e decisioni in **Contesto**. Usa **Roadmap** per i prossimi passi e i task per il lavoro da svolgere. Con **Avvia matteOS.command** questi dati vengono salvati per progetto in `~/.matteos/t3/userdata/statev2.sqlite`, fuori dal checkout Git. Se ti colleghi a un altro ambiente, i dati risiedono nella directory `userdata` del server a cui sei connesso. Conserva anche gli eventuali backup in una destinazione privata.

Se parti da appunti esistenti, tieni gli originali in una cartella privata fuori dai checkout. **Aggiungi da file** copia il testo nella bozza. Rileggilo prima di salvarlo. Per valutare le priorità, usa la chat di progetto con un provider autorizzato a trattare quei dati. A ogni turno ordinario il provider riceve contesto, roadmap e tutti i task ordinati. Nella chat di un task riceve lo stesso contesto e la stessa roadmap, insieme al solo task selezionato. Anche i client autorizzati a leggere il progetto possono consultare la board.

Conserva chiavi e token in un gestore di segreti. Non inserirli nella board, nei file importati o nelle chat. Per fornire una credenziale a T3, segui la [guida ai segreti](secrets.md).

## Avvio locale

Su macOS, apri **Avvia matteOS.command** nel checkout compilato. Avvia l’interfaccia nel browser e conserva i dati del fork in `~/.matteos/t3`. Al primo utilizzo aggiungi il repository fra i progetti T3 e scegli un provider configurato sul computer.

Per preparare un checkout nuovo usa Node 26.12.1, pnpm 12.14.0 e Vite+, quindi esegui dalla radice:

```sh
pnpm install --frozen-lockfile
pnpm --filter @t3tools/web build
pnpm --filter t3 build:bundle
```

Per provare Electron dal checkout di sviluppo usa `vp run dev:desktop --home-dir "$HOME/.matteos/desktop-dev" --no-seed`.

Il branch principale del fork è `main`. Per provare una release upstream, crea un branch temporaneo da `main`, integra il tag scelto e verifica Kanban, chat di progetto e due conversazioni sullo stesso worktree prima di incorporare l’aggiornamento.
