# Il caricatore

Una funzione sola, `carica(opzioni)`, al posto di uno script nuovo per ogni carico. Legge un **file di dati** che dice cosa creare o aggiornare, dove e con quale visibilità; rifiuta le operazioni e i campi che non conosce; prova senza scrivere; con «applica» scrive, rilegge quello che ha scritto e salva il rapporto. Un lavoro nuovo cambia solo il file di dati: il codice del caricatore si rivede una volta, e a ogni estensione.

Copre le cartelle e le pagine di journal, le Roll Table e gli attori dal compendio, le note, i tasselli e i disegni su una scena che c'è, le macro di una riga, e i documenti da togliere, messi da parte e mai cancellati (`daParte`, sotto). Restano fuori, per script a parte: le migrazioni, le impostazioni del mondo, gli interventi sulle schede.

Il codice lo scarica ogni client, giocatrici comprese: dentro non c'è niente di nessuna campagna. I nomi di una campagna (il suffisso delle pagine solo GM, i GM della campagna, la cartella dei rapporti) arrivano col file di dati, dai parametri di quella campagna. Gli esempi qui sotto sono inventati.

## Come si lancia

Dalla console di un utente col ruolo Gamemaster:

```js
const api = game.modules.get("gdr-strumenti").api;
const prova = await api.carica({ modo: "prova", utente: "<utente>", file: "scambio/xx-carico-esempio.json", sha256: "<SHA-256 del file>" });
// si legge il rapporto: problemi, avvisi, piano; se è pulito (chi altro è connesso è un avviso)
const fatto = await api.carica({ modo: "applica", utente: "<utente>", file: "scambio/xx-carico-esempio.json", sha256: "<lo stesso>", firma: prova.firma });
```

| Opzione | Cosa vuol dire |
|---|---|
| `modo` | `"prova"`: non scrive niente, nemmeno il rapporto, e restituisce il piano con la sua firma. `"applica"`: rifà la prova, e scrive solo se il piano ha la firma di quella che si è letta |
| `utente` | il nome dell'utente che lancia il caricatore: deve essere chi lancia, col ruolo Gamemaster pieno (un assistente non basta) |
| `file` | il file di dati in `Data/`, copiato nel server prima di lanciare; oppure |
| `testo` | il file di dati come testo, passato dalla console: non lascia nel server un file che chiunque ne sappia il nome potrebbe leggere |
| `sha256` | l'impronta SHA-256 dei byte del file (di `testo`, in UTF-8): se non torna, il caricatore si ferma |
| `firma` | solo con `applica`: la firma del piano restituita dalla prova. Se nel frattempo è cambiato qualcosa, nel mondo, nei dati o nel caricatore, la firma non torna e non si scrive: si rilancia la prova |
| `consenti` | non serve più perché chi è connesso non ferma il caricatore: si accetta ancora (un elenco di nomi), con un avviso, e non conta |

Restituisce sempre il rapporto (sotto, «Il rapporto»), anche dopo un errore imprevisto; l'ultimo resta in `globalThis.gdrCaricoUltimo`, se lo strumento del browser scade prima della fine.

## Il file di dati

Un file JSON, scritto dal generatore della sorgente (lo script che prepara i dati di una scena o di una città), mai a mano. Il caricatore rifiuta un campo che non conosce, a ogni livello: un errore di battitura è un problema, non un campo ignorato.

```json
{
  "formato": "gdr-carico/1",
  "carico": "xx-scena3",
  "titolo": "Scena 3, le pagine",
  "mondo": "il-mondo",
  "generato": { "da": "xx/genera-carico.py", "commit": "abc1234", "il": "2026-11-02T10:00:00Z" },
  "campagna": { "…": "i parametri, qui sotto" },
  "file": [ { "percorso": "worlds/il-mondo/handout/xx-biglietto.webp", "sha256": "…" } ],
  "operazioni": [ { "op": "cartella", "…": "…" }, { "op": "journal", "…": "…" } ]
}
```

| Campo | Cosa vuol dire |
|---|---|
| `formato` | `"gdr-carico/1"`: la versione di questo formato. Un formato che il caricatore non conosce lo ferma |
| `carico` | il nome del carico, minuscole, cifre e trattini (3-60), che comincia con l'abbreviazione della campagna e un trattino (`xx-scena3`): nello stesso mondo stanno più campagne. Senza spoiler, come un `rif`: mentre il carico scrive, il suo nome sta nel blocco del mondo, che ogni client riceve. Con il `rif` di ogni documento fa il suo id e il suo segno (sotto, «Ritrovare i documenti»). Resta lo stesso a ogni rilancio dello stesso lavoro |
| `titolo` | una riga per il rapporto |
| `mondo` | l'id del mondo: se non è quello aperto, il caricatore si ferma |
| `generato` | chi ha fatto il file (percorso del generatore), da quale commit, quando: per il rapporto |
| `campagna` | i parametri della campagna |
| `file` | ogni immagine che il carico usa, nel mondo, col suo SHA-256: il caricatore la scarica e controlla l'impronta. Un'immagine usata e non elencata è un problema |
| `operazioni` | le operazioni, in ordine: le cartelle prima di quello che ci va dentro |

**Parametri della campagna** (`campagna`). Li scrive il generatore, dai parametri della campagna; il caricatore li controlla come il resto.

| Campo | Cosa vuol dire | Esempio |
|---|---|---|
| `abbr` | l'abbreviazione della campagna (2-6 minuscole), nel nome del rapporto | `"xx"` |
| `suffissoSoloGM` | il suffisso delle pagine e dei journal solo GM, fra parentesi; si riconosce senza distinzione fra maiuscole e minuscole | `"(solo GM)"` |
| `riquadroDM` | il titolo del riquadro «Nota per il DM» nelle pagine che si mostrano. Il riquadro sta in un blocco segreto tutto suo, che non si rivela: quel blocco non conta nel controllo delle parole da DM; il titolo fuori da un blocco così è un problema | `"Nota per il DM"` |
| `classi` | le classi HTML ammesse oltre a quelle fisse (`secret`, `revealed`, `gdr-regola`), per esempio quella del riquadro della campagna. Nelle pagine che si mostrano stanno solo dentro il blocco segreto del riquadro | `["dnd-gm-hint"]` |
| `paroleDM` | le parole da DM che non devono stare dove le giocatrici leggono, come espressioni regolari (senza distinzione fra maiuscole e minuscole) | `["\\bPG\\b", "§"]` |
| `ammessi` | i GM della campagna che di solito sono connessi: chi è connesso non ferma il caricatore, e nell'avviso dei connessi un GM ammesso è segnato «ammesso» | `["Gamemaster"]` |
| `cartellaRapporti` | la cartella di `Data/` dove va il rapporto | `"scambio"` |

