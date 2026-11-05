/**
 * Il caricatore: note, tasselli e disegni su una scena che c'è, e le macro di una riga. Il piano, la scrittura e la verifica,
 * con le stesse regole delle pagine: id fissi, segno, registro, l'ultima scrittura conosciuta, niente cancellazioni.
 * Regole: docs/caricatore.md, «Le scene» e «Le macro».
 *
 * La scena non si crea e non si cambia: dentro, un elemento nasce coi campi dei dati, e uno che c'è cambia solo nei campi che i dati
 * danno, se nel mondo sono ancora come li aveva lasciati l'ultima scrittura. Chi vede cosa non si tocca mai: un tassello o un
 * disegno nasce nascosto (visibile solo con una decisione del GM, scritta nei dati) e poi la sua visibilità è del GM e di «Scopri»;
 * una nota la vede chi vede la pagina che apre, e una nota che le giocatrici vedrebbero (nuova, o legata a una pagina che vedono e
 * prima no) vuole la decisione del GM. Livello e blocco valgono solo alla nascita, e i flag del mondo anche, salvo quelli che i dati
 * correggono dando in «precedente» il valore di prima: poi l'ultima scrittura dei flag sta nel segno.
 * Una macro è una riga che chiama una funzione del modulo: nasce a None, ed è solo del GM.
 */
import { MODULO, SEGNO, jsonStabile, sha256, controllaFile, esisteFile, scrivi } from "./comune.mjs";
import { contieneNome } from "./html.mjs";
import { COMANDO, testiDi, CAMPI } from "./dati-scene.mjs";

const segnoDi = d => d?.flags?.[MODULO]?.[SEGNO] ?? null;
const uguali = (a, b) => jsonStabile(a) === jsonStabile(b);
const clona = x => JSON.parse(JSON.stringify(x));
const TIPO = { nota: "Note", tassello: "Tile", disegno: "Drawing" };
const RACCOLTA = { nota: "notes", tassello: "tiles", disegno: "drawings" };
const UUID_JOURNAL = /^JournalEntry\.([A-Za-z0-9]{16})(?:\.JournalEntryPage\.([A-Za-z0-9]{16}))?$/;

// --- i campi: come si leggono dal mondo (toObject) e come si scrivono, nella forma dei dati -------------------------------------------
const colore = c => { if ( (c === null) || (c === undefined) ) return null; if ( typeof c === "number" ) return `#${c.toString(16).padStart(6, "0")}`; return String(c?.css ?? c).toLowerCase(); };
const ANCORA = () => { const A = CONST.TEXT_ANCHOR_POINTS; return { centro: A.CENTER, sotto: A.BOTTOM, sopra: A.TOP, sinistra: A.LEFT, destra: A.RIGHT }; };
const FORMA = () => { const T = CONST.DRAWING_TYPES; return { rettangolo: T.RECTANGLE, ellisse: T.ELLIPSE, poligono: T.POLYGON }; };
const inverso = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const LEGGI = {
  nota: {
    posizione: o => ({ x: o.x, y: o.y }), pagina: o => ({ entryId: o.entryId ?? null, pageId: o.pageId ?? null }), testo: o => o.text ?? "",
    icona: o => o.texture?.src ?? null, tinta: o => colore(o.texture?.tint) ?? "#ffffff", dimensioneIcona: o => o.iconSize ?? null,
    dimensioneTesto: o => o.fontSize ?? null, ancoraTesto: o => inverso(ANCORA())[o.textAnchor] ?? null, ordine: o => o.sort ?? 0 },
  tassello: { immagine: o => o.texture?.src ?? null, area: o => ({ x: o.x, y: o.y, larghezza: o.width, altezza: o.height }), ordine: o => o.sort ?? 0 },
  disegno: {
    area: o => ({ x: o.x, y: o.y, forma: { tipo: inverso(FORMA())[o.shape?.type] ?? String(o.shape?.type), larghezza: o.shape?.width ?? 0, altezza: o.shape?.height ?? 0, punti: [...(o.shape?.points ?? [])] } }),
    testo: o => o.text ?? "", dimensioneTesto: o => o.fontSize ?? null, coloreTesto: o => colore(o.textColor) ?? "#ffffff",
    riempimento: o => (!o.fillType ? null : (o.fillType === CONST.DRAWING_FILL_TYPES.SOLID) ? { colore: colore(o.fillColor) ?? "#ffffff", alpha: o.fillAlpha } : { altro: o.fillType }),
    bordo: o => (o.strokeWidth ? { colore: colore(o.strokeColor) ?? "#ffffff", spessore: o.strokeWidth, alpha: o.strokeAlpha } : null),
    ordine: o => o.sort ?? 0 }
};
const SCRIVI = {
  nota: {
    posizione: v => ({ x: v.x, y: v.y }), pagina: v => ({ entryId: v.entryId, pageId: v.pageId }), testo: v => ({ text: v }), icona: v => ({ "texture.src": v }),
    tinta: v => ({ "texture.tint": v }), dimensioneIcona: v => ({ iconSize: v }), dimensioneTesto: v => ({ fontSize: v }), ancoraTesto: v => ({ textAnchor: ANCORA()[v] }), ordine: v => ({ sort: v }) },
  tassello: { immagine: v => ({ "texture.src": v }), area: v => ({ x: v.x, y: v.y, width: v.larghezza, height: v.altezza }), ordine: v => ({ sort: v }) },
  disegno: {
    area: v => ({ x: v.x, y: v.y, "shape.type": FORMA()[v.forma.tipo], "shape.width": v.forma.larghezza, "shape.height": v.forma.altezza, "shape.points": [...v.forma.punti] }),
    testo: v => ({ text: v }), dimensioneTesto: v => ({ fontSize: v }), coloreTesto: v => ({ textColor: v }),
    riempimento: v => (v ? { fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: v.colore, fillAlpha: v.alpha } : { fillType: CONST.DRAWING_FILL_TYPES.NONE }),
    bordo: v => (v ? { strokeWidth: v.spessore, strokeColor: v.colore, strokeAlpha: v.alpha } : { strokeWidth: 0 }),
    ordine: v => ({ sort: v }) }
};
/** Chi vede adesso una nota legata a { entryId, pageId }, come Foundry: la pagina, se no il journal, se no chiunque (nomi, in ordine). */
const vedonoDove = ({ entryId, pageId }) => {
  const giocatrici = game.users.filter(u => !u.isGM);
  const J = entryId ? game.journal.get(entryId) : null;
  const d = (pageId ? J?.pages.get(pageId) : null) ?? J;
  return (d ? giocatrici.filter(u => d.testUserPermission(u, "LIMITED")) : giocatrici).map(u => u.name).sort();
};
const leggiTutti = (genere, o, chiavi) => Object.fromEntries(chiavi.map(k => [k, LEGGI[genere][k](o)]));
const scriviTutti = (genere, valori) => Object.assign({}, ...Object.entries(valori).map(([k, v]) => SCRIVI[genere][k](v)));
const leggiMacro = (d, chiavi) => Object.fromEntries(chiavi.map(k => [k, (k === "nome") ? d.name : (k === "comando") ? String(d.command ?? "").trim() : (d.img ?? null)]));
const scriviMacro = valori => Object.assign({}, ...Object.entries(valori).map(([k, v]) => ({ [{ nome: "name", comando: "command", img: "img" }[k]]: v })));

