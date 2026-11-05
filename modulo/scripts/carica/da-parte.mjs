/**
 * Il caricatore: «metti da parte». Il caricatore non cancella niente (le cancellazioni in Foundry sono definitive), ma un
 * documento da togliere lo toglie dal gioco, in modo reversibile, e il GM lo cancella quando vuole.
 * - Una nota della pianta: si lega a una pagina (o a un journal) che nessuna giocatrice vede, così non la vede nessuna; il modulo non
 *   la disegna nemmeno per il GM, salvo col livello delle note attivo, in rosso, per trovarla e cancellarla (pin-mappa.mjs).
 * - Una pagina: a None per tutte le giocatrici, col nome che finisce con « (da togliere)» (una pagina non sta in una cartella).
 * - Un journal, un attore, una Roll Table, una macro: nella cartella dei dati (per esempio «Da togliere»), a None per tutte.
 * Ognuno porta il segno flags.gdr-strumenti.daParte, con com'era prima (pagina della nota; nome, cartella e visibilità), per tornare
 * indietro a mano. Un documento che non c'è più è il lavoro finito se il registro del carico dice che l'aveva messo da parte (poi
 * l'ha cancellato il GM); se no, è un problema. Un documento da parte conta come solo GM, anche per «Scopri».
 * Formato e regole: docs/caricatore.md, «daParte».
 */
import { MODULO, jsonStabile, scrivi } from "./comune.mjs";
import { DECISIONE } from "./dati-scene.mjs";

export const DA_PARTE = "daParte";
export const SUFFISSO = " (da togliere)";
const ID = "[A-Za-z0-9]{16}";
const UUID = {
  nota: new RegExp(`^Scene\\.(${ID})\\.Note\\.(${ID})$`),
  pagina: new RegExp(`^JournalEntry\\.(${ID})\\.JournalEntryPage\\.(${ID})$`),
  journal: new RegExp(`^JournalEntry\\.(${ID})$`),
  attore: new RegExp(`^Actor\\.(${ID})$`),
  tabella: new RegExp(`^RollTable\\.(${ID})$`),
  macro: new RegExp(`^Macro\\.(${ID})$`)
};
const TIPO_CARTELLA = { journal: "JournalEntry", attore: "Actor", tabella: "RollTable", macro: "Macro" };
const UUID_JOURNAL = new RegExp(`^JournalEntry\\.(${ID})(?:\\.JournalEntryPage\\.(${ID}))?$`);
const cosaDi = uuid => Object.keys(UUID).find(k => UUID[k].test(uuid ?? "")) ?? null;
const segnoDP = d => d?.flags?.[MODULO]?.[DA_PARTE] ?? null;
const clona = x => JSON.parse(JSON.stringify(x));

/** Il documento di un uuid dei dati, nel mondo, o null. */
function documento(uuid) {
  const cosa = cosaDi(uuid);
  const m = cosa ? uuid.match(UUID[cosa]) : null;
  if ( !m ) return null;
  if ( cosa === "nota" ) return game.scenes.get(m[1])?.notes?.get(m[2]) ?? null;
  if ( cosa === "pagina" ) return game.journal.get(m[1])?.pages.get(m[2]) ?? null;
  return { journal: game.journal, attore: game.actors, tabella: game.tables, macro: game.macros }[cosa].get(m[1]) ?? null;
}
/** Il nome che si confronta coi dati: il testo di una nota, il nome degli altri. */
const nomeDi = (d, cosa) => (cosa === "nota") ? (d.text ?? "") : (d.name ?? "");
/** Lo stato di un documento per la fotografia e per il controllo subito prima di scrivere. */
function stato(d, cosa) {
  if ( !d ) return "-";
  if ( cosa === "nota" ) return jsonStabile(d.toObject());
  return jsonStabile({ n: d.name, f: d.folder?.id ?? null, o: d.ownership ?? null, t: d._stats?.modifiedTime ?? null, dp: segnoDP(d) });
}

