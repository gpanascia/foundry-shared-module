/**
 * Il caricatore: le Roll Table e gli attori dal compendio. Il piano (cosa creare, cosa aggiornare), la scrittura e la verifica,
 * con le stesse regole delle pagine: id fissi, segno, registro, l'ultima scrittura conosciuta, niente cancellazioni.
 * Regole: docs/caricatore.md, «Le Roll Table» e «Gli attori dal compendio».
 *
 * Le Roll Table sono sempre solo del GM: nascono a None, e la loro visibilità non si tocca. Si aggiornano come le pagine, campo per
 * campo (nome, formula, descrizione, voci), solo se nel mondo sono ancora come le aveva lasciate l'ultima scrittura; le voci in più si
 * aggiungono, una voce in meno è un problema (il caricatore non cancella).
 * Gli attori nascono a None dalle statistiche del compendio, coi ritocchi di un vocabolario chiuso (via, sostituisci, rinomina, taglia,
 * abilità, vantaggio, senza armatura), col token prototipo neutrale e col doppio nome di «Rivela il nome». Un attore che c'è non si
 * aggiorna, salvo l'immagine (il ritratto), con la stessa regola delle pagine; il token prototipo non si tocca. In un mondo in unità
 * metriche, gli attori nuovi nascono convertiti in metri (carica/metri.mjs).
 */
import { MODULO, SEGNO, jsonStabile, sha256, controllaFile, scrivi, operatori } from "./comune.mjs";
import { impronta, contieneNome } from "./html.mjs";
import { attoreInMetri } from "./metri.mjs";
import { nomiDi, nomeComposto, portaRivelato, nomeNuovo } from "../rivela-nome.mjs";

const segnoDi = d => d?.flags?.[MODULO]?.[SEGNO] ?? null;
const uguali = (a, b) => jsonStabile(a) === jsonStabile(b);
const clona = x => JSON.parse(JSON.stringify(x));
const norm = s => String(s ?? "").replace(/\s+/g, " ").trim();
const CAMPI_TABELLA = { nome: "nome", formula: "formula", descrizione: "descrizione", voci: "voci" };

// --- le Roll Table ------------------------------------------------------------------------------------------------------------------
/** Le voci di una tabella del mondo, in ordine di tiro. */
const vociDi = t => t.results.contents.slice().sort((a, b) => (a.range[0] - b.range[0]) || (a.range[1] - b.range[1]))
  .map(r => ({ id: r.id, da: r.range[0], a: r.range[1], testo: r.name ?? "", descrizione: r.description ?? "" }));
const improntaVoci = async voci => sha256(jsonStabile(await Promise.all(voci.map(async v => [v.da, v.a, norm(v.testo), await impronta(v.descrizione ?? "")]))));
/** Le impronte di una tabella, campo per campo: dai dati, dal mondo o da «precedente». */
async function improntaTabella(t) {
  return { nome: t.nome ?? null, formula: t.formula ?? null, descrizione: (t.descrizione === undefined) ? null : await impronta(t.descrizione ?? ""),
    voci: (t.voci === undefined) ? null : await improntaVoci(t.voci) };
}
// il peso è l'ampiezza dell'intervallo: «Normalizza» nella scheda della tabella non cambia i range
const datiRisultato = v => ({ type: CONST.TABLE_RESULT_TYPES.TEXT, name: v.testo, description: v.descrizione ?? "", range: [v.da, v.a], weight: v.a - v.da + 1, drawn: false });
// una voce del mondo è già come i dati? (Foundry non restituisce gli aggiornamenti senza cambiamenti)
// i testi come li confronta l'impronta delle voci (Foundry pulisce spazi e HTML prima di salvare)
const vocUguale = async (r, v) => { const d = datiRisultato(v); return (r.type === d.type) && (norm(r.name) === norm(d.name)) && ((await impronta(r.description ?? "")) === (await impronta(d.description)))
  && (r.range?.[0] === d.range[0]) && (r.range?.[1] === d.range[1]) && (r.weight === d.weight) && (r.drawn === d.drawn); };

// --- gli attori: i ritocchi e i numeri -----------------------------------------------------------------------------------------------
const richiami = data => data.items.flatMap(i => [...String(i.system?.description?.value ?? "").matchAll(/\[\[\/item \.(\w{16})\]\]/g)].map(m => m[1]));
const togliRichiami = (data, id) => {
  for ( const i of data.items ) {
    const d = i.system?.description;
    if ( !d?.value?.includes(id) ) continue;
    d.value = d.value.replace(new RegExp(`\\s+or\\s+\\[\\[/item \\.${id}\\]\\]`, "g"), "").replace(new RegExp(`\\[\\[/item \\.${id}\\]\\]\\s+or\\s+`, "g"), "");
  }
};
const ARMATURE = ["light", "medium", "heavy"];

/** I numeri di un attore, per il confronto con «atteso» e per il rapporto. */
function numeri(actor) {
  const src = actor._source?.system ?? {};
  const out = { ca: actor.system?.attributes?.ac?.value ?? null, taglia: actor.system?.traits?.size ?? null,
    abilita: Object.entries(src.skills ?? {}).filter(([, s]) => s.value >= 1).map(([k]) => k),
    vantaggio: Object.entries(src.skills ?? {}).filter(([, s]) => s.roll?.mode === 1).map(([k]) => k), armi: {} };
  for ( const it of (actor.items?.contents ?? []).filter(i => i.type === "weapon") ) {
    const att = it.system?.activities?.find?.(a => a.type === "attack");
    let danni = null;
    try {
      const roll = att?.getDamageConfig?.({})?.rolls?.[0];
      if ( roll ) danni = norm(Roll.replaceFormulaData(roll.parts.join(" + "), roll.data ?? it.getRollData(), { missing: "0" }));
    } catch(err) { danni = `non letto: ${err.message}`; }
    out.armi[it.name] = [att?.labels?.toHit ?? null, danni];
  }
  return out;
}
const numeriTornano = (n, at) => !at || (((at.ca === undefined) || (n.ca === at.ca)) && (!at.taglia || (n.taglia === at.taglia))
  && (at.abilita ?? []).every(s => n.abilita.includes(s)) && (at.vantaggio ?? []).every(s => n.vantaggio.includes(s))
  && Object.entries(at.armi ?? {}).every(([arma, [c, d]]) => n.armi[arma] && (norm(n.armi[arma][0]) === norm(c)) && (norm(n.armi[arma][1]) === norm(d))));

