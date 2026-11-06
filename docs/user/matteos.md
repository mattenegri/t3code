# matteOS

Apri **Task** nella barra laterale di T3 e scegli il progetto. Kanban e Lista mostrano gli stessi task. La lista segue la priorità della roadmap. Dal dettaglio puoi cambiare la priorità, mentre trascinare una scheda fra colonne modifica il suo stato.

Per concentrarti sulla Kanban puoi chiudere la sidebar a sinistra e la chat a destra, indipendentemente. Su desktop **Chat** ricorda la tua scelta; se lo spazio è poco, alterna task e conversazione senza perdere la bozza.

**Contesto** conserva scopo, decisioni e vincoli del progetto. Puoi scrivere direttamente oppure usare **Aggiungi da file** per accodare testo o Markdown alla bozza. Rivedi il contenuto e premi **Salva** per condividerlo con la chat di progetto e con le chat dei task. Il testo che avevi salvato sotto **Roadmap** nel fork si trova già qui. Per recuperare appunti dal vecchio matteOS, seleziona i file che vuoi condividere.

**Roadmap** raccoglie obiettivi e prossimi passi. La chat a fianco riceve roadmap, contesto e tutti i task nell’ordine scelto a ogni turno ordinario. Chiedile di valutare priorità, dipendenze e attività da svolgere in parallelo. Puoi rivedere le proposte nella conversazione e aggiornare la roadmap o i task. Se un’altra finestra modifica lo stesso campo mentre scrivi, puoi confrontare il testo salvato con la tua bozza prima di scegliere.

Dentro un task, **Nuova conversazione** apre un thread T3. Al primo messaggio scegli il checkout del progetto o un worktree dedicato. Le conversazioni successive usano lo stesso spazio di lavoro. Passa sul contrassegno **Worktree** della scheda o selezionalo nel dettaglio del task per leggere il percorso. L’icona di apertura accanto al titolo della chat apre il thread nella vista completa di T3, con diff, terminale e verifiche. Eliminare il task conserva le conversazioni e i file del worktree.

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