/**
 * Il controllo dei dati di un'operazione «daParte» (dati.mjs). h: { P, campi, nuovoRif, cartellaDi, RIF, BERSAGLIO_CARICO, carico,
 * daRisolvere, uuidVisti }. Restituisce l'operazione normalizzata, o null.
 */
export function controllaDaParte(op, dove, h) {
  const P = h.P;
  const d = `${dove} (daParte «${op.rif}»)`;
  if ( !h.campi(op, ["op", "rif", "uuid", "nome", "cartella", "pagina", "decisione"], d, ["rif", "uuid", "nome", "decisione"]) ) return null;
  const cosa = cosaDi(op.uuid);
  if ( !cosa ) { P.push(`${d}: uuid «${op.uuid}» non riconosciuto (una nota, Scene.<id>.Note.<id>; una pagina; un journal; Actor, RollTable o Macro .<id>)`); return null; }
  if ( h.uuidVisti.has(op.uuid) ) P.push(`${d}: ${op.uuid} è già in un'altra operazione daParte`);
  h.uuidVisti.add(op.uuid);
  if ( (typeof op.nome !== "string") || (op.nome.length > 255) || ((cosa !== "nota") && !op.nome.trim()) ) P.push(`${d}: nome deve essere il nome del documento nel mondo (per una nota, il suo testo)`);
  if ( !DECISIONE(op.decisione) ) P.push(`${d}: decisione deve essere la decisione del GM, con la data (AAAA-MM-GG)`);
  const x = { rif: op.rif, uuid: op.uuid, cosa, nome: op.nome, cartella: null, pagina: null, decisione: (typeof op.decisione === "string") ? op.decisione.trim() : null };
  if ( cosa === "nota" ) {
    if ( op.cartella !== undefined ) P.push(`${d}: una nota non va in una cartella: si lega a una pagina che le giocatrici non vedono («pagina»)`);
    const b = op.pagina;
    if ( (typeof b !== "string") || !b ) P.push(`${d}: una nota vuole «pagina», una pagina o un journal che nessuna giocatrice vede (rif, carico/rif o uuid)`);
    else {
      if ( h.RIF.test(b) ) h.daRisolvere.push({ rif: b, d });
      else if ( h.BERSAGLIO_CARICO.test(b) ) { if ( b.startsWith(`${h.carico}/`) ) P.push(`${d}: un documento di questo carico si scrive col suo rif`); }
      else if ( !UUID_JOURNAL.test(b) ) P.push(`${d}: pagina «${b}» non riconosciuta (rif, carico/rif, JournalEntry.id o l'UUID di una pagina)`);
      x.pagina = b;
    }
  } else if ( cosa === "pagina" ) {
    if ( op.cartella !== undefined ) P.push(`${d}: una pagina non va in una cartella: resta nel suo journal, a None, col nome «…${SUFFISSO}»`);
    if ( op.pagina !== undefined ) P.push(`${d}: «pagina» vale solo per una nota`);
  } else {
    if ( op.pagina !== undefined ) P.push(`${d}: «pagina» vale solo per una nota`);
    if ( (op.cartella === undefined) || (op.cartella === null) ) P.push(`${d}: serve la cartella dove metterlo da parte (il rif di una cartella del file, di tipo ${TIPO_CARTELLA[cosa]}, o { "id": "…" })`);
    else x.cartella = h.cartellaDi(op.cartella, TIPO_CARTELLA[cosa], `${d}, cartella`);
  }
  return h.nuovoRif(op.rif, d, "daParte", x) ? x : null;
}

/** La fotografia dei documenti da mettere da parte: «applica» la rifà subito prima di scrivere. */
export const fotografaDaParte = D => (D.daParte ?? []).map(x => `DP|${x.uuid}|${stato(documento(x.uuid), x.cosa)}`).join("\n");

/**
 * Il piano: per ogni documento, niente da fare (non c'è più, o è già da parte) o l'aggiornamento che lo mette da parte.
 * ctx: { D, report, piano, bersaglio, cartellaPiano, registro, chiave, soloGMNome }
 */
