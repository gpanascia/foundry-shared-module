/**
 * Il caricatore, cartelle e journal: dai dati controllati al piano (cosa creare, cosa aggiornare, dove), la scrittura e la verifica.
 * Regole: docs/caricatore.md («Le regole fisse», «Ritrovare i documenti e aggiornarli», «Dove vanno le pagine nuove»).
 *
 * Il piano si fa tutto prima di scrivere, con gli id dei documenti nuovi già fissati (id fissi, comune.mjs): così i collegamenti
 * verso le pagine nuove si scrivono subito, e la prova e «applica» fanno lo stesso piano, con la stessa firma.
 * calcolaSort e controllaGenitori sono pure e si provano anche fuori dal mondo.
 */
import { MODULO, SEGNO, DENSITA, idFisso, chiaveDi, jsonStabile, controllaFile, scrivi, leggiRegistro, operatori } from "./comune.mjs";
import { impronta, diagnosi, sostituisciCollegamenti, titoliDi, rivelati, parentesi, controllaPerProprietarie, riquadroRivelato, contieneNome, testoVisibile } from "./html.mjs";
import { BERSAGLIO_ID, BERSAGLIO_PAGINA, BERSAGLIO_CARICO } from "./dati.mjs";
import { pianificaTabelleAttori, esitoNomi } from "./tabelle-attori.mjs";
import { pianificaScene, fotografaScene } from "./scene.mjs";
import { pianificaDaParte, fotografaDaParte } from "./da-parte.mjs";
import { testiDi } from "./dati-scene.mjs";
import { nomiDi, stessiNomi, nomeComposto, portaRivelato } from "../rivela-nome.mjs";

/** Il segno del caricatore nei dati di un documento, letto come dato (senza getFlag). */
const segnoDi = d => d?.flags?.[MODULO]?.[SEGNO] ?? null;
const uguali = (a, b) => jsonStabile(a) === jsonStabile(b);
const clona = x => JSON.parse(JSON.stringify(x));
// il nome vero di una pagina e gli attori che segue, in una chiave sola per il confronto in tre
const chiaveNomi = (vero, attori) => vero ? JSON.stringify([vero, attori?.length ? attori : null]) : null;
const NOME_CAMPO = { nome: "nome", livello: "livello", testo: "testo", src: "immagine", didascalia: "didascalia", flagsMondo: "flag del mondo", nomeVero: "nome vero" };

// --- l'ordinamento delle pagine nuove e i genitori nell'indice (pure) --------------------------------------------------------------
/**
 * I sort delle pagine nuove di una sequenza, fra le pagine che ci sono già, senza spostarle.
 * @param {{chiave: string, sort?: number}[]} voci  la sequenza, dall'alto; sort solo per le pagine che ci sono già
 * @param {{chiave: string, sort: number, livello: number, nome: string}[]} pagine  tutte le pagine del journal, adesso
 * @param {boolean} contigua  nessun'altra pagina fra la prima e l'ultima della sequenza
 * @param {boolean} [rigida]  tutte le pagine fisse della sequenza nel suo ordine (la sequenza dei dati); false: conta solo l'ordine
 *                            intorno alle pagine nuove (la sequenza predefinita, dal file)
 * @returns {{ sort: Map<string, number>, problemi: string[] }}
 */
export function calcolaSort(voci, pagine, contigua, rigida = true) {
  const problemi = [], sort = new Map();
  const nomi = new Map(pagine.map(p => [p.chiave, `${p.nome}» (${p.chiave}`]));
  const fissi = voci.filter(v => v.sort !== undefined);
  const pari = fissi.filter((v, i) => i && (v.sort === fissi[i - 1].sort));
  if ( pari.length ) {
    problemi.push(`pagine della sequenza con lo stesso sort (${pari.map(v => `«${nomi.get(v.chiave) ?? v.chiave}» ${v.sort}`).join(", ")}): l'ordine fra loro non è definito; decide il GM`);
    return { sort, problemi };
  }
  if ( rigida && fissi.some((v, i) => i && (v.sort < fissi[i - 1].sort)) ) {
    problemi.push(`le pagine che ci sono già non sono nell'ordine dei dati (${fissi.map(v => `«${nomi.get(v.chiave) ?? v.chiave}» ${v.sort}`).join(", ")}): le ha spostate qualcuno in Foundry, o i dati le vogliono in un altro ordine; il caricatore non sposta le pagine che ci sono: decide il GM, e l'ordine si riporta nella fonte dei dati`);
    return { sort, problemi };
  }
  const tutti = pagine.map(p => p.sort);
  const occupati = new Set(tutti);
  const massimo = arr => arr.length ? Math.max(...arr) : undefined, minimo = arr => arr.length ? Math.min(...arr) : undefined;
  let i = 0;
  while ( i < voci.length ) {
    if ( voci[i].sort !== undefined ) { i++; continue; }
    let j = i;
    while ( (j < voci.length) && (voci[j].sort === undefined) ) j++;
    const k = j - i;
    // in testa o in coda alla sequenza il limite è la pagina vicina del journal, qualunque sia: le nuove vanno subito accanto alla
    // pagina fissa, e quello che c'è dopo (o prima) resta dov'è
    let lo = (i > 0) ? voci[i - 1].sort : undefined;
    let hi = (j < voci.length) ? voci[j].sort : undefined;
    // dopo una pagina fissa, le nuove vanno dopo le sue figlie che non sono della sequenza (le pagine di livello più alto che la
    // seguono): così restano figlie di lei
    if ( lo !== undefined ) {
      const madre = pagine.find(p => p.chiave === voci[i - 1].chiave);
      const nellaSeq = new Set(voci.map(v => v.chiave));
      const seguenti = pagine.filter(p => (p.sort > lo) && ((hi === undefined) || (p.sort < hi))).sort((a, b) => a.sort - b.sort);
      for ( const p of seguenti ) { if ( nellaSeq.has(p.chiave) || !madre || (p.livello <= madre.livello) ) break; lo = p.sort; }
      // le nuove vanno nell'intervallo libero subito dopo: mai sopra una pagina estranea (una pagina del GM trascinata in mezzo)
      const prossimo = minimo(tutti.filter(v => v > lo));
      if ( (prossimo !== undefined) && ((hi === undefined) || (prossimo < hi)) ) hi = prossimo;
    }
    if ( (lo === undefined) && (hi !== undefined) ) lo = massimo(tutti.filter(v => v < hi));
    else if ( (hi === undefined) && (lo !== undefined) ) hi = minimo(tutti.filter(v => v > lo));
    else if ( (lo === undefined) && (hi === undefined) ) lo = massimo(tutti) ?? 0;    // nessuna pagina fissa: in fondo al journal
    const valori = [];
    for ( let t = 0; t < k; t++ ) {
      if ( (lo !== undefined) && (hi !== undefined) ) valori.push(lo + Math.floor(((hi - lo) * (t + 1)) / (k + 1)));
      else if ( hi !== undefined ) valori.push(hi - (DENSITA * (k - t)));
      else valori.push(lo + (DENSITA * (t + 1)));
    }
    const fila = [lo, ...valori, hi].filter(v => v !== undefined);
    if ( fila.some((v, t) => t && (v <= fila[t - 1])) || valori.some(v => !Number.isSafeInteger(v) || occupati.has(v)) ) {
      problemi.push(`fra il sort ${lo ?? "—"} e il sort ${hi ?? "—"} non c'è posto per ${k} pagine nuove (${voci.slice(i, j).map(v => v.chiave).join(", ")}): le pagine fisse attorno non sono in ordine, o sono troppo vicine; decide il GM`);
    } else valori.forEach((v, t) => { sort.set(voci[i + t].chiave, v); occupati.add(v); });
    i = j;
  }
  if ( problemi.length ) return { sort, problemi };
  if ( contigua ) {
    const finale = voci.map(v => v.sort ?? sort.get(v.chiave));
    const dentro = new Set(voci.map(v => v.chiave));
    const da = Math.min(...finale), a = Math.max(...finale);
    const inMezzo = pagine.filter(p => !dentro.has(p.chiave) && (p.sort >= da) && (p.sort <= a));
    if ( inMezzo.length ) problemi.push(`fra la prima e l'ultima pagina della sequenza ci sono altre pagine: ${inMezzo.map(p => `«${p.nome}» (sort ${p.sort})`).join(", ")}; decide il GM`);
  }
  return { sort, problemi };
}

/** La madre di ogni pagina nell'indice del journal: la più vicina prima di lei con un livello più basso. */
export function genitori(pagine) {
  const ord = pagine.slice().sort((a, b) => a.sort - b.sort);
  const madre = new Map();
  ord.forEach((p, i) => {
    let m = null;
    for ( let k = i - 1; k >= 0; k-- ) if ( ord[k].livello < p.livello ) { m = ord[k].chiave; break; }
    madre.set(p.chiave, m);
  });
  return madre;
}

/**
 * Il journal prima e dopo il piano: una pagina che non è del file deve restare figlia della stessa pagina (o di nessuna); due
 * pagine non possono avere lo stesso sort.
 * @param {{chiave, sort, livello, nome}[]} prima  le pagine adesso
 * @param {{chiave, sort, livello, nome}[]} dopo   le pagine dopo il piano (sort nuovi, livelli aggiornati)
 * @param {Set<string>} delFile  le chiavi delle pagine del file
 */
export function controllaGenitori(prima, dopo, delFile) {
  const problemi = [];
  const m0 = genitori(prima), m1 = genitori(dopo);
  const nomi = new Map(dopo.map(p => [p.chiave, p.nome]));
  for ( const p of prima ) {
    if ( delFile.has(p.chiave) || (m0.get(p.chiave) === m1.get(p.chiave)) ) continue;
    const n = c => c ? `«${nomi.get(c)}»` : "nessuna";
    problemi.push(`la pagina «${p.nome}» (${p.chiave}), che non è di questi dati, passerebbe nell'indice da figlia di ${n(m0.get(p.chiave))} a figlia di ${n(m1.get(p.chiave))}; decide il GM`);
  }
  const visti = new Map();
  for ( const p of dopo ) {
    if ( visti.has(p.sort) && (delFile.has(p.chiave) || delFile.has(visti.get(p.sort).chiave)) ) problemi.push(`«${p.nome}» e «${visti.get(p.sort).nome}» avrebbero lo stesso sort ${p.sort}`);
    visti.set(p.sort, p);
  }
  return problemi;
}

// --- il piano ------------------------------------------------------------------------------------------------------------------------
/**
 * Dai dati controllati al piano. I problemi vanno nel rapporto; il piano ha anche le fotografie del mondo, quello che la verifica
 * deve ritrovare e le voci del registro.
 */
