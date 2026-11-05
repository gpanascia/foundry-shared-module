/**
 * Il caricatore — carica(opzioni): legge un file di dati, prova, e con «applica» crea o aggiorna nel mondo quello che il file descrive.
 * -------------------------------------------------------------------------------------------------------------------------------------
 * Una funzione sola al posto di uno script nuovo per ogni carico. Copre cartelle e pagine di journal; Roll Table e attori dal
 * compendio (carica/tabelle-attori.mjs); note, tasselli e disegni sulle scene, e macro di una riga (carica/scene.mjs); i documenti
 * da togliere, messi da parte e mai cancellati (carica/da-parte.mjs).
 * Formato del file di dati, regole fisse, rapporto: docs/caricatore.md.
 * Si lancia dalla console di un utente col ruolo Gamemaster:
 *   const r = await game.modules.get("gdr-strumenti").api.carica({ modo: "prova", utente: "<utente>", file: "<cartella>/….json", sha256: "…" });
 *   await game.modules.get("gdr-strumenti").api.carica({ modo: "applica", utente: "<utente>", file: "…", sha256: "…", firma: r.firma });
 * Il codice lo scarica ogni client: dentro non c'è niente di nessuna campagna, che arriva tutta coi dati.
 */
import { VERSIONE, nuovoRapporto, controllaOpzioni, leggiDati, guardie, colBlocco, salvaRapporto, sha256, jsonStabile,
  prendiBlocco, lasciaBlocco, aggiornaRegistro } from "./carica/comune.mjs";
import { controllaDati } from "./carica/dati.mjs";
import { pianifica, perLaFirma, esegui, verifica, vociRegistro, nonCreati, adottate } from "./carica/journal.mjs";
import { perLaFirmaTA, eseguiTA, verificaTA } from "./carica/tabelle-attori.mjs";
import { perLaFirmaS, eseguiS, verificaS } from "./carica/scene.mjs";
import { perLaFirmaDP, eseguiDP, verificaDP } from "./carica/da-parte.mjs";