export function pianificaDaParte(ctx) {
  const { D, report, piano, bersaglio, cartellaPiano, registro, chiave: chiavi, soloGMNome } = ctx;
  const P = report.problemi, A = report.avvisi;
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const giocatrici = game.users.filter(u => !u.isGM);
  const nomi = us => us.map(u => u.name);
  piano.daParte = [];
  if ( !D.daParte?.length ) return;
  // i documenti che questo file scrive: non si mettono da parte nello stesso giro
  const delFile = new Set(piano.corrispondenze.map(c => c.id));
  for ( const x of piano.elementi ?? [] ) delFile.add(`${x.sid}.${x.eid}`);
  const journalDelFile = new Set((piano.journal ?? []).filter(j => j.dati || j.crea.length || j.aggiorna.length || j.segni.length).map(j => j.id));
  // chi vedrà una pagina o un journal: quelli che il carico crea, con la visibilità che avranno alla nascita
  const nuoveP = new Map(), nuoviJ = new Map();
  for ( const j of piano.journal ?? [] ) {
    const jOwn = j.dati?.ownership ?? game.journal.get(j.id)?.ownership ?? { default: L.NONE };
    if ( j.dati ) nuoviJ.set(j.id, j.dati.ownership);
    for ( const p of j.crea ) nuoveP.set(`${j.id}.${p._id}`, { own: p.ownership, jOwn });
  }
  const liv = (own, u) => own?.[u.id] ?? own?.default;
  const vedeOwn = (own, jOwn, u) => { let l = liv(own, u); if ( (l === undefined) || (l < 0) ) l = liv(jOwn, u); return (l ?? 0) >= L.LIMITED; };
  /** chi vede una pagina o un journal dopo il carico; null se non c'è e non si crea in questo giro */
  const vedranno = (entryId, pageId) => {
    const n = pageId ? nuoveP.get(`${entryId}.${pageId}`) : null;
    if ( n ) return nomi(giocatrici.filter(u => vedeOwn(n.own, n.jOwn, u)));
    const J = game.journal.get(entryId);
    if ( !J ) return (!pageId && nuoviJ.has(entryId)) ? nomi(giocatrici.filter(u => vedeOwn(nuoviJ.get(entryId), {}, u))) : null;
    const d = pageId ? J.pages.get(pageId) : J;
    return d ? nomi(giocatrici.filter(u => d.testUserPermission(u, "LIMITED"))) : null;
  };
  const vedonoDoc = d => nomi(giocatrici.filter(u => d.testUserPermission(u, "LIMITED")));
  // la visibilità che si toglie: None per tutti, anche chi è nominato uno per uno (il suo livello a None, senza togliere chiavi); anche i
  // GM, che vedono comunque tutto: se uno diventasse giocatore non ritroverebbe il livello di prima
  const aNone = own => {
    const u = { "ownership.default": L.NONE };
    for ( const [k, v] of Object.entries(own ?? {}) ) if ( (k !== "default") && (v !== L.NONE) ) u[`ownership.${k}`] = L.NONE;
    return u;
  };
  const nessunaVede = t => !!t && giocatrici.every(u => !t.testUserPermission(u, "LIMITED"));
  // gli uuid messi da parte in questo file, e i collegamenti e le note del file che porterebbero a loro
  const uuidDP = new Set(D.daParte.map(o => o.uuid));
  const verso = u => [...uuidDP].find(z => (u === z) || u.startsWith(`${z}.`) || u.startsWith(`${z}#`)) ?? null;
  for ( const a of piano.attese ?? [] ) for ( const l of (a.collegamenti ?? []) ) {
    const z = verso(String(l)); if ( z ) P.push(`journal «${a.journal}», pagina «${a.nome}»: un collegamento porta a ${z}, che questo file mette da parte`);
  }
  for ( const x of piano.elementi ?? [] ) {
    const pg = x.valori?.pagina; if ( !pg?.entryId ) continue;
    const z = verso(pg.pageId ? `JournalEntry.${pg.entryId}.JournalEntryPage.${pg.pageId}` : `JournalEntry.${pg.entryId}`);
    if ( z ) P.push(`scena, ${x.e.genere} «${x.nome}»: porta a ${z}, che questo file mette da parte`);
  }
  // le note delle scene che portano a un documento: diventano invisibili alle giocatrici
  const noteVerso = (jid, pid) => game.scenes.contents.flatMap(s => (s.notes?.contents ?? []).filter(n => (n.entryId === jid) && (!pid || (n.pageId === pid))).map(n => `«${n.text || n.id}» (scena «${s.name}»)`));

  for ( const op of D.daParte ) {
    const dove = `daParte «${op.rif}» (${op.uuid})`;
    const d = documento(op.uuid);
    const x = { op, doc: d, stato: stato(d, op.cosa), azione: null, chiave: chiavi.get(op.rif) };
    piano.daParte.push(x);
    // un documento che non c'è: il lavoro è finito se questo carico l'aveva messo da parte (il registro); se no, l'uuid è sbagliato, o
    // il GM l'ha cancellato prima: si toglie dai dati
    if ( !d ) {
      if ( (registro[x.chiave]?.tipo === "daParte") && (registro[x.chiave]?.id === op.uuid) ) report.saltati.push(`${dove}: messo da parte, e poi cancellato: il lavoro è finito`);
      else P.push(`${dove}: non c'è nel mondo, e questo carico non l'ha mai messo da parte: l'uuid è sbagliato? Se l'ha già cancellato il GM, si toglie dai dati`);
      continue;
    }
    const [a, b] = op.uuid.match(UUID[op.cosa]).slice(1);
    const chiave = ["nota", "pagina"].includes(op.cosa) ? `${a}.${b}` : a;
    if ( delFile.has(chiave) || ((op.cosa === "journal") && journalDelFile.has(a)) ) { P.push(`${dove}: questo file lo scrive anche (in un'altra operazione): o lo si scrive o lo si mette da parte`); continue; }
    if ( segnoDP(d) ) {
      // già da parte: si ricontrolla che nessuna giocatrice lo veda, perché la visibilità si può ridare a mano
      let t = d;
      if ( op.cosa === "nota" ) { const J = d.entryId ? game.journal.get(d.entryId) : null; t = (d.pageId ? J?.pages.get(d.pageId) : null) ?? J; }
      const vista = !nessunaVede(t) || ((op.cosa === "journal") && !d.pages.contents.every(nessunaVede));
      if ( vista ) P.push(`${dove}: è già da parte (segno), ma qualche giocatrice lo vede ancora${op.cosa === "nota" ? " (la pagina a cui è legata)" : ""}: decide il GM`);
      else report.saltati.push(`${dove}: è già da parte`);
      x.giaDaParte = true; continue;
    }
    if ( nomeDi(d, op.cosa) !== op.nome ) { P.push(`${dove}: nel mondo si chiama «${nomeDi(d, op.cosa)}», i dati dicono «${op.nome}»: l'uuid è sbagliato, o il GM l'ha rinominato; non lo tocco`); continue; }
    const vedevano = (op.cosa === "nota") ? (() => { const J = d.entryId ? game.journal.get(d.entryId) : null; const t = (d.pageId ? J?.pages.get(d.pageId) : null) ?? J; return t ? vedonoDoc(t) : nomi(giocatrici); })() : vedonoDoc(d);
    const voce = { azione: "mettiDaParte", cosa: op.cosa, nome: op.nome, id: op.uuid, vedevano, decisione: op.decisione };
    if ( op.cosa === "nota" ) {
      // la pagina deve essere solo GM (il suffisso), non solo nascosta adesso: una voce nascosta «Scopri» la può mostrare
      const r = bersaglio(op.pagina);
      if ( r.problema ) { P.push(`${dove}, pagina: ${r.problema}`); continue; }
      if ( r.pagina?.rimandata ) { P.push(`${dove}, pagina: «${op.pagina}» è rimandata in questo giro`); continue; }
      if ( !r.soloGM ) { P.push(`${dove}, pagina: ${r.cosa ?? op.pagina} non è solo GM (col suffisso, lei o il suo journal); la nota messa da parte va legata a una pagina solo GM`); continue; }
      const uuid = r.uuid;
      const [, jid, pid] = uuid.match(UUID_JOURNAL);
      const vedono = vedranno(jid, pid ?? null);
      if ( vedono === null ) { P.push(`${dove}, pagina: ${uuid} non c'è nel mondo e non si crea in questo giro`); continue; }
      if ( vedono.length ) { P.push(`${dove}, pagina: la vedono ${vedono.join(", ")}; la nota messa da parte va legata a una pagina o a un journal che nessuna giocatrice vede`); continue; }
      x.verso = { entryId: jid, pageId: pid ?? null };
      x.upd = { _id: d.id, entryId: jid, pageId: pid ?? null, [`flags.${MODULO}.${DA_PARTE}`]: { carico: D.carico, rif: op.rif, prima: { entryId: d.entryId ?? null, pageId: d.pageId ?? null } } };
      voce.verso = uuid;
    } else {
      const prima = { nome: d.name, cartella: d.folder?.id ?? null, ownership: clona(d.ownership ?? {}) };
      x.upd = { _id: d.id, ...aNone(d.ownership), [`flags.${MODULO}.${DA_PARTE}`]: { carico: D.carico, rif: op.rif, prima } };
      if ( op.cosa === "pagina" ) {
        x.upd.name = `${d.name}${SUFFISSO}`;
        voce.nuovoNome = x.upd.name;
        const n = noteVerso(a, b);
        if ( n.length ) A.push(`${dove}: le note che portano a questa pagina non le vede più nessuna giocatrice: ${n.join(", ")}`);
      } else {
        let cid = null;
        if ( op.cartella?.rif ) { const c = cartellaPiano.get(op.cartella.rif); if ( !c ) { P.push(`${dove}: la cartella «${op.cartella.rif}» non è nel piano`); continue; } cid = c.id; }
        else if ( op.cartella?.id ) { const f = game.folders.get(op.cartella.id); if ( !f || (f.type !== TIPO_CARTELLA[op.cosa]) ) { P.push(`${dove}: la cartella ${op.cartella.id} non c'è o non è di tipo ${TIPO_CARTELLA[op.cosa]}`); continue; } cid = f.id; }
        else { P.push(`${dove}: la cartella non va`); continue; }
        x.upd.folder = cid;
        x.cartella = cid;
        voce.dentro = cid;
        if ( op.cosa === "attore" ) {
          // un token sulla scena resta lì, e le giocatrici lo vedono: si toglie prima (il GM)
          const t = game.scenes.contents.filter(s => s.tokens?.some?.(k => k.actorId === d.id)).map(s => `«${s.name}»`);
          if ( t.length ) { P.push(`${dove}: ha dei token sulle scene ${t.join(", ")}; si tolgono prima (il GM), poi si rilancia`); continue; }
          // il personaggio di una giocatrice non si mette da parte
          const di = game.users.filter(u => u.character?.id === d.id).map(u => u.name);
          if ( di.length ) { P.push(`${dove}: è il personaggio di ${di.join(", ")}; non si mette da parte`); continue; }
        }
        if ( op.cosa === "journal" ) {
          // una pagina con la sua visibilità resta visibile anche col journal a None: si mette da parte anche lei
          // salvo quelle che questo file mette da parte
          const viste = d.pages.contents.filter(p => !uuidDP.has(`JournalEntry.${d.id}.JournalEntryPage.${p.id}`) && giocatrici.some(u => { const l = p.ownership?.[u.id] ?? p.ownership?.default; return (l !== undefined) && (l >= L.LIMITED); }));
          if ( viste.length ) { P.push(`${dove}: le pagine ${viste.map(p => `«${p.name}» (${p.uuid ?? p.id})`).join(", ")} hanno una visibilità loro, e le giocatrici le vedrebbero ancora: si mettono da parte anche loro, nello stesso file`); continue; }
          const n = noteVerso(a, null);
          if ( n.length ) A.push(`${dove}: le note che portano a questo journal o alle sue pagine non le vede più nessuna giocatrice: ${n.join(", ")}`);
        }
        if ( op.cosa === "macro" ) {
          const barre = game.users.filter(u => Object.values(u.hotbar ?? {}).includes(d.id)).map(u => u.name);
          if ( barre.length ) A.push(`${dove}: sta nella barra delle macro di ${barre.join(", ")}`);
        }
      }
    }
    x.azione = "mettiDaParte";
    report.piano.push(voce);
  }
}