export async function pianifica(D, report) {
  const P = report.problemi, A = report.avvisi;
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const HTML = CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML;
  const suff = D.campagna.suffissoSoloGM.toLowerCase();
  const soloGMNome = n => String(n ?? "").toLowerCase().endsWith(suff);
  const giocatrici = game.users.filter(u => !u.isGM);
  const opzHtml = { classi: D.campagna.classi, riquadroDM: D.campagna.riquadroDM, paroleDM: D.campagna.paroleDM };

  // gli id fissi e le chiavi di ogni documento del file, e dei documenti degli altri carichi citati
  const id = new Map(), chiave = new Map();
  for ( const r of D.rif.keys() ) { id.set(r, await idFisso(D.mondo, D.carico, r)); chiave.set(r, await chiaveDi(D.carico, r)); }
  const esterni = new Map();                                          // "carico/rif" → { id, chiave }
  const altroCarico = async (c, r) => { const k = `${c}/${r}`; if ( !esterni.has(k) ) esterni.set(k, { id: await idFisso(D.mondo, c, r), chiave: await chiaveDi(c, r) }); return esterni.get(k); };
  for ( const J of D.journal ) {
    for ( const v of (J.ordine?.sequenza ?? []) ) if ( v.carico ) await altroCarico(v.carico, v.rif);
    for ( const p of J.pagine ) for ( const l of (p.controllo?.collegamenti ?? []) ) { const m = l.bersaglio.match(BERSAGLIO_CARICO); if ( m ) await altroCarico(m[1], m[2]); }
  }
  for ( const S of D.scene ) for ( const e of S.elementi ) { const m = String(e.campi.pagina ?? "").match(BERSAGLIO_CARICO); if ( m ) await altroCarico(m[1], m[2]); }
  // anche la pagina di una nota da mettere da parte
  for ( const x of D.daParte ) { const m = String(x.pagina ?? "").match(BERSAGLIO_CARICO); if ( m ) await altroCarico(m[1], m[2]); }
  // il registro: i documenti che il carico ha già scritto
  const registro = await leggiRegistro(D.carico);
  if ( !registro ) { P.push("il registro del caricatore non si legge: il modulo è attivo e alla versione giusta?"); return { cartelle: [], journal: [], tabelle: [], attori: [], elementi: [], macro: [], attese: [], corrispondenze: [], senzaRegistro: true }; }
  // tutti i documenti del mondo con un segno, per chiave: cartelle, journal, pagine
  const perChiave = new Map();
  const aggiungi = (d, genere) => { const k = segnoDi(d)?.chiave; if ( !k ) return; if ( !perChiave.has(k) ) perChiave.set(k, []); perChiave.get(k).push({ d, genere }); };
  for ( const f of game.folders ) aggiungi(f, "cartella");
  for ( const j of game.journal ) { aggiungi(j, "journal"); for ( const p of j.pages ) aggiungi(p, "pagina"); }
  for ( const t of game.tables ) aggiungi(t, "tabella");
  for ( const a of game.actors ) aggiungi(a, "attore");
  for ( const m of game.macros ) aggiungi(m, "macro");
  for ( const sc of game.scenes ) { for ( const n of sc.notes ) aggiungi(n, "nota"); for ( const t of sc.tiles ) aggiungi(t, "tassello"); for ( const d of sc.drawings ) aggiungi(d, "disegno"); }

  // le fotografie, prima di leggere il resto: «applica» le rifà subito prima di scrivere
  const journalFoto = [...new Set(D.journal.flatMap(J => [J.id, id.get(J.rif)].filter(Boolean)))];
  const tipiFoto = new Set(["JournalEntry", ...D.cartelle.map(c => c.tipo)]);
  // gli attori dei dati: per id, per id fisso, per segno (gli altri attori cambiano durante il gioco, e non contano)
  const chiaviAttori = new Set(D.attori.map(a => chiave.get(a.rif)));
  // e gli attori col doppio nome, che le pagine seguono
  const attoriFoto = [...new Set([...D.attori.flatMap(a => [a.id, id.get(a.rif)].filter(Boolean)), ...game.actors.filter(a => chiaviAttori.has(segnoDi(a)?.chiave)).map(a => a.id),
    ...(D.journal.some(J => J.pagine.some(p => p.nomeVero)) ? game.actors.filter(a => a.flags?.[MODULO]?.nomi).map(a => a.id) : [])])];
  if ( D.tabelle.length ) tipiFoto.add("RollTable");
  if ( D.attori.length ) tipiFoto.add("Actor");
  if ( D.macro.length ) tipiFoto.add("Macro");
  const fotografia = () => `${fotografa(journalFoto, tipiFoto, D.tabelle.length > 0, attoriFoto)}\n${fotografaScene(D)}\n${fotografaDaParte(D)}`;
  const foto = fotografia();
  const fotoJournal = new Map(journalFoto.map(j => [j, fotografaJournal(j)]));

  const piano = { cartelle: [], journal: [], tabelle: [], attori: [], elementi: [], macro: [], foto, fotografia, fotoJournal, attese: [], corrispondenze: [] };
  const segno = r => ({ v: 1, chiave: chiave.get(r) });
  const cartellaPiano = new Map();                                    // rif → { id, tipo, nuova }

  /**
   * Cerca un documento del file: per l'id dei dati, per l'id fisso, per il segno. Se non c'è: se il registro dice che c'era, o se
   * il suo segno sta altrove, è un problema. null se non c'è (i problemi vanno in P).
   */
  const trova = (collezione, x, r, dove, genere) => {
    const fid = id.get(r), k = chiave.get(r);
    const altri = (perChiave.get(k) ?? []).filter(y => y.genere === genere);
    if ( x.id ) {
      const d = collezione.get(x.id);
      if ( !d ) { P.push(`${dove}: l'id ${x.id} dei dati non c'è più nel mondo; l'ha tolto qualcuno, decide il GM (per ricrearlo: nei dati senza «id», con «ricrea»: true)`); return null; }
      if ( segnoDi(d) && (segnoDi(d).chiave !== k) ) { P.push(`${dove}: l'id ${x.id} è di un documento scritto da un altro carico`); return null; }
      const doppi = altri.filter(y => y.d !== d);
      if ( doppi.length ) { P.push(`${dove}: col segno di questo documento c'è anche ${doppi.map(y => y.d.id).join(", ")}: decide il GM`); return null; }
      return d;
    }
    const d = collezione.get(fid);
    if ( d ) {
      if ( segnoDi(d)?.chiave !== k ) { P.push(`${dove}: c'è un documento con l'id fisso ${fid} senza il segno di questo carico`); return null; }
      if ( altri.length > 1 ) { P.push(`${dove}: ${altri.length} documenti col segno di questo carico (${altri.map(y => y.d.id).join(", ")}), forse un journal duplicato: decide il GM`); return null; }
      return d;
    }
    const qui = collezione.filter(y => segnoDi(y)?.chiave === k);
    if ( qui.length ) {
      if ( altri.length > 1 ) { P.push(`${dove}: ${altri.length} documenti col segno di questo carico (${altri.map(y => y.d.id).join(", ")}): decide il GM`); return null; }
      return qui[0];
    }
    if ( altri.length ) { P.push(`${dove}: c'è, ma in un altro posto (${altri.map(y => `${y.d.id}${y.d.parent ? ` in «${y.d.parent.name}»` : ""}`).join(", ")}): l'ha spostato qualcuno, o i dati l'hanno cambiato di posto; il caricatore non lo rifà: decide il GM`); return null; }
    if ( registro[k] && !x.ricrea ) { P.push(`${dove}: l'ha già scritto questo carico (${registro[k].id}), e nel mondo non c'è più: l'ha tolto qualcuno, o una scrittura di prima non è riuscita. Decide il GM; per ricrearlo, nei dati «ricrea»: true`); return null; }
    return null;
  };

  // --- le cartelle -------------------------------------------------------------------------------------------------------------------
  for ( const c of D.cartelle ) {
    const dove = `cartella ${c.tipo} «${c.nome}»`;
    const n0 = P.length;
    // la cartella madre: una del file (già nel piano) o una che c'è, per id
    let padre = null;
    if ( c.padre?.rif ) { const x = cartellaPiano.get(c.padre.rif); padre = x?.id ?? undefined; if ( !x ) P.push(`${dove}: la cartella madre «${c.padre.rif}» non è nel piano`); }
    else if ( c.padre?.id ) { const f = game.folders.get(c.padre.id); if ( !f || (f.type !== c.tipo) ) P.push(`${dove}: la cartella madre ${c.padre.id} non c'è o non è di tipo ${c.tipo}`); else padre = f.id; }
    const trovata = trova(game.folders, c, c.rif, dove, "cartella");
    if ( P.length > n0 ) continue;
    if ( trovata ) {
      if ( trovata.type !== c.tipo ) { P.push(`${dove}: l'id ${trovata.id} è una cartella di tipo ${trovata.type}`); continue; }
      if ( trovata.name !== c.nome ) A.push(`${dove}: nel mondo si chiama «${trovata.name}» (${trovata.id}); non si rinomina`);
      if ( (trovata.folder?.id ?? null) !== (padre ?? null) ) A.push(`${dove}: nel mondo sta in un'altra cartella madre (${trovata.folder?.name ?? "in cima"}); non si sposta`);
      cartellaPiano.set(c.rif, { id: trovata.id, tipo: c.tipo, nuova: false });
      report.saltati.push(`${dove} c'è già (${trovata.id})`);
      piano.corrispondenze.push({ rif: c.rif, chiave: chiave.get(c.rif), tipo: "Folder", id: trovata.id, nome: trovata.name });
      continue;
    }
    const omonime = game.folders.filter(f => (f.type === c.tipo) && (f.name === c.nome) && ((f.folder?.id ?? null) === (padre ?? null)));
    // una sola cartella con lo stesso nome, dello stesso tipo e nella stessa cartella madre, senza il segno di un carico (fatta a mano o
    // da uno script): si usa quella, e il piano lo dice. Non si scrive niente sulla cartella, e non entra nel registro: al giro dopo si
    // ritrova allo stesso modo. Con più omonime, o col segno di un altro carico, resta un problema
    if ( (omonime.length === 1) && !segnoDi(omonime[0]) ) {
      const f = omonime[0];
      cartellaPiano.set(c.rif, { id: f.id, tipo: c.tipo, nuova: false });
      report.piano.push({ azione: "adotta", cosa: "cartella", tipo: c.tipo, nome: c.nome, id: f.id, dentro: padre ?? null });
      report.saltati.push(`${dove} c'è già, non scritta da un carico (${f.id}): si usa quella`);
      // nelle corrispondenze del rapporto sì (l'id, per chi tiene traccia del mondo), nel registro no
      piano.corrispondenze.push({ rif: c.rif, chiave: chiave.get(c.rif), tipo: "Folder", id: f.id, nome: f.name, adottata: true });
      continue;
    }
    if ( omonime.length ) { P.push(`${dove}: c'è già, non di questo carico (${omonime.map(f => f.id).join(", ")}): se è quella, il suo id va nei dati`); continue; }
    const fid = id.get(c.rif);
    const dati = { _id: fid, name: c.nome, type: c.tipo, folder: padre ?? null, flags: { [MODULO]: { [SEGNO]: segno(c.rif) } } };
    piano.cartelle.push({ rif: c.rif, dati });
    cartellaPiano.set(c.rif, { id: fid, tipo: c.tipo, nuova: true });
    report.piano.push({ azione: "crea", cosa: "cartella", tipo: c.tipo, nome: c.nome, id: fid, dentro: padre ?? null });
    piano.corrispondenze.push({ rif: c.rif, chiave: chiave.get(c.rif), tipo: "Folder", id: fid, nome: c.nome, crea: true });
  }

  // --- i journal e le loro pagine: dove sono, o dove andranno ----------------------------------------------------------------------------
  const giornali = [];                                                 // { J (dati), doc (o null), jid, nuovo, pagine: [{ p, doc, pid }] }
  for ( const J of D.journal ) {
    const dove = `journal «${J.nome}»`;
    const n0 = P.length;
    let cartella = null;
    if ( J.cartella?.rif ) cartella = cartellaPiano.get(J.cartella.rif)?.id ?? null;
    else if ( J.cartella?.id ) { const f = game.folders.get(J.cartella.id); if ( !f || (f.type !== "JournalEntry") ) P.push(`${dove}: la cartella ${J.cartella.id} non c'è o non è di journal`); else cartella = f.id; }
    if ( J.cartella?.rif && !cartellaPiano.has(J.cartella.rif) ) P.push(`${dove}: la cartella «${J.cartella.rif}» non è nel piano`);
    const doc = trova(game.journal, J, J.rif, dove, "journal");
    if ( P.length > n0 ) continue;
    const g = { J, doc, jid: doc?.id ?? id.get(J.rif), nuovo: !doc, cartella, pagine: [] };
    if ( doc ) {
      if ( soloGMNome(doc.name) !== J.soloGM ) { P.push(`${dove}: nel mondo si chiama «${doc.name}»: ${J.soloGM ? "i dati lo vogliono solo GM, nel mondo non lo è" : "nel mondo è solo GM, i dati no"}; decide il GM`); continue; }
      if ( doc.name !== J.nome ) A.push(`${dove}: nel mondo si chiama «${doc.name}» (${doc.id}); non si rinomina`);
      if ( (doc.folder?.id ?? null) !== (cartella ?? null) ) A.push(`${dove}: nel mondo sta in «${doc.folder?.name ?? "nessuna cartella"}»; non si sposta`);
    } else {
      if ( !J.crea ) { P.push(`${dove}: non c'è, e i dati dicono che deve esserci già (crea: false)`); continue; }
      const omonimi = game.journal.filter(j => j.name === J.nome);
      if ( omonimi.length ) { P.push(`${dove}: c'è già un journal con questo nome, non di questo carico (${omonimi.map(j => j.id).join(", ")}): se è quello, il suo id va nei dati`); continue; }
    }
    // le pagine
    for ( const p of J.pagine ) {
      const dp = `${dove}, pagina «${p.nome}»`;
      const m0 = P.length;
      if ( !doc && p.id ) { P.push(`${dp}: ha un id (${p.id}), ma il journal non c'è ancora`); continue; }
      const pd = doc ? trova(doc.pages, p, p.rif, dp, "pagina") : null;
      // un journal nuovo: le sue pagine non ci sono, ma possono stare altrove, o essere state tolte
      if ( !doc ) {
        const altrove = (perChiave.get(chiave.get(p.rif)) ?? []).filter(y => y.genere === "pagina");
        if ( altrove.length ) P.push(`${dp}: c'è già, in un altro journal (${altrove.map(y => `«${y.d.parent?.name}»`).join(", ")}): decide il GM`);
        else if ( registro[chiave.get(p.rif)] && !p.ricrea && !J.ricrea ) P.push(`${dp}: l'ha già scritta questo carico, e nel mondo non c'è più: decide il GM; per ricrearla, nei dati «ricrea»: true`);
      }
      if ( P.length > m0 ) continue;
      if ( pd ) {
        const soloGMMondo = soloGMNome(pd.name) || soloGMNome(doc.name);
        if ( soloGMMondo !== p.soloGM ) { P.push(`${dp}: nel mondo si chiama «${pd.name}»: ${p.soloGM ? "i dati la vogliono solo GM, nel mondo non lo è" : "nel mondo è solo GM, i dati no"}; decide il GM`); continue; }
        if ( p.visibilita.tipo !== "nessuna" ) A.push(`${dp}: la visibilità dei dati vale solo alla creazione; la pagina c'è, e la sua visibilità la decide il GM`);
        if ( p.precedente && segnoDi(pd) ) A.push(`${dp}: «precedente» non serve, la pagina ha già il segno del caricatore`);
      } else if ( doc ) {
        const omonime = doc.pages.filter(x => x.name === p.nome);
        if ( omonime.length ) { P.push(`${dp}: c'è già, non di questo carico (${omonime.map(x => x.id).join(", ")}): se è quella, il suo id va nei dati, con «precedente» se l'ha scritta uno script di prima`); continue; }
      }
      g.pagine.push({ p, doc: pd, pid: pd?.id ?? id.get(p.rif) });
    }
    giornali.push(g);
  }
  if ( P.length ) return piano;

  // --- i nomi veri: mai in quello che le giocatrici leggono di una pagina (il nome, il testo fuori dai blocchi segreti chiusi) -----------
  // i nomi veri degli attori dei dati e quelli del mondo non ancora rivelati; nei messaggi il nome dell'attore o il suo id, mai il nome vero
  const veri = [...D.attori.filter(a => a.nomeVero).map(a => ({ chi: `dell'attore «${a.nome}» dei dati`, vero: a.nomeVero })),
    ...game.actors.filter(a => a.flags?.[MODULO]?.nomi?.vero && (a.flags[MODULO].nomi.rivelato !== true)).map(a => ({ chi: `dell'attore ${a.id}`, vero: String(a.flags[MODULO].nomi.vero) })),
    // e quelli delle pagine: dei dati, e del mondo non ancora rivelati; delle pagine che si mostrano (quelli delle pagine solo GM
    // hanno il suffisso, e sono gli stessi dell'attore o della voce)
    ...D.journal.flatMap(J => J.pagine.filter(p => p.nomeVero && !p.soloGM).map(p => ({ chi: `della pagina «${p.nome}» dei dati`, vero: p.nomeVero }))),
    // e quelli degli attori che una pagina segue, anche se l'attore non è nei dati né nel mondo
    ...D.journal.flatMap(J => J.pagine.flatMap(p => (p.attori ?? []).map(a => ({ chi: `di un attore della pagina «${p.nome}» dei dati`, vero: a.vero })))),
    ...game.journal.contents.flatMap(j => j.pages.contents.filter(p => { const n = nomiDi(p); return n && !n.rivelato && !soloGMNome(n.aspetto) && !soloGMNome(j.name); })
      .map(p => ({ chi: `della pagina ${j.id}.${p.id}`, vero: nomiDi(p).vero })))];
  if ( veri.length ) for ( const g of giornali ) for ( const { p } of g.pagine ) {
    if ( p.soloGM ) continue;
    const testo = (p.tipo === "text") ? testoVisibile(p.html ?? "") : (p.didascalia ?? "");
    const flags = testiDi(p.flagsMondo ?? null);
    for ( const v of veri ) if ( contieneNome(p.nome, v.vero) || contieneNome(testo, v.vero) || (p.src && contieneNome(p.src, v.vero)) || flags.some(z => contieneNome(z, v.vero)) )
      P.push(`journal «${g.J.nome}», pagina «${p.nome}»: c'è il nome vero ${v.chi}, e la pagina la leggono le giocatrici (fuori dai blocchi segreti, o nei flag del mondo)`);
  }
  if ( P.length ) return piano;

  // --- il doppio nome delle pagine: «Rivela il nome» le trova dall'attore coi loro stessi due nomi -----------------------------------
  // un attore dei dati che c'è già conta coi nomi del mondo: il caricatore non lo rinomina
  // come lo ritrova il caricatore: per id, per id fisso, per segno
  const delMondo = a => game.actors.get(a.id ?? id.get(a.rif)) ?? (a.id ? null : game.actors.find(w => segnoDi(w)?.chiave === chiave.get(a.rif))) ?? null;
  // il caricatore rinomina anche gli attori che ci sono: per quelli dei dati contano i nomi dei dati, con lo stato
  // rivelato o no del mondo; poi gli attori del mondo coi loro nomi. «palese»: rivelato, col nome da rivelato addosso
  const palese = (a, n) => !!(a && n?.rivelato && portaRivelato(a, n));
  // un attore dei dati che c'è: i nomi che avrà dopo il carico (quelli dei dati se si rinomina, se no quelli del mondo), con lo stato del
  // mondo
  const dopoCarico = a => { const w = delMondo(a); if ( !w ) return a.nomeVero ? { aspetto: a.nome, vero: a.nomeVero, palese: false, attore: null } : null;
    const en = esitoNomi(w, a); return en.dopo ? { ...en.dopo, rivelato: en.rivelato, palese: en.rivelato, attore: w } : null; };
  // gli attori del mondo che sono nei dati contano solo coi nomi dopo il carico
  const neiDati = new Set(D.attori.map(delMondo).filter(Boolean).map(w => w.id));
  const coppie = [...D.attori.map(dopoCarico).filter(Boolean),
    ...game.actors.contents.filter(a => !neiDati.has(a.id)).map(a => { const n = nomiDi(a); return n ? { ...n, palese: palese(a, n), attore: a } : null; }).filter(Boolean)];
  for ( const g of giornali ) for ( const x of g.pagine ) {
    const { p } = x;
    if ( !p.nomeVero ) continue;
    // una pagina di più attori: ognuno deve esserci; nasce col nome vero se sono già tutti rivelati
    if ( p.attori ) {
      const trovati = p.attori.map(x => coppie.find(c => (c.aspetto === x.aspetto) && (c.vero === x.vero)));
      if ( trovati.some(c => !c) ) A.push(`journal «${g.J.nome}», pagina «${p.nome}»: ${trovati.filter(c => !c).length} dei suoi attori non ${trovati.filter(c => !c).length === 1 ? "c'è" : "ci sono"} nei dati o nel mondo con quei due nomi (${p.attori.filter((x, k) => !trovati[k]).map(x => `«${x.aspetto}»`).join(", ")}): «Rivela il nome» non la cambia finché non ci sono tutti`);
      // rivelata solo se lo sono tutti, anche per una pagina che c'è, con attori nuovi
      x.palese = trovati.every(c => c?.palese);
      continue;
    }
    const m = coppie.find(c => stessiNomi(c, { aspetto: p.nome, vero: p.nomeVero }));
    if ( !m ) A.push(`journal «${g.J.nome}», pagina «${p.nome}»: ha il nome vero, ma nessun attore dei dati o del mondo ha gli stessi due nomi (si correggono i dati, della pagina o dell'attore): «Rivela il nome» dalla scheda di un attore non la cambia`);
    // il nome che la pagina porta va con quello del suo attore: una pagina nuova di un personaggio già rivelato nasce col nome vero,
    // una che c'è lo prende o lo lascia con lui
    else x.palese = !!m.palese;
  }
  // una pagina che porterà il nome vero: dentro non ci sia il nome vero di un attore non ancora rivelato, fuori dai suoi (per
  // esempio la pagina di due attori che nomina un terzo, non rivelato)
  const nascosti = [...D.attori.map(dopoCarico).filter(c => c && !c.palese).map(c => c.vero),
    ...game.actors.contents.map(a => nomiDi(a)).filter(n => n && !(n.rivelato)).map(n => n.vero)];
  for ( const g of giornali ) for ( const x of g.pagine ) {
    const { p } = x;
    if ( !p.nomeVero || !x.palese || p.soloGM ) continue;
    const suoi = new Set([...(p.attori ?? []).map(a => a.vero), ...coppie.filter(c => stessiNomi(c, { aspetto: p.nome, vero: p.nomeVero })).map(c => c.vero)]);
    if ( nascosti.some(v => !suoi.has(v) && contieneNome(p.nomeVero, v)) ) P.push(`journal «${g.J.nome}», pagina «${p.nome}»: il suo nome vero, che le giocatrici leggerebbero subito, contiene il nome vero di un attore non ancora rivelato, fuori da quelli della pagina`);
  }

  // --- le immagini: ci sono, con l'impronta dei dati ----------------------------------------------------------------------------------
  const usate = new Set(giornali.flatMap(g => g.pagine.flatMap(({ p }) => [p.src, ...(p.controllo?.immagini ?? [])].filter(Boolean))));
  for ( const f of usate ) { const no = await controllaFile(f, D.file.get(f)); if ( no ) P.push(`immagine ${f}: ${no}`); }

  // --- i collegamenti: @GDR → @UUID ---------------------------------------------------------------------------------------------------
  const JEP = CONFIG.JournalEntryPage.documentClass;
  const slug = JEP.slugifyHeading ?? foundry.documents?.JournalEntryPage?.slugifyHeading;
  const dalRif = new Map(giornali.flatMap(g => [[g.J.rif, { genere: "journal", g }], ...g.pagine.map(x => [x.p.rif, { genere: "pagina", g, x }])]));
  // un documento messo da parte conta come solo GM: una pagina che si mostra non ci porta
  const daParteMondo = d => !!d?.flags?.[MODULO]?.daParte || !!d?.parent?.flags?.[MODULO]?.daParte;
  const soloGMMondo = d => daParteMondo(d) || ((d?.documentName === "JournalEntryPage") ? (soloGMNome(d.name) || soloGMNome(d.parent?.name)) : ((d?.documentName === "JournalEntry") && soloGMNome(d.name)));
  // il bersaglio di un collegamento: { uuid, soloGM, titoli (per una pagina), cosa }, o un problema
  const bersaglio = b => {
    if ( dalRif.has(b) ) {
      const r = dalRif.get(b);
      if ( r.genere === "journal" ) return { uuid: `JournalEntry.${r.g.jid}`, soloGM: r.g.J.soloGM, cosa: `journal «${r.g.J.nome}»` };
      // i titoli: quelli dei dati; quelli del mondo, se la pagina c'è e i dati dicono di non aggiornarla
      const titoli = (r.x.p.tipo !== "text") ? [] : ((r.x.doc && !r.x.p.aggiorna) ? titoliDi(r.x.doc.text?.content ?? "") : titoliDi(r.x.p.html));
      return { uuid: `JournalEntry.${r.g.jid}.JournalEntryPage.${r.x.pid}`, soloGM: r.x.p.soloGM, titoli, cosa: `pagina «${r.x.p.nome}»`, pagina: r.x };
    }
    let m = b.match(BERSAGLIO_CARICO);
    if ( m ) {
      const e = esterni.get(`${m[1]}/${m[2]}`);
      const c = (perChiave.get(e.chiave) ?? []).filter(y => ["journal", "pagina"].includes(y.genere));
      if ( c.length > 1 ) return { problema: `«${b}»: ${c.length} documenti con quel segno (${c.map(y => y.d.id).join(", ")}), forse un journal duplicato` };
      if ( !c.length ) return { problema: `«${b}» non c'è nel mondo (un documento di un altro carico, non ancora caricato o tolto)` };
      const d = c[0].d;
      return { uuid: d.uuid, soloGM: soloGMMondo(d), titoli: (c[0].genere === "pagina") ? titoliDi(d.text?.content ?? "") : [], cosa: `${c[0].genere} «${d.name}»` };
    }
    m = b.match(BERSAGLIO_PAGINA);
    if ( m ) {
      const x = game.journal.get(m[1])?.pages.get(m[2]);
      return x ? { uuid: x.uuid, soloGM: soloGMMondo(x), titoli: titoliDi(x.text?.content ?? ""), cosa: `pagina «${x.name}»` } : { problema: `la pagina ${b} non c'è nel mondo` };
    }
    m = b.match(BERSAGLIO_ID);
    if ( m ) {
      const coll = { JournalEntry: game.journal, Actor: game.actors, Item: game.items, RollTable: game.tables, Macro: game.macros }[m[1]];
      const d = coll?.get(m[2]);
      return d ? { uuid: d.uuid, soloGM: soloGMMondo(d), cosa: `${m[1]} «${d.name}»` } : { problema: `${b} non c'è nel mondo` };
    }
    return { problema: `bersaglio «${b}» non riconosciuto` };
  };
  for ( const g of giornali ) for ( const x of g.pagine ) {
    if ( x.p.tipo !== "text" ) continue;
    const dl = `journal «${g.J.nome}», pagina «${x.p.nome}»`;
    x.collegamenti = [];
    x.versoPagine = [];                                                // le pagine del file a cui porta: se una si rimanda, va controllato
    const { html, mancati } = sostituisciCollegamenti(x.p.html, l => {
      const t = bersaglio(l.bersaglio);
      if ( t.problema ) { P.push(`${dl}, collegamento «${l.etichetta}»: ${t.problema}`); return null; }
      if ( !x.p.soloGM && t.soloGM ) { P.push(`${dl}, collegamento «${l.etichetta}»: una pagina che si mostra porta a un documento solo GM (${t.cosa})`); return null; }
      let ancora = "";
      if ( l.ancora ) {
        if ( typeof slug !== "function" ) { P.push(`${dl}: JournalEntryPage.slugifyHeading non c'è in questa versione di Foundry`); return null; }
        // Foundry distingue le sezioni per ancora: due titoli diversi con la stessa ancora («Città», «Citta») non vanno
        const a0 = slug.call(JEP, l.ancora);
        const n = (t.titoli ?? []).filter(s => s === l.ancora).length, na = (t.titoli ?? []).filter(s => slug.call(JEP, s) === a0).length;
        if ( (n !== 1) || (na !== 1) ) { P.push(`${dl}, collegamento «${l.etichetta}»: il titolo «${l.ancora}» c'è ${n} volte in ${t.cosa}, e la sua ancora ${na}; ne serve uno`); return null; }
        ancora = `#${a0}`;
      }
      x.collegamenti.push(`${t.uuid}${ancora}`);
      if ( t.pagina ) x.versoPagine.push(t.pagina);
      if ( t.pagina && ancora ) (x.versoSezioni ??= []).push({ y: t.pagina, titolo: l.ancora, ancora: ancora.slice(1), etichetta: l.etichetta });
      return `@UUID[${t.uuid}${ancora}]{${l.etichetta}}`;
    });
    if ( mancati && !P.length ) P.push(`${dl}: ${mancati} collegamenti non risolti`);
    x.html = html;
    x.impronta = await impronta(html);
  }
  if ( P.length ) return piano;

  // --- le pagine che ci sono: com'è nel mondo, com'è nei dati, come l'aveva lasciata l'ultima scrittura ---------------------------------
  for ( const g of giornali ) for ( const x of g.pagine ) {
    const { p, doc } = x;
    const dp = `journal «${g.J.nome}», pagina «${p.nome}»`;
    if ( !doc ) {
      x.segno = { v: 1, chiave: chiave.get(p.rif), nome: p.nome, livello: p.livello, impronta: x.impronta ?? null, src: p.src, didascalia: p.didascalia };
      if ( p.nomeVero ) x.segno.nomeVero = p.nomeVero;
      if ( p.nomeVero && p.attori ) x.segno.nomiAttori = clona(p.attori);
      x.nomeFinale = x.palese ? nomeComposto(p.nome, p.nomeVero) : p.nome;
      x.nomi = p.nomeVero ? { aspetto: p.nome, vero: p.nomeVero, rivelato: !!x.palese, ...(p.attori ? { attori: clona(p.attori) } : {}) } : null;
      continue;
    }
    if ( doc.type !== p.tipo ) { P.push(`${dp}: nel mondo è di tipo ${doc.type}, nei dati ${p.tipo}`); continue; }
    const s = segnoDi(doc);
    const pr = s ? null : p.precedente;
    // il doppio nome: una pagina rivelata porta il nome vero, ma per il confronto vale il nome che descrive, quello dei dati
    const nm = nomiDi(doc), rivelata = !!nm?.rivelato && portaRivelato(doc, nm);
    const mondo = { nome: rivelata ? nm.aspetto : doc.name, livello: doc.title?.level ?? 1 };
    const dati = { nome: p.nome, livello: p.livello };
    const prima = s ? { nome: s.nome, livello: s.livello } : { nome: pr?.nome, livello: pr?.livello };
    if ( p.tipo === "text" ) {
      mondo.testo = await impronta(doc.text?.content ?? "");
      dati.testo = x.impronta;
      prima.testo = s ? s.impronta : ((pr?.html !== undefined) ? await impronta(pr.html) : undefined);
      // «accetta»: il testo nel mondo, con questa impronta, si prende come l'ultima scrittura (una pagina salvata nell'editor di
      // Foundry, col ritocco già riportato nella fonte dei dati): da lì si aggiorna coi dati
      if ( p.accetta ) {
        if ( p.accetta === mondo.testo ) prima.testo = mondo.testo;
        else x.accettaNo = true;                                       // si dice solo se il testo resta in conflitto (sotto)
      }
    } else {
      Object.assign(mondo, { src: doc.src ?? null, didascalia: doc.image?.caption ?? "" });
      Object.assign(dati, { src: p.src, didascalia: p.didascalia });
      Object.assign(prima, s ? { src: s.src, didascalia: s.didascalia } : { src: pr?.src, didascalia: pr?.didascalia });
    }
    if ( (p.tipo === "text") && !p.soloGM && D.campagna.riquadroDM && riquadroRivelato(doc.text?.content ?? "", D.campagna.riquadroDM) ) A.push(`${dp}: nel mondo il riquadro «${D.campagna.riquadroDM}» è rivelato: le giocatrici che vedono la pagina lo leggono; lo si dice al GM`);
    const noto = k => (prima[k] !== undefined) && (prima[k] !== null);
    // per ogni campo: uguale; da aggiornare (il mondo è com'era all'ultima scrittura); ritoccato in Foundry e lasciato com'è (i dati
    // sono com'erano all'ultima scrittura: non vogliono cambiarlo); in conflitto (cambiato in Foundry, e i dati vogliono un'altra cosa)
    const cambia = [], ritocchi = [], conflitti = [];
    for ( const k of Object.keys(dati) ) {
      if ( mondo[k] === dati[k] ) continue;
      if ( noto(k) && (mondo[k] === prima[k]) ) cambia.push(k);
      else if ( noto(k) && (dati[k] === prima[k]) ) ritocchi.push(k);
      else conflitti.push(k);
    }
    // il nome vero, a parte: «nessuno» è un valore (null), e una pagina scritta prima della 1.13.0 non l'ha nel segno: lo prende
    {
      const vM = chiaveNomi(nm?.vero, nm?.attori), vD = chiaveNomi(p.nomeVero, p.attori), vP = s ? chiaveNomi(s.nomeVero, Array.isArray(s.nomiAttori) ? s.nomiAttori.map(a => ({ aspetto: a?.aspetto, vero: a?.vero })) : null) : null;
      if ( vM !== vD ) { if ( vM === vP ) cambia.push("nomeVero"); else if ( vD === vP ) ritocchi.push("nomeVero"); else conflitti.push("nomeVero"); }
      if ( rivelata && !vD && !ritocchi.includes("nomeVero") ) { P.push(`${dp} (${doc.id}): nel mondo porta il nome vero, rivelato, e i dati lo tolgono: decide il GM (la pagina si rinomina a mano, o si rimette il nome vero nei dati)`); continue; }
      mondo.nomeVero = vM; dati.nomeVero = vD; prima.nomeVero = vP;
    }
    if ( x.accettaNo && conflitti.includes("testo") ) A.push(`${dp}: «accetta» non è l'impronta del testo nel mondo (${mondo.testo}): ignorato`);
    // il segno che resta: per i campi ritoccati e lasciati, quello dell'ultima scrittura, così un cambiamento dei dati si vede ancora
    const tieni = k => ritocchi.includes(k) ? prima[k] : dati[k];
    x.segno = { v: 1, chiave: chiave.get(p.rif), nome: tieni("nome"), livello: tieni("livello"), impronta: (p.tipo === "text") ? tieni("testo") : null,
      src: (p.tipo === "image") ? tieni("src") : null, didascalia: (p.tipo === "image") ? tieni("didascalia") : null };
    // un aggiornamento fonde il segno con quello che c'è: se il segno di prima aveva il nome vero, la chiave resta, anche a null
    // il nome vero e gli attori nel segno, dalla chiave che resta (dei dati, o dell'ultima scrittura se ritoccati in Foundry)
    { const [sv, sa] = tieni("nomeVero") ? JSON.parse(tieni("nomeVero")) : [null, null];
      if ( sv || (s && Object.hasOwn(s, "nomeVero")) ) x.segno.nomeVero = sv;
      if ( sa || (s && Object.hasOwn(s, "nomiAttori")) ) x.segno.nomiAttori = sa ?? null; }
    if ( p.tipo === "text" ) { x.segno.src = p.src; x.segno.didascalia = p.didascalia; }
    if ( !p.aggiorna ) {
      const mancano = Object.keys(p.flagsMondo ?? {}).filter(k => !Object.hasOwn(doc.flags?.world ?? {}, k));
      if ( mancano.length ) cambia.push("flagsMondo");
      if ( cambia.length || conflitti.length || ritocchi.length ) A.push(`${dp}: nel mondo è diversa dai dati (${[...cambia, ...ritocchi, ...conflitti].map(k => NOME_CAMPO[k]).join(", ")}), e i dati dicono di non aggiornarla`);
      else report.saltati.push(`${dp}: com'è nei dati`);
      continue;
    }
    if ( conflitti.length ) {
      const motivi = conflitti.map(k => (k === "testo")
        ? `testo: ${(pr?.html !== undefined) ? `rispetto allo script di prima, ${diagnosi(doc.text?.content ?? "", pr.html).join(", ")}` : `rispetto ai dati, ${diagnosi(doc.text?.content ?? "", x.html).join(", ")}`}`
        : (k === "nomeVero") ? "nome vero: nel mondo diverso dai dati"
        : `${NOME_CAMPO[k]}: nel mondo «${mondo[k]}», nei dati «${dati[k]}»`);
      P.push(`${dp} (${doc.id}): cambiata in Foundry dopo l'ultima scrittura, e i dati la vogliono diversa${(s || pr) ? "" : " (l'ultima scrittura non si conosce: per una pagina di uno script di prima serve «precedente»)"}: ${motivi.join("; ")}. Il caricatore non la tocca: decide il GM; un ritocco di testo, nome o ordine si riporta nella fonte dei dati${conflitti.includes("testo") ? `. Se il ritocco è già nella fonte dei dati, per prendere il testo del mondo come ultima scrittura: «accetta»: "${mondo.testo}"` : ""}`);
      continue;
    }
    if ( ritocchi.length ) A.push(`${dp}: ritoccata in Foundry (${ritocchi.map(k => NOME_CAMPO[k]).join(", ")}), e i dati non la cambiano lì: resta com'è. Un ritocco di testo o di nome si riporta nella fonte dei dati; blocchi rivelati e parentesi riempite si annotano a parte`);
    // il testo da aggiornare: mai sopra blocchi rivelati o parentesi già riempite, qualunque cosa dica il segno
    if ( cambia.includes("testo") ) {
      const html0 = doc.text?.content ?? "";
      if ( (rivelati(html0) > rivelati(x.html)) || (parentesi(html0) < parentesi(x.html)) ) {
        P.push(`${dp} (${doc.id}): nel mondo ha blocchi rivelati (${rivelati(html0)}) o parentesi riempite (da riempire ${parentesi(html0)}), e i dati la riscriverebbero (${rivelati(x.html)} rivelati, ${parentesi(x.html)} da riempire): decide il GM`);
        continue;
      }
    }
    // i flag del mondo dei dati: si aggiungono quelli che mancano; uno che c'è, diverso, resta com'è (lo usa uno strumento del mondo)
    x.flagsNuovi = {};
    for ( const [k, v] of Object.entries(p.flagsMondo ?? {}) ) {
      const mondoF = doc.flags?.world ?? {};
      const w = Object.hasOwn(mondoF, k) ? mondoF[k] : undefined;
      if ( w === undefined ) x.flagsNuovi[k] = v;
      else if ( !uguali(w, v) ) A.push(`${dp}: il flag del mondo «${k}» c'è già, diverso dai dati: resta com'è`);
    }
    if ( Object.keys(x.flagsNuovi).length ) cambia.push("flagsMondo");
    const upd = { _id: doc.id };
    for ( const [k, v] of Object.entries(x.flagsNuovi) ) upd[`flags.world.${k}`] = clona(v);
    // il nome e i due nomi: quello che descrive e quello vero, ognuno dai dati o, se ritoccato in Foundry, dal mondo; il nome della
    // pagina è il vero se nel mondo è rivelata, se no quello che descrive
    const aspetto = ritocchi.includes("nome") ? mondo.nome : p.nome;
    const vero = ritocchi.includes("nomeVero") ? (nm?.vero ?? null) : (p.nomeVero ?? null), attori = ritocchi.includes("nomeVero") ? (nm?.attori ?? null) : (p.attori ?? null);
    // rivelata o no: dagli attori della pagina, se i dati li danno e il nome vero è quello dei dati; se no com'è nel mondo
    const palese = (vero && !ritocchi.includes("nomeVero") && (x.palese !== undefined)) ? x.palese : rivelata;
    // da rivelata: il nome composto; una pagina rivelata prima della 1.15.0, col solo nome vero, lo prende (il nome si aggiorna)
    x.nomeFinale = ritocchi.includes("nome") ? doc.name : ((palese && vero) ? nomeComposto(aspetto, vero) : aspetto);
    if ( x.nomeFinale !== doc.name ) { upd.name = x.nomeFinale; if ( !cambia.includes("nome") ) cambia.push("nome"); }
    // il flag si scrive solo se cambia un nome; se no resta com'è nel mondo (e la verifica lo ritrova così)
    const nomi = vero ? { aspetto, vero, rivelato: !!(palese && vero && (x.nomeFinale === nomeComposto(aspetto, vero))), ...(attori?.length ? { attori: clona(attori) } : {}) } : null;
    if ( !uguali(nm ?? null, nomi) && (cambia.includes("nome") || cambia.includes("nomeVero")) ) {
      // un aggiornamento fonde il flag con quello che c'è: gli attori che non servono più si tolgono a parte
      if ( nomi ) { upd[`flags.${MODULO}.nomi`] = clona(nomi); if ( !nomi.attori && Object.hasOwn(doc.flags?.[MODULO]?.nomi ?? {}, "attori") ) upd[`flags.${MODULO}.nomi.-=attori`] = null; }
      else upd[`flags.${MODULO}.-=nomi`] = null;
      x.nomi = nomi;
    } else x.nomi = nm ?? null;
    if ( cambia.includes("livello") ) upd["title.level"] = p.livello;
    if ( cambia.includes("testo") ) upd["text.content"] = x.html;
    if ( cambia.includes("src") ) upd.src = p.src;
    if ( cambia.includes("didascalia") ) upd["image.caption"] = p.didascalia;
    upd[`flags.${MODULO}.${SEGNO}`] = x.segno;
    if ( cambia.length ) {
      x.azione = "aggiorna"; x.upd = upd; x.cambia = cambia;
      report.piano.push({ azione: "aggiorna", cosa: "pagina", journal: g.J.nome, nome: p.nome, id: doc.id, campi: cambia.map(k => NOME_CAMPO[k]) });
    } else if ( !uguali(s, x.segno) ) {
      x.azione = "segna"; x.upd = { _id: doc.id, [`flags.${MODULO}.${SEGNO}`]: x.segno };
      report.piano.push({ azione: "segna", cosa: "pagina", journal: g.J.nome, nome: p.nome, id: doc.id, perche: s ? "il segno non è quello dei dati" : "pagina di uno script di prima, uguale ai dati" });
    } else report.saltati.push(`${dp}: com'è nei dati`);
  }
  if ( P.length ) return piano;

  // --- le pagine nuove: dove vanno, con quale visibilità; i genitori nell'indice ----------------------------------------------------------
  for ( const g of giornali ) {
    const dove = `journal «${g.J.nome}»`;
    const nuove = g.pagine.filter(x => !x.doc);
    const esistenti = g.doc ? g.doc.pages.contents : [];
    const conCategoria = esistenti.filter(d => d.category);
    if ( conCategoria.length && (nuove.length || g.pagine.some(x => x.cambia?.includes("livello"))) ) { P.push(`${dove}: pagine con una categoria (${conCategoria.map(d => `«${d.name}»`).join(", ")}): il caricatore non le gestisce`); continue; }
    // la sequenza: quella dei dati, o tutte le pagine del file nel loro ordine, senza vincolo di contiguità
    const ordine = g.J.ordine ?? { sequenza: g.J.pagine.filter(p => g.pagine.some(x => x.p === p)).map(p => ({ rif: p.rif })), contigua: false, seMancaAncora: "problema" };
    let rimanda = false;
    const voci = [], seq = [];
    const mappa = new Map(esistenti.map(d => [d.id, d]));
    for ( const v of ordine.sequenza ) {
      if ( v.rif && !v.carico ) {
        const x = g.pagine.find(y => y.p.rif === v.rif);
        if ( !x ) continue;
        voci.push(x.doc ? { chiave: x.doc.id, sort: x.doc.sort } : { chiave: `nuova:${v.rif}` });
        seq.push(`${g.jid}.${x.pid}`);
        continue;
      }
      let d = null, cosa = "";
      if ( v.id ) { d = mappa.get(v.id) ?? null; cosa = `la pagina ${v.id}`; }
      else {
        const e = esterni.get(`${v.carico}/${v.rif}`);
        const c = (perChiave.get(e.chiave) ?? []).filter(y => (y.genere === "pagina") && (y.d.parent?.id === g.doc?.id));
        if ( c.length > 1 ) { P.push(`${dove}: la pagina «${v.rif}» del carico «${v.carico}» c'è ${c.length} volte`); continue; }
        d = c[0]?.d ?? null; cosa = `la pagina «${v.rif}» del carico «${v.carico}»`;
      }
      if ( !d ) {
        if ( ordine.seMancaAncora === "rimanda" ) { rimanda = true; report.note.push(`${dove}: ${cosa} non c'è ancora; le pagine nuove (${nuove.map(x => `«${x.p.nome}»`).join(", ") || "nessuna"}) si rimandano: si rilancia quando c'è`); break; }
        P.push(`${dove}: ${cosa}, nella sequenza, non c'è nel journal`);
        continue;
      }
      voci.push({ chiave: d.id, sort: d.sort });
      seq.push(`${g.jid}.${d.id}`);
    }
    if ( rimanda ) { g.rimandato = true; g.rimandate = nuove.map(x => x.p.rif); for ( const x of nuove ) x.rimandata = true; continue; }
    const adesso = esistenti.map(d => ({ chiave: d.id, sort: d.sort, livello: d.title?.level ?? 1, nome: d.name }));
    const livelli = g.pagine.some(x => x.cambia?.includes("livello"));
    if ( !nuove.length && !livelli && !g.J.ordine ) continue;          // niente da mettere in ordine: un ordine ritoccato non ferma niente
    const r = calcolaSort(voci, adesso, ordine.contigua, !!g.J.ordine);
    P.push(...r.problemi.map(q => `${dove}: ${q}`));
    if ( r.problemi.length ) continue;
    // la verifica controlla l'ordine dei dati solo se i dati lo danno; con la sequenza predefinita, i sort delle pagine nuove
    if ( g.J.ordine ) g.ordine = { sequenza: seq, contigua: ordine.contigua };
    for ( const x of nuove ) {
      const { p } = x;
      const own = { default: L.NONE };
      const vis = p.visibilita;
      if ( vis.tipo === "osservatore" ) own.default = L.OBSERVER;
      else if ( vis.tipo === "proprietarie" ) own.default = L.OWNER;
      else if ( vis.tipo === "osservatoreSolo" ) for ( const n of vis.utenti ) {
        const us = game.users.filter(u => u.name === n);
        if ( (us.length !== 1) || us[0].isGM ) { P.push(`${dove}, pagina «${p.nome}»: «${n}» non è una giocatrice del mondo (una sola, non GM)`); continue; }
        own[us[0].id] = L.OBSERVER;
      }
      const dati = { _id: x.pid, name: x.nomeFinale ?? p.nome, type: p.tipo, sort: r.sort.get(`nuova:${p.rif}`), title: { show: true, level: p.livello }, ownership: own,
        flags: { ...(p.flagsMondo ? { world: clona(p.flagsMondo) } : {}), [MODULO]: { [SEGNO]: x.segno, ...(x.nomi ? { nomi: clona(x.nomi) } : {}) } } };
      if ( p.tipo === "text" ) dati.text = { format: HTML, content: x.html };
      else { dati.src = p.src; dati.image = { caption: p.didascalia }; }
      x.azione = "crea"; x.dati = dati;
      report.piano.push({ azione: "crea", cosa: "pagina", journal: g.J.nome, nome: p.nome, id: x.pid, tipo: p.tipo, livello: p.livello, sort: dati.sort,
        visibilita: (vis.tipo === "osservatoreSolo") ? `Observer per ${vis.utenti.join(", ")}` : { nessuna: "None", osservatore: "Observer", proprietarie: "Proprietario" }[vis.tipo],
        ...(p.decisione ? { decisione: p.decisione } : {}) });
    }
    // l'indice prima e dopo: le pagine degli altri restano figlie di chi erano
    const delFile = new Set(g.pagine.map(x => x.doc ? x.doc.id : `nuova:${x.p.rif}`));
    const livelloDopo = d => g.pagine.find(x => x.doc === d && x.cambia?.includes("livello"))?.p.livello ?? (d.title?.level ?? 1);
    const dopo = [...esistenti.map(d => ({ chiave: d.id, sort: d.sort, livello: livelloDopo(d), nome: d.name })),
      ...nuove.filter(x => x.dati).map(x => ({ chiave: `nuova:${x.p.rif}`, sort: x.dati.sort, livello: x.p.livello, nome: x.p.nome }))];
    P.push(...controllaGenitori(adesso, dopo, delFile).map(q => `${dove}: ${q}`));
  }
  // (qui, dopo le pagine nuove: l'azione di ogni pagina è decisa) un collegamento a una sezione di una pagina il cui testo nel mondo resta com'è (non si aggiorna, o è ritoccato): il titolo deve
  // esserci nel mondo, una volta sola
  for ( const g of giornali ) for ( const x of g.pagine ) {
    for ( const v of (x.versoSezioni ?? []) ) {
      const y = v.y;
      if ( !y.doc || ((y.azione === "aggiorna") && y.cambia.includes("testo")) ) continue;
      const n = titoliDi(y.doc.text?.content ?? "").filter(t => slug.call(JEP, t) === v.ancora).length;
      if ( n === 1 ) continue;
      const msg = `journal «${g.J.nome}», pagina «${x.p.nome}», collegamento «${v.etichetta}»: nel mondo la pagina «${y.doc.name}» resta com'è, e la sezione «${v.titolo}» lì c'è ${n} volte (ritoccata in Foundry?)`;
      // il collegamento si scrive solo se la pagina che lo porta si crea o cambia testo; se no, quello che c'è non si tocca
      if ( (x.azione === "crea") || ((x.azione === "aggiorna") && x.cambia.includes("testo")) ) P.push(`${msg}; decide il GM`);
      else A.push(`${msg}; il collegamento nel mondo porta a una sezione che non c'è più: lo si dice al GM`);
    }
  }
  // un collegamento verso una pagina rimandata non si aprirebbe: chi lo porta aspetta con lei
  for ( const g of giornali ) for ( const x of g.pagine ) {
    const verso = (x.versoPagine ?? []).filter(y => y.rimandata);
    if ( ["crea", "aggiorna"].includes(x.azione) && verso.length ) P.push(`journal «${g.J.nome}», pagina «${x.p.nome}»: porta a pagine rimandate (${verso.map(y => `«${y.p.nome}»`).join(", ")}); si carica quando ci sono, o si divide il carico`);
  }
  if ( P.length ) return piano;

  // --- i documenti costruiti in memoria: i dati passano come sono? ---------------------------------------------------------------------
  for ( const g of giornali ) {
    let base = g.doc;
    if ( !base ) try { base = new CONFIG.JournalEntry.documentClass({ _id: g.jid, name: g.J.nome, ownership: { default: L.NONE } }); } catch(err) { P.push(`journal «${g.J.nome}» costruito in memoria non valido: ${err.message}`); continue; }
    for ( const x of g.pagine ) {
      if ( !["crea", "aggiorna"].includes(x.azione) ) continue;
      const dp = `journal «${g.J.nome}», pagina «${x.p.nome}»`;
      try {
        // per un aggiornamento: i dati della pagina com'è, con sopra l'aggiornamento, costruiti come una pagina nuova
        const dati = (x.azione === "crea") ? clona(x.dati)
          : foundry.utils.mergeObject(x.doc.toObject(), foundry.utils.expandObject(operatori(Object.fromEntries(Object.entries(x.upd).filter(([k]) => k !== "_id")))), { inplace: false, performDeletions: true, applyOperators: true });
        const m = new JEP(dati, { parent: base });
        const o = m.toObject();
        const torna = (o.name === (x.nomeFinale ?? x.doc?.name)) && (o.type === x.p.tipo)
          && ((x.nomi === undefined) || uguali(nomiDi(o), x.nomi))
          && uguali(o.flags?.[MODULO]?.[SEGNO], x.segno)
          && ((x.p.tipo !== "text") || (x.azione === "aggiorna" && !x.cambia.includes("testo")) || ((await impronta(o.text?.content ?? "")) === x.impronta))
          && ((x.p.tipo !== "image") || (x.azione === "aggiorna" && !x.cambia.includes("src")) || (o.src === x.p.src))
          && ((x.azione !== "crea") || uguali(o.ownership, x.dati.ownership))
          && Object.entries((x.azione === "crea") ? (x.p.flagsMondo ?? {}) : (x.flagsNuovi ?? {})).every(([k, v]) => uguali(o.flags?.world?.[k], v));
        if ( !torna ) P.push(`${dp}: costruita in memoria non è come nei dati (nome, testo, immagine, visibilità, segno o flag del mondo)`);
      } catch(err) { P.push(`${dp}: costruita in memoria non valida: ${err.message}`); }
    }
  }

  // --- chi vede cosa, dopo il piano: le pagine solo GM nascoste, le proprietarie, cosa vedrebbe ognuna col journal a Observer ---------
  for ( const g of giornali ) {
    const nome = g.doc?.name ?? g.J.nome;
    const jOwn = g.doc?.ownership ?? { default: L.NONE };
    const jSoloGM = g.J.soloGM || soloGMNome(g.doc?.name);
    const delPiano = new Map(g.pagine.filter(x => x.doc).map(x => [x.doc.id, x]));
    const pagine = [
      ...(g.doc ? g.doc.pages.contents.map(d => {
        const x = delPiano.get(d.id);
        return { nome: x?.nomeFinale ?? d.name, own: d.ownership ?? {}, soloGM: jSoloGM || soloGMNome(d.name) || !!x?.p.soloGM, doc: d,
          html: (x?.azione === "aggiorna" && x.cambia.includes("testo")) ? x.html : ((d.type === "text") ? (d.text?.content ?? "") : null), toccata: ["crea", "aggiorna"].includes(x?.azione), dp: x };
      }) : []),
      ...g.pagine.filter(x => x.azione === "crea").map(x => ({ nome: x.p.nome, own: x.dati.ownership, soloGM: x.p.soloGM, doc: null, html: x.html ?? null, toccata: true, dp: x }))
    ];
    const vedrebbe = {};
    for ( const u of giocatrici ) {
      const livello = pg => { let l = pg.own[u.id] ?? pg.own.default; if ( (l === undefined) || (l < 0) ) l = jOwn[u.id] ?? jOwn.default ?? L.NONE; return l; };
      const conObserver = pg => { let l = pg.own[u.id] ?? pg.own.default; if ( (l === undefined) || (l < 0) ) l = Math.max(jOwn[u.id] ?? L.OBSERVER, L.OBSERVER); return l; };
      vedrebbe[u.name] = pagine.filter(pg => conObserver(pg) >= L.LIMITED).map(pg => pg.nome);
      for ( const pg of pagine ) {
        if ( pg.soloGM ) {
          if ( pg.doc?.testUserPermission(u, "LIMITED") || (livello(pg) >= L.LIMITED) ) P.push(`journal «${nome}», pagina solo GM «${pg.nome}»: ${u.name} la vede già; decide il GM (regola fissa 6)`);
          // un journal solo GM non va mai a Observer: le sue pagine che ereditano restano nascoste
          else if ( !jSoloGM && (conObserver(pg) >= L.LIMITED) ) P.push(`journal «${nome}», pagina solo GM «${pg.nome}»: ${u.name} la vedrebbe col journal a Observer; decide il GM (regola fissa 6)`);
        }
        // una giocatrice proprietaria vede anche i blocchi segreti: il testo che il carico scrive si controlla per lei
        if ( pg.toccata && (pg.html !== null) && (Math.max(livello(pg), conObserver(pg)) >= L.OWNER) ) for ( const q of controllaPerProprietarie(pg.html, opzHtml) ) P.push(`journal «${nome}», pagina «${pg.nome}» (${u.name} ne è proprietaria): ${q}`);
      }
    }
    report.vedrebbero[nome] = vedrebbe;
    // le pagine scritte da un carico che non sono nei dati: non si toccano
    if ( g.doc ) {
      const chiavi = new Set(g.pagine.map(x => chiave.get(x.p.rif)));
      const fuori = g.doc.pages.filter(d => segnoDi(d) && !chiavi.has(segnoDi(d).chiave));
      if ( fuori.length ) report.note.push(`journal «${nome}»: pagine scritte da un carico che non sono in questi dati, non si toccano: ${fuori.map(d => `«${d.name}»`).join(", ")}`);
    }
  }
  if ( P.length ) return piano;

  // --- il piano per la scrittura e quello che la verifica deve ritrovare ----------------------------------------------------------------
  for ( const g of giornali ) {
    const j = { rif: g.J.rif, nome: g.J.nome, id: g.jid, dati: null, crea: [], aggiorna: [], segni: [], tempi: {}, rimandate: g.rimandate ?? [] };
    if ( g.nuovo ) {
      j.dati = { _id: g.jid, name: g.J.nome, folder: g.cartella ?? null, ownership: { default: L.NONE }, flags: { [MODULO]: { [SEGNO]: segno(g.J.rif) } } };
      report.piano.push({ azione: "crea", cosa: "journal", nome: g.J.nome, id: g.jid, dentro: g.cartella ?? null, visibilita: "None" });
    } else report.saltati.push(`journal «${g.J.nome}» c'è già (${g.jid})`);
    piano.corrispondenze.push({ rif: g.J.rif, chiave: chiave.get(g.J.rif), tipo: "JournalEntry", id: g.jid, nome: g.doc?.name ?? g.J.nome, crea: g.nuovo });
    for ( const x of g.pagine ) {
      if ( x.azione === "crea" ) j.crea.push(x.dati);
      else if ( x.azione === "aggiorna" ) j.aggiorna.push(x.upd);
      else if ( x.azione === "segna" ) j.segni.push(x.upd);
      // l'ultima modifica delle pagine da aggiornare: si ricontrolla subito prima di scrivere
      if ( ["aggiorna", "segna"].includes(x.azione) ) j.tempi[x.doc.id] = x.doc._stats?.modifiedTime ?? null;
      if ( x.rimandata ) continue;
      piano.corrispondenze.push({ rif: x.p.rif, chiave: chiave.get(x.p.rif), tipo: "JournalEntryPage", id: `${g.jid}.${x.pid}`, journal: g.jid, nome: x.doc?.name ?? x.p.nome, crea: x.azione === "crea" });
      // una pagina che il carico non tocca (com'è nei dati, o lasciata com'è) la verifica la ritrova com'era al piano
      if ( !x.azione || (x.azione === "segna") ) {
        piano.attese.push({ jid: g.jid, journal: g.J.nome, pid: x.pid, nome: x.doc.name, toccata: false, impronta: (x.p.tipo === "text") ? await impronta(x.doc.text?.content ?? "") : null,
          src: x.doc.src ?? null, segno: (x.azione === "segna") ? x.segno : segnoDi(x.doc) });
        continue;
      }
      piano.attese.push({ jid: g.jid, journal: g.J.nome, pid: x.pid, toccata: true, nome: x.nomeFinale, nomi: x.nomi, tipo: x.p.tipo,
        livello: ((x.azione === "aggiorna") && !x.cambia.includes("livello")) ? (x.doc.title?.level ?? 1) : x.p.livello,
        impronta: ((x.azione === "aggiorna") && !x.cambia.includes("testo")) ? ((x.p.tipo === "text") ? await impronta(x.doc.text?.content ?? "") : null) : (x.impronta ?? null),
        src: ((x.azione === "aggiorna") && !x.cambia.includes("src")) ? (x.doc.src ?? null) : x.p.src,
        didascalia: ((x.azione === "aggiorna") && !x.cambia.includes("didascalia")) ? (x.doc.image?.caption ?? "") : x.p.didascalia,
        segno: x.segno, soloGM: x.p.soloGM, ownership: (x.azione === "crea") ? x.dati.ownership : null, sort: (x.azione === "crea") ? x.dati.sort : null,
        collegamenti: ((x.azione === "crea") || x.cambia.includes("testo")) ? (x.collegamenti ?? []) : null,
        flagsMondo: (x.azione === "crea") ? (x.p.flagsMondo ?? null) : (Object.keys(x.flagsNuovi ?? {}).length ? x.flagsNuovi : null) });
    }
    j.ordine = (!g.rimandato && g.ordine) ? g.ordine : null;
    piano.journal.push(j);
  }
  // --- tappa 2: le Roll Table e gli attori dal compendio ---------------------------------------------------------------------------------
  await pianificaTabelleAttori({ D, report, id, chiave, trova, cartellaPiano, piano });
  // --- tappa 3: note, tasselli e disegni sulle scene, e le macro di una riga ---------------------------------------------------------------
  await pianificaScene({ D, report, id, chiave, trova, cartellaPiano, piano, bersaglio });
  // --- i documenti da mettere da parte, dopo tutto il resto (non si mette da parte quello che il file scrive) ------------------------
  pianificaDaParte({ D, report, piano, bersaglio, cartellaPiano, registro, chiave, soloGMNome });
  piano.tutto = true;
  return piano;
}