/** Un documento di un compendio, per nome, fra quelli delle regole 2024: uno solo. */
async function dalCompendio(pacchi, collezione, nome, P, dove, tipo) {
  const pack = game.packs.get(collezione);
  if ( !pack ) { P.push(`${dove}: il compendio ${collezione} non c'è`); return null; }
  if ( pack.documentName !== tipo ) { P.push(`${dove}: il compendio ${collezione} è di ${pack.documentName}, serve ${tipo}`); return null; }
  // «system.source» intero: chiederne anche «system.source.rules» fa fallire la richiesta sul server
  if ( !pacchi.has(collezione) ) pacchi.set(collezione, await pack.getIndex({ fields: ["system.source"] }));
  const e = pacchi.get(collezione).filter(x => (x.name === nome) && (foundry.utils.getProperty(x, "system.source.rules") === "2024"));
  if ( e.length !== 1 ) { P.push(`${dove}: «${nome}» (regole 2024) trovato ${e.length} volte in ${collezione}`); return null; }
  return pack.getDocument(e[0]._id);
}

/** I ritocchi del vocabolario chiuso, sui dati dell'attore in memoria; i problemi in P. */
async function ritocca(data, r, compendioOggetti, pacchi, P, dove) {
  const perNome = n => data.items.filter(i => i.name === n);
  const togli = id => { data.items = data.items.filter(i => i._id !== id); togliRichiami(data, id); };
  for ( const n of r.via ) {
    const v = perNome(n);
    if ( v.length !== 1 ) { P.push(`${dove}: «${n}» da togliere trovato ${v.length} volte`); continue; }
    togli(v[0]._id);
  }
  if ( r.senzaArmatura ) {
    const arm = data.items.filter(i => (i.type === "equipment") && ARMATURE.includes(i.system?.type?.value));
    if ( !arm.length ) P.push(`${dove}: senzaArmatura, ma il compendio non dà nessuna armatura`);
    for ( const i of arm ) togli(i._id);
  }
  for ( const [vecchio, nuovo] of Object.entries(r.sostituisci) ) {
    const v = perNome(vecchio);
    if ( v.length !== 1 ) { P.push(`${dove}: «${vecchio}» da sostituire trovato ${v.length} volte`); continue; }
    const doc = await dalCompendio(pacchi, compendioOggetti, nuovo, P, `${dove}, sostituisci «${vecchio}»`, "Item");
    if ( !doc ) continue;
    const n = game.items.fromCompendium(doc);
    n._id = v[0]._id;                                                // la Multiattacco cita l'oggetto per _id
    if ( n.system ) n.system.equipped = true;
    // un'arma prende la descrizione da statblock di quella che sostituisce ([[/attack]] e [[/damage]])
    if ( (n.type === "weapon") && (v[0].type === "weapon") ) n.system.description = clona(v[0].system.description);
    if ( (v[0].system?.properties ?? []).includes("gear") ) n.system.properties = [...new Set([...(n.system.properties ?? []), "gear"])];
    n.sort = v[0].sort;
    data.items = data.items.map(i => (i._id === v[0]._id) ? n : i);
  }
  for ( const [vecchio, { nome, img }] of Object.entries(r.rinomina) ) {
    const v = perNome(vecchio);
    if ( v.length !== 1 ) { P.push(`${dove}: «${vecchio}» da rinominare trovato ${v.length} volte`); continue; }
    v[0].name = nome;
    if ( img ) v[0].img = img;
  }
  if ( r.taglia ) {
    foundry.utils.setProperty(data, "system.traits.size", r.taglia);
    // dnd5e non rifà la misura del token per un attore che viene da un compendio (TraitsFields.preCreateSize): la si scrive qui
    const lato = globalThis.CONFIG?.DND5E?.actorSizes?.[r.taglia]?.token ?? 1;
    data.prototypeToken = { ...(data.prototypeToken ?? {}), width: lato, height: lato };
  }
  for ( const s of r.abilita ) foundry.utils.setProperty(data, `system.skills.${s}.value`, 1);
  for ( const s of r.vantaggio ) foundry.utils.setProperty(data, `system.skills.${s}.roll.mode`, 1);
}

// --- il piano -------------------------------------------------------------------------------------------------------------------------
/**
 * Le Roll Table e gli attori dei dati, nel piano. ctx: quello che pianifica (journal.mjs) ha già: dati, rapporto, id fissi, chiavi,
 * trova, le cartelle del piano, il segno, il piano.
 */
/**
 * I nomi di un attore che c'è, coi dati: il confronto in tre del nome che descrive e di quello vero. «decisione»: «uguali»,
 * «ignoto» (diversi, l'ultima scrittura non si conosce), «ritocco» (cambiati in Foundry, i dati no), «conflitto», «toglie» (i dati tolgono
 * il nome vero a un attore rivelato), «rinomina», «composto» (rivelato prima della 1.15.0, col solo nome vero: prende il nome composto).
 * «dopo»: i due nomi dopo il carico (per le pagine che lo seguono), con lo stato rivelato del mondo. Lo usano anche le pagine (journal.mjs).
 */
export function esitoNomi(doc, x0) {
  const s = segnoDi(doc), nm = nomiDi(doc), rivelato = !!nm?.rivelato && portaRivelato(doc, nm);
  const kN = (a, v) => JSON.stringify([a ?? null, v ?? null]);
  const kM = (nm && ((doc.name === nm.aspetto) || rivelato)) ? kN(nm.aspetto, nm.vero) : kN(doc.name, nm?.vero);
  const kD = kN(x0.nome, x0.nomeVero);
  const kP = Array.isArray(s?.nomi) ? kN(s.nomi[0], s.nomi[1]) : (x0.precedente?.nome ? kN(x0.precedente.nome, x0.precedente.nomeVero) : null);
  let decisione;
  if ( kM === kD ) decisione = (rivelato && x0.nomeVero && (doc.name !== nomeComposto(x0.nome, x0.nomeVero))) ? "composto" : "uguali";
  else if ( kP === null ) decisione = "ignoto";
  else if ( kD === kP ) decisione = "ritocco";
  else if ( kM !== kP ) decisione = "conflitto";
  else if ( rivelato && !x0.nomeVero ) decisione = "toglie";
  else decisione = "rinomina";
  const daiDati = ["uguali", "composto", "rinomina"].includes(decisione);
  const dopo = daiDati ? (x0.nomeVero ? { aspetto: x0.nome, vero: x0.nomeVero } : null) : (nm ? { aspetto: nm.aspetto, vero: nm.vero } : null);
  const nuovo = ["composto", "rinomina"].includes(decisione) ? (rivelato ? nomeComposto(x0.nome, x0.nomeVero) : x0.nome) : doc.name;
  return { s, nm, rivelato, kM, kD, kP, decisione, dopo, nuovo };
}

