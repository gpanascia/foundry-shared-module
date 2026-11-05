# GDR · Strumenti comuni

Un modulo per [Foundry VTT](https://foundryvtt.com) V13 e V14 (verificato sulla 14.369), col sistema dnd5e, che raccoglie gli strumenti usati nei nostri mondi di D&D 5e: macro comuni, il caricatore che porta nel mondo i contenuti preparati altrove, una mappa della città che si scopre a poco a poco, il doppio nome dei PNG e un indice dei journal che si richiude. L'interfaccia e i messaggi sono in italiano.

Chiunque può proporre una modifica: come si fa sta in [CONTRIBUTING.md](CONTRIBUTING.md).

## Indice

- [Cosa fa](#cosa-fa)
- [Com'è fatto](#comè-fatto)
- [Il doppio nome](#il-doppio-nome)
- [Il caricatore](#il-caricatore)
- [«Scopri»](#scopri)
- [L'indice dei journal che si richiude](#lindice-dei-journal-che-si-richiude)
- [Le macro dei mondi](#le-macro-dei-mondi)
- [Installare e aggiornare](#installare-e-aggiornare)
- [Le prove](#le-prove)
- [Licenza](#licenza)

## Cosa fa

| Funzione | Cosa fa | Codice |
|---|---|---|
| `sussurraA(scope)` | Messaggio privato a uno o più utenti, senza scrivere /w, coi link alle pagine e il permesso sulla pagina collegata | [`sussurra-a.mjs`](modulo/scripts/sussurra-a.mjs) |
| `ripuntaAudio(scope)` | Rimette nella cartella audio del mondo le tracce trascinate con DFreds Droppables | [`ripunta-audio.mjs`](modulo/scripts/ripunta-audio.mjs) |
| `copiaStileLuce(scope)` | Copia lo stile di una luce su altre luci | [`luci.mjs`](modulo/scripts/luci.mjs) |
| `alternaSorgenteLuce(nome, scope)` | Accende o spegne sul token selezionato una sorgente di Light Sources | [`luci.mjs`](modulo/scripts/luci.mjs) |
| `sincronizzaOggetti(scope)` | Porta le modifiche degli oggetti del catalogo sulle copie nelle schede, conservando lo stato del personaggio; prima l'anteprima, poi «Applica» | [`sincronizza-oggetti.mjs`](modulo/scripts/sincronizza-oggetti.mjs) |
| `rivelaNome(scope)` | Il doppio nome dei PNG: il nome che descrive e quello vero, scambiati con un clic, anche dal menu della scheda (sotto, «Il doppio nome») | [`rivela-nome.mjs`](modulo/scripts/rivela-nome.mjs) |
| `rivelaPagina(pagina)`, `impostaDoppioNome(attore, { aspetto, vero, rivelato, pagine })` | «Rivela il nome» dalla pagina di journal, e il doppio nome dato a mano | [`rivela-nome.mjs`](modulo/scripts/rivela-nome.mjs) |
| `carica(opzioni)` | Il caricatore: legge un file di dati, prova, e con «applica» crea o aggiorna nel mondo quello che il file descrive | [`carica.mjs`](modulo/scripts/carica.mjs) e [`carica/`](modulo/scripts/carica/) |
| `scopri(opzioni)` | «Scopri», la mappa che si compone: un pannello col livello di ogni quartiere e i posti con una voce nel journal; «Applica» mostra o nasconde i tasselli in dissolvenza, apre o chiude le pagine e i loro blocchi segreti, e lo dice in chat | [`scopri.mjs`](modulo/scripts/scopri.mjs) |
| — (solo disegno) | I pin delle mappe che si compongono: tondi, senza il riquadro di Foundry; per il GM, più scuri quelli che le giocatrici non vedono. Non scrive niente nel mondo | [`pin-mappa.mjs`](modulo/scripts/pin-mappa.mjs) |
| — (aggancio) | Il tiro privato delle Roll Table col segno `gdr-strumenti.privata`: il messaggio di un tiro a vista va ai soli GM, come «Tiro privato del GM» | [`tiro-privato.mjs`](modulo/scripts/tiro-privato.mjs) |
| — (solo disegno) | L'indice dei journal che si richiude (sotto) | [`indice.mjs`](modulo/scripts/indice.mjs) |

Con `scope = { prova: true }` le funzioni dicono cosa farebbero e non scrivono niente (per «Sincronizza oggetti», l'anteprima e il piano): per una macro del mondo, `await game.macros.getName("…").execute({ prova: true })`. Fa eccezione «Scopri», che non riceve `scope`: la prova si fa dalla console (sotto, «Scopri»).

## Com'è fatto

- In Foundry va solo la cartella [`modulo/`](modulo/): `module.json`, `scripts/` e `styles/`. Il resto del repository (le prove, gli strumenti, i documenti) non va nel server.
- In Foundry il modulo si chiama `gdr-strumenti`, non come il repository: i mondi usano quell'id nei flag, nelle impostazioni e nelle macro, e per questo resta quello.
- All'avvio del mondo il modulo mette le funzioni in `game.modules.get("gdr-strumenti").api`. In ogni mondo resta una macro di una riga che le chiama: cambiando il modulo cambiano tutte, in tutti i mondi.
- `api.versione` dice quale versione del codice gira davvero nel browser (`module.version` viene dal manifest letto all'apertura del mondo).
- Il foglio di stile, [`styles/gdr-strumenti.css`](modulo/styles/gdr-strumenti.css), porta anche gli stili delle pagine dei journal generate dai dati: la classe `gdr-regola` è il box di un riquadro «Regola», e la classe `gdr-figura` tiene i ritratti delle voci alti quanto le immagini dei luoghi. Senza il modulo attivo le pagine restano leggibili.
- Foundry manda i file del modulo a ogni client, giocatrici comprese, commenti compresi: nel codice non ci sono dati di nessuna campagna, e gli esempi sono inventati.

## Il doppio nome

Un PNG il cui nome le giocatrici devono scoprire porta in Foundry il nome d'aspetto, sull'attore e sul token prototipo, e il nome vero solo nel flag `gdr-strumenti.nomi`. Per darlo a un PNG nuovo, dal GM (dalla console, o col caricatore):

```js
await actor.update({ name: aspetto, "prototypeToken.name": aspetto, "flags.gdr-strumenti.nomi": { aspetto, vero, rivelato: false } });
```

«Rivela il nome» scambia i due nomi sull'attore, sul token prototipo e sui token delle scene che portano ancora il nome di prima, anche numerati («… (2)»); un secondo clic li rimette. Il nome rivelato tiene davanti quello che descrive, «La locandiera: Mara Vell», così le giocatrici hanno tutte e due le informazioni e l'ordine alfabetico resta quello; una pagina solo GM tiene il suffisso in fondo («La locandiera: Mara Vell (solo GM)»). Un documento rivelato prima della 1.15.0, col solo nome vero, si riconosce ancora: un clic lo riporta al nome che descrive, e il caricatore gli dà il nome composto.

Cambia insieme anche le pagine di journal del personaggio: quelle col flag `gdr-strumenti.nomi` coi due nomi dell'attore, o con gli stessi due nomi e lo stesso suffisso fra parentesi (la sua pagina «… (solo GM)»). Il testo, i blocchi rivelati e la visibilità delle pagine non cambiano; una pagina rinominata a mano, che non porta né l'uno né l'altro nome, resta com'è, con un avviso. Il nome è uno per tutto il mondo: lo leggono tutte le giocatrici che vedono la pagina.

- Nel menu ⋮ del journal, «Rivela o nascondi il nome (pagina aperta)», per il GM, nei journal con pagine col doppio nome: una pagina non rivelata rivela i suoi attori che non lo sono ancora, uno o più (con più attori, solo se ci sono tutti nel mondo), e con loro la pagina; una rivelata li nasconde.
- Nel menu ⋮ della scheda di ogni attore o del suo token, e nel menu del tasto destro sugli attori della barra, «Doppio nome…», per il GM: una finestra col nome che descrive, il nome vero, «già rivelato» e «anche le pagine col suo nome, senza doppio nome»; poi il piano, da confermare con «Salva». Dà, cambia o toglie (col nome vero vuoto) il doppio nome, sempre sull'attore del mondo, anche dalla scheda di un token non collegato. Le pagine col doppio nome del personaggio lo seguono sempre, e con la spunta anche le pagine senza flag col nome di adesso. Una pagina col doppio nome di un altro personaggio non si tocca, anche se ha lo stesso nome. Scrive prima token e pagine, poi l'attore: se si ferma a metà, basta salvare di nuovo. Vale anche per un attore di una giocatrice, come una PG nuova. Il piano avvisa quando una giocatrice vede l'attore (il nome vero sta nei suoi dati, che chi lo vede legge dalla console) e quando un altro attore ha già gli stessi due nomi.

Una pagina può seguire più attori, come la voce di una coppia («Il fabbro e sua moglie»): ha i suoi due nomi e, nel flag, gli attori coi loro (`attori`); prende il suo nome vero quando li hai rivelati tutti, e torna al nome che descrive appena uno non lo è più. Il caricatore dà alle pagine il doppio nome col campo `nomeVero` ([docs/caricatore.md](docs/caricatore.md), «I journal») e fa lo stesso: una pagina col nome vero nei dati porta il nome che i suoi attori dicono.

**Chi può leggere il nome vero.** Il flag `gdr-strumenti.nomi` sta nei dati dell'attore e delle sue pagine col doppio nome, e chi riceve quei dati lo legge dalla console del browser: il GM, e una giocatrice che vede la pagina o l'attore. Il modulo non lo mostra, ma non lo nasconde a chi lo cerca; toglierlo dai documenti che le giocatrici ricevono è un lavoro ancora da fare.

**Il nome vero non deve stare in niente che le giocatrici vedono**: le Roll Table che si tirano in chat (il nome e il testo delle voci; le descrizioni, salvo nelle tabelle `privata`, che si tirano solo in privato), il nome e il testo delle pagine che leggono, i file che il server dà a chi ne sa il nome (gli esempi del codice di questo modulo; i messaggi del rapporto del caricatore, che dicono l'id dell'attore e mai un nome vero non ancora rivelato). I dati di un carico che crea attori col doppio nome il nome vero lo portano per forza: restano sul server il meno possibile. Il caricatore controlla che il nome vero non stia nelle Roll Table, nel nome degli attori, negli oggetti rinominati o sostituiti, nei nomi dei file dei ritratti e in quello che le giocatrici leggono delle pagine che si mostrano: a parola intera, senza distinzione fra maiuscole e minuscole, coi nomi veri dei dati e quelli del mondo non ancora rivelati. In un testo, un nome vero con la maiuscola conta solo dove comincia anche lì con la maiuscola: una parola comune uguale al nome, in minuscolo, non ferma il carico; nei nomi dei file, che si scrivono in minuscolo, conta comunque.

## Il caricatore

Una funzione sola, `carica(opzioni)`, al posto di uno script nuovo per ogni lavoro nel mondo: legge un **file di dati** (formato `gdr-carico/1`) che dice cosa creare o aggiornare, dove e con quale visibilità; rifiuta le operazioni e i campi che non conosce; prova senza scrivere; con «applica» scrive, rilegge quello che ha scritto e salva il rapporto. Non cancella mai niente: un documento da togliere lo mette da parte. Come si lancia, il formato del file, le regole fisse, il rapporto e le guardie: [docs/caricatore.md](docs/caricatore.md).

## «Scopri»

La mappa che si compone: un pannello con, per ogni quartiere, quattro livelli (Sentito dire, Visitato, Conosciuto, Di casa) e, sotto, i posti che hanno una voce nel journal. «Applica» cambia quello che le spunte chiedono, mostra o nasconde i tasselli in dissolvenza, apre o chiude le pagine e i loro blocchi segreti, riallinea i segnaposto e lo dice in chat; il pannello resta aperto, riletto, al punto dove era. Si può staccare in una finestra sua. Come funzionano i livelli, i segnaposto e la riga in chat sta in testa a [`scopri.mjs`](modulo/scripts/scopri.mjs).

Le opzioni vengono dalla riga della macro:

| Opzione | |
|---|---|
| `journal` | obbligatorio: l'id del journal coi quartieri e i posti |
| `titolo` | facoltativo: nel titolo del pannello, «Scopri — <titolo>» |
| `alias` | facoltativo: a nome di chi esce in chat la riga per le giocatrici; se manca, il titolo, e senza titolo «Scopri» |
| `livelli` | facoltativo: i nomi dei quattro livelli, se non sono quelli predefiniti; dal secondo al quarto sono anche i titoli dei blocchi segreti della pagina del quartiere (`<strong>Visitato.</strong>`), quattro nomi diversi, fino a 40 caratteri, senza `< > & "` e non nomi riservati come `constructor` o `toString` |
| `prova`, `scelta` | per provare, dalla console: `await game.modules.get("gdr-strumenti").api.scopri({ journal: "…", prova: true, scelta: { "q.porto.2": true } })`. Niente pannello e niente scritto; restituisce cosa cambierebbe con le spunte di adesso più quelle di `scelta` (`"q.<quartiere>.<livello da 1 a 4>"`, `"p.<id della voce>"`, `"r.<quartiere>"` per riallineare). Le spunte di `scelta` si prendono come sono, senza i legami del pannello: il livello di un quartiere è la spunta più alta. I segnaposto si calcolano coi permessi che le pagine avrebbero dopo |

La macro del mondo, a una riga, non passa `scope`: lanciata con `execute({ prova: true })` apre il pannello come sempre (che non scrive niente finché non si preme «Applica»); la prova si fa dalla console, come sopra.

Restano fissi i segni che mettono i programmi che preparano la mappa: la scena col segno `world.wgMappa`; i tasselli dei quartieri col segno `world.wgMappa` (`quartiere`, `nome`, `livello` fra `sentito-dire`, `visitato` e `di-casa`, `ordine`); i pin col segno `world.wgMappa.punto` e i segnaposto col segno `world.wgSegnaposto`; le pagine «(solo GM)», che «Scopri» non tocca mai. I nomi dei segni vengono dal mondo dove la mappa è nata e restano così, per non perdere i dati.

## L'indice dei journal che si richiude

Vale in tutti i journal di tutti i mondi col modulo attivo, senza macro: l'hook `renderJournalEntrySheet`, che V14 chiama anche per le sottoclassi del foglio (quella di dnd5e compresa).

- **I gruppi.** Una voce dell'indice raccoglie le voci che la seguono con un livello più basso (`title.level` della pagina): il quartiere richiude luoghi e personaggi, un luogo i suoi personaggi. Un gruppo non scavalca un'intestazione di categoria. Sulla voce che ha qualcosa sotto c'è una freccia, con un bersaglio di 24 px: un clic apre e chiude, senza aprire la pagina. La freccia sta fra il numero e il titolo e si sposta di 16 px per livello; le voci senza freccia hanno uno spazio uguale, così i titoli dello stesso livello restano in colonna. La freccia dice cosa apre («Apri Porto (3 pagine)») e si colora quando la pagina in vista è dentro il suo gruppo chiuso; sul titolo accorciato c'è il nome intero.
- **Le linee guida.** Per ogni gruppo aperto, una linea verticale sotto la freccia del capo, fino all'ultima voce visibile del gruppo. Una tinta per ogni gruppo di primo livello, a giro su sette tinte che restano distinte anche per chi è daltonico e senza l'arancio, che è il colore della pagina in vista; un gruppo dentro un gruppo ha la stessa tinta, più chiara. Il colore è in OKLCH, per il fondo vero dell'indice, deciso dal colore del testo dei titoli.
- **All'inizio chiusi.** La pagina in vista apre da sola i gruppi che la contengono e il suo, quando la finestra si disegna e quando cambia la pagina attiva, e l'indice scorre fino alla sua voce. I gruppi aperti così restano aperti finché la finestra è aperta; uno richiuso a mano si riapre solo quando torna in vista una sua pagina.
- **Lo stato** dei gruppi aperti a mano si ricorda per persona e per journal, nel browser (`localStorage`, chiave `gdr-strumenti.indice`); ogni clic cambia solo il suo gruppo. Se il browser non salva, l'indice funziona lo stesso e alla prossima apertura riparte chiuso.
- **Tutto aperto** con del testo nella ricerca dell'indice, e durante un trascinamento, così il riordino delle pagine funziona. Non col lucchetto dell'indice: in V14 i journal partono senza lucchetto, e l'indice del GM resterebbe sempre aperto.
- **Le giocatrici** vedono solo le loro pagine: Foundry non mette le altre nell'indice, e una voce senza niente di visibile sotto non ha la freccia.
- **Solo disegno**, nel browser di chi guarda: niente scritture nel mondo.

Le prove con jsdom non provano la resa sul foglio vero di dnd5e (rientri, fondo del tema chiaro, voce attiva) né il trascinamento e lo scorrimento veri del browser: quando l'indice cambia, si guarda nel mondo.

## Le macro dei mondi

Macro di tipo Script, di una riga; se il modulo non è attivo, o non si è caricato, lo dicono. Le opzioni fra parentesi sono esempi.

| Macro | Comando |
|---|---|
| «Sussurra a…» | `return game.modules.get("gdr-strumenti")?.api?.sussurraA?.(scope) ?? ui.notifications.error("Modulo «GDR · Strumenti comuni» non attivo o non caricato: attivalo in «Gestisci moduli», poi ricarica con Ctrl+F5.");` |
| «Ripunta audio nel mondo» | `return game.modules.get("gdr-strumenti")?.api?.ripuntaAudio?.(scope) ?? ui.notifications.error("…");` |
| «Copia stile luce» | `return game.modules.get("gdr-strumenti")?.api?.copiaStileLuce?.(scope) ?? ui.notifications.error("…");` |
| una sorgente di luce sul token | `return game.modules.get("gdr-strumenti")?.api?.alternaSorgenteLuce?.("Spada corta elfica", scope) ?? ui.notifications.error("…");` |
| «Sincronizza oggetti» | `return game.modules.get("gdr-strumenti")?.api?.sincronizzaOggetti?.({ ...scope, prefisso: "xx", titolo: "Sincronizza oggetti", cartelle: ["Catalogo"], cartelleAttori: ["Compagnia"] }) ?? ui.notifications.error("…");` |
| «Rivela il nome» | `return game.modules.get("gdr-strumenti")?.api?.rivelaNome?.(scope) ?? ui.notifications.error("…");` |
| «Scopri» | `return game.modules.get("gdr-strumenti")?.api?.scopri?.({"journal":"<id del journal>","titolo":"<città>"}) ?? ui.notifications.error("…");` |

Le opzioni di «Sincronizza oggetti» sono in testa a [`sincronizza-oggetti.mjs`](modulo/scripts/sincronizza-oggetti.mjs). Il caricatore può creare queste macro da sé ([docs/caricatore.md](docs/caricatore.md), «Le macro»).

## Installare e aggiornare

1. Copia la cartella [`modulo/`](modulo/) in `Data/modules/gdr-strumenti/` (con `module.json` direttamente lì dentro).
2. La prima volta, Foundry vede il modulo solo dopo un riavvio. Poi, nel mondo, in «Gestisci moduli» attiva «GDR · Strumenti comuni» e salva.
3. Nel mondo, metti le macro di una riga che ti servono (sopra).

Per aggiornare: si sostituisce la cartella e si ricarica il mondo (F5); se cambia `module.json`, bisogna tornare alla schermata iniziale e riaprire il mondo.

[`strumenti/pacchetto.py`](strumenti/pacchetto.py) fa il pacchetto del modulo da un commit di `master`, con l'elenco delle impronte dei file e il commit scritto in `module.json` (`flags.gdr.commit`): serve a chi installa il modulo con uno strumento che controlla la provenienza.

## Le prove

Le prove girano in Node (22 o più recente), su un Foundry finto, con jsdom; non sostituiscono la prova nel mondo.

```bash
cd prove
npm ci --ignore-scripts
npm test
```

`npm test` lancia le prove del caricatore ([`prove.mjs`](prove/prove.mjs)), dell'indice ([`prove-indice.mjs`](prove/prove-indice.mjs)) e di «Scopri» ([`prove-scopri.mjs`](prove/prove-scopri.mjs)); `npm run test:senza-subtle` rifà quelle del caricatore come in un browser senza `crypto.subtle`. Tutte e due girano su GitHub a ogni pull request.

## Licenza

[MIT](LICENSE). Le versioni sono nel [CHANGELOG](CHANGELOG.md).