/**
 * La fotografia del mondo per il carico: cartelle dei tipi toccati, i journal (nomi e id), le pagine dei journal toccati; con la
 * tappa 2, le Roll Table (tutte, coi nomi) e gli attori dei dati.
 */
function fotografa(journalIds, tipi, tabelle = false, attori = []) {
  const t = d => d?._stats?.modifiedTime ?? "";
  const parti = [];
  for ( const f of game.folders.contents.filter(f => tipi.has(f.type)).sort((a, b) => a.id.localeCompare(b.id)) ) parti.push(`F|${f.id}|${t(f)}|${f.name}|${f.folder?.id ?? ""}`);
  for ( const j of game.journal.contents.slice().sort((a, b) => a.id.localeCompare(b.id)) ) parti.push(`J|${j.id}|${j.name}`);
  for ( const jid of journalIds ) parti.push(fotografaJournal(jid));
  if ( tabelle ) for ( const x of game.tables.contents.slice().sort((a, b) => a.id.localeCompare(b.id)) ) parti.push(`T|${x.id}|${t(x)}|${x.name}|${x.folder?.id ?? ""}`);
  for ( const aid of [...attori].sort() ) { const a = game.actors.get(aid); parti.push(a ? `A|${a.id}|${t(a)}|${a.name}|${a.folder?.id ?? ""}` : `A|${aid}|-`); }
  return parti.join("\n");
}