/**
 * L'ultima scrittura conosciuta, campo per campo, come per pagine e tabelle: un campo cambia solo se nel mondo è com'era all'ultima
 * scrittura; uno ritoccato in Foundry che i dati non cambiano resta com'è; uno ritoccato che i dati vogliono diverso è un conflitto.
 */
function treStati({ mondo, dati, prima, accetta, intera, A, dove }) {
  const accettato = !!accetta && (accetta === intera);
  if ( accettato ) Object.assign(prima, mondo);
  const noto = k => prima[k] !== undefined;
  const cambia = [], ritocchi = [], conflitti = [];
  for ( const k of Object.keys(dati) ) {
    if ( uguali(mondo[k], dati[k]) ) continue;
    if ( noto(k) && uguali(mondo[k], prima[k]) ) cambia.push(k);
    else if ( noto(k) && uguali(dati[k], prima[k]) ) ritocchi.push(k);
    else conflitti.push(k);
  }
  // un «accetta» che non è l'impronta nel mondo si dice solo se c'è un conflitto (dopo un carico riuscito resta nei dati, e non serve più)
  if ( accetta && !accettato && conflitti.length ) A.push(`${dove}: «accetta» non è l'impronta nel mondo (${intera}): ignorato`);
  return { cambia, ritocchi, conflitti, tieni: k => (ritocchi.includes(k) ? prima[k] : dati[k]) };
}