export async function carica(opzioni = {}) {
  const report = nuovoRapporto(opzioni?.modo);
  globalThis.gdrCaricoUltimo = report;
  let D = null, scritto = false, piano = null;
  const fine = esito => { report.esito = esito; return report; };
  try {
    if ( !globalThis.game?.user || (game.user.role !== CONST.USER_ROLES.GAMEMASTER) ) {
      report.problemi.push("il caricatore lo lancia solo un utente col ruolo Gamemaster pieno");
      return fine("fermato");
    }
    if ( !controllaOpzioni(opzioni, report) ) return fine("fermato");
    const grezzi = await leggiDati(opzioni, report);
    if ( !grezzi ) return fine("fermato");
    D = controllaDati(grezzi, report);
    if ( !D ) return fine("fermato");
    guardie(report, opzioni, D);
    if ( report.problemi.length ) return fine("fermato");
    // i file del server: chi può sfogliarli li legge tutti, nomi difficili o no (il rapporto e, con «file», i dati)
    const sfogliano = game.users.filter(u => !u.isGM && u.can?.("FILES_BROWSE")).map(u => u.name);
    if ( sfogliano.length ) report.avvisi.push(`possono sfogliare i file del server: ${sfogliano.join(", ")}; vedono anche i file in Data/${D.campagna.cartellaRapporti}/ finché non si tolgono: lo si dice al GM`);
    const daTogliere = [...(opzioni.file ? [`Data/${opzioni.file}`] : []), ...((opzioni.modo === "applica") ? [`il rapporto in Data/${D.campagna.cartellaRapporti}/`] : [])];
    if ( daTogliere.length ) report.note.push(`finito il lavoro vanno tolti dal server: ${daTogliere.join(" e ")}. Hanno i nomi di tutte le pagine, anche quelle solo GM, e il server li dà a chi ne sa il nome; se servono, si conservano altrove`);

    piano = await pianifica(D, report);
    // con un problema nelle cartelle o nelle pagine il piano si ferma lì: il resto si controlla al giro dopo
    if ( !piano.tutto && !piano.senzaRegistro && (D.tabelle.length || D.attori.length || D.scene.length || D.macro.length || D.daParte.length) ) report.note.push("tabelle, attori, scene, macro e documenti da mettere da parte non sono ancora controllati: prima vanno risolti i problemi di cartelle e pagine (sopra), poi si rilancia la prova");
    report.corrispondenze = piano.corrispondenze.map(({ chiave, ...c }) => c);
    report.firma = await sha256(jsonStabile({ versione: VERSIONE, dati: report.dati.sha256, piano: { ...perLaFirma(piano), ...(await perLaFirmaTA(piano)), ...perLaFirmaS(piano), ...perLaFirmaDP(piano) } }));
    const rimandate = piano.journal.some(j => j.rimandate.length);
    // una cartella usata senza scriverla sta nel piano a ogni giro, ma non è da fare
    const daFare = report.piano.filter(x => x.azione !== "adotta").length;
    const nienteDaFare = () => report.note.push(rimandate ? "niente da fare per ora: le pagine rimandate (sopra) si caricano rilanciando quando c'è la pagina che aspettano" : "niente da fare: nel mondo è già tutto come nei dati");
    if ( opzioni.modo === "prova" ) {
      if ( !report.problemi.length && !daFare ) nienteDaFare();
      return fine(report.problemi.length ? "prova con problemi" : "prova pulita");
    }

    // applica: lo stesso piano della prova; poi, coi blocchi del browser e del mondo, la fotografia e la scrittura
    if ( report.problemi.length ) return fine("fermato");
    if ( opzioni.firma !== report.firma ) {
      report.problemi.push("la firma non è quella del piano di adesso: nel mondo, nei dati o nel caricatore è cambiato qualcosa dopo la prova; si rilancia la prova e si legge il piano nuovo");
      return fine("fermato");
    }
    const vuoto = !daFare;
    const partita = await colBlocco(async () => {
      const b = await prendiBlocco(D.carico);
      if ( !b.gettone ) { report.problemi.push(b.motivo); return; }
      if ( b.vecchio ) report.avvisi.push(b.vecchio);
      try {
        if ( piano.fotografia() !== piano.foto ) { report.problemi.push("il mondo è cambiato fra i controlli e la scrittura: non scrivo; si rilancia la prova"); return; }
        // il registro prima dei documenti: un documento registrato e non creato dà al più un «tolto da qualcuno» da guardare, mai una
        // ricreazione in silenzio; se il registro non si scrive, non si scrive niente
        if ( !(await aggiornaRegistro(report, D.carico, vociRegistro(piano), adottate(piano))) ) { report.problemi.push("il registro del caricatore non si scrive: non scrivo niente"); report.esito = "fermato"; return; }
        if ( vuoto ) { nienteDaFare(); report.esito = report.errori.length ? "da guardare" : "OK"; return; }
        scritto = true;
        const tutto = (await esegui(piano, report)) && (await eseguiDP(piano, report)) && (await eseguiTA(piano, report)) && (await eseguiS(piano, report));
        const togli = nonCreati(piano);
        if ( togli.length && !(await aggiornaRegistro(report, D.carico, [], togli)) ) report.note.push("il registro ha documenti non creati: al rilancio sembreranno «tolti da qualcuno»; si guarda il rapporto e si usa «ricrea»");
        await new Promise(r => setTimeout(r, 500));
        try { await verifica(piano, report); await verificaTA(piano, report); await verificaS(piano, report); await verificaDP(piano, report); } catch(err) { report.errori.push(`verifica: ${err.message}`); }
        if ( !tutto ) report.note.push("le scritture si sono fermate alla prima non riuscita: quelle dopo non sono state fatte (sopra, «scritto» ed «errori»); col rilancio si riprende da lì");
        report.esito = (tutto && !report.errori.length && report.verifica.length && report.verifica.every(v => v.startsWith("OK"))) ? "OK" : "da guardare";
        await salvaRapporto(report, D.campagna.cartellaRapporti, D.campagna.abbr);
      } finally { await lasciaBlocco(b.gettone); }
    }, report);
    if ( !partita ) report.problemi.push("un altro «applica» del caricatore è in corso in questo browser (un'altra scheda o un'altra finestra): non scrivo");
    return report.esito ? report : fine("fermato");
  } catch(err) {
    // un errore imprevisto non fa perdere il rapporto; se qualcosa è già scritto, il registro e il rapporto si salvano
    report.problemi.push(`errore imprevisto: ${err.message}`);
    report.errori.push(`errore imprevisto: ${err.stack ?? err.message}`);
    report.esito = scritto ? "da guardare" : "fermato";
    // le voci dei documenti che il piano doveva creare e che non ci sono restano nel registro (qui il blocco del mondo non c'è più):
    // al rilancio sembrano «tolti da qualcuno», dal lato sicuro; il rapporto lo dice
    if ( scritto && D && piano ) { const togli = nonCreati(piano); if ( togli.length ) report.note.push(`dopo l'errore, nel registro restano ${togli.length} documenti non creati: al rilancio sembreranno «tolti da qualcuno»; si guarda il rapporto e si usa «ricrea»`); }
    if ( scritto && D && !report.salvato ) await salvaRapporto(report, D.campagna.cartellaRapporti, D.campagna.abbr);
    return report;
  }
}