/** La fotografia di un journal solo: il journal e le sue pagine, coi tempi dell'ultima modifica. */
function fotografaJournal(jid) {
  const t = d => d?._stats?.modifiedTime ?? "";
  const j = game.journal.get(jid);
  if ( !j ) return `JJ|${jid}|-`;
  return [`JJ|${j.id}|${t(j)}|${j.name}|${jsonStabile(j.ownership ?? {})}|${j.folder?.id ?? ""}`,
    ...j.pages.contents.slice().sort((a, b) => a.id.localeCompare(b.id)).map(p => `P|${j.id}|${p.id}|${t(p)}|${p.sort}|${p.name}|${p.title?.level}`)].join("\n");
}

/** La parte del piano che entra nella firma: tutto quello che si scriverebbe, e la fotografia del mondo. */
export const perLaFirma = piano => ({ cartelle: piano.cartelle, journal: piano.journal, foto: piano.foto });

// --- la scrittura --------------------------------------------------------------------------------------------------------------------
/**
 * Scrive il piano, in ordine; alla prima scrittura non riuscita si ferma. Prima delle creazioni rifà la fotografia di ogni journal
 * che tocca, e prima degli aggiornamenti di un journal ricontrolla l'ultima modifica di ogni pagina da aggiornare: se qualcuno l'ha
 * cambiata dopo i controlli (il GM da un altro browser, un altro utente), si ferma.
 * @returns true se tutto è andato
 */