// --- il piano -------------------------------------------------------------------------------------------------------------------------
/** Le scene e le macro dei dati, nel piano. ctx: quello che pianifica (journal.mjs) ha già, con bersaglio (i collegamenti). */
export async function pianificaScene(ctx) {
  const { D, report, id, chiave, trova, cartellaPiano, piano, bersaglio } = ctx;
  const P = report.problemi, A = report.avvisi;
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const giocatrici = game.users.filter(u => !u.isGM);
  piano.elementi = []; piano.macro = [];

  // chi vedrà una nota: chi vede la pagina che apre (o il journal, se la nota non ha pagina); le pagine e i journal che il carico crea
  // con la visibilità che avranno alla nascita; una nota senza journal la vede chiunque
  const nuoveP = new Map(), nuoviJ = new Map();
  for ( const j of piano.journal ) {
    const jOwn = j.dati?.ownership ?? game.journal.get(j.id)?.ownership ?? { default: L.NONE };
    if ( j.dati ) nuoviJ.set(j.id, j.dati.ownership);
    for ( const p of j.crea ) nuoveP.set(`${j.id}.${p._id}`, { own: p.ownership, jOwn });
  }
  const liv = (own, u) => own?.[u.id] ?? own?.default;
  const vedeOwn = (own, jOwn, u) => { let l = liv(own, u); if ( (l === undefined) || (l < 0) ) l = liv(jOwn, u); return (l ?? 0) >= L.LIMITED; };
  const nomi = us => us.map(u => u.name);
  /** dopo il carico; null se la pagina (o il journal) non c'è e non si crea in questo giro */
  const vedranno = ({ entryId, pageId }) => {
    if ( !entryId ) return nomi(giocatrici);
    const n = pageId ? nuoveP.get(`${entryId}.${pageId}`) : null;
    if ( n ) return nomi(giocatrici.filter(u => vedeOwn(n.own, n.jOwn, u)));
    const J = game.journal.get(entryId);
    if ( !J ) return (!pageId && nuoviJ.has(entryId)) ? nomi(giocatrici.filter(u => vedeOwn(nuoviJ.get(entryId), {}, u))) : null;
    const d = pageId ? J.pages.get(pageId) : J;
    return d ? nomi(giocatrici.filter(u => d.testUserPermission(u, "LIMITED"))) : null;
  };
  /** adesso, come Foundry: la pagina, se no il journal, se no chiunque */
  const vedonoOra = ({ entryId, pageId }) => {
    const J = entryId ? game.journal.get(entryId) : null;
    const d = (pageId ? J?.pages.get(pageId) : null) ?? J;
    return d ? nomi(giocatrici.filter(u => d.testUserPermission(u, "LIMITED"))) : nomi(giocatrici);
  };
  const ids = uuid => { const m = String(uuid ?? "").match(UUID_JOURNAL); return m ? { entryId: m[1], pageId: m[2] ?? null } : null; };
  const risolvi = (b, dove) => {
    let uuid = b;
    if ( !UUID_JOURNAL.test(b) ) { const r = bersaglio(b); if ( r.problema ) { P.push(`${dove}: ${r.problema}`); return null; } uuid = r.uuid; }
    const x = ids(uuid);
    if ( !x ) P.push(`${dove}: «${b}» non è una pagina o un journal`);
    return x;
  };
  const immagine = async (src, dove) => {
    const no = D.file.has(src) ? await controllaFile(src, D.file.get(src)) : await esisteFile(src);
    if ( no ) P.push(`${dove}: immagine ${src}: ${no}`);
    return !no;
  };
  // i nomi veri degli attori del mondo, non ancora rivelati: i testi di note e disegni li riceve anche chi gioca (nei messaggi, l'id)
  const veriMondo = game.actors.filter(a => a.flags?.[MODULO]?.nomi?.vero && (a.flags[MODULO].nomi.rivelato !== true)).map(a => ({ id: a.id, vero: String(a.flags[MODULO].nomi.vero) }));
  const svelano = testi => veriMondo.filter(v => testi.some(z => z && contieneNome(z, v.vero))).map(v => v.id);
  // un aggiornamento costruito in memoria: dopo, i campi si rileggono come nei dati (la prova scova un campo che Foundry non tiene)
  const costruito = (dove, o, genere, attesi) => {
    const letti = leggiTutti(genere, o, Object.keys(attesi));
    const diversi = Object.keys(attesi).filter(k => !uguali(letti[k], attesi[k]));
    if ( diversi.length ) P.push(`${dove}: costruito in memoria, ${diversi.join(", ")} non tornano (${diversi.map(k => `${jsonStabile(letti[k])} invece di ${jsonStabile(attesi[k])}`).join("; ")})`);
  };

  // --- gli elementi delle scene ---------------------------------------------------------------------------------------------------------
  for ( const Sd of D.scene ) {
    const S = game.scenes.get(Sd.id);
    const ds = `scena «${Sd.nome ?? Sd.id}»`;
    if ( !S ) { P.push(`${ds}: la scena ${Sd.id} non c'è nel mondo (il caricatore non crea scene)`); continue; }
    if ( Sd.nome && (S.name !== Sd.nome) ) A.push(`${ds}: nel mondo si chiama «${S.name}» (${S.id})`);
    for ( const e of Sd.elementi ) {
      const g = e.genere;
      const dove = `${ds}, ${g} «${e.rif}»`;
      const n0 = P.length;
      const doc = trova(S[RACCOLTA[g]], e, e.rif, dove, g);
      if ( P.length > n0 ) continue;
      const dati = clona(e.campi);
      if ( dati.pagina !== undefined ) { const r = risolvi(dati.pagina, dove); if ( !r ) continue; dati.pagina = r; }
      const sv = svelano([dati.testo, dati.icona, dati.immagine, ...(doc ? [] : testiDi(e.nascita.flagsMondo ?? null))]);
      if ( sv.length ) { P.push(`${dove}: nel testo, nel nome del file o nei flag del mondo c'è il nome vero, non ancora rivelato, di ${sv.join(", ")}`); continue; }
      const x = { e, sid: S.id, scena: S.name, doc, eid: doc?.id ?? id.get(e.rif), valori: dati, nome: e.rif };
      if ( !doc ) {
        // un elemento nuovo: coi campi dei dati, nel livello dei dati, nascosto (una nota: la vede chi vede la sua pagina)
        if ( !S.levels?.get?.(e.nascita.livello) ) { P.push(`${dove}: il livello ${e.nascita.livello} non c'è nella scena`); continue; }
        if ( g === "nota" ) {
          const v = vedranno(dati.pagina);
          if ( v === null ) { P.push(`${dove}: la pagina che apre non c'è nel mondo, e non si crea in questo giro`); continue; }
          if ( v.length && !e.decisione ) { P.push(`${dove}: la vedrebbero ${v.join(", ")}, che vedono la pagina che apre: serve la decisione del GM, con la data, in «decisione»`); continue; }
          x.vedono = { prima: null, dopo: v };
        }
        const data = { _id: x.eid, levels: [e.nascita.livello], ...scriviTutti(g, dati),
          flags: { ...(e.nascita.flagsMondo ? { world: clona(e.nascita.flagsMondo) } : {}), [MODULO]: {} } };
        if ( g !== "nota" ) { data.hidden = e.nascita.visibile !== true; data.locked = e.nascita.bloccato !== false; }
        if ( g === "tassello" ) data.alpha = 1;
        // il segno ha tutti i campi, anche quelli che i dati non danno (come nascono): così un campo aggiunto dopo ai dati ha la sua
        // ultima scrittura, e si aggiorna se nessuno l'ha toccato
        try {
          const o0 = new CONFIG[TIPO[g]].documentClass(clona(foundry.utils.expandObject(data)), { parent: S }).toObject();
          x.segno = { v: 1, chiave: chiave.get(e.rif), campi: { ...leggiTutti(g, o0, Object.keys(CAMPI[g])), ...clona(dati) } };
        } catch(err) { P.push(`${dove}: costruito in memoria non valido: ${err.message}`); continue; }
        data.flags[MODULO][SEGNO] = x.segno;
        x.dati = foundry.utils.expandObject(data);
        try {
          const o = new CONFIG[TIPO[g]].documentClass(clona(x.dati), { parent: S }).toObject();
          costruito(dove, o, g, dati);
          if ( !(o.levels ?? []).includes(e.nascita.livello) ) P.push(`${dove}: costruito in memoria, senza il suo livello`);
          if ( (g !== "nota") && (o.hidden !== x.dati.hidden) ) P.push(`${dove}: costruito in memoria, nascosto non è come nel piano`);
          if ( !uguali(segnoDi(o), x.segno) ) P.push(`${dove}: costruito in memoria, senza il segno`);
          if ( e.nascita.flagsMondo && !uguali(o.flags?.world ?? null, e.nascita.flagsMondo) ) P.push(`${dove}: costruito in memoria, i flag del mondo non sono come nei dati`);
        } catch(err) { P.push(`${dove}: costruito in memoria non valido: ${err.message}`); continue; }
        const m0 = P.length;
        for ( const src of [dati.icona, dati.immagine].filter(Boolean) ) await immagine(src, dove);
        if ( P.length > m0 ) continue;
        x.azione = "crea";
        piano.elementi.push(x);
        continue;
      }
      // l'elemento c'è: com'è nel mondo, com'è nei dati, come l'aveva lasciato l'ultima scrittura
      const o = doc.toObject();
      if ( e.nascita.livello && !(o.levels ?? []).includes(e.nascita.livello) ) A.push(`${dove}: nel mondo non è nel livello dei dati; il livello non si cambia`);
      const mondo = leggiTutti(g, o, Object.keys(dati));
      const s = segnoDi(doc);
      x.segnoPrima = clona(s);
      let prima = {};
      if ( s && Object.keys(e.precedente ?? {}).length ) A.push(`${dove}: ha già il segno del caricatore: «precedente» non conta più per i campi, e si può togliere dai dati`);
      if ( s ) prima = clona(s.campi ?? {});
      else if ( e.precedente ) {
        prima = clona(e.precedente);
        if ( prima.pagina !== undefined ) prima.pagina = (prima.pagina === null) ? { entryId: null, pageId: null } : ids(prima.pagina);
      }
      x.intera = await sha256(jsonStabile(mondo));
      x.mondo = mondo; x.stato = jsonStabile(o);
      const t = treStati({ mondo, dati, prima, accetta: e.accetta, intera: x.intera, A, dove });
      // i flag del mondo si confrontano in tre, come i campi, quando se ne conosce l'ultima scrittura: nel segno, dopo una
      // correzione del caricatore, o in «precedente.flagsMondo». Senza, valgono solo alla nascita: uno diverso dai dati è un avviso
      const fw = o.flags?.world ?? {}, fd = e.nascita.flagsMondo ?? {}, fp = e.flagsPrima ?? {}, fs = s?.flags ?? {};
      const fMondo = k => (Object.hasOwn(fw, k) ? fw[k] : null);
      const fPrima = k => (Object.hasOwn(fs, k) ? fs[k] : fp[k]);
      const fK = Object.keys(fd).filter(k => Object.hasOwn(fs, k) || Object.hasOwn(fp, k));
      const fSuperati = Object.keys(fp).filter(k => Object.hasOwn(fs, k));
      if ( fSuperati.length ) A.push(`${dove}: il segno del caricatore ha già l'ultima scrittura dei flag ${fSuperati.join(", ")}: per quelli «precedente.flagsMondo» non conta più, e si può togliere dai dati`);
      const flagCambia = [], flagRitocchi = [], flagAltri = [];
      for ( const k of fK ) {
        if ( uguali(fMondo(k), fd[k]) ) continue;
        if ( uguali(fMondo(k), fPrima(k)) ) flagCambia.push(k);
        else if ( uguali(fd[k], fPrima(k)) ) flagRitocchi.push(k);
        else flagAltri.push(k);
      }
      const flagNascita = Object.keys(fd).filter(k => !fK.includes(k) && !uguali(fMondo(k), fd[k]));
      if ( flagNascita.length ) A.push(`${dove}: i flag del mondo ${flagNascita.join(", ")} sono diversi dai dati e valgono solo alla nascita: restano come sono. Per correggerli: l'id dell'elemento nei dati e il valore di adesso in «precedente.flagsMondo»`);
      // il segno tiene l'ultima scrittura dei flag confrontati in tre (un ritocco lasciato com'è tiene quella di prima)
      const segnoFlags = { ...fs, ...Object.fromEntries(fK.filter(k => !flagAltri.includes(k)).map(k => [k, flagRitocchi.includes(k) ? fPrima(k) : fd[k]])) };
      // nel segno anche i campi che i dati non danno, come sono adesso (se il segno non li ha già): sono l'ultima scrittura conosciuta
      x.segno = { v: 1, chiave: chiave.get(e.rif), campi: { ...leggiTutti(g, o, Object.keys(CAMPI[g])), ...(s?.campi ?? {}), ...Object.fromEntries(Object.keys(dati).map(k => [k, t.tieni(k)])) },
        ...(Object.keys(segnoFlags).length ? { flags: segnoFlags } : {}) };
      if ( !e.aggiorna ) {
        const tutti = [...t.cambia, ...t.ritocchi, ...t.conflitti, ...[...flagCambia, ...flagRitocchi, ...flagAltri].map(k => `flag ${k}`)];
        if ( tutti.length ) A.push(`${dove}: nel mondo è diverso dai dati (${tutti.join(", ")}), e i dati dicono di non aggiornarlo`);
        else report.saltati.push(`${dove}: com'è nei dati`);
        x.azione = null; piano.elementi.push(x); continue;
      }
      if ( flagAltri.length ) {
        P.push(`${dove} (${doc.id}): ${flagAltri.map(k => `il flag del mondo «${k}» nel mondo è ${jsonStabile(fMondo(k))}, non com'era all'ultima scrittura (${Object.hasOwn(fs, k) ? "nel segno" : "in «precedente»"}: ${jsonStabile(fPrima(k))}), e i dati lo vogliono ${jsonStabile(fd[k])}`).join("; ")}: il caricatore non lo tocca, decide il GM. Se il valore del mondo va bene, si porta nei dati (il caricatore lo prende come ultima scrittura) e poi si cambia; «accetta» non vale per i flag`);
        continue;
      }
      // i nomi veri non ancora rivelati: nei flag che si scrivono (i dati della scena li riceve anche chi gioca)
      const svF = svelano(flagCambia.flatMap(k => testiDi(fd[k])));
      if ( svF.length ) { P.push(`${dove}: nei flag del mondo da scrivere c'è il nome vero, non ancora rivelato, di ${svF.join(", ")}`); continue; }
      if ( flagRitocchi.length ) A.push(`${dove}: flag del mondo ${flagRitocchi.join(", ")} ritoccati in Foundry dopo la correzione, e i dati non li cambiano: restano come sono`);
      if ( t.conflitti.length ) {
        P.push(`${dove} (${doc.id}): cambiato in Foundry dopo l'ultima scrittura, e i dati lo vogliono diverso (${t.conflitti.join(", ")})${(s || Object.keys(e.precedente ?? {}).length) ? "" : "; l'ultima scrittura non si conosce: per un elemento di uno script di prima serve «precedente»"}. Il caricatore non lo tocca: decide il GM. Se il ritocco è già nella fonte dei dati, per prendere l'elemento del mondo come ultima scrittura: «accetta»: "${x.intera}"`);
        continue;
      }
      if ( t.ritocchi.length ) A.push(`${dove}: ritoccato in Foundry (${t.ritocchi.join(", ")}), e i dati non lo cambiano lì: resta com'è; il ritocco si riporta nella fonte dei dati`);
      if ( (g === "nota") && t.cambia.includes("pagina") ) {
        const ora = vedonoOra(LEGGI.nota.pagina(o)), poi = vedranno(dati.pagina);
        if ( poi === null ) { P.push(`${dove}: la pagina che aprirebbe non c'è nel mondo, e non si crea in questo giro`); continue; }
        const nuove = poi.filter(n => !ora.includes(n)), perse = ora.filter(n => !poi.includes(n));
        if ( nuove.length && !e.decisione ) { P.push(`${dove}: la vedrebbero anche ${nuove.join(", ")}, che vedono la pagina nuova: serve la decisione del GM, con la data, in «decisione»`); continue; }
        if ( perse.length ) A.push(`${dove}: non la vedranno più ${perse.join(", ")}: la pagina nuova non è loro (la vedranno quando la vedono)`);
        x.vedono = { prima: ora, dopo: poi };
      }
      const m0 = P.length;
      for ( const k of ["icona", "immagine"] ) if ( t.cambia.includes(k) ) await immagine(dati[k], dove);
      if ( P.length > m0 ) continue;
      x.cambia = [...t.cambia, ...flagCambia.map(k => `flag ${k}`)]; x.ritocchi = t.ritocchi;
      x.flagsNuovi = Object.fromEntries(flagCambia.map(k => [k, clona(e.nascita.flagsMondo[k])]));
      x.flagsPrimaMondo = Object.fromEntries(flagCambia.map(k => [k, clona(fMondo(k))]));
      x.upd = { _id: doc.id, ...scriviTutti(g, Object.fromEntries(t.cambia.map(k => [k, dati[k]]))),
        ...Object.fromEntries(flagCambia.map(k => [`flags.world.${k}`, clona(e.nascita.flagsMondo[k])])), [`flags.${MODULO}.${SEGNO}`]: x.segno };
      x.azione = x.cambia.length ? "aggiorna" : (!uguali(s, x.segno) ? "segna" : null);
      if ( x.azione ) try {
        const { _id, ...r } = x.upd;
        const o2 = doc.clone(foundry.utils.expandObject(clona(r))).toObject();
        costruito(dove, o2, g, Object.fromEntries(Object.keys(dati).map(k => [k, t.cambia.includes(k) ? dati[k] : mondo[k]])));
        const fuori = flagCambia.filter(k => !uguali(o2.flags?.world?.[k], e.nascita.flagsMondo[k]));
        if ( fuori.length ) P.push(`${dove}: aggiornato in memoria, i flag del mondo ${fuori.join(", ")} non sono come nei dati (Foundry fonde gli oggetti: una sottochiave che c'è nel mondo e non nei dati non si toglie)`);
      } catch(err) { P.push(`${dove}: aggiornato in memoria non valido: ${err.message}`); continue; }
      if ( !x.azione ) report.saltati.push(`${dove}: com'è nei dati`);
      piano.elementi.push(x);
    }
  }

  // --- le macro ------------------------------------------------------------------------------------------------------------------------
  const api = game.modules.get(MODULO)?.api ?? {};
  for ( const m of D.macro ) {
    const dove = `macro «${m.nome}»`;
    const n0 = P.length;
    let cartella = null;
    if ( m.cartella?.rif ) { const c = cartellaPiano.get(m.cartella.rif); if ( !c ) P.push(`${dove}: la cartella «${m.cartella.rif}» non è nel piano`); cartella = c?.id ?? null; }
    else if ( m.cartella?.id ) { const f = game.folders.get(m.cartella.id); if ( !f || (f.type !== "Macro") ) P.push(`${dove}: la cartella ${m.cartella.id} non c'è o non è di tipo Macro`); cartella = f?.id ?? null; }
    const fn = COMANDO.exec(m.campi.comando)?.[1];
    if ( !fn || !Object.hasOwn(api, fn) || (typeof api[fn] !== "function") || ["carica", "versione"].includes(fn) ) P.push(`${dove}: la funzione «${fn}» non c'è nel modulo (versione ${api.versione ?? "?"})`);
    // la forma col messaggio dice «modulo spento» anche quando la funzione non restituisce niente: si ammette solo per una funzione
    // async, che restituisce sempre una promessa
    else if ( m.campi.comando.startsWith("return ") && (api[fn].constructor?.name !== "AsyncFunction") ) P.push(`${dove}: nella forma col messaggio, la funzione «${fn}» deve essere async: se non restituisse niente, comparirebbe il messaggio del modulo spento`);
    const doc = trova(game.macros, m, m.rif, dove, "macro");
    if ( P.length > n0 ) continue;
    const x = { m, doc, mid: doc?.id ?? id.get(m.rif), cartella };
    if ( !doc ) {
      const omonime = game.macros.filter(y => y.name === m.nome);
      if ( omonime.length ) { P.push(`${dove}: c'è già, non di questo carico (${omonime.map(y => y.id).join(", ")}): se è quella, il suo id va nei dati, con «precedente» se l'ha scritta uno script di prima`); continue; }
      if ( m.campi.img && !(await immagine(m.campi.img, dove)) ) continue;
      x.segno = { v: 1, chiave: chiave.get(m.rif), campi: null };
      x.dati = { _id: x.mid, type: "script", ...scriviMacro(m.campi), folder: cartella, ownership: { default: L.NONE }, flags: { [MODULO]: { [SEGNO]: x.segno } } };
      try {
        // il segno ha tutti i campi, anche l'icona che i dati non danno (come nasce), come per gli elementi delle scene
        x.segno.campi = { ...leggiMacro(new CONFIG.Macro.documentClass(clona(x.dati)).toObject(), ["nome", "comando", "img"]), ...clona(m.campi) };
        x.dati.flags[MODULO][SEGNO] = x.segno;
        const o = new CONFIG.Macro.documentClass(clona(x.dati)).toObject();
        if ( !uguali(leggiMacro(o, Object.keys(m.campi)), m.campi) || !uguali(o.ownership, x.dati.ownership) ) P.push(`${dove}: costruita in memoria non è come nei dati`);
      } catch(err) { P.push(`${dove}: costruita in memoria non valida: ${err.message}`); continue; }
      x.azione = "crea";
      piano.macro.push(x);
      continue;
    }
    if ( doc.type !== "script" ) { P.push(`${dove} (${doc.id}): nel mondo non è una macro di script`); continue; }
    if ( ((doc.ownership?.default ?? L.NONE) > L.NONE) || giocatrici.some(u => doc.testUserPermission(u, "LIMITED")) ) A.push(`${dove}: nel mondo una giocatrice la vede; la visibilità non la tocca il caricatore, lo si dice al GM`);
    if ( (doc.folder?.id ?? null) !== (cartella ?? null) ) A.push(`${dove}: nel mondo sta in «${doc.folder?.name ?? "nessuna cartella"}»; non si sposta`);
    const mondo = leggiMacro(doc, Object.keys(m.campi));
    const s = segnoDi(doc);
    x.segnoPrima = clona(s);
    if ( s && m.precedente ) A.push(`${dove}: ha già il segno del caricatore: «precedente» non conta più, e si può togliere dai dati`);
    const prima = s ? clona(s.campi ?? {}) : clona(m.precedente ?? {});
    x.intera = await sha256(jsonStabile(mondo));
    const t = treStati({ mondo, dati: m.campi, prima, accetta: m.accetta, intera: x.intera, A, dove });
    x.segno = { v: 1, chiave: chiave.get(m.rif), campi: { ...leggiMacro(doc, ["nome", "comando", "img"]), ...(s?.campi ?? {}), ...Object.fromEntries(Object.keys(m.campi).map(k => [k, t.tieni(k)])) } };
    if ( !m.aggiorna ) {
      const tutti = [...t.cambia, ...t.ritocchi, ...t.conflitti];
      if ( tutti.length ) A.push(`${dove}: nel mondo è diversa dai dati (${tutti.join(", ")}), e i dati dicono di non aggiornarla`); else report.saltati.push(`${dove}: com'è nei dati`);
      x.azione = null; piano.macro.push(x); continue;
    }
    if ( t.conflitti.length ) { P.push(`${dove} (${doc.id}): cambiata in Foundry dopo l'ultima scrittura, e i dati la vogliono diversa (${t.conflitti.join(", ")})${(s || m.precedente) ? "" : "; l'ultima scrittura non si conosce: per una macro di uno script di prima serve «precedente»"}. Il caricatore non la tocca: decide il GM. Per prendere la macro del mondo come ultima scrittura: «accetta»: "${x.intera}"`); continue; }
    if ( t.ritocchi.length ) A.push(`${dove}: ritoccata in Foundry (${t.ritocchi.join(", ")}), e i dati non la cambiano lì: resta com'è`);
    if ( t.cambia.includes("comando") && (((doc.ownership?.default ?? L.NONE) > L.NONE) || giocatrici.some(u => doc.testUserPermission(u, "LIMITED"))) ) { P.push(`${dove} (${doc.id}): una giocatrice la vede, e i dati ne cambiano il comando: il caricatore non cambia il comando di una macro che le giocatrici possono lanciare; decide il GM`); continue; }
    if ( t.cambia.includes("img") && !(await immagine(m.campi.img, dove)) ) continue;
    x.cambia = t.cambia; x.ritocchi = t.ritocchi;
    x.upd = { _id: doc.id, ...scriviMacro(Object.fromEntries(t.cambia.map(k => [k, m.campi[k]]))), [`flags.${MODULO}.${SEGNO}`]: x.segno };
    x.azione = t.cambia.length ? "aggiorna" : (!uguali(s, x.segno) ? "segna" : null);
    x.tempo = doc._stats?.modifiedTime ?? null;
    if ( !x.azione ) report.saltati.push(`${dove}: com'è nei dati`);
    piano.macro.push(x);
  }

  // --- il rapporto e il registro -----------------------------------------------------------------------------------------------------
  for ( const x of piano.elementi ) {
    const v = x.vedono ? { vedono: x.vedono.dopo, ...(x.vedono.prima ? { vedevano: x.vedono.prima } : {}) }
      : ((x.azione === "aggiorna") && (x.e.genere === "nota")) ? { vedono: vedonoOra(LEGGI.nota.pagina(x.doc.toObject())) }
      : ((x.azione === "aggiorna") && x.doc) ? { visibile: !x.doc.hidden } : {};
    if ( x.e.decisione && (x.azione === "crea") ) v.decisione = x.e.decisione;
    if ( x.azione === "crea" ) report.piano.push({ azione: "crea", cosa: x.e.genere, scena: x.scena, nome: x.nome, id: x.eid, campi: Object.keys(x.valori), ...(x.e.genere !== "nota" ? { visibile: !x.dati.hidden } : {}), ...v });
    else if ( x.azione === "aggiorna" ) report.piano.push({ azione: "aggiorna", cosa: x.e.genere, scena: x.scena, nome: x.nome, id: x.eid, campi: x.cambia,
      ...(Object.keys(x.flagsNuovi ?? {}).length ? { flags: Object.fromEntries(Object.entries(x.flagsNuovi).map(([k, z]) => [k, { prima: x.flagsPrimaMondo[k], dopo: z }])) } : {}), ...v });
    else if ( x.azione === "segna" ) report.piano.push({ azione: "segna", cosa: x.e.genere, scena: x.scena, nome: x.nome, id: x.eid, perche: segnoDi(x.doc) ? "il segno non è quello dei dati" : "elemento di uno script di prima, uguale ai dati" });
    piano.corrispondenze.push({ rif: x.e.rif, chiave: chiave.get(x.e.rif), tipo: TIPO[x.e.genere], id: `${x.sid}.${x.eid}`, nome: x.nome, crea: x.azione === "crea" });
  }
  for ( const x of piano.macro ) {
    if ( x.azione === "crea" ) report.piano.push({ azione: "crea", cosa: "macro", nome: x.m.nome, id: x.mid, chiama: COMANDO.exec(x.m.campi.comando)[1], dentro: x.cartella ?? null, visibilita: "None" });
    else if ( x.azione === "aggiorna" ) report.piano.push({ azione: "aggiorna", cosa: "macro", nome: x.doc.name, id: x.mid, campi: x.cambia });
    else if ( x.azione === "segna" ) report.piano.push({ azione: "segna", cosa: "macro", nome: x.doc.name, id: x.mid, perche: segnoDi(x.doc) ? "il segno non è quello dei dati" : "macro di uno script di prima, uguale ai dati" });
    piano.corrispondenze.push({ rif: x.m.rif, chiave: chiave.get(x.m.rif), tipo: "Macro", id: x.mid, nome: x.doc?.name ?? x.m.nome, crea: x.azione === "crea" });
  }
}