/** La parte del piano che entra nella firma. */
export const perLaFirmaDP = piano => ({ daParte: (piano.daParte ?? []).filter(x => x.azione).map(x => ({ uuid: x.op.uuid, upd: x.upd, stato: x.stato })) });

/** Scrive, dopo tutto il resto; alla prima scrittura non riuscita si ferma. @returns true se tutto è andato */
export async function eseguiDP(piano, report) {
  const giocatrici = game.users.filter(u => !u.isGM);
  const X = (piano.daParte ?? []).filter(x => x.azione);
  for ( const x of X ) {
    const d = documento(x.op.uuid);
    if ( stato(d, x.op.cosa) !== x.stato ) { report.errori.push(`daParte «${x.op.rif}»: ${x.op.uuid} è cambiato durante il carico; non lo tocco, si rilancia la prova`); return false; }
    if ( x.verso ) {
      const J = game.journal.get(x.verso.entryId);
      const t = x.verso.pageId ? J?.pages.get(x.verso.pageId) : J;
      if ( !t || giocatrici.some(u => t.testUserPermission(u, "LIMITED")) ) { report.errori.push(`daParte «${x.op.rif}»: la pagina a cui legarla non c'è o qualcuna la vede; non la tocco, si rilancia la prova`); return false; }
    }
  }
  for ( const x of X ) {
    const d = documento(x.op.uuid);
    const voce = `daParte «${x.op.rif}»: ${x.op.cosa} «${x.op.nome}» (${x.op.uuid})`;
    let r;
    if ( x.op.cosa === "nota" ) r = await scrivi(report, voce, () => d.parent.updateEmbeddedDocuments("Note", [clona(x.upd)]), [d.id]);
    else if ( x.op.cosa === "pagina" ) r = await scrivi(report, voce, () => d.parent.updateEmbeddedDocuments("JournalEntryPage", [clona(x.upd)]), [d.id]);
    else r = await scrivi(report, voce, () => d.update(clona(x.upd)), [d.id]);
    if ( !r ) return false;
  }
  return true;
}