export async function esegui(piano, report) {
  const Folder = CONFIG.Folder.documentClass, Journal = CONFIG.JournalEntry.documentClass;
  for ( const c of piano.cartelle ) {
    const r = await scrivi(report, `cartella ${c.dati.type} «${c.dati.name}» (${c.dati._id})`, () => Folder.create(clona(c.dati), { keepId: true }), [c.dati._id]);
    if ( !r ) return false;
  }
  // prima tutti i journal e le pagine nuove, poi gli aggiornamenti: così un collegamento scritto porta già a una pagina che c'è
  for ( const j of piano.journal ) {
    if ( fotografaJournal(j.id) !== piano.fotoJournal.get(j.id) ) { report.errori.push(`journal «${j.nome}» (${j.id}): cambiato dopo i controlli; non ci scrivo, si rilancia la prova`); return false; }
  }
  for ( const j of piano.journal ) {
    if ( j.dati ) {
      const r = await scrivi(report, `journal «${j.nome}» (${j.id})`, () => Journal.create(clona(j.dati), { keepId: true }), [j.id]);
      if ( !r ) return false;
    }
    const J = game.journal.get(j.id);
    if ( !J ) { report.errori.push(`journal «${j.nome}» (${j.id}): non lo trovo per scriverci le pagine`); return false; }
    if ( j.crea.length && !(await scrivi(report, `${j.crea.length} pagine nuove in «${j.nome}»: ${j.crea.map(p => `«${p.name}»`).join(", ")}`,
      () => J.createEmbeddedDocuments("JournalEntryPage", clona(j.crea), { keepId: true }), j.crea.map(p => p._id))) ) return false;
  }
  for ( const j of piano.journal ) {
    const J = game.journal.get(j.id);
    const cambiate = Object.entries(j.tempi ?? {}).filter(([pid, t]) => { const q = J?.pages.get(pid); return (q ? (q._stats?.modifiedTime ?? null) : "assente") !== t; }).map(([pid]) => pid);
    if ( cambiate.length ) { report.errori.push(`journal «${j.nome}»: pagine cambiate durante il carico (${cambiate.join(", ")}); non le aggiorno, si rilancia la prova`); return false; }
    if ( j.aggiorna.length && !(await scrivi(report, `${j.aggiorna.length} pagine aggiornate in «${j.nome}»`,
      () => J.updateEmbeddedDocuments("JournalEntryPage", clona(j.aggiorna).map(operatori)), j.aggiorna.map(u => u._id))) ) return false;
    if ( j.segni.length && !(await scrivi(report, `${j.segni.length} segni rinnovati in «${j.nome}»`,
      () => J.updateEmbeddedDocuments("JournalEntryPage", clona(j.segni)), j.segni.map(u => u._id))) ) return false;
  }
  return true;
}