### Le operazioni

#### Le cartelle (`cartella`)

Una cartella, creata se manca. Non si sposta e non si rinomina mai: se il GM l'ha rinominata, si ritrova dal suo id e il rapporto lo dice. se nel mondo c'è già una cartella con lo stesso nome, dello stesso tipo e nella stessa cartella madre, una sola e senza il segno di un carico (fatta a mano o da uno script), il caricatore usa quella invece di fermarsi: il piano lo dice (`adotta`), e sulla cartella non scrive niente. Con più omonime, o con una scritta da un altro carico, resta un problema: il suo id va nei dati. La cartella usata sta nelle corrispondenze del rapporto (`adottata`), non nel registro: al giro dopo si ritrova allo stesso modo. Una cartella scritta dal carico e poi tolta resta un problema; con `ricrea`, se intanto ne è stata fatta un'omonima a mano, si usa quella.

| Campo | |
|---|---|
| `rif` | il riferimento nel file: minuscole, cifre e trattini, unico fra tutti i documenti del file. Senza spoiler: un suo derivato finisce nei dati del documento |
| `tipo` | `"JournalEntry"`, `"Actor"`, `"RollTable"`, `"Item"`, `"Scene"` o `"Macro"` |
| `nome` | il nome, per crearla |
| `padre` | obbligatorio: la cartella che la contiene, il `rif` di un'altra cartella del file (dichiarata prima), `{ "id": "…" }` per una che c'è già, o `null` in cima |
| `id` | facoltativo: l'id di una cartella che c'è già, da una corrispondenza tenuta a parte |
| `ricrea` | `true` per ricreare una cartella che il carico aveva scritto e che nel mondo non c'è più (sotto, «Ritrovare i documenti»); vale anche per journal e pagine |

#### I journal (`journal`)

Un journal e le sue pagine. Il journal si crea se manca, a None; non si rinomina, non si sposta e la sua visibilità non si tocca mai.

| Campo | |
|---|---|
| `rif`, `nome`, `id` | come per le cartelle |
| `cartella` | obbligatorio: dove crearlo, il `rif` di una cartella del file, `{ "id": "…" }`, o `null` |
| `crea` | `false` se il journal deve esserci già (il journal del gruppo): se manca, è un problema. Predefinito `true` |
| `pagine` | le pagine, sotto |
| `ordine` | facoltativo: dove vanno le pagine nuove (sotto) |

**Le pagine** (`pagine` di un journal):

| Campo | |
|---|---|
| `rif`, `nome`, `id`, `ricrea` | come per le cartelle; il nome di una pagina che si mostra la leggono le giocatrici |
| `nomeVero` | facoltativo: il nome vero del personaggio della pagina, che le giocatrici leggono nel nome della pagina solo dopo «Rivela il nome»; nel flag della pagina c'è sempre (README.md, «Il doppio nome», «Chi può leggere il nome vero»). Testo semplice, diverso dal nome; solo GM se lo è il nome (`«…» (solo GM)` tutti e due); in una pagina che si mostra, senza parole da DM. Sta nel flag `gdr-strumenti.nomi` della pagina; con l'attore coi due nomi uguali (o uguali col suffisso solo GM), «Rivela il nome» cambia insieme l'attore e la pagina. Una pagina col nome vero senza un attore così è un avviso |
| `attori` | facoltativo, con `nomeVero`: gli attori che la pagina segue, da 1 a 10, `[{ "nome": "…", "nomeVero": "…" }]` coi loro due nomi; la pagina prende il nome vero quando sono rivelati tutti. Un attore che non c'è, nei dati o nel mondo, con quei due nomi è un avviso |
| `tipo` | `"text"` o `"image"` |
| `livello` | il livello del titolo nell'indice del journal, 1, 2 o 3 (predefinito 1): una pagina di livello 2 è figlia della pagina di livello 1 prima di lei |
| `html` | per `text`: il testo, nell'HTML ammesso (sotto); `""` per una pagina vuota, come un nodo |
| `src`, `didascalia` | per `image`: il file (elencato in `file`) e la didascalia, anche `""`. Il nome del file di una pagina che si mostra non deve avere parole da DM: chi apre l'immagine lo legge |
| `visibilita` | come nasce: `"nessuna"` (predefinito: None); `"osservatore"` (Observer per tutte); `"proprietarie"` (Proprietario per tutte, come una lavagna: chi possiede una pagina vede anche i blocchi segreti, quindi niente blocchi segreti, niente riquadro, niente parole da DM); `{ "osservatoreSolo": ["<utente>"] }` (Observer per quelle giocatrici sole, come i loro appunti). Vale solo alla creazione: su una pagina che c'è, è un avviso |
| `decisione` | obbligatoria con una `visibilita` diversa da `"nessuna"`: la decisione del GM che la giustifica, con la data (AAAA-MM-GG); va nel rapporto |
| `precedente` | facoltativo, per una pagina che c'è già, data col suo `id`, e che non ha scritto il caricatore (l'ha scritta uno script di prima): `nome`, `livello`, `html`, `src`, `didascalia` come li aveva lasciati quello script. Senza, una differenza fra la pagina e i dati è un problema |
| `aggiorna` | `false` se una pagina che c'è già non va aggiornata nemmeno quando si potrebbe: le differenze vanno fra gli avvisi. Predefinito `true` |
| `accetta` | per una pagina di testo in conflitto (sotto): l'impronta del testo nel mondo, che la prova dà nel problema. Con quella, il testo del mondo conta come ultima scrittura, e si aggiorna coi dati; si usa quando il ritocco del GM è già riportato nella fonte dei dati e il mondo differisce solo per la forma (una pagina salvata nell'editor). Mai sopra blocchi rivelati o parentesi riempite |
| `flagsMondo` | facoltativo: i flag `world` della pagina, per gli strumenti del mondo (come `{ "wgVoce": true }`, che fa riconoscere a «Scopri» la voce di un posto). Alla nascita si scrivono tutti; su una pagina che c'è si aggiungono solo quelli che mancano, e uno che c'è già, diverso, resta com'è con un avviso. Chiavi senza punti, senza `-=` o `==` in testa (per Foundry vogliono dire «togli» e «sostituisci»), niente `__proto__`, `constructor`, `prototype` e gli altri nomi che ogni oggetto ha (`toString`…); nelle chiavi e nei testi niente parole da DM e niente nomi veri, anche quelli del mondo per una pagina che si mostra |

#### Le Roll Table (`tabella`)