/** I token delle scene di un attore che portano il nome di prima e cambiano nome (solo quelli che cambiano davvero). */
function tokenDaRinominare(doc, nuovo) {
  if ( nuovo === doc.name ) return [];
  return game.scenes.contents.map(sc => ({ scena: sc, token: (sc.tokens?.filter?.(t => t.actorId === doc.id) ?? [])
    .map(t => ({ _id: t.id, name: nomeNuovo(t.name, doc.name, nuovo), prima: t.name })).filter(t => t.name && (t.name !== t.prima)).map(({ prima, ...t }) => t) })).filter(y => y.token.length);
}

export async function pianificaTabelleAttori(ctx) {
  const { D, report, id, chiave, trova, cartellaPiano, piano } = ctx;
  const P = report.problemi, A = report.avvisi;
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const giocatrici = game.users.filter(u => !u.isGM);
  const cartellaDi = (c, tipo, dove) => {
    if ( c?.rif ) { const x = cartellaPiano.get(c.rif); if ( !x ) P.push(`${dove}: la cartella «${c.rif}» non è nel piano`); return x?.id ?? null; }
    if ( c?.id ) { const f = game.folders.get(c.id); if ( !f || (f.type !== tipo) ) { P.push(`${dove}: la cartella ${c.id} non c'è o non è di tipo ${tipo}`); return null; } return f.id; }
    return null;
  };

  // --- le Roll Table -----------------------------------------------------------------------------------------------------------------
  // i nomi veri degli attori del mondo, non ancora rivelati: una tabella si tira in chat
  // (nei messaggi l'id dell'attore, mai il nome vero: il rapporto finisce in un file del server)
  const veriMondo = game.actors.filter(a => a.flags?.[MODULO]?.nomi?.vero && (a.flags[MODULO].nomi.rivelato !== true)).map(a => ({ id: a.id, vero: String(a.flags[MODULO].nomi.vero) }));
  for ( const t of D.tabelle ) {
    const dove = `tabella «${t.nome}»`;
    const n0 = P.length;
    const cartella = cartellaDi(t.cartella, "RollTable", dove);
    const doc = trova(game.tables, t, t.rif, dove, "tabella");
    if ( P.length > n0 ) continue;
    for ( const v of veriMondo ) if ( [t.nome, ...(t.privata ? [] : [t.descrizione]), ...t.voci.flatMap(z => [z.testo, ...(t.privata ? [] : [z.descrizione])])].some(z => contieneNome(z, v.vero)) ) P.push(`${dove}: c'è il nome vero, non ancora rivelato, dell'attore ${v.id}: finirebbe in chat quando si tira`);
    const dati = await improntaTabella(t);
    const x = { t, doc, tid: doc?.id ?? id.get(t.rif), cartella, impronte: dati };
    if ( !doc ) {
      const omonime = game.tables.filter(y => (y.name === t.nome) && ((y.folder?.id ?? null) === (cartella ?? null)));
      if ( omonime.length ) { P.push(`${dove}: c'è già, non di questo carico (${omonime.map(y => y.id).join(", ")}): se è quella, il suo id va nei dati, con «precedente» se l'ha scritta uno script di prima`); continue; }
      x.azione = "crea";
      x.segno = { v: 1, chiave: chiave.get(t.rif), ...dati };
      x.dati = { _id: x.tid, name: t.nome, formula: t.formula, description: t.descrizione, replacement: true, displayRoll: true, folder: cartella ?? null,
        ownership: { default: L.NONE }, flags: { [MODULO]: { [SEGNO]: x.segno, ...(t.privata ? { privata: true } : {}) } }, results: t.voci.map(datiRisultato) };
      piano.tabelle.push(x);
      continue;
    }
    // la tabella c'è: com'è nel mondo, com'è nei dati, come l'aveva lasciata l'ultima scrittura
    if ( (doc.ownership?.default ?? L.NONE) > L.NONE || giocatrici.some(u => doc.testUserPermission(u, "LIMITED")) ) A.push(`${dove}: nel mondo una giocatrice la vede; la visibilità non la tocca il caricatore, lo si dice al GM`);
    const vm = vociDi(doc);
    const mondo = await improntaTabella({ nome: doc.name, formula: doc.formula, descrizione: doc.description ?? "", voci: vm });
    const s = segnoDi(doc);
    x.segnoPrima = clona(s);
    const pr = s ? null : t.precedente;
    const prima = s ? { nome: s.nome, formula: s.formula, descrizione: s.descrizione, voci: s.voci } : (pr ? await improntaTabella(pr) : {});
    const intera = await sha256(jsonStabile(mondo));
    x.mondo = mondo; x.intera = intera;
    if ( t.accetta ) { if ( t.accetta === intera ) Object.assign(prima, mondo); else A.push(`${dove}: «accetta» non è l'impronta della tabella nel mondo (${intera}): ignorato`); }
    const noto = k => (prima[k] !== undefined) && (prima[k] !== null);
    const cambia = [], ritocchi = [], conflitti = [];
    for ( const k of Object.keys(CAMPI_TABELLA) ) {
      if ( mondo[k] === dati[k] ) continue;
      if ( noto(k) && (mondo[k] === prima[k]) ) cambia.push(k);
      else if ( noto(k) && (dati[k] === prima[k]) ) ritocchi.push(k);
      else conflitti.push(k);
    }
    const tieni = k => ritocchi.includes(k) ? prima[k] : dati[k];
    x.segno = { v: 1, chiave: chiave.get(t.rif), nome: tieni("nome"), formula: tieni("formula"), descrizione: tieni("descrizione"), voci: tieni("voci") };
    if ( !t.aggiorna ) {
      if ( cambia.length || ritocchi.length || conflitti.length ) A.push(`${dove}: nel mondo è diversa dai dati (${[...cambia, ...ritocchi, ...conflitti].join(", ")}), e i dati dicono di non aggiornarla`);
      else report.saltati.push(`${dove}: com'è nei dati`);
      x.azione = null; piano.tabelle.push(x); continue;
    }
    if ( conflitti.length ) {
      P.push(`${dove} (${doc.id}): cambiata in Foundry dopo l'ultima scrittura, e i dati la vogliono diversa (${conflitti.join(", ")})${(s || pr) ? "" : "; l'ultima scrittura non si conosce: per una tabella di uno script di prima serve «precedente»"}. Il caricatore non la tocca: decide il GM. Se il ritocco è già nella fonte dei dati, per prendere la tabella del mondo come ultima scrittura: «accetta»: "${intera}"`);
      continue;
    }
    if ( ritocchi.length ) A.push(`${dove}: ritoccata in Foundry (${ritocchi.join(", ")}), e i dati non la cambiano lì: resta com'è; il ritocco si riporta nella fonte dei dati`);
    if ( cambia.includes("voci") && (vm.length > t.voci.length) ) { P.push(`${dove} (${doc.id}): nei dati ha ${t.voci.length} voci, nel mondo ${vm.length}: il caricatore non toglie voci; decide il GM`); continue; }
    const upd = { _id: doc.id, [`flags.${MODULO}.${SEGNO}`]: x.segno };
    if ( cambia.includes("nome") ) upd.name = t.nome;
    if ( cambia.includes("formula") ) upd.formula = t.formula;
    if ( cambia.includes("descrizione") ) upd.description = t.descrizione;
    x.risultati = { aggiorna: [], crea: [] };
    if ( cambia.includes("voci") ) for ( const [k, v] of t.voci.entries() ) {
      if ( !vm[k] ) x.risultati.crea.push(datiRisultato(v));
      else if ( !(await vocUguale(doc.results.get(vm[k].id), v)) ) x.risultati.aggiorna.push({ _id: vm[k].id, ...datiRisultato(v) });
    }
    // una tabella privata porta il segno «privata» del modulo, che porta al tiro privato anche un tiro a vista: si
    // aggiunge se manca; tolto a mano in Foundry o non più privata nei dati, resta com'è nel mondo, con un avviso
    const privataNelMondo = doc.flags?.[MODULO]?.privata === true;
    if ( t.privata && !privataNelMondo ) { upd[`flags.${MODULO}.privata`] = true; cambia.push("privata"); }
    else if ( !t.privata && privataNelMondo ) A.push(`${dove}: nel mondo si tira sempre in privato, e i dati non la dicono privata: resta com'è; per toglierlo decide il GM`);
    x.upd = upd; x.cambia = cambia; x.ritocchi = ritocchi;
    x.azione = cambia.length ? "aggiorna" : (!uguali(s, x.segno) ? "segna" : null);
    x.tempo = doc._stats?.modifiedTime ?? null;
    if ( !x.azione ) report.saltati.push(`${dove}: com'è nei dati`);
    piano.tabelle.push(x);
  }

  // --- gli attori ----------------------------------------------------------------------------------------------------------------------
  const pacchi = new Map();
  // un mondo in unità metriche (l'impostazione di dnd5e): gli attori nuovi si convertono prima di crearli
  const unita = k => { try { return game.settings.get("dnd5e", k) === true; } catch(err) { return null; } };
  const metrico = unita("metricLengthUnits") === true;
  // la conversione porta in metri anche pesi e volumi: con le impostazioni non tutte uguali, il carico di dnd5e si calcolerebbe male
  const unitaMiste = metrico && ((unita("metricWeightUnits") === false) || (unita("metricVolumeUnits") === false));
  const doppioDi = a => a?.flags?.[MODULO]?.nomi ?? null;
  // un attore si riconosce da tutti i suoi nomi: quello in Foundry, quello vero, anche nel doppio nome di un altro attore
  const basso = v => String(v ?? "").toLowerCase();
  const omonimi = x => { const nomi = [x.nome, x.nomeVero].filter(Boolean).map(basso); return game.actors.filter(a => [a.name, doppioDi(a)?.aspetto, doppioDi(a)?.vero].some(n => n && nomi.includes(basso(n)))); };
  for ( const x0 of D.attori ) {
    const dove = `attore «${x0.nome}»`;
    const n0 = P.length;
    const cartella = cartellaDi(x0.cartella, "Actor", dove);
    const doc = trova(game.actors, x0, x0.rif, dove, "attore");
    if ( P.length > n0 ) continue;
    const x = { a: x0, doc, aid: doc?.id ?? id.get(x0.rif), cartella };
    if ( doc ) {
      // un attore che c'è non si aggiorna, salvo il ritratto; il resto si confronta e si dice
      const s = segnoDi(doc);
      // i nomi: il nome che descrive e quello vero si confrontano in tre, come il ritratto: com'è nel mondo, com'è nei dati, come li
      // aveva lasciati l'ultima scrittura (il segno, o «precedente»)
      const en = esitoNomi(doc, x0), nm = en.nm, rivelato = en.rivelato;
      let nomiSegno = (en.kM === en.kD) ? [x0.nome, x0.nomeVero ?? null] : (Array.isArray(s?.nomi) ? s.nomi : null);
      const upd = { _id: doc.id }, cambia = [];
      if ( en.decisione === "ignoto" ) A.push(`${dove} (${doc.id}): nel mondo ha nomi diversi dai dati, e l'ultima scrittura dei nomi non si conosce: non si rinomina (per rinominarlo, nei dati «precedente» con «nome» e «nomeVero» com'erano)`);
      else if ( en.decisione === "ritocco" ) A.push(`${dove} (${doc.id}): i nomi sono stati cambiati in Foundry, e i dati non li cambiano: restano come sono`);
      else if ( en.decisione === "conflitto" ) { P.push(`${dove} (${doc.id}): i nomi sono stati cambiati in Foundry dopo l'ultima scrittura, e i dati li vogliono diversi: decide il GM`); continue; }
      else if ( en.decisione === "toglie" ) { P.push(`${dove} (${doc.id}): nel mondo porta il nome vero, rivelato, e i dati lo tolgono: decide il GM`); continue; }
      else if ( ["rinomina", "composto"].includes(en.decisione) ) {
        // il nome nuovo, come quello di un attore nuovo: niente nomi veri di altri non rivelati, e nessun altro attore coi suoi nomi
        // il nome che porterà davvero: per un attore rivelato quello composto, col nome vero
        const svelaN = veriMondo.filter(v => (v.id !== doc.id) && contieneNome(en.nuovo, v.vero));
        if ( svelaN.length ) { P.push(`${dove} (${doc.id}): nel nome nuovo c'è il nome vero, non ancora rivelato, di ${svelaN.map(v => v.id).join(", ")}`); continue; }
        const altri = omonimi(x0).filter(y => y.id !== doc.id);
        if ( altri.length ) { P.push(`${dove} (${doc.id}): un altro attore ha già uno dei suoi nomi nuovi (${altri.map(y => y.id).join(", ")}): decide il GM`); continue; }
        // il nome che descrive nuovo, o quello composto se è rivelato; il prototipo e i token delle scene che portano il nome di prima
        if ( en.nuovo !== doc.name ) {
          upd.name = en.nuovo;
          const pr = nomeNuovo(doc.prototypeToken?.name, doc.name, en.nuovo);
          if ( pr && (pr !== doc.prototypeToken?.name) ) { upd["prototypeToken.name"] = pr; x.protoAtteso = pr; }
        }
        if ( x0.nomeVero ) upd[`flags.${MODULO}.nomi`] = { aspetto: x0.nome, vero: x0.nomeVero, rivelato };
        else if ( nm ) upd[`flags.${MODULO}.-=nomi`] = null;
        x.tokenScene = tokenDaRinominare(doc, en.nuovo);
        x.nomeAtteso = en.nuovo; x.nomiAtteso = x0.nomeVero ? { aspetto: x0.nome, vero: x0.nomeVero, rivelato } : null;
        nomiSegno = [x0.nome, x0.nomeVero ?? null]; cambia.push("nomi");
      }
      if ( ((doc.ownership?.default ?? L.NONE) > L.NONE) || giocatrici.some(u => doc.testUserPermission(u, "LIMITED")) ) A.push(`${dove}: nel mondo una giocatrice lo vede; la visibilità non la tocca il caricatore`);
      if ( (doc.folder?.id ?? null) !== (cartella ?? null) ) A.push(`${dove}: nel mondo sta in «${doc.folder?.name ?? "nessuna cartella"}»; non si sposta`);
      // l'ultima scrittura del ritratto: il segno, o «precedente»; mai l'immagine che l'attore ha adesso, che può averla cambiata il GM
      const prima = s?.img ?? x0.precedente?.img ?? null;
      x.segno = { v: 1, chiave: chiave.get(x0.rif), img: x0.img ?? prima, ...(nomiSegno ? { nomi: nomiSegno } : {}) };
      const svelaImg = x0.img ? veriMondo.filter(v => (v.id !== doc.id) && contieneNome(x0.img, v.vero)) : [];
      if ( svelaImg.length ) { P.push(`${dove}: nel file del ritratto c'è il nome vero, non ancora rivelato, di ${svelaImg.map(v => v.id).join(", ")}`); continue; }
      if ( x0.img && (doc.img !== x0.img) ) {
        if ( (prima !== null) && (doc.img === prima) ) {
          const no = await controllaFile(x0.img, D.file.get(x0.img));
          if ( no ) { P.push(`${dove}: immagine ${x0.img}: ${no}`); continue; }
          upd.img = x0.img; cambia.push("ritratto");
        } else if ( (prima !== null) && (x0.img === prima) ) { A.push(`${dove}: il ritratto è stato cambiato in Foundry, e i dati non lo cambiano: resta com'è`); x.segno.img = prima; }
        else { P.push(`${dove} (${doc.id}): il ritratto nel mondo non è quello dei dati${(prima === null) ? ", e l'ultima scrittura non si conosce: per un attore di uno script di prima serve «precedente», con l'img di prima" : ", ed è stato cambiato dopo l'ultima scrittura"}: decide il GM`); continue; }
      }
      if ( cambia.length ) { x.azione = "aggiorna"; x.cambia = cambia; x.upd = { ...upd, [`flags.${MODULO}.${SEGNO}`]: x.segno }; }
      if ( !x.azione ) x.azione = uguali(s, x.segno) ? null : "segna";
      if ( x.azione === "segna" ) x.upd = { _id: doc.id, [`flags.${MODULO}.${SEGNO}`]: x.segno };
      x.tempo = doc._stats?.modifiedTime ?? null;
      if ( !x.azione ) report.saltati.push(`${dove}: c'è già (${doc.id})`);
      piano.attori.push(x);
      continue;
    }
    const c = omonimi(x0);
    if ( c.length ) { P.push(`${dove}: c'è già un attore con uno dei suoi nomi, non di questo carico (${c.map(y => y.id).join(", ")}): se è quello, il suo id va nei dati`); continue; }
    const visti = [x0.nome, ...Object.values(x0.ritocchi.rinomina).map(r => r.nome), ...Object.values(x0.ritocchi.sostituisci), x0.img ?? ""];
    const svela = veriMondo.filter(v => visti.some(z => contieneNome(z, v.vero)));
    if ( svela.length ) { P.push(`${dove}: nel nome, negli oggetti o nel file del ritratto c'è il nome vero, non ancora rivelato, di ${svela.map(v => v.id).join(", ")}`); continue; }
    const sorgente = await dalCompendio(pacchi, x0.compendio, x0.srd, P, dove, "Actor");
    if ( !sorgente ) continue;
    let data = game.actors.fromCompendium(sorgente);
    data._id = x.aid;
    data.name = x0.nome;
    data.folder = cartella ?? null;
    data.ownership = { default: L.NONE };
    data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULO]: { ...(x0.nomeVero ? { nomi: { aspetto: x0.nome, vero: x0.nomeVero, rivelato: false } } : {}) } }, { inplace: false });
    const inattivo = src => { const m = String(src ?? "").match(/^modules\/([^/]+)\//)?.[1]; return (m && !game.modules.get(m)?.active) ? m : null; };
    if ( x0.img ) data.img = x0.img;                                     // il ritratto
    else if ( inattivo(data.img) ) { report.note.push(`${dove}: l'immagine del compendio sta nel modulo ${inattivo(data.img)}, che non è attivo: l'immagine di default`); data.img = CONST.DEFAULT_TOKEN; }
    const uno = x0.token === "uno";
    const NEUTRALE = CONST.TOKEN_DISPOSITIONS.NEUTRAL;
    const pt = data.prototypeToken ?? {};
    Object.assign(pt, { name: x0.nome, actorLink: uno, appendNumber: !uno, disposition: NEUTRALE });
    // un token jolly che sta in un modulo non attivo (il Monster Manual premium) darebbe l'icona di default con un errore
    const mod = inattivo(pt.texture?.src);
    if ( mod ) {
      // con l'immagine di default, Foundry dà al token quella dell'attore (il ritratto, se c'è): la verifica accetta l'una e l'altra
      report.note.push(`${dove}: il token del compendio sta nel modulo ${mod}, che non è attivo: il token prende l'immagine di default, o il ritratto`);
      pt.randomImg = false;
      pt.texture = { ...(pt.texture ?? {}), src: CONST.DEFAULT_TOKEN };
    }
    data.prototypeToken = pt;
    // l'immagine predefinita di dnd5e, scritta in chiaro: così il segno dice l'immagine vera
    data.img ||= (CONFIG.Actor.documentClass.getDefaultArtwork?.(data)?.img ?? CONST.DEFAULT_TOKEN);
    // il segno ha l'immagine che si scrive davvero (anche quella del compendio): un ritratto dato dopo si aggiorna con la regola dei tre stati
    x.segno = { v: 1, chiave: chiave.get(x0.rif), img: data.img ?? null, nomi: [x0.nome, x0.nomeVero ?? null] };
    foundry.utils.setProperty(data, `flags.${MODULO}.${SEGNO}`, x.segno);
    const m0 = P.length;
    await ritocca(data, x0.ritocchi, x0.compendioOggetti, pacchi, P, dove);
    if ( P.length > m0 ) continue;
    const ids = new Set(data.items.map(i => i._id));
    const rotti = richiami(data).filter(i => !ids.has(i));
    if ( rotti.length ) P.push(`${dove}: richiami a oggetti che non ci sono più (${rotti.join(", ")})`);
    if ( !data._stats?.compendiumSource ) P.push(`${dove}: senza _stats.compendiumSource la conversione metrica lo salterebbe`);
    if ( metrico ) {
      // le regole della macro della conversione, sui dati dell'attore costruito in memoria (come li scriverebbe Foundry)
      try {
        const o = new CONFIG.Actor.documentClass(clona(data)).toObject();
        o._stats = clona(data._stats ?? {});                             // le date e la fonte come nei dati: la firma non cambia fra prova e applica
        const lg = attoreInMetri(o, x0.nome);
        if ( lg.saltati.length ) P.push(`${dove}: il compendio lo dà già convertito in metri`);
        // un attore che la conversione non ha segnato (toccato dal modulo italiano) resterebbe a metà: non si crea
        else if ( !o.flags?.world?.metric ) P.push(`${dove}: la conversione in metri non lo segna (toccato dal modulo italiano?): non si crea; decide il GM`);
        for ( const q of lg.aMano ) report.avvisi.push(`${dove}, conversione in metri, da guardare a mano: ${q}`);
        x.metri = lg.modifiche.length;
        data = o;
      } catch(err) { P.push(`${dove}: conversione in metri non riuscita: ${err.message}`); continue; }
    }
    try {
      const prova = new CONFIG.Actor.documentClass(clona(data));
      const n = numeri(prova);
      report.numeri ??= {};
      report.numeri[x0.rif] = { nome: x0.nome, srd: x0.srd, ...n };
      if ( x0.atteso && !numeriTornano(n, x0.atteso) ) P.push(`${dove}: i numeri non tornano (${JSON.stringify(n)}, attesi ${JSON.stringify(x0.atteso)})`);
      if ( (prova.name !== x0.nome) || !uguali(prova.flags?.[MODULO]?.[SEGNO], x.segno) || (x0.nomeVero && !uguali(doppioDi(prova), { aspetto: x0.nome, vero: x0.nomeVero, rivelato: false })) )
        P.push(`${dove}: costruito in memoria non è come nei dati (nome, segno o doppio nome)`);
    } catch(err) { P.push(`${dove}: costruito in memoria non valido: ${err.message}`); continue; }
    if ( x0.img ) { const no = await controllaFile(x0.img, D.file.get(x0.img)); if ( no ) { P.push(`${dove}: immagine ${x0.img}: ${no}`); continue; } }
    x.azione = "crea";
    x.dati = data;
    x.token = { src: data.prototypeToken?.texture?.src ?? null, lato: data.prototypeToken?.width ?? null, richiami: richiami(data) };
    x.metrico = metrico;
    piano.attori.push(x);
  }

  // --- il piano per la scrittura, il rapporto e quello che la verifica deve ritrovare ----------------------------------------------------
  for ( const x of piano.tabelle ) {
    const t = x.t;
    if ( x.azione === "crea" ) {
      try {
        const m = new CONFIG.RollTable.documentClass(clona(x.dati));
        const o = m.toObject();
        if ( (o.name !== t.nome) || (o.results?.length !== t.voci.length) || !uguali(o.ownership, x.dati.ownership) ) P.push(`tabella «${t.nome}»: costruita in memoria non è come nei dati`);
      } catch(err) { P.push(`tabella «${t.nome}»: costruita in memoria non valida: ${err.message}`); }
      report.piano.push({ azione: "crea", cosa: "tabella", nome: t.nome, id: x.tid, voci: t.voci.length, formula: t.formula, dentro: x.cartella ?? null, visibilita: "None" });
    } else if ( x.azione === "aggiorna" ) report.piano.push({ azione: "aggiorna", cosa: "tabella", nome: t.nome, id: x.tid, campi: x.cambia });
    else if ( x.azione === "segna" ) report.piano.push({ azione: "segna", cosa: "tabella", nome: t.nome, id: x.tid, perche: segnoDi(x.doc) ? "il segno non è quello dei dati" : "tabella di uno script di prima, uguale ai dati" });
    piano.corrispondenze.push({ rif: t.rif, chiave: chiave.get(t.rif), tipo: "RollTable", id: x.tid, nome: x.doc?.name ?? t.nome, crea: x.azione === "crea" });
  }
  for ( const x of piano.attori ) {
    const a = x.a;
    if ( x.azione === "crea" ) report.piano.push({ azione: "crea", cosa: "attore", nome: a.nome, id: x.aid, da: `${a.compendio} «${a.srd}»`, token: a.token,
      ritocchi: Object.entries(a.ritocchi).filter(([, v]) => (v === true) || (Array.isArray(v) ? v.length : (v && (typeof v === "object") ? Object.keys(v).length : !!v))).map(([k]) => k),
      nomeVero: !!a.nomeVero, ritratto: a.img ?? null, dentro: x.cartella ?? null, visibilita: "None", ...(x.metrico ? { inMetri: x.metri } : {}) });
    // una voce sola per attore, coi campi veri e i token delle scene
    else if ( x.azione === "aggiorna" ) report.piano.push({ azione: "aggiorna", cosa: "attore", nome: x.a.nome, id: x.aid, campi: x.cambia ?? ["ritratto"], ...(x.tokenScene?.length ? { token: x.tokenScene.reduce((t, y) => t + y.token.length, 0) } : {}) });
    else if ( x.azione === "segna" ) report.piano.push({ azione: "segna", cosa: "attore", nome: x.doc.name, id: x.aid, perche: segnoDi(x.doc) ? "il segno non è quello dei dati" : "attore di uno script di prima" });
    piano.corrispondenze.push({ rif: a.rif, chiave: chiave.get(a.rif), tipo: "Actor", id: x.aid, nome: x.doc?.name ?? a.nome, crea: x.azione === "crea" });
  }
  const nuovi = piano.attori.filter(x => x.azione === "crea");
  if ( nuovi.length && unitaMiste ) A.push("il mondo ha le lunghezze in metri ma non i pesi o i volumi: gli attori nuovi si convertono in tutto, come fa la macro; lo si dice al GM");
  if ( nuovi.length && metrico ) report.note.push(`il mondo è in unità metriche: gli attori nuovi (${nuovi.map(x => `«${x.a.nome}»`).join(", ")}) nascono già convertiti in metri, con le regole della macro della conversione e il suo segno (nel piano, «inMetri»: i campi cambiati)`);
}