/** Le voci del registro: tutti i documenti del piano, quelli che ci sono e quelli che si creano (si registrano prima di scrivere). */
export const vociRegistro = piano => [...piano.corrispondenze.filter(c => !c.adottata).map(c => ({ chiave: c.chiave, tipo: c.tipo, id: c.id, journal: c.journal })),
  // i documenti messi da parte: un uuid che poi non c'è più è il lavoro finito solo se il carico l'aveva messo da parte
  ...(piano.daParte ?? []).filter(x => x.azione || x.giaDaParte).map(x => ({ chiave: x.chiave, tipo: "daParte", id: x.op.uuid }))];
// le cartelle usate senza scriverle: se il registro aveva una cartella di prima di questo carico, poi tolta e rifatta a mano
// (con «ricrea»), la sua voce si toglie, se no al giro dopo tornerebbe il problema «l'ha già scritto»
export const adottate = piano => piano.corrispondenze.filter(c => c.adottata).map(c => c.chiave);

/**
 * Dopo la scrittura: le chiavi dei documenti che il piano doveva creare e che nel mondo non ci sono (una creazione non riuscita), da
 * togliere dal registro. Mai quelle dei documenti ritrovati: uno tolto dal GM durante il carico resta nel registro.
 */
export function nonCreati(piano) {
  return piano.corrispondenze.filter(c => c.crea).filter(c => {
    if ( c.tipo === "Folder" ) return !game.folders.get(c.id);
    if ( c.tipo === "JournalEntry" ) return !game.journal.get(c.id);
    if ( c.tipo === "RollTable" ) return !game.tables.get(c.id);
    if ( c.tipo === "Actor" ) return !game.actors.get(c.id);
    if ( c.tipo === "Macro" ) return !game.macros.get(c.id);
    if ( ["Note", "Tile", "Drawing"].includes(c.tipo) ) { const [sid, eid] = c.id.split("."); return !game.scenes.get(sid)?.getEmbeddedCollection(c.tipo)?.get(eid); }
    const [jid, pid] = c.id.split(".");
    return !game.journal.get(jid)?.pages.get(pid);
  }).map(c => c.chiave);
}