/** La fotografia delle scene dei dati (gli elementi dei generi toccati, interi) e delle macro; «applica» la rifà prima di scrivere. */
export function fotografaScene(D) {
  const parti = [];
  for ( const Sd of D.scene ?? [] ) {
    const S = game.scenes.get(Sd.id);
    if ( !S ) { parti.push(`SC|${Sd.id}|-`); continue; }
    parti.push(`SC|${S.id}|${S.name}`);
    for ( const g of [...new Set(Sd.elementi.map(e => e.genere))] ) for ( const d of S[RACCOLTA[g]].contents.slice().sort((a, b) => a.id.localeCompare(b.id)) ) parti.push(`${TIPO[g]}|${d.id}|${jsonStabile(d.toObject())}`);
  }
  if ( D.macro?.length ) for ( const m of game.macros.contents.slice().sort((a, b) => a.id.localeCompare(b.id)) ) parti.push(`M|${m.id}|${m._stats?.modifiedTime ?? ""}|${m.name}|${m.folder?.id ?? ""}`);
  return parti.join("\n");
}

/** La parte del piano di scene e macro che entra nella firma: tutto quello che si scriverebbe. */
export function perLaFirmaS(piano) {
  return {
    elementi: (piano.elementi ?? []).filter(x => x.azione).map(x => ({ scena: x.sid, id: x.eid, azione: x.azione, dati: x.dati ?? null, upd: x.upd ?? null, stato: x.stato ?? null })),
    macro: (piano.macro ?? []).filter(x => x.azione).map(x => ({ id: x.mid, azione: x.azione, dati: x.dati ?? null, upd: x.upd ?? null, tempo: x.tempo ?? null }))
  };
}