Una Roll Table, sempre solo del GM. Nasce a None, col tiro mostrato in chat (`displayRoll`) e con le voci rimesse nel mazzo dopo ogni tiro (`replacement`); la sua visibilità non si tocca mai. Si estrae in chat col modo di tiro scelto: nome, descrizione e voci non portano i nomi veri degli attori (quelli dei dati e quelli del mondo non ancora rivelati; in una tabella `privata`, le descrizioni sì), e il nome e il testo delle voci non hanno parole da DM; la descrizione e quella delle voci possono averle, come una pagina solo GM, e allora la tabella si tira in privato, come dice la sua descrizione.

| Campo | |
|---|---|
| `rif`, `nome`, `id`, `ricrea` | come per le cartelle; il nome è testo semplice |
| `cartella` | obbligatorio: il `rif` di una cartella di Roll Table del file, `{ "id": "…" }`, o `null` |
| `formula` | un tiro solo, come `1d12`, `d20`, `2d6`: niente modificatori |
| `descrizione` | facoltativa: HTML ammesso, come in una pagina solo GM, senza immagini e senza collegamenti |
| `privata` | `true` per una tabella che si tira solo in privato («Tiro privato del GM»), come le tabelle degli incontri con la colonna «Per il DM»: le descrizioni, sue e delle voci, sono del GM e possono avere i nomi veri; il nome della tabella e il testo delle voci no, perché si leggerebbero in chat se la tabella si tirasse a vista. la tabella porta il segno del modulo `flags.gdr-strumenti.privata` (alla nascita, e su una tabella che c'è si aggiunge se manca; tolto a mano o non più privata nei dati, resta com'è con un avviso), e il modulo la tira sempre come «Tiro privato del GM», anche se in chat è scelto il tiro a vista: il messaggio del tiro va ai soli GM (README.md, «Com'è fatto», il tiro privato). Come nel tiro privato di Foundry, con Dice So Nice le giocatrici possono vedere i dadi 3D senza valori; non lo coprono le tabelle tirate da un compendio, quelle annidate e i moduli che scrivono il proprio messaggio o lo riscrivono dopo. La descrizione lo dice comunque: se non parla di tiro privato è un avviso |
| `voci` | 1-200 voci: `da` e `a` (i numeri del tiro, dentro la formula, mai due voci sullo stesso numero), `testo` (testo semplice, il nome della voce, quello che si legge in chat), `descrizione` (facoltativa, HTML come sopra). Un numero del tiro senza voce è un avviso |
| `precedente` | come per le pagine, per una tabella di uno script di prima: `nome`, `formula`, `descrizione`, `voci` come le aveva lasciate |
| `aggiorna`, `accetta` | come per le pagine; `accetta` è l'impronta della tabella intera, che la prova dà nel problema |

Una tabella che c'è si aggiorna come una pagina, campo per campo (nome, formula, descrizione, voci), solo se nel mondo è ancora come l'aveva lasciata l'ultima scrittura. Le voci dei dati si mettono in ordine di tiro; si aggiornano al loro posto, solo quelle che cambiano, e quelle in più si aggiungono (prima le voci, poi la tabella col suo segno: se le voci aggiunte non si scrivono dopo quelle aggiornate, al rilancio la tabella risulta cambiata in Foundry, e si risolve con «accetta»); se i dati ne hanno meno del mondo è un problema, perché il caricatore non cancella.

#### Gli attori dal compendio (`attore`)

Un attore dalle statistiche di un compendio, coi ritocchi di un vocabolario chiuso. Nasce a None, col token prototipo neutrale e col nome dei dati; col nome vero, porta il doppio nome di «Rivela il nome» (README.md, «Il doppio nome»). Un attore che c'è non si aggiorna, salvo il ritratto e i nomi: il nome che descrive e quello vero si confrontano in tre, come il ritratto (il mondo, i dati, l'ultima scrittura nel segno o in «precedente»), e si aggiornano coi dati se nel mondo sono ancora come li aveva lasciati l'ultima scrittura, insieme al token prototipo e ai token delle scene che portano il nome di prima. Un attore rivelato prende il nome composto nuovo. Se cambiano insieme il nome che descrive e quello vero, con un «precedente» che ha il nome vero di adesso, ne esce un conflitto: decide il GM. Nell'«applica» i token delle scene si scrivono prima dell'attore, così una scrittura fermata a metà riparte al rilancio; un token tolto o spostato fra la scrittura e la verifica dà un KO da guardare. I nomi di un attore scritto prima della 1.15.0 non stanno nel segno: per rinominarlo serve «precedente» coi nomi di prima, se no è un avviso.