/** La parte del piano di tabelle e attori che entra nella firma: tutto quello che si scriverebbe. */
export async function perLaFirmaTA(piano) {
  return {
    tabelle: piano.tabelle.filter(x => x.azione).map(x => ({ id: x.tid, azione: x.azione, dati: x.dati ?? null, upd: x.upd ?? null, risultati: x.risultati ?? null, tempo: x.tempo ?? null })),
    // i token delle scene da rinominare entrano nella firma
    attori: await Promise.all(piano.attori.filter(x => x.azione).map(async x => ({ id: x.aid, azione: x.azione, dati: x.dati ? await sha256(jsonStabile(x.dati)) : null, upd: x.upd ?? null, tempo: x.tempo ?? null,
      ...(x.tokenScene?.length ? { token: x.tokenScene.map(y => ({ scena: y.scena.id, token: y.token })) } : {}) })))
  };
}

// --- la scrittura --------------------------------------------------------------------------------------------------------------------
/** Scrive tabelle e attori del piano; alla prima scrittura non riuscita si ferma. @returns true se tutto è andato */
export async function eseguiTA(piano, report) {
  // prima delle scritture: nessuno ha toccato tabelle e attori da aggiornare, e nessun attore ha preso uno dei nomi dei nuovi
  for ( const x of [...piano.tabelle, ...piano.attori].filter(x => ["aggiorna", "segna"].includes(x.azione)) ) {
    const d = x.t ? game.tables.get(x.tid) : game.actors.get(x.aid);
    if ( (d?._stats?.modifiedTime ?? "assente") !== x.tempo ) { report.errori.push(`${x.t ? "tabella" : "attore"} «${d?.name ?? x.tid ?? x.aid}»: cambiato durante il carico; non lo aggiorno, si rilancia la prova`); return false; }
  }
  for ( const x of piano.tabelle.filter(x => ["aggiorna", "segna"].includes(x.azione)) ) {
    const T = game.tables.get(x.tid);
    const ora = T ? await sha256(jsonStabile(await improntaTabella({ nome: T.name, formula: T.formula, descrizione: T.description ?? "", voci: vociDi(T) }))) : null;
    if ( ora !== x.intera ) { report.errori.push(`tabella «${T?.name ?? x.tid}»: le voci o il contenuto sono cambiati durante il carico; non la aggiorno, si rilancia la prova`); return false; }
  }
  for ( const x of piano.attori.filter(x => x.azione === "crea") ) {
    const nomi = [x.a.nome, x.a.nomeVero].filter(Boolean).map(n => n.toLowerCase());
    const c = game.actors.filter(a => [a.name, a.flags?.[MODULO]?.nomi?.aspetto, a.flags?.[MODULO]?.nomi?.vero].some(n => n && nomi.includes(String(n).toLowerCase())) || (a.id === x.aid));
    if ( c.length ) { report.errori.push(`attore «${x.a.nome}»: durante il carico è comparso un attore con uno dei suoi nomi o col suo id (${c.map(a => a.id).join(", ")}); non lo creo, si rilancia la prova`); return false; }
  }
  for ( const x of piano.tabelle ) {
    if ( x.azione === "crea" ) {
      if ( !(await scrivi(report, `tabella «${x.t.nome}» (${x.tid}), ${x.t.voci.length} voci`, () => CONFIG.RollTable.documentClass.create(clona(x.dati), { keepId: true }), [x.tid])) ) return false;
    } else if ( ["aggiorna", "segna"].includes(x.azione) ) {
      const T = game.tables.get(x.tid);
      // prima le voci, poi la tabella col segno: se le voci non si scrivono, il segno dice ancora l'ultima scrittura riuscita
      if ( x.risultati?.aggiorna.length && !(await scrivi(report, `tabella «${T.name}»: ${x.risultati.aggiorna.length} voci aggiornate`,
        () => T.updateEmbeddedDocuments("TableResult", clona(x.risultati.aggiorna)), x.risultati.aggiorna.map(r => r._id))) ) return false;
      if ( x.risultati?.crea.length && !(await scrivi(report, `tabella «${T.name}»: ${x.risultati.crea.length} voci aggiunte`,
        () => T.createEmbeddedDocuments("TableResult", clona(x.risultati.crea)))) ) return false;
      if ( !(await scrivi(report, `tabella «${T.name}» (${x.tid}): ${x.azione === "aggiorna" ? x.cambia.join(", ") : "segno"}`, () => T.update(clona(x.upd)), [x.tid])) ) return false;
    }
  }
  for ( const x of piano.attori ) {
    if ( x.azione === "crea" ) {
      const r = await scrivi(report, `attore «${x.a.nome}» (${x.aid}) da ${x.a.compendio} «${x.a.srd}»`, () => CONFIG.Actor.documentClass.create(clona(x.dati), { keepId: true }), [x.aid]);
      if ( !r ) return false;
    } else if ( ["aggiorna", "segna"].includes(x.azione) ) {
      const d = game.actors.get(x.aid);
      // i token nelle scene col nome di prima, prima dell'attore col suo segno: se una scrittura si ferma, al rilancio l'attore ha
      // ancora i nomi di prima e la rinomina riparte da lì
      for ( const y of (x.tokenScene ?? []) ) if ( !(await scrivi(report, `scena «${y.scena.name}»: ${y.token.length} token dell'attore ${x.aid}`, () => y.scena.updateEmbeddedDocuments("Token", clona(y.token)), y.token.map(t => t._id))) ) return false;
      if ( !(await scrivi(report, `attore «${d.name}» (${x.aid}): ${x.azione === "aggiorna" ? x.cambia.join(", ") : "segno"}`, () => d.update(operatori(clona(x.upd))), [x.aid])) ) return false;
    }
  }
  return true;
}

