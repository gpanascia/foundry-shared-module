# Contribuire

Chiunque può proporre una modifica al modulo: una funzione nuova, una correzione, un messaggio più chiaro. Questa pagina spiega come si fa, con le poche regole che valgono per tutti.

## Indice

- [Tre regole per tutti](#tre-regole-per-tutti)
- [Una proposta o un problema: le issue](#una-proposta-o-un-problema-le-issue)
- [Una modifica: la pull request](#una-modifica-la-pull-request)
- [Il caricatore](#il-caricatore)
- [Le prove](#le-prove)
- [Le versioni](#le-versioni)
- [Come si rivede una pull request](#come-si-rivede-una-pull-request)
- [Problemi di sicurezza](#problemi-di-sicurezza)
- [Licenza](#licenza)

## Tre regole per tutti

1. **Niente delle nostre campagne.** Né nomi, né luoghi, né fatti: nel codice, nei commenti, nelle prove, nelle issue, nelle pull request e nei messaggi dei commit. Il repository è pubblico, e Foundry manda i file del modulo, commenti compresi, a ogni giocatrice. Gli esempi si inventano, come «La locandiera: Mara Vell».
2. **Niente fuori dal server di Foundry.** Il codice non chiama indirizzi esterni e non carica risorse da internet (script, font, immagini): `fetch` e `import` vanno solo verso percorsi del server, che cominciano con `/`. Niente `eval`, `new Function` o codice costruito mentre gira. L'HTML costruito coi dati passa da `esc`, che rende innocui i caratteri speciali, o dal controllo dell'HTML del caricatore.
3. **Le giocatrici vedono solo quello che decide il GM.** Il modulo non dà permessi, non mostra pagine e non manda messaggi di sua iniziativa: lo fa su un'azione di chi lo usa, e per le cose del GM solo su un'azione del GM. Le funzioni del GM controllano che chi le lancia sia GM, e con `{ prova: true }` nessuna funzione scrive.

## Una proposta o un problema: le issue

Si comincia da una issue, coi modelli «Proposta» e «Problema»: cosa vorresti o cosa non funziona, con un esempio inventato. Per una modifica piccola, come un refuso, si può aprire direttamente la pull request.

## Una modifica: la pull request

1. Fai un fork del repository e, nel fork, un ramo per la modifica.
2. Cambia quello che serve, con lo stile dei file che tocchi: italiano per i messaggi, i commenti e i documenti, due spazi di rientro.
3. Fai girare le prove (sotto) e aggiungine per quello che cambia.
4. Se cambia `modulo/`, alza la versione (sotto, «Le versioni»).
5. Apri la pull request verso `master` e compila la lista del modello.

Su `master` non scrive nessuno direttamente: ci arriva solo una pull request approvata. Per provare la modifica nel tuo Foundry, copia `modulo/` in `Data/modules/gdr-strumenti/` e usa un mondo di prova ([README](README.md#installare-e-aggiornare)).

## Il caricatore

Il caricatore (`modulo/scripts/carica.mjs` e la cartella `modulo/scripts/carica/`) scrive nei mondi, e lo cambia solo chi cura il repository. Per il caricatore si apre una issue, non una pull request: una pull request che lo tocca si chiude, e la proposta continua in una issue. Il formato dei dati è in [docs/caricatore.md](docs/caricatore.md).

## Le prove

Le prove girano in Node 22 o più recente, su un Foundry finto:

```bash
cd prove
npm ci --ignore-scripts
npm test
npm run test:senza-subtle
```

`npm test` prova il caricatore, l'indice dei journal e «Scopri»; `npm run test:senza-subtle` rifà le prove del caricatore come in un browser senza `crypto.subtle`, cioè una pagina di Foundry servita senza HTTPS. Le stesse prove girano su GitHub a ogni pull request: per chi contribuisce la prima volta partono dopo un'approvazione. Le prove non sostituiscono quella nel mondo: dopo l'unione, la versione nuova si installa nei mondi e si prova lì.

## Le versioni

Una pull request che cambia `modulo/` alza la versione in tre posti, che devono dire la stessa cosa: `version` in `modulo/module.json`, `VERSIONE` in `modulo/scripts/carica/comune.mjs` e `versione` in `modulo/scripts/main.mjs`. Aggiunge anche una riga in cima al [CHANGELOG](CHANGELOG.md). Si alza la terza cifra per una correzione, la seconda per una funzione nuova o per un cambiamento di quello che si vede.

## Come si rivede una pull request

Chi cura il repository guarda le issue e le pull request aperte, di solito una volta al giorno. Di una pull request legge il codice, rifà le prove, controlla le tre regole e la sicurezza. Se c'è da cambiare qualcosa lo scrive nella pull request; se va bene, l'ultima parola spetta al GM, e la pull request si unisce a `master`. Poi la versione nuova si installa nei mondi e si prova lì: se qualcosa non va, la correzione è una pull request nuova.

## Problemi di sicurezza

Se trovi un modo per leggere o cambiare quello che il GM non mostra, non aprire una issue pubblica: segnalalo in privato, come dice [SECURITY.md](SECURITY.md). Prima si corregge, poi se ne parla.

## Licenza

Il codice è sotto [licenza MIT](LICENSE): chi contribuisce accetta che la sua modifica sia distribuita con la stessa licenza.