/** Rilegge dal mondo: ogni documento da parte (o già cancellato), col segno, che nessuna giocatrice vede. */
export async function verificaDP(piano, report) {
  const ok = (voce, cond) => report.verifica.push(`${cond ? "OK" : "KO"} · ${voce}`);
  const giocatrici = game.users.filter(u => !u.isGM);
  const nessuna = t => !!t && giocatrici.every(u => !t.testUserPermission(u, "LIMITED"));
  for ( const x of piano.daParte ?? [] ) {
    const v = `daParte «${x.op.rif}»: ${x.op.cosa} (${x.op.uuid})`;
    const d = documento(x.op.uuid);
    if ( !d ) { ok(`${v}: non c'è più`, !x.azione); continue; }
    if ( !x.azione && !x.giaDaParte ) continue;
    const s = segnoDP(d);
    let giusto = !!s;
    if ( x.op.cosa === "nota" ) {
      const J = d.entryId ? game.journal.get(d.entryId) : null;
      const t = (d.pageId ? J?.pages.get(d.pageId) : null) ?? J;
      giusto &&= nessuna(t) && (!x.verso || ((d.entryId === x.verso.entryId) && ((d.pageId ?? null) === x.verso.pageId)));
    } else {
      giusto &&= nessuna(d);
      if ( (x.op.cosa === "pagina") && x.azione ) giusto &&= (d.name === x.upd.name);
      else if ( x.cartella ) giusto &&= ((d.folder?.id ?? null) === x.cartella);
      if ( x.op.cosa === "journal" ) giusto &&= d.pages.contents.every(p => nessuna(p));
    }
    ok(`${v}: ${x.azione ? "messo da parte" : "già da parte"}, col segno, non lo vede nessuna giocatrice${x.cartella ? ", nella sua cartella" : ""}`, giusto);
  }
}