// --- la verifica -------------------------------------------------------------------------------------------------------------------
export async function verificaTA(piano, report) {
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const ok = (voce, cond) => report.verifica.push(`${cond ? "OK" : "KO"} · ${voce}`);
  const giocatrici = game.users.filter(u => !u.isGM);
  const nascosto = d => giocatrici.every(u => !d.testUserPermission(u, "LIMITED"));
  for ( const x of piano.tabelle ) {
    const T = game.tables.get(x.tid);
    if ( !T ) { ok(`tabella «${x.t.nome}» (${x.tid}): c'è`, false); continue; }
    const mondo = await improntaTabella({ nome: T.name, formula: T.formula, descrizione: T.description ?? "", voci: vociDi(T) });
    // dopo la scrittura ogni campo è quello del segno, salvo i ritocchi del GM lasciati com'erano (il segno tiene l'ultima scrittura)
    const contenuto = x.azione ? Object.keys(CAMPI_TABELLA).every(k => (mondo[k] === x.segno[k]) || (x.ritocchi ?? []).includes(k))
      : uguali(mondo, x.mondo);                                         // non toccata: com'era al piano
    ok(`tabella «${T.name}» (${x.tid}): ${x.azione === "crea" ? "creata, a None, nella sua cartella" : (x.azione ?? "com'era")}, contenuto come nel piano, nascosta alle giocatrici, col segno`,
      contenuto && ((x.azione !== "crea") || ((T.ownership.default === L.NONE) && ((T.folder?.id ?? null) === x.dati.folder) && (T.results.size === x.t.voci.length)))
      && nascosto(T) && (x.azione ? uguali(segnoDi(T), x.segno) : uguali(segnoDi(T), x.segnoPrima ?? null)) && (!x.t.privata || (T.flags?.[MODULO]?.privata === true)));
  }
  for ( const x of piano.attori ) {
    const d = game.actors.get(x.aid);
    if ( !d ) { ok(`attore «${x.a.nome}» (${x.aid}): c'è`, false); continue; }
    if ( x.azione === "crea" ) {
      const n = numeri(d);
      const nomi = d.flags?.[MODULO]?.nomi ?? null;
      ok(`attore «${x.a.nome}» (${x.aid}): creato, a None, nascosto alle giocatrici, nella sua cartella, col segno${x.a.img ? ", col ritratto" : ""}${x.a.nomeVero ? ", col doppio nome" : ""}, dal compendio${x.a.atteso ? ", coi numeri attesi" : ""}${x.metrico ? ", in metri" : ""}`,
        (d.name === x.a.nome) && (d.ownership.default === L.NONE) && nascosto(d) && ((d.folder?.id ?? null) === (x.cartella ?? null)) && uguali(segnoDi(d), x.segno)
        && (!x.a.img || (d.img === x.a.img)) && (!x.a.nomeVero || uguali(nomi, { aspetto: x.a.nome, vero: x.a.nomeVero, rivelato: false }))
        && !!d._stats?.compendiumSource && numeriTornano(n, x.a.atteso) && (!x.metrico || (!!d.flags?.world?.metric && ((x.metri ?? 0) === 0 || (d._source?.system?.attributes?.movement?.units === "m")))));
      const pt = d.prototypeToken ?? {};
      const ids = new Set((d.items?.contents ?? []).map(i => i.id));
      ok(`attore «${x.a.nome}»: token prototipo col suo nome, ${x.a.token === "uno" ? "collegato" : "non collegato e numerato"}, neutrale, con l'immagine del piano (o il ritratto)${x.token.lato ? `, ${x.token.lato}×${x.token.lato}` : ""}; i richiami fra gli oggetti reggono`,
        (pt.name === x.a.nome) && (pt.actorLink === (x.a.token === "uno")) && (pt.appendNumber === (x.a.token !== "uno")) && (pt.disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL)
        && [x.token.src, d.img].includes(pt.texture?.src) && (!x.token.lato || ((pt.width === x.token.lato) && (pt.height === x.token.lato))) && x.token.richiami.every(i => ids.has(i)));
    } else if ( x.azione ) ok(`attore «${d.name}» (${x.aid}): ${x.azione === "aggiorna" ? x.cambia.map(k => (k === "nomi") ? "coi nomi dei dati" : "col ritratto dei dati").join(", ") : "segnato"}, col segno`,
      uguali(segnoDi(d), x.segno) && (!(x.cambia ?? []).includes("ritratto") || (d.img === x.a.img))
      && (!(x.cambia ?? []).includes("nomi") || ((d.name === x.nomeAtteso) && uguali(nomiDi(d), x.nomiAtteso)
        // il prototipo e i token delle scene col nome nuovo
        && (!x.protoAtteso || (d.prototypeToken?.name === x.protoAtteso))
        && (x.tokenScene ?? []).every(y => y.token.every(t => game.scenes.get(y.scena.id)?.tokens?.get?.(t._id)?.name === t.name)))));
  }
}