// --- la scrittura --------------------------------------------------------------------------------------------------------------------
/** Scrive elementi e macro del piano, dopo pagine, tabelle e attori; alla prima scrittura non riuscita si ferma. @returns true se tutto è andato */
export async function eseguiS(piano, report) {
  const E = piano.elementi ?? [], M = piano.macro ?? [];
  // prima delle scritture: nessuno ha toccato gli elementi e le macro da aggiornare, e quelli da creare non ci sono
  for ( const x of E.filter(x => x.azione) ) {
    const c = game.scenes.get(x.sid)?.[RACCOLTA[x.e.genere]];
    if ( x.azione === "crea" ) {
      if ( !c || c.get(x.eid) || c.some(y => segnoDi(y)?.chiave === x.segno.chiave) ) { report.errori.push(`${x.e.genere} «${x.nome}»: durante il carico è comparso un elemento col suo id o col suo segno; non lo creo, si rilancia la prova`); return false; }
    } else {
      const d = c?.get(x.eid);
      if ( !d || (jsonStabile(d.toObject()) !== x.stato) ) { report.errori.push(`${x.e.genere} «${x.nome}»: cambiato durante il carico; non lo aggiorno, si rilancia la prova`); return false; }
    }
    // chi vedrà la nota: la pagina che apre (anche quella appena creata da questo carico) è ancora come al piano?
    if ( x.vedono && !uguali(vedonoDove(x.valori.pagina), [...x.vedono.dopo].sort()) ) {
      report.errori.push(`nota «${x.nome}»: la visibilità della pagina che apre è cambiata durante il carico (la vedrebbero ${vedonoDove(x.valori.pagina).join(", ") || "solo i GM"}); non la scrivo, si rilancia la prova`); return false;
    }
  }
  for ( const x of M.filter(x => x.azione) ) {
    if ( x.azione === "crea" ) {
      if ( game.macros.get(x.mid) || game.macros.some(y => y.name === x.m.nome) ) { report.errori.push(`macro «${x.m.nome}»: durante il carico è comparsa una macro col suo id o col suo nome; non la creo, si rilancia la prova`); return false; }
    } else {
      const d = game.macros.get(x.mid);
      if ( !d || ((d._stats?.modifiedTime ?? null) !== x.tempo) || ((await sha256(jsonStabile(leggiMacro(d, Object.keys(x.m.campi))))) !== x.intera) ) { report.errori.push(`macro «${d?.name ?? x.mid}»: cambiata durante il carico; non la aggiorno, si rilancia la prova`); return false; }
    }
  }
  // scena per scena e genere per genere: prima gli elementi nuovi, poi gli aggiornamenti (il segno insieme ai campi)
  for ( const sid of [...new Set(E.map(x => x.sid))] ) {
    const S = game.scenes.get(sid);
    for ( const g of ["tassello", "disegno", "nota"] ) {
      const crea = E.filter(x => (x.sid === sid) && (x.e.genere === g) && (x.azione === "crea"));
      if ( crea.length && !(await scrivi(report, `scena «${S.name}»: ${crea.length} ${g === "nota" ? "note" : g === "tassello" ? "tasselli" : "disegni"} nuovi: ${crea.map(x => `«${x.nome}»`).join(", ")}`,
        () => S.createEmbeddedDocuments(TIPO[g], clona(crea.map(x => x.dati)), { keepId: true }), crea.map(x => x.eid))) ) return false;
      const up = E.filter(x => (x.sid === sid) && (x.e.genere === g) && ["aggiorna", "segna"].includes(x.azione));
      if ( up.length && !(await scrivi(report, `scena «${S.name}»: ${up.length} ${g === "nota" ? "note" : g === "tassello" ? "tasselli" : "disegni"} aggiornati: ${up.map(x => `«${x.nome}» (${x.azione === "aggiorna" ? x.cambia.join(", ") : "segno"})`).join(", ")}`,
        () => S.updateEmbeddedDocuments(TIPO[g], clona(up.map(x => x.upd))), up.map(x => x.eid))) ) return false;
    }
  }
  for ( const x of M ) {
    if ( x.azione === "crea" ) {
      if ( !(await scrivi(report, `macro «${x.m.nome}» (${x.mid})`, () => CONFIG.Macro.documentClass.create(clona(x.dati), { keepId: true }), [x.mid])) ) return false;
    } else if ( ["aggiorna", "segna"].includes(x.azione) ) {
      const d = game.macros.get(x.mid);
      if ( !(await scrivi(report, `macro «${d.name}» (${x.mid}): ${x.azione === "aggiorna" ? x.cambia.join(", ") : "segno"}`, () => d.update(clona(x.upd)), [x.mid])) ) return false;
    }
  }
  return true;
}