// --- la verifica -------------------------------------------------------------------------------------------------------------------
/** Rilegge dal mondo quello che il piano ha scritto o doveva ritrovare; una riga OK o KO per voce. */
export async function verifica(piano, report) {
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const ok = (voce, cond) => report.verifica.push(`${cond ? "OK" : "KO"} · ${voce}`);
  const giocatrici = game.users.filter(u => !u.isGM);
  const nascosto = d => giocatrici.every(u => !d.testUserPermission(u, "LIMITED"));
  // la visibilità per le giocatrici: il default e i loro livelli (Foundry aggiunge da sé come proprietario il GM che crea)
  const perGiocatrici = own => Object.fromEntries(Object.entries(own ?? {}).filter(([k]) => (k === "default") || giocatrici.some(u => u.id === k)));
  const JEP = CONFIG.JournalEntryPage.documentClass;
  const slug = JEP.slugifyHeading ?? foundry.documents?.JournalEntryPage?.slugifyHeading;
  for ( const c of piano.cartelle ) {
    const f = game.folders.get(c.dati._id);
    ok(`cartella ${c.dati.type} «${c.dati.name}» (${c.dati._id}): c'è, nella cartella madre giusta, col segno`,
      !!f && (f.type === c.dati.type) && (f.name === c.dati.name) && ((f.folder?.id ?? null) === c.dati.folder) && uguali(segnoDi(f), c.dati.flags[MODULO][SEGNO]));
  }
  for ( const j of piano.journal ) {
    const J = game.journal.get(j.id);
    if ( j.dati ) ok(`journal «${j.nome}» (${j.id}): c'è, nella sua cartella, a None, nascosto alle giocatrici, col segno`,
      !!J && (J.name === j.nome) && ((J.folder?.id ?? null) === j.dati.folder) && (J.ownership.default === L.NONE) && nascosto(J) && uguali(segnoDi(J), j.dati.flags[MODULO][SEGNO]));
    if ( !J ) { ok(`journal «${j.nome}» (${j.id}): c'è`, false); continue; }
    for ( const a of piano.attese.filter(x => x.jid === j.id) ) {
      const d = J.pages.get(a.pid);
      if ( !a.toccata ) {
        ok(`«${j.nome}» · «${a.nome}» (${a.pid}): c'è, col contenuto di prima e col segno`, !!d && (d.name === a.nome) && uguali(segnoDi(d), a.segno)
          && ((a.impronta === null) || ((await impronta(d.text?.content ?? "")) === a.impronta)) && ((a.impronta !== null) || ((d.src ?? null) === a.src)));
        continue;
      }
      const testo = (a.tipo === "text") ? ((await impronta(d?.text?.content ?? "")) === a.impronta) : ((d?.src === a.src) && ((d?.image?.caption ?? "") === a.didascalia));
      ok(`«${j.nome}» · «${a.nome}» (${a.pid}): c'è, ${a.tipo}, livello ${a.livello}, ${a.tipo === "text" ? "testo" : "immagine"} come nel piano, col segno${a.ownership ? ", con la visibilità del piano" : ""}${a.soloGM ? ", nascosta alle giocatrici" : ""}`,
        !!d && (d.name === a.nome) && (d.type === a.tipo) && ((d.title?.level ?? 1) === a.livello) && testo && uguali(segnoDi(d), a.segno) && ((a.sort === null) || (d.sort === a.sort))
        && (!a.ownership || uguali(perGiocatrici(d.ownership), perGiocatrici(a.ownership))) && (!a.soloGM || nascosto(d))
        && (!a.flagsMondo || Object.entries(a.flagsMondo).every(([k, v]) => Object.hasOwn(d.flags?.world ?? {}, k) && uguali(d.flags.world[k], v)))
        && ((a.nomi === undefined) || uguali(nomiDi(d), a.nomi)));
      // i collegamenti delle pagine scritte: ognuno si apre, porta dove diceva il piano, e la sua sezione c'è
      if ( a.collegamenti?.length && d ) {
        const trovati = [...String(d.text?.content ?? "").matchAll(/@UUID\[([^\]]+)\]/g)].map(m => m[1]);
        const aperti = await Promise.all(trovati.map(async u => {
          try {
            const [base, ancora] = u.split("#");
            const x = await foundry.utils.fromUuid(base);
            if ( !x ) return false;
            if ( !ancora ) return true;
            return (typeof slug === "function") && titoliDi(x.text?.content ?? "").some(t => slug.call(JEP, t) === ancora);
          } catch(err) { return false; }
        }));
        ok(`«${j.nome}» · «${a.nome}»: ${trovati.length} collegamenti, quelli del piano, e si aprono tutti, sezioni comprese`,
          uguali([...trovati].sort(), [...a.collegamenti].sort()) && aperti.every(Boolean));
      }
    }
    if ( j.ordine ) {
      const ordinate = J.pages.contents.slice().sort((x, y) => x.sort - y.sort).map(p => `${j.id}.${p.id}`);
      const pos = j.ordine.sequenza.map(s => ordinate.indexOf(s));
      const inOrdine = pos.every((v, i) => (v >= 0) && (!i || (v > pos[i - 1])));
      const contigua = !j.ordine.contigua || (inOrdine && ((pos.at(-1) - pos[0]) === (pos.length - 1)));
      ok(`«${j.nome}»: le pagine nell'ordine dei dati${j.ordine.contigua ? ", senza altre in mezzo" : ""}`, inOrdine && contigua);
    }
  }
}