| Campo | |
|---|---|
| `rif`, `id`, `ricrea` | come per le cartelle |
| `nome` | il nome in Foundry, quello che le giocatrici leggono su token e chat (testo semplice, senza parole da DM): finché il personaggio non si è presentato, un nome che lo descrive |
| `nomeVero` | facoltativo: il nome vero, che sta solo nei dati dell'attore (`flags.gdr-strumenti.nomi`) finché il GM non lo rivela |
| `cartella` | obbligatorio: il `rif` di una cartella di attori del file, `{ "id": "…" }`, o `null` |
| `compendio`, `srd` | il compendio (come `dnd5e.actors24`) e il nome della creatura, fra quelle delle regole 2024: una sola |
| `token` | `"uno"`: il token collegato all'attore (un personaggio solo); `"molti"`: non collegato e numerato (un garzone, una guardia) |
| `precedente` | facoltativo, per un attore che c'è, scritto da uno script di prima o dal caricatore prima della 1.15.0: `img` (il ritratto di prima; solo con l'`id`), `nome` e `nomeVero` (i nomi di prima, per rinominarlo) |
| `img` | facoltativo: il ritratto dell'attore, un'immagine elencata in `file`. Il token prototipo resta quello del compendio (se sta in un modulo non attivo, l'immagine di default) |
| `ritocchi` | facoltativo, solo queste voci: `via` (oggetti tolti per nome, coi loro richiami nelle descrizioni, come la Multiattacco), `senzaArmatura` (`true`: tolte le armature leggere, medie e pesanti), `sostituisci` (`{ "oggetto di prima": "oggetto del compendio" }`: il nuovo prende l'`_id` del vecchio, che la Multiattacco cita, e un'arma tiene la descrizione da statblock), `rinomina` (`{ "oggetto": { "nome": "…", "img": "icons/…" } }`), `taglia` (`tiny`, `sm`, `med`, `lg`, `huge`, `grg`), `abilita` e `vantaggio` (le abilità con competenza e quelle con vantaggio, coi codici di dnd5e, come `acr`). Ogni altra modifica alla scheda resta uno script a parte |
| `compendioOggetti` | con `sostituisci`: il compendio degli oggetti (come `dnd5e.equipment24`) |
| `atteso` | facoltativo (con `senzaArmatura` conviene dare la CA: se il compendio la scrive come valore fisso, togliere l'armatura non la cambia; senza, è un avviso): i numeri che devono uscire, `ca`, `taglia`, `abilita`, `vantaggio`, `armi` (`{ "arma": ["+5", "1d4 + 3"] }`): l'attore si costruisce in memoria nella prova e si ricontrolla dopo la scrittura |

Il ritratto di un attore che c'è si confronta in tre, come una pagina: com'è nel mondo, com'è nei dati, com'era all'ultima scrittura (il segno, o `precedente`). anche i nomi, allo stesso modo (sopra); gli altri campi non si toccano: una visibilità o una cartella diverse dai dati sono avvisi. Un attore nuovo che ha uno dei suoi nomi (in Foundry, d'aspetto o vero, senza distinzione fra maiuscole e minuscole) già in un altro attore del mondo è un problema. Con `taglia`, il token prototipo prende la misura della taglia (dnd5e non la rifà per un attore che viene da un compendio). Se il token del compendio sta in un modulo non attivo, prende l'immagine di default, che Foundry alla creazione può sostituire col ritratto dell'attore. Un attore o una tabella duplicati in Foundry si portano dietro il segno: al rilancio il caricatore si ferma («col segno… c'è anche»), e decide il GM.

**La conversione in metri**. Gli attori del compendio sono in piedi e libbre. In un mondo che usa le unità metriche (l'impostazione di dnd5e «Usa Unità Metriche di Lunghezza»), il caricatore li converte prima di crearli, con le regole di una macro di conversione che vive fuori da questo repository, copiate in [`carica/metri.mjs`](../modulo/scripts/carica/metri.mjs) per gli attori, i loro oggetti ed effetti e il token prototipo, come nel suo modo `SOLO`), e col suo segno `flags.world.metric`, che una passata della macro poi salta. Il piano dice per ogni attore nuovo quanti campi cambiano (`inMetri`); quello che la macro lascerebbe «a mano» va fra gli avvisi. Così non serve più il mondo senza nessun altro connesso, che la macro vuole: valgono le guardie del caricatore. Un attore che la conversione non segna (toccato dal modulo italiano) è un problema, e non si crea; se il mondo ha le lunghezze in metri ma non i pesi o i volumi, è un avviso. Se la macro cambia le sue regole, si cambiano anche qui.

#### Le scene (`scena`)

Note, tasselli e disegni su una scena che c'è, data col suo `id` (il caricatore non crea scene e non cambia la scena: sfondo, griglia, livelli restano com'è). Un'operazione per scena, con tre elenchi facoltativi, `note`, `tasselli` e `disegni`, e `nome`, facoltativo, il nome che la scena deve avere (diverso nel mondo: un avviso).

Ogni elemento ha `rif`, e facoltativi `id`, `ricrea`, `aggiorna` e `accetta`, come le pagine; i suoi **campi** si confrontano in tre come quelli di una pagina, e un campo che i dati non danno non si tocca. Il segno tiene tutti i campi, anche quelli che i dati non danno, come erano all'ultima scrittura: un campo aggiunto dopo ai dati si aggiorna se nessuno l'ha toccato, e resta com'è se l'ha cambiato il GM o «Scopri». Un elemento senza `id` lo crea il caricatore, adesso o in un giro di prima, e i dati lo danno intero; uno che c'è già, scritto da uno script di prima o messo a mano, si prende col suo `id`, e con `precedente` (gli stessi campi, come li aveva lasciati lo script) se i dati lo cambiano. Valgono solo alla nascita `livello` (l'id di un livello della scena, obbligatorio), `flagsMondo` (i flag `world` dell'elemento, come `{ "wgMappa": { "punto": 3 } }`, per gli strumenti del mondo come «Scopri»), e per tasselli e disegni `bloccato` (di default `true`) e `visibile`; su un elemento che c'è sono un avviso, e non si guardano, salvo i flag del mondo corretti con `precedente`. Le coordinate sono quelle che scrive Foundry, intere per note e tasselli (in V14, per un tassello, il centro): le calcola il generatore. I limiti sono quelli di Foundry: `dimensioneIcona` fra 32 e 512, `dimensioneTesto` fra 8 e 128 per una nota, fino a 256 per un disegno. Un disegno senza `bordo` nasce col bordo di Foundry (8 pixel): per nessun bordo, `bordo: null`.

| Genere | Campi (si aggiornano) | Alla nascita |
|---|---|---|
| nota | `x` e `y` insieme (la posizione), `pagina`, `testo`, `icona`, `tinta` (`#rrggbb`), `dimensioneIcona`, `dimensioneTesto`, `ancoraTesto` (`centro`, `sotto`, `sopra`, `sinistra`, `destra`), `ordine` | `livello`, `flagsMondo` (un flag si corregge dopo con `precedente`, sotto); senza `id` servono anche `x`, `y`, `pagina`, `icona` |
| tassello | `immagine`, `x`, `y`, `larghezza` e `altezza` insieme (l'area), `ordine` | `livello`, `visibile`, `bloccato`, `flagsMondo` (un flag si corregge dopo con `precedente`, sotto); senza `id` servono anche l'area e l'immagine |
| disegno | `x`, `y` e `forma` insieme (l'area; `forma`: `{ "tipo": "rettangolo" \| "ellisse" \| "poligono", "larghezza", "altezza", "punti" }`, i punti solo per un poligono, almeno tre), `testo`, `dimensioneTesto`, `coloreTesto`, `riempimento` (`null` o `{ "colore", "alpha" }`), `bordo` (`null` o `{ "colore", "spessore", "alpha" }`), `ordine` | come i tasselli, anche per i flag del mondo; senza `id` servono anche `x`, `y` e `forma` |

**I flag del mondo di un elemento che c'è**. Valgono solo alla nascita, come il livello, salvo quelli che i dati correggono: in `flagsMondo` il flag come deve diventare, e in `precedente.flagsMondo` lo stesso flag com'è adesso nel mondo (`null`, se non c'è). Vale per note, tasselli e disegni dati col loro `id`. Il flag si cambia solo se nel mondo è com'era in `precedente`; uno già come nei dati resta; uno diverso da tutti e due l'ha cambiato qualcun altro, ed è un problema: decide il GM (con `aggiorna: false`, un avviso). `accetta` non vale per i flag: se il valore del mondo va bene, si porta nei dati, il caricatore lo prende come ultima scrittura, e poi si cambia. In `precedente` un flag uguale a quello dei dati è un problema: non c'è niente da correggere. Dopo la correzione l'ultima scrittura del flag sta nel segno del caricatore, e da lì il flag si confronta in tre come un campo: un ritocco in Foundry resta com'è, anche se rimette il valore di prima, e `precedente.flagsMondo` si può togliere dai dati. Gli altri flag dell'elemento non si toccano; un flag non si toglie (`null` in `flagsMondo` è un problema, anche alla nascita e dopo la correzione), e nemmeno una sua sottochiave, perché Foundry fonde gli oggetti: il valore nuovo ha almeno le sottochiavi di quello di adesso. Un flag dei dati diverso dal mondo e senza ultima scrittura (né nel segno né in `precedente`) resta com'è, con un avviso, anche su un elemento nato da un carico e ritrovato senza `id`: per correggerlo servono il suo `id` e `precedente` (il segno della nascita non tiene i flag). Il piano dice, per ogni flag, il valore di prima e quello di dopo. È il caso di «Scopri», che riporta un segnaposto alla pagina del suo flag `wgSegnaposto.nascosta`: per cambiare la pagina di un segnaposto si corregge anche quel flag.

La **`pagina`** di una nota è quella che apre: il `rif` di una pagina o di un journal del file, `carico/rif`, `JournalEntry.<id>` o l'UUID di una pagina. Deve esserci nel mondo, o crearsi in questo giro (una pagina rimandata no). In `precedente`, la pagina di prima è il suo UUID (o `null`, una nota senza pagina).

**Chi vede cosa non si tocca.** Un tassello e un disegno nascono nascosti; visibili, con `visibile: true` e la `decisione` del GM, con la data, come una pagina. Dopo, la loro visibilità è del GM e di «Scopri»: il caricatore non la cambia, e non la guarda. Una nota la vede chi vede la pagina che apre (in Foundry: la pagina, se no il suo journal, se no chiunque): una nota nuova che una giocatrice vedrebbe, o una nota ricollegata a una pagina che una giocatrice vede e prima no, vuole la `decisione` del GM; una nota ricollegata a una pagina che le giocatrici non vedono più è un avviso, coi loro nomi. Il piano dice, per ogni nota che nasce o cambia pagina, chi la vede (`vedono`) e chi la vedeva (`vedevano`); per una nota che si aggiorna, chi la vede; per un tassello o un disegno che si aggiorna, se è visibile; per un elemento che nasce visibile, la `decisione`. Subito prima di scrivere, la visibilità della pagina di ogni nota che nasce o cambia pagina si ricontrolla: se è cambiata dopo il piano, non si scrive.

Il testo di una nota o di un disegno e il nome del file di un'icona o di un tassello stanno nei dati della scena, che riceve anche chi gioca: niente parole da DM e niente nomi veri degli attori (quelli dei dati e quelli del mondo non ancora rivelati), anche in una nota che apre una pagina solo GM. Le immagini sono elencate in `file`, con la loro impronta; le icone di Foundry (`icons/…`) no, e si controlla solo che ci siano. Ogni elemento nuovo o cambiato si costruisce in memoria nella prova, e i suoi campi si rileggono: un campo che Foundry non tiene, o tiene in un'altra forma, è un problema prima di scrivere.

#### Le macro (`macro`)

Una macro di una riga, che chiama una funzione del modulo: `game.modules.get("gdr-strumenti").api.<funzione>(<argomenti in JSON>)`, facoltativo `await` davanti; anche nella forma delle macro dei mondi (README.md, «Le macro dei mondi»), `return game.modules.get("gdr-strumenti")?.api?.<funzione>?.(<argomenti in JSON>) ?? ui.notifications.error("<il messaggio>");`, col messaggio fisso del modulo spento («Modulo «GDR · Strumenti comuni» non attivo o non caricato: …»), che così compare invece dell'errore di Foundry; un altro messaggio, o altro codice, è un problema. In questa forma la funzione deve essere async: una funzione che non restituisse niente farebbe comparire il messaggio anche col modulo attivo (oggi le funzioni del modulo sono tutte async). La logica sta nel modulo, rivisto una volta; una macro che fa altro, su più righe, con argomenti che non sono JSON, che lancia il caricatore, o che chiama una funzione che il modulo non ha, è un problema; la funzione deve essere del modulo, non ereditata, e gli argomenti non usano chiavi con punti, `-=`, `==`, `__proto__`, `constructor`, `prototype` o gli altri nomi che ogni oggetto ha. Il segno di una macro tiene nome, comando e icona, anche quelli che i dati non danno. Nasce a None, di script, solo del GM; la visibilità non si tocca, e il comando di una macro che una giocatrice vede non si cambia: è un problema, decide il GM.

| Campo | |
|---|---|
| `rif`, `id`, `ricrea`, `aggiorna`, `accetta` | come per le tabelle |
| `nome` | il nome della macro (si aggiorna in tre, come il resto) |
| `cartella` | obbligatorio: il `rif` di una cartella di macro del file, `{ "id": "…" }`, o `null` |
| `comando` | la riga |
| `img` | facoltativo: un'immagine elencata in `file`, o un'icona di Foundry (`icons/…`) |
| `precedente` | per una macro di uno script di prima, data col suo `id`: `nome`, `comando`, `img` che aveva |

#### Mettere da parte (`daParte`)

Un documento che va tolto dal gioco. Il caricatore non cancella niente: le cancellazioni in Foundry sono definitive, e il caricatore non le fa, nemmeno col sì del GM. Mette da parte, in modo reversibile, e il GM cancella quando vuole, a mano. Un'operazione per documento, dato col suo uuid, letto nel mondo:

| Campo | |
|---|---|
| `rif` | come per le cartelle (solo per il rapporto: niente registro, niente id fisso) |
| `uuid` | il documento: una nota, `Scene.<id>.Note.<id>`; una pagina, `JournalEntry.<id>.JournalEntryPage.<id>`; un journal, `JournalEntry.<id>`; un attore, una Roll Table, una macro, `Actor.<id>`, `RollTable.<id>`, `Macro.<id>`. Tasselli, disegni, cartelle e oggetti no |
| `nome` | il nome nel mondo (per una nota, il suo testo): se non è quello, l'uuid è sbagliato o il GM l'ha rinominato, ed è un problema |
| `pagina` | solo per una nota, e obbligatoria: la pagina o il journal a cui si lega (`rif` del file, `carico/rif` o uuid). Deve essere solo GM, col suffisso (lei o il suo journal), non solo nascosta adesso: una voce nascosta «Scopri» la può mostrare. Se non lo è, è un problema |
| `cartella` | obbligatoria per journal, attori, tabelle e macro: dove vanno (il `rif` di una cartella del file, del tipo giusto, o `{ "id": "…" }`), per esempio una cartella «Da togliere»; vietata per note e pagine |
| `decisione` | obbligatoria: la decisione del GM, con la data (AAAA-MM-GG) |

Cosa fa:

- una nota: la lega alla pagina solo GM dei dati, nello stesso punto, così nessuna giocatrice la vede (in Foundry, chi non vede la pagina non vede la nota); il modulo non la disegna nemmeno per il GM, salvo col livello delle note attivo, in rosso (README.md, «Com'è fatto»). Le note di uno script di prima o messe a mano si prendono così; una nota che questo file scrive no (sotto);
- una pagina: a None per tutti (anche per chi è nominato uno per uno, GM compresi: il suo livello a None), col nome che finisce con « (da togliere)»; resta nel suo journal, perché una pagina non sta in una cartella. Le note che portano a lei non le vede più nessuna giocatrice: un avviso;
- un journal, un attore, una Roll Table, una macro: nella cartella dei dati, a None per tutti, col nome che non cambia. Un journal con una pagina che le giocatrici vedono da sé (una visibilità sua, che vale anche col journal a None) è un problema, salvo se lo stesso file mette da parte anche quella pagina. Un attore con un token su una scena è un problema: il token si toglie prima; lo è anche il personaggio di una giocatrice. Una macro nella barra di una giocatrice è un avviso.

Ognuno porta il segno `flags.gdr-strumenti.daParte`, con il carico, il `rif` e com'era prima (la pagina della nota; per gli altri nome, cartella e visibilità), per tornare indietro a mano. Nel piano, l'azione `mettiDaParte`, con chi lo vedeva (`vedevano`); nel registro del carico, l'uuid. Al rilancio un documento già da parte (col segno, di qualunque carico) non si tocca, ma se una giocatrice lo vede di nuovo (per una nota, la pagina a cui è legata) è un problema. Uno che non c'è più è il lavoro finito, fra i saltati, se il registro dice che questo carico l'aveva messo da parte: per questo la voce può restare nei dati. Se il registro non lo dice, l'uuid è sbagliato, o il GM l'ha cancellato prima: è un problema, e la voce si toglie dai dati. Un documento che lo stesso file scrive in un'altra operazione non si mette da parte, e un collegamento o una nota del file non portano a un documento che il file mette da parte: sono problemi. Un documento messo da parte conta come solo GM: una pagina che si mostra non ci porta, e «Scopri» non lo tocca (né come posto né come segnaposto). Il caricatore lo controlla dopo tutto il resto, con la stessa fotografia del mondo e la stessa firma, e lo scrive subito dopo journal e pagine, prima di tabelle, attori, scene e macro: si toglie prima di aggiungere (un tassello nuovo non finisce sopra uno vecchio ancora visibile). La verifica, quando c'è qualcosa da fare, rilegge il segno, la cartella o la pagina, e che nessuna giocatrice lo veda.

**Dove vanno le pagine nuove** (`ordine` del journal). Senza `ordine` la sequenza è quella delle pagine del file, nel loro ordine, senza vincolo di contiguità: una pagina nuova in mezzo al file va in mezzo, fra le sue vicine, e conta solo l'ordine delle pagine attorno a lei; un journal senza pagine nuove e senza livelli che cambiano non si controlla nell'ordine. Con `ordine` la sequenza vale tutta, e la verifica la controlla:

| Campo | |
|---|---|
| `sequenza` | l'ordine voluto, dall'alto: il `rif` di una pagina del file, `{ "id": "…" }` per una pagina che c'è già (una pagina che il carico non tocca, come un handout di un altro lavoro), o `{ "carico": "…", "rif": "…" }` per una pagina scritta da un altro carico (si trova dal suo segno, anche se il carico l'ha adottata da uno script di prima). Ogni pagina del file deve esserci |
| `contigua` | `true` (predefinito): fra la prima e l'ultima pagina della sequenza non ci devono essere altre pagine |
| `seMancaAncora` | che fare se una pagina della sequenza che non è del file non c'è ancora (la pagina dopo cui vanno le nuove, che arriva con un altro carico): `"problema"` (predefinito) o `"rimanda"`, che salta le pagine nuove di questo journal con una nota; si rilancia dopo |

Le pagine che ci sono già non si spostano mai. Se non sono nell'ordine della sequenza (le ha spostate qualcuno, o i dati le vogliono in un altro ordine), il caricatore si ferma: decide il GM, e l'ordine si riporta nella fonte dei dati. Dopo una pagina che c'è, le pagine nuove vanno dopo le sue figlie che non sono della sequenza, così restano figlie di lei, e prima della pagina estranea che viene subito dopo: mai sopra una pagina del GM trascinata in mezzo. L'indice del journal si controlla prima e dopo il piano: una pagina che non è dei dati deve restare figlia della stessa pagina (una pagina di livello 2 o 3 è figlia della pagina prima di lei con un livello più basso), e due pagine non hanno mai lo stesso sort. Le pagine con una categoria (Foundry V13 e dopo) non si gestiscono: un journal che ne ha, se il carico ci crea pagine o ne cambia il livello, si ferma.

### L'HTML ammesso

Il caricatore legge l'HTML in un documento inerte (niente immagini scaricate, niente codice eseguito) e ammette solo:

- gli elementi `p`, `br`, `strong`, `em`, `b`, `i`, `u`, `s`, `sub`, `sup`, `span`, `div`, `section`, `h1`…`h6`, `ul`, `ol`, `li`, `blockquote`, `hr`, `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `img`, `figure`, `figcaption`, `code`, `pre`;
- gli attributi `class` (con le classi fisse e quelle di `campagna.classi`; `secret` e `revealed` solo su `section`, perché Foundry nasconde solo `section.secret`), `style` (solo `text-align`), `id` solo su `section.secret` (`secret-…`, unico nella pagina; ogni blocco segreto ne ha uno), `src` e `alt` su `img` (`src` elencato in `file`), `colspan` e `rowspan` sulle celle, `start` sugli elenchi numerati;
- testo, senza i comandi di Foundry (`@UUID`, `@Embed`, `@Compendium` e ogni altro `@Parola[`, gli arricchitori come `&Reference[`, e i tiri in linea `[[…]]`), salvo i collegamenti scritti come sotto.

Ogni altra cosa è un problema, con la pagina e il punto (gli attributi di `html` e `body`, che il parser scarta, non contano).

**I collegamenti.** Un collegamento dei dati a un documento che è in Foundry il generatore lo scrive `@GDR[<bersaglio>]{<etichetta>}`, e il caricatore lo converte nel collegamento di Foundry, `@UUID[…]{<etichetta>}`. Il bersaglio è:

- il `rif` di una pagina o di un journal del file;
- `<carico>/<rif>`, un documento scritto da un altro carico;
- un documento che c'è già, per id: `JournalEntry.<id>`, `JournalEntry.<id>.JournalEntryPage.<id>`, `Actor.<id>`, `Item.<id>`, `RollTable.<id>`, `Macro.<id>`. Un journal adottato da uno script di prima (come il journal del gruppo, dato coi suoi `id` e `crea: false`) non ha il segno: da un altro carico si cita così, per id.

Per una pagina si può aggiungere una sezione, `#<titolo della sezione>`, col testo del titolo com'è nella pagina (per una pagina con `aggiorna: false`, com'è nel mondo): l'ancora la calcola Foundry (`JournalEntryPage.slugifyHeading`), e il titolo, e la sua ancora, devono esserci una volta sola. Se la pagina a cui porta il collegamento resta com'è nel mondo (non si aggiorna, o ha un ritocco che i dati non toccano), il titolo si cerca nel mondo: se il GM l'ha cambiato, è un problema quando il collegamento si scrive, un avviso quando sta in una pagina che il carico non tocca. Il caricatore si ferma anche se il bersaglio non c'è, se c'è più di una volta, se una pagina che si mostra porta a un documento solo GM, a una macro o a una tabella.

### Le regole fisse

I dati non le cambiano:

1. Ogni documento nuovo nasce a None, journal e cartelle compresi; una pagina può nascere diversa solo con la sua `visibilita` e la sua `decisione`. Una pagina solo GM (col suffisso nel nome, o in un journal col suffisso) nasce sempre a None. Sulle scene, un tassello o un disegno nasce nascosto, salvo `visibile` con la `decisione`; una nota che le giocatrici vedrebbero vuole la `decisione`.
2. Il caricatore non cambia mai la visibilità di un documento che c'è già (né quella di un tassello o di un disegno), salvo per toglierla con `daParte`, e non porta mai un journal a Observer: la visibilità la gestisce il GM.
3. Non cancella niente, non sposta né rinomina journal e cartelle, non sposta le pagine che ci sono (salvo `daParte`, che sposta nella sua cartella un journal, un attore, una tabella o una macro, e rinomina una pagina); un elemento di una scena si sposta solo se i dati ne danno la posizione, in tre come gli altri campi.
4. Aggiorna una pagina che c'è solo se è ancora com'era all'ultima scrittura (sotto).
5. Nelle pagine che si mostrano, niente titoli dentro un blocco segreto e niente parole da DM nel nome o nel testo, salvo nel blocco del riquadro per il DM, non rivelato.
6. Una pagina solo GM che una giocatrice vede già, o vedrebbe se il suo journal andasse a Observer, è un problema anche se il carico non la tocca.
7. Le versioni di Foundry e di dnd5e sono fissate: oggi Foundry 14.369 e dnd5e 6.0.6. Dopo un aggiornamento il caricatore si ferma finché non è riverificato con la prova a vuoto sui carichi già fatti, e la versione nuova si scrive nel codice (`VERIFICATO`, in [`carica/comune.mjs`](../modulo/scripts/carica/comune.mjs)) con la sua revisione.

### Ritrovare i documenti e aggiornarli

Ogni documento che il caricatore crea ha un **id fisso**, calcolato dal mondo, dal `carico` e dal `rif`, e un **segno** nei suoi dati (`flags.gdr-strumenti.carico`), con una chiave calcolata da `carico` e `rif` e, per le pagine, quello che il caricatore ci ha scritto: nome, livello, l'impronta del testo (o immagine e didascalia). Così un rilancio ritrova i documenti anche se il GM li ha rinominati, e non ne fa doppioni. Un documento si cerca:

1. per l'`id` del file, se c'è (un documento caricato prima, da una corrispondenza tenuta a parte): se non c'è più, l'ha tolto qualcuno, ed è un problema; se un altro documento porta il suo segno, anche;
2. per l'id fisso, poi per il segno: se c'è, deve essere uno solo (un journal duplicato porta i segni con sé);
3. se non c'è dove i dati lo vogliono ma il suo segno sta altrove (una pagina in un altro journal), è un problema: l'ha spostata qualcuno, o i dati l'hanno cambiata di posto, e il caricatore non la rifà;
4. se il **registro** del caricatore dice che il carico l'ha già scritto, nel mondo non c'è più: l'ha tolto qualcuno, ed è un problema; con `ricrea: true` si ricrea. Il registro è un'impostazione nascosta del mondo, del modulo (`gdr-strumenti.carichi`): per ogni carico, indicato con un'impronta del nome, la chiave, il tipo e l'id di ogni documento del piano. Si scrive prima dei documenti, col blocco del mondo preso: se non si scrive, non si scrive niente; dopo, se una creazione non è riuscita, se ne toglie la voce, e solo quella: un documento ritrovato che il GM toglie durante il carico resta nel registro. Se anche questo non riesce, o il carico si ferma per un errore imprevisto, al rilancio quel documento sembra «tolto da qualcuno», dal lato sicuro, e il rapporto lo dice. Con l'`id` nei dati, `ricrea` non basta: per ricreare si toglie l'`id`;
5. per nome, nello stesso posto (la pagina nel suo journal, la cartella nella sua cartella madre, il journal in tutto il mondo): se c'è un documento con quel nome che non è di questo carico, è un problema; una cartella sola senza segno si usa (sopra, «cartella»);
6. se non c'è, si crea.

Per una pagina che c'è, ogni caratteristica (nome, livello, testo; per un'immagine il file e la didascalia) si confronta in tre: com'è nel mondo, com'è nei dati, come l'aveva lasciata l'ultima scrittura (il segno, o `precedente`):

- nel mondo è come nei dati: niente da fare;
- nel mondo è diversa dai dati ma come l'ultima scrittura: i dati sono cambiati, e si aggiorna;
- nel mondo è diversa dall'ultima scrittura, e i dati sono come l'ultima scrittura: l'ha cambiata qualcuno in Foundry, e i dati non la vogliono cambiare lì. Resta com'è, con un avviso: un ritocco di testo o di nome si riporta nella fonte dei dati, blocchi rivelati e parentesi riempite restano nel mondo;
- nel mondo è diversa dall'ultima scrittura, e i dati la vogliono diversa ancora, o l'ultima scrittura non si conosce: il caricatore si ferma con il motivo. Decide il GM; il ritocco si riporta nella fonte dei dati, e i dati rigenerati lo portano (o, se il mondo differisce solo per la forma, `accetta`).

Un testo che si aggiorna non si scrive mai sopra blocchi rivelati o parentesi già riempite, qualunque cosa dica l'ultima scrittura. Una pagina che i dati vogliono solo GM e nel mondo non lo è, o il contrario, ferma il carico; lo stesso per un journal.

Se una pagina è in tutto come nei dati ma il suo segno non lo dice, il piano rinnova il segno: una scrittura dei soli dati del caricatore, che non cambia niente di quello che si vede.

Il testo si confronta con un'impronta (SHA-256) della sua forma canonica: la struttura degli elementi, gli attributi in ordine, lo stile scritto sempre allo stesso modo, gli spazi ridotti a uno. Non contano le riscritture che non cambiano quello che si legge: `text-align: center` che il server scrive `text-align:center`, e quelle dell'editor di Foundry (`<b>` per `<strong>`, `<i>` per `<em>`, uno `<span>` senza attributi, un paragrafo vuoto, il `<p>` dentro una voce d'elenco, una cella o una citazione). Contano un blocco rivelato, una parola, uno spazio fra due parole, un'immagine. Da provare nel mondo, nella prova a vuoto: una pagina salvata nell'editor senza cambiare niente deve dare «niente da fare».

### Il rapporto

| Campo | |
|---|---|
| `problemi` | quello che ferma il carico: con un problema la prova non è pulita e «applica» non scrive |
| `avvisi` | quello che va letto ma non ferma: le pagine ritoccate in Foundry che i dati non cambiano, il riquadro per il DM rivelato in una pagina che si mostra, le differenze delle pagine con `aggiorna: false`, un journal o una cartella rinominati dal GM, la visibilità dei dati su una pagina che c'è già, le giocatrici che possono sfogliare i file del server; chi altro è connesso, coi rischi che il caricatore non vede; `consenti`, che non serve più; una tabella ritoccata in Foundry che i dati non cambiano; un attore che c'è con nome, nome vero, cartella o visibilità diversi dai dati; un numero del tiro senza voce; `senzaArmatura` senza la CA attesa |
| `numeri` | nella prova, per ogni attore nuovo: CA, taglia, abilità, vantaggi, armi (tiro per colpire e danni), costruiti in memoria |
| `daConvertire` | sempre vuoto: la conversione in metri la fa il caricatore (resta per i lettori di rapporti di prima) |
| `note` | il resto: con un problema nelle cartelle o nelle pagine, che tabelle, attori, scene e macro non sono ancora controllati; gli attori nuovi convertiti in metri, un token o un'immagine del compendio in un modulo non attivo, le pagine rimandate, le pagine di un carico che non sono più nei dati (non si toccano), i file da togliere dal server |
| `consenti` | i nomi dell'opzione `consenti` della chiamata, se c'è (senza ripetizioni); non conta |
| `piano` | cosa farebbe, operazione per operazione (per una nota, un tassello o un disegno, col suo `rif`): crea, aggiorna (coi campi), segna, adotta (una cartella che c'è già, sopra, «cartella»), mettiDaParte (sopra, «daParte»); i testi no, perché il rapporto finisce in un file. Per una nota che nasce o cambia pagina, chi la vede (`vedono`) e chi la vedeva (`vedevano`) |
| `saltati` | cosa c'è già com'è nei dati |
| `firma` | l'impronta del piano completo, dei dati e della versione del caricatore: «applica» scrive solo con questa |
| `vedrebbero` | per ogni journal toccato, quali pagine vedrebbe ciascuna giocatrice se il journal andasse a Observer |
| `corrispondenze` | per ogni documento del file, `rif`, tipo, id e nome nel mondo: per chi tiene la corrispondenza fra i dati e il mondo |
| `scritto`, `errori` | dopo «applica»: le scritture riuscite (una conta solo se Foundry restituisce il documento) e quelle no |
| `verifica` | dopo «applica»: la rilettura dal mondo, voce per voce, `OK` o `KO`; un collegamento si controlla aprendo il suo documento e, se porta a una sezione, trovandone il titolo |
| `esito` | `prova pulita`, `prova con problemi`, `OK`, `da guardare` (un errore o una verifica `KO`), `fermato` |
| `salvato` | dove sta il rapporto in `Data/<cartellaRapporti>/`, riletto dopo il salvataggio. La prova non lo salva |

Il rapporto ha i nomi delle pagine e i titoli, anche di quelle non mostrate, e il server lo dà a chi ne sa il nome: finito il lavoro si toglie dalla cartella, insieme al file di dati se si è usato `file`, e si conserva a parte.

### Le guardie

- Chi lancia: l'`utente` delle opzioni, col ruolo Gamemaster pieno.
- Il mondo del file, e le versioni verificate (regola 7).
- Chi altro è connesso non ferma il caricatore, né nella prova né in «applica». Le scritture di altri fra la prova e «applica» le ferma la firma, con la fotografia del mondo, come prima; quello che un altro salva dopo «applica» non lo vedeva nemmeno il controllo dei connessi. Un avviso nel rapporto dice chi è connesso e i rischi che il caricatore non vede: una giocatrice connessa vede subito quello che i dati le rendono visibile (pagine, note della scena, attori), e uno stato a metà se il carico si ferma; un GM con un documento aperto in modifica (una pagina, una scheda, una configurazione), se poi salva, riporta indietro quello che scrive il caricatore, quindi va chiuso prima di «applica».
- Due «applica» insieme: nello stesso browser (due schede) il secondo si ferma (Web Locks, che ci sono solo su una pagina in un contesto sicuro: su un indirizzo http senza TLS mancano, se il browser non tratta l'indirizzo come sicuro, e allora il rapporto lo dice fra gli avvisi e vale solo il blocco del mondo, sotto); fra browser diversi c'è il blocco del mondo, un'impostazione nascosta del modulo (`gdr-strumenti.caricoInCorso`) che il caricatore scrive, rilegge e lascia, e che scade dopo 15 minuti se un carico si interrompe. Per liberarlo prima, dopo aver controllato che nessun altro stia caricando: `await game.settings.set("gdr-strumenti", "caricoInCorso", {})`.
- Il mondo cambiato fra i controlli e la scrittura: prima di scrivere il caricatore rifà la fotografia dei journal e delle cartelle che tocca (e degli elementi delle scene e delle macro), e prima di ogni journal la sua; prima degli aggiornamenti di un journal ricontrolla l'ultima modifica di ogni pagina da aggiornare. Se qualcosa non torna si ferma. Scrive prima tutti i journal e le pagine nuove, poi gli aggiornamenti, così un collegamento scritto porta già a una pagina che c'è; poi tabelle e attori, poi gli elementi delle scene (una nota porta già a una pagina che c'è) e le macro, ricontrollando prima che gli elementi e le macro da aggiornare siano com'erano al piano.
- Le giocatrici che possono sfogliare i file del server (`FILES_BROWSE`): un avviso, perché vedono il rapporto e i dati finché non si tolgono.

**Le prove fuori dal mondo.** Le parti che non chiamano Foundry (il controllo dei dati, l'HTML, l'ordinamento) e il giro intero su un Foundry finto si provano in Node, con [`prove/prove.mjs`](../prove/prove.mjs), fuori dalla cartella del modulo perché non va nel server; con `GDR_SENZA_SUBTLE=1` le stesse prove girano come in un browser senza `crypto.subtle`, come su un indirizzo http senza TLS in un browser che non tratta l'indirizzo come sicuro. Scovano errori di battitura e di logica; non sostituiscono la prova a vuoto nel mondo, che fa entrare in uso ogni versione.