// --- la verifica -------------------------------------------------------------------------------------------------------------------
export async function verificaS(piano, report) {
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const ok = (voce, cond) => report.verifica.push(`${cond ? "OK" : "KO"} · ${voce}`);
  const giocatrici = game.users.filter(u => !u.isGM);
  for ( const x of piano.elementi ?? [] ) {
    const g = x.e.genere;
    const d = game.scenes.get(x.sid)?.[RACCOLTA[g]]?.get(x.eid);
    if ( !d ) { ok(`${g} «${x.nome}» (${x.eid}): c'è`, false); continue; }
    const o = d.toObject();
    const letti = leggiTutti(g, o, Object.keys(x.valori));
    // dopo la scrittura ogni campo dei dati è quello del segno, salvo i ritocchi lasciati com'erano; uno non toccato è com'era al piano
    const contenuto = x.azione ? Object.keys(letti).every(k => uguali(letti[k], x.segno.campi[k]) || (x.ritocchi ?? []).includes(k)) : (jsonStabile(o) === x.stato);
    const nascita = (x.azione !== "crea") || (((o.levels ?? []).includes(x.e.nascita.livello)) && ((g === "nota") || (o.hidden === x.dati.hidden))
      && (!x.e.nascita.flagsMondo || uguali(o.flags?.world ?? null, x.e.nascita.flagsMondo)));
    const flag = Object.entries(x.flagsNuovi ?? {}).every(([k, v]) => uguali(o.flags?.world?.[k], v));
    const vista = !x.vedono || uguali(vedonoDove(LEGGI.nota.pagina(o)), [...x.vedono.dopo].sort());
    ok(`${g} «${x.nome}» (${x.eid}): ${x.azione === "crea" ? `creato${g === "nota" ? "" : (x.dati.hidden ? ", nascosto" : ", visibile")}, nel suo livello` : (x.azione ?? "com'era")}, campi come nel piano, col segno${x.vedono ? `, lo vedono ${x.vedono.dopo.length ? x.vedono.dopo.join(", ") : "solo i GM"}` : ""}`,
      contenuto && nascita && flag && vista && (x.azione ? uguali(segnoDi(d), x.segno) : uguali(segnoDi(d), x.segnoPrima ?? null)));
  }
  for ( const x of piano.macro ?? [] ) {
    const d = game.macros.get(x.mid);
    if ( !d ) { ok(`macro «${x.m.nome}» (${x.mid}): c'è`, false); continue; }
    const letti = leggiMacro(d, Object.keys(x.m.campi));
    const contenuto = x.azione ? Object.keys(letti).every(k => uguali(letti[k], x.segno.campi[k]) || (x.ritocchi ?? []).includes(k)) : ((await sha256(jsonStabile(letti))) === x.intera);
    const nascosta = giocatrici.every(u => !d.testUserPermission(u, "LIMITED"));
    ok(`macro «${d.name}» (${x.mid}): ${x.azione === "crea" ? "creata, a None, di script, nella sua cartella" : (x.azione ?? "com'era")}, come nel piano, nascosta alle giocatrici, col segno`,
      contenuto && nascosta && ((x.azione !== "crea") || ((d.ownership?.default === L.NONE) && (d.type === "script") && ((d.folder?.id ?? null) === (x.cartella ?? null))))
      && (x.azione ? uguali(segnoDi(d), x.segno) : uguali(segnoDi(d), x.segnoPrima ?? null)));
  }
}
