/**
 * Rivela il nome — il doppio nome dei PNG: quello d'aspetto e quello vero, scambiati con un clic
 * -----------------------------------------------------------------------------------------------
 * Al posto del modulo «Hide NPC Names», che cambia il nome su token e chat ma non nella barra degli attori, sulla scheda e nella
 * ricerca. Generico: vale in ogni mondo, per gli attori del mondo col flag
 *   flags["gdr-strumenti"].nomi = { aspetto: "La locandiera", vero: "Mara Vell", rivelato: false }
 * (l'esempio è inventato: questo file lo scarica ogni client, anche quello delle giocatrici).
 * In Foundry l'attore porta il nome d'aspetto finché le giocatrici non sanno quello vero, che sta solo nei dati dell'attore:
 * così non compare in nessun posto che vedono, nemmeno nella ricerca della barra.
 * «Rivela il nome» mette il nome rivelato sull'attore, sul suo token prototipo e sui suoi token nelle scene che portano ancora il
 * nome d'aspetto, anche numerato («La locandiera (2)» diventa «La locandiera: Mara Vell (2)»); un secondo clic rimette il nome
 * d'aspetto.
 * Cambia insieme anche le pagine di journal del personaggio: quelle col flag
 *   flags["gdr-strumenti"].nomi = { aspetto: "La locandiera", vero: "Mara Vell", rivelato: false }
 * con gli stessi due nomi dell'attore, o con gli stessi due nomi e lo stesso suffisso fra parentesi («La locandiera (solo GM)»,
 * «Mara Vell (solo GM)»): la voce che leggono le giocatrici e la sua pagina solo GM. Il testo e la visibilità non cambiano.
 * Non tocca: un token rinominato a mano; un attore o una pagina rinominati a mano, che non portano né l'uno né l'altro nome (lo
 * dice un avviso); gli attori di una giocatrice senza doppio nome (il GM può darglielo, con «Doppio nome…»). Restano col
 * nome di prima i messaggi di chat già scritti e le etichette scritte
 * nei collegamenti delle altre pagine.
 * Una pagina può seguire più attori, come la voce di una coppia: il suo flag ha anche
 *   attori: [{ aspetto: "Il fabbro", vero: "Brunone" }, { aspetto: "La moglie del fabbro", vero: "Tilde" }]
 * e i suoi due nomi sono suoi («I fabbri», «Brunone e Tilde»). Prende il nome vero quando tutti i suoi attori sono rivelati, e torna
 * al nome che descrive appena uno non lo è più.
 * Il nome rivelato tiene anche quello che descrive, davanti: «La locandiera: Mara Vell», così chi legge ha tutte e due le
 * informazioni e l'ordine alfabetico resta quello. Una pagina solo GM tiene il suffisso in fondo: «La locandiera: Mara Vell (solo GM)».
 * Un documento rivelato prima della 1.15.0, col solo nome vero, si riconosce ancora, e un clic lo riporta al nome che descrive.
 * Si usa:
 *   - dalla voce «Rivela il nome» del menu ⋮ in testa alla scheda dell'attore, solo per il GM e solo per gli attori col flag;
 *   - dalla macro del mondo «Rivela il nome», sui token selezionati (README.md, «Le macro dei mondi»).
 * Prova senza scrivere niente, dalla console (F12):
 *   await game.modules.get("gdr-strumenti").api.rivelaNome({ prova: true, attori: [game.actors.getName("…")] })
 * restituisce cosa farebbe, attore per attore.
 */
import { operatori } from "./carica/comune.mjs";

const MODULO = "gdr-strumenti";
const AZIONE = "gdrRivelaNome";
// i valori dei documenti negli avvisi, che Foundry mostra come HTML, passano sempre dall'escape
const escAvviso = v => { const t = String(v ?? ""); return foundry.utils.escapeHTML?.(t) ?? t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); };
// i nomi nell'etichetta di una voce di menu, che secondo la versione di Foundry è testo o HTML: senza < e >, così non aprono un tag
const senzaTag = v => String(v ?? "").replace(/[<>]/g, "");

/** I due nomi di un attore o di una pagina, o null se non ne ha due. Il flag si legge come dato del documento, senza getFlag. */
export function nomiDi(actor) {
  const n = actor?.flags?.[MODULO]?.nomi;
  if ( !n?.aspetto || !n?.vero || (n.aspetto === n.vero) ) return null;
  const out = { aspetto: String(n.aspetto), vero: String(n.vero), rivelato: n.rivelato === true };
  // gli attori di una pagina che ne segue più d'uno: solo coppie di nomi complete
  if ( Array.isArray(n.attori) && n.attori.length ) {
    const a = n.attori.filter(x => x?.aspetto && x?.vero).map(x => ({ aspetto: String(x.aspetto), vero: String(x.vero) }));
    if ( a.length === n.attori.length ) out.attori = a;
  }
  return out;
}

/**
 * Se una pagina coi due nomi n (dal suo flag) è del personaggio coi due nomi m (dell'attore): gli stessi nomi, o gli stessi con lo
 * stesso suffisso fra parentesi in fondo a tutti e due (la pagina solo GM: «… (solo GM)»).
 */
export function stessiNomi(m, n) {
  if ( !m || !n ) return false;
  if ( (n.aspetto === m.aspetto) && (n.vero === m.vero) ) return true;
  if ( !n.aspetto.startsWith(m.aspetto) ) return false;
  const coda = n.aspetto.slice(m.aspetto.length);
  return /^ \([^()]+\)$/.test(coda) && (n.vero === m.vero + coda);
}

/** Le pagine di journal del mondo del personaggio m: quelle coi suoi due nomi, e quelle che lo hanno fra i loro attori. */
function pagineDi(m) {
  const out = [];
  for ( const j of game.journal ) for ( const p of j.pages ) {
    const n = nomiDi(p);
    if ( !n ) continue;
    if ( n.attori ? n.attori.some(x => (x.aspetto === m.aspetto) && (x.vero === m.vero)) : stessiNomi(m, n) ) out.push(p);
  }
  return out;
}

/** Se l'attore del mondo coi due nomi x è rivelato (il flag, e il nome vero addosso). */
function attoreRivelato(x) {
  const a = game.actors.find(a => { const n = nomiDi(a); return n && (n.aspetto === x.aspetto) && (n.vero === x.vero); });
  return !!a && nomiDi(a).rivelato && portaRivelato(a, x);
}

/** Il nome rivelato: quello che descrive, due punti, quello vero; un suffisso fra parentesi uguale in tutti e due va in fondo. */
export function nomeComposto(aspetto, vero) {
  const coda = x => String(x).match(/^(.*\S)( \([^()]+\))$/);
  const ca = coda(aspetto), cv = coda(vero);
  if ( ca && cv && (ca[2] === cv[2]) ) return `${ca[1]}: ${cv[1]}${ca[2]}`;
  return `${aspetto}: ${vero}`;
}

/** I nomi che un documento coi due nomi n porta quando è rivelato: quello composto e, per uno rivelato prima della 1.15.0, il solo vero. */
export const nomiRivelati = n => [nomeComposto(n.aspetto, n.vero), n.vero];

/** Se il documento d (attore o pagina) coi due nomi n porta un nome da rivelato. */
export const portaRivelato = (d, n) => !!n && nomiRivelati(n).includes(d?.name);

/**
 * L'attore del mondo: un token non collegato porta un attore sintetico, che rimanda al suo attore del mondo; un attore di un compendio
 * non si tocca (null).
 */
const delMondo = a => (a?.isToken ? a.token?.baseActor : null) ?? (a?.pack ? null : game.actors.get(a?.id)) ?? null;

/** Il nome di un token di quell'attore, se porta ancora il nome di prima, da solo o numerato; se no null. */
export function nomeNuovo(nomeToken, da, a) {
  if ( nomeToken === da ) return a;
  if ( nomeToken?.startsWith(`${da} (`) && /^ \(\d+\)$/.test(nomeToken.slice(da.length)) ) return a + nomeToken.slice(da.length);
  return null;
}

/**
 * Scambia il nome d'aspetto e quello vero degli attori dati, o di quelli dei token selezionati.
 * @param {object} [scope]
 * @param {boolean} [scope.prova]     non scrive niente e restituisce il piano
 * @param {Actor[]} [scope.attori]    gli attori; senza, quelli dei token selezionati
 * @returns {Promise<object[]|undefined>} in prova, il piano attore per attore
 */
export async function rivelaNome(scope = {}) {
  const PROVA = scope?.prova === true;
  const esito = [];
  if ( !game.user.isGM ) {
    ui.notifications.warn("«Rivela il nome» è solo per il GM.");
    return PROVA ? [{ esito: "non GM" }] : undefined;
  }
  const dati = Array.isArray(scope?.attori) ? scope.attori : (canvas?.tokens?.controlled ?? []).map(t => t.document?.baseActor ?? t.actor);
  const attori = [...new Map(dati.map(delMondo).filter(Boolean).map(a => [a.id, a])).values()];
  if ( !attori.length ) {
    ui.notifications.warn("«Rivela il nome»: seleziona il token del PNG, o usa la voce «Rivela il nome» nel menu ⋮ della sua scheda.");
    return PROVA ? [{ esito: "nessun attore" }] : undefined;
  }
  for ( const actor of attori ) {
    const chi = { attore: actor.name, id: actor.id };
    const n = nomiDi(actor);
    if ( !n ) { esito.push({ ...chi, esito: "non ha un doppio nome" }); continue; }
    // anche l'attore di una giocatrice, se il GM gli ha dato il doppio nome (per esempio una PG nuova)
    // da quale nome a quale: rivelato, porta il nome composto (o il solo vero, se rivelato prima della 1.15.0) e torna a quello che
    // descrive; se no prende il nome composto
    const da = n.rivelato ? (portaRivelato(actor, n) ? actor.name : nomeComposto(n.aspetto, n.vero)) : n.aspetto;
    const a = n.rivelato ? n.aspetto : nomeComposto(n.aspetto, n.vero);
    if ( actor.name !== da ) {
      esito.push({ ...chi, esito: `porta un nome diverso da «${da}»: non lo tocco` });
      ui.notifications.warn(escAvviso(`«Rivela il nome»: «${actor.name}» non porta «${da}», come mi aspettavo; non lo tocco.`));
      continue;
    }
    const upd = { name: a, [`flags.${MODULO}.nomi.rivelato`]: !n.rivelato };
    const proto = nomeNuovo(actor.prototypeToken?.name, da, a);
    if ( proto ) upd["prototypeToken.name"] = proto;
    // i token nelle scene: quelli di questo attore che portano ancora il nome di prima
    const perScena = game.scenes.contents.map(s => ({ scena: s, token: s.tokens.filter(t => t.actorId === actor.id)
      .map(t => ({ _id: t.id, name: nomeNuovo(t.name, da, a) })).filter(t => t.name) })).filter(x => x.token.length);
    const token = perScena.reduce((tot, x) => tot + x.token.length, 0);
    // le pagine del personaggio: quelle che portano ancora il nome di prima prendono l'altro, col flag; quelle già col nome
    // giusto (rivelate a mano, o col flag già girato) si lasciano; quelle rinominate a mano si lasciano, con un avviso
    const pagine = [], lasciate = [];
    for ( const p of pagineDi(n) ) {
      const m = nomiDi(p);
      // dove va la pagina: con un attore solo, dove va lui; con più attori, rivelata solo se lo sono tutti, lui compreso dopo il clic
      const t = m.attori ? m.attori.every(x => ((x.aspetto === n.aspetto) && (x.vero === n.vero)) ? !n.rivelato : attoreRivelato(x)) : !n.rivelato;
      const pA = t ? nomeComposto(m.aspetto, m.vero) : m.aspetto;
      // i nomi da cui si parte: quello che descrive, o un nome da rivelata (anche il solo vero, di prima della 1.15.0)
      const pDa = t ? [m.aspetto, m.vero] : nomiRivelati(m);
      if ( p.name === pA ) { if ( m.rivelato !== t ) pagine.push({ p, upd: { _id: p.id, [`flags.${MODULO}.nomi.rivelato`]: t }, a: pA }); continue; }
      if ( !pDa.includes(p.name) ) { lasciate.push(p); continue; }
      pagine.push({ p, upd: { _id: p.id, name: pA, [`flags.${MODULO}.nomi.rivelato`]: t }, a: pA });
    }
    const voce = { ...chi, da, a, rivelato: !n.rivelato, prototipo: !!proto, token, scene: perScena.map(x => x.scena.name),
      pagine: pagine.map(x => `${x.p.parent?.name} · ${x.a}`), lasciate: lasciate.map(p => `${p.parent?.name} · ${p.name}`) };
    if ( PROVA ) { esito.push({ ...voce, esito: "lo farei" }); continue; }
    try {
      await actor.update(operatori(upd));
      for ( const x of perScena ) await x.scena.updateEmbeddedDocuments("Token", x.token);
      // le pagine per journal, con una scrittura per journal
      const perJournal = new Map();
      for ( const x of pagine ) { const j = x.p.parent; if ( !perJournal.has(j) ) perJournal.set(j, []); perJournal.get(j).push(x.upd); }
      for ( const [j, upds] of perJournal ) await j.updateEmbeddedDocuments("JournalEntryPage", upds.map(operatori));
      esito.push({ ...voce, esito: "fatto" });
      ui.notifications.info(escAvviso(`«${da}» ora è «${a}»${token ? `, con ${token} token` : ""}${pagine.length ? `; ${pagine.length === 1 ? "una pagina" : `${pagine.length} pagine`} di journal` : ""}.`));
      if ( lasciate.length ) ui.notifications.warn(escAvviso(`«Rivela il nome»: ${lasciate.length === 1 ? "una pagina" : `${lasciate.length} pagine`} di «${a}» non ${lasciate.length === 1 ? "porta" : "portano"} «${da}» né l'altro nome (rinominate a mano?): non le tocco (${lasciate.map(p => `«${p.name}»`).join(", ")}).`));
    } catch(err) {
      esito.push({ ...voce, esito: `errore: ${err.message}` });
      // l'attore può essere già cambiato e le pagine no: un secondo clic rimette tutto insieme
      ui.notifications.error(escAvviso(`«Rivela il nome» su «${da}»: ${err.message}. Guarda il nome dell'attore e delle sue pagine: se non sono tutti uguali, un altro clic li riallinea.`));
    }
  }
  if ( !PROVA && esito.every(e => e.esito === "non ha un doppio nome") ) {
    ui.notifications.warn("«Rivela il nome»: nessuno dei PNG scelti ha un doppio nome; non ho cambiato niente.");
  }
  return PROVA ? esito : undefined;
}

/**
 * Il nome intero al passaggio del mouse, nella barra degli attori, per gli attori rivelati: il nome composto è lungo, e la barra
 * lo taglia proprio sul nome vero. Il nome è quello che chi guarda vede già nella barra: niente che non sappia. Nell'indice dei
 * journal il nome intero c'è già (indice.mjs).
 */
export function nomeInteroNellaBarra(radice) {
  const el = (radice instanceof HTMLElement) ? radice : (radice?.[0] ?? null);
  for ( const li of el?.querySelectorAll?.("[data-entry-id]") ?? [] ) {
    const a = game.actors?.get(li.dataset.entryId);
    const n = nomiDi(a);
    const nome = li.querySelector(".entry-name") ?? li;
    // sempre il nome di adesso sugli attori rivelati; il title messo da qui su uno tornato al nome che descrive si toglie (una voce
    // riusata da un disegno parziale)
    if ( n && portaRivelato(a, n) ) { nome.title = a.name; nome.dataset.gdrNomeIntero = ""; }
    else if ( nome.dataset?.gdrNomeIntero !== undefined ) { nome.removeAttribute("title"); delete nome.dataset.gdrNomeIntero; }
  }
}

const AZIONE_PAGINA = "gdrRivelaNomePagina";
const AZIONE_DOPPIO = "gdrDoppioNome";

/**
 * Dà, cambia o toglie il doppio nome di un attore, a mano, per esempio a una PG nuova o a un PNG creato al momento. Lavora sull'attore del
 * mondo, anche quando arriva dalla scheda di un token non collegato. L'attore, il token prototipo e i token delle scene che portano il
 * nome di adesso prendono il nome che descrive, o quello composto se «rivelato». Le pagine di journal col flag del personaggio lo seguono
 * sempre; con «pagine», anche quelle senza flag col nome di adesso (o con quel nome e un suffisso fra parentesi, come la pagina solo GM)
 * prendono i due nomi. Una pagina col flag di un altro personaggio non si tocca, anche se ha lo stesso nome. Le pagine di più attori
 * tengono i loro due nomi: nella loro lista «attori» cambiano i nomi di questo, e il loro stato segue quello di tutti i loro attori.
 * Senza «vero», il doppio nome si toglie: l'attore e le sue pagine tornano al nome vero.
 * Scrive prima token e pagine, poi l'attore: se si ferma a metà, un secondo tentativo ritrova l'attore col nome di prima.
 * @returns {Promise<object>} cosa ha fatto (in prova, cosa farebbe)
 */
export async function impostaDoppioNome(attore, { aspetto, vero, rivelato = false, pagine = true, prova = false } = {}) {
  if ( !game.user.isGM ) throw new Error("solo il GM");
  const actor = delMondo(attore);
  if ( !actor ) throw new Error("serve un attore del mondo, non di un compendio");
  aspetto = String(aspetto ?? "").trim(); vero = String(vero ?? "").trim();
  const prima = nomiDi(actor), daNome = actor.name;
  if ( vero && (!aspetto || (aspetto === vero)) ) throw new Error("servono due nomi diversi: quello che descrive e quello vero");
  const nuovo = !vero ? (prima?.vero ?? actor.name) : (rivelato ? nomeComposto(aspetto, vero) : aspetto);
  const upd = { name: nuovo };
  // il prototipo porta di solito il nome dell'attore: col nome che non cambia, non c'è niente da rinominare
  const pr = (nuovo !== daNome) ? nomeNuovo(actor.prototypeToken?.name, daNome, nuovo) : null;
  if ( pr ) upd["prototypeToken.name"] = pr;
  if ( vero ) upd[`flags.${MODULO}.nomi`] = { aspetto, vero, rivelato: !!rivelato };
  else if ( prima ) upd[`flags.${MODULO}.-=nomi`] = null;
  const perScena = (nuovo === daNome) ? [] : game.scenes.contents.map(sc => ({ scena: sc, token: (sc.tokens?.filter?.(t => t.actorId === actor.id) ?? [])
    .map(t => ({ _id: t.id, name: nomeNuovo(t.name, daNome, nuovo) })).filter(t => t.name) })).filter(y => y.token.length);
  const coda = nome => { const m = String(nome).match(/^(.*\S)( \([^()]+\))$/); return m ? [m[1], m[2]] : [nome, ""]; };
  const perJournal = new Map(), elenco = [], diPiu = [], lasciate = [], avvisi = [];
  const metti = (j, u) => { if ( !perJournal.has(j) ) perJournal.set(j, []); perJournal.get(j).push(u); };
  const nuovi = vero ? { aspetto, vero } : null;
  // se un attore coi due nomi x è rivelato dopo questo salvataggio: questo coi nomi nuovi, gli altri come sono
  const rivelatoDopo = x => (nuovi && (x.aspetto === aspetto) && (x.vero === vero)) ? !!rivelato : attoreRivelato(x);
  // le pagine col flag del personaggio seguono sempre i suoi nomi, anche senza «pagine»: altrimenti non le ritroverebbe più
  // nessuno; «pagine» decide solo delle pagine omonime senza flag
  for ( const j of game.journal ) for ( const p of j.pages ) {
    const n = nomiDi(p);
    // una pagina di più attori: cambia la voce di questo personaggio nella sua lista, e il suo stato, che dipende da tutti; tiene i
    // suoi due nomi
    if ( n?.attori ) {
      const i = prima ? n.attori.findIndex(x => (x.aspetto === prima.aspetto) && (x.vero === prima.vero)) : -1;
      if ( i < 0 ) continue;
      const lista = vero ? n.attori.map((x, k) => (k === i) ? { aspetto, vero } : x) : n.attori.filter((x, k) => k !== i);
      const u = { _id: p.id };
      if ( !lista.length ) {
        u[`flags.${MODULO}.nomi.-=attori`] = null;
        diPiu.push(`${j.name} · ${p.name} (non segue più nessun personaggio: nessuno la rivela)`);
      } else {
        u[`flags.${MODULO}.nomi.attori`] = lista;
        const t = lista.every(rivelatoDopo), pA = t ? nomeComposto(n.aspetto, n.vero) : n.aspetto;
        const segue = (p.name === pA) || [n.aspetto, ...nomiRivelati(n)].includes(p.name);
        if ( segue ) { u.name = pA; u[`flags.${MODULO}.nomi.rivelato`] = t; }
        // niente da cambiare: la stessa lista, lo stesso nome e lo stesso stato
        if ( (JSON.stringify(lista) === JSON.stringify(n.attori)) && (!segue || ((p.name === pA) && (n.rivelato === t))) ) continue;
        diPiu.push(`${j.name} · ${pA}`);
      }
      metti(j, u);
      continue;
    }
    // il suffisso fra parentesi della pagina («(solo GM)»): da quello del flag, se è di questo personaggio; dal nome, se non ha flag
    const [base, s] = coda(p.name);
    const omonima = (p.name === daNome) || ((base === daNome) && !!s);
    let suff;
    if ( n ) {
      if ( !stessiNomi(prima, n) ) {
        // già coi nomi nuovi (un secondo tentativo dopo un errore): a posto, non si elenca
        if ( omonima && !stessiNomi(nuovi, n) ) lasciate.push(`${j.name} · ${p.name}`);
        continue;
      }
      // del personaggio, ma rinominata a mano: non porta né il nome che descrive né quello da rivelata
      if ( (p.name !== n.aspetto) && !nomiRivelati(n).includes(p.name) ) { lasciate.push(`${j.name} · ${p.name}`); continue; }
      suff = n.aspetto.slice(prima.aspetto.length);
    } else if ( pagine && omonima ) suff = (p.name === daNome) ? "" : s;
    else continue;
    const u = { _id: p.id };
    if ( vero ) {
      u.name = rivelato ? nomeComposto(aspetto + suff, vero + suff) : aspetto + suff;
      u[`flags.${MODULO}.nomi`] = { aspetto: aspetto + suff, vero: vero + suff, rivelato: !!rivelato };
      if ( (u.name === p.name) && n && (n.aspetto === aspetto + suff) && (n.vero === vero + suff) && (n.rivelato === !!rivelato) ) continue;
    } else {
      u.name = nuovo + suff;
      if ( n ) u[`flags.${MODULO}.-=nomi`] = null;
      else if ( u.name === p.name ) continue;
    }
    metti(j, u);
    elenco.push(`${j.name} · ${u.name}`);
  }
  // avvisi: il nome vero su un attore che una giocatrice vede (come il caricatore); un altro attore coi due nomi nuovi
  const L = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1;
  const visto = actor.hasPlayerOwner || ((actor.ownership?.default ?? 0) >= L)
    || (game.users?.some?.(u => !u.isGM && ((actor.ownership?.[u.id] ?? 0) >= L)) ?? false);
  // togliendo il doppio nome a uno non ancora rivelato, attore e pagine prendono il nome vero
  if ( !vero && prima && !(prima.rivelato && portaRivelato(actor, prima)) ) avvisi.push(`togliendo il doppio nome, l'attore${elenco.length ? " e le sue pagine prendono" : " prende"} il nome vero, «${nuovo}»: chi ${elenco.length ? "li" : "lo"} vede lo legge`);
  if ( vero && !rivelato && visto ) avvisi.push(`una giocatrice vede «${nuovo}»: il nome vero sta nei dati dell'attore, e chi lo vede può leggerlo dalla console`);
  if ( nuovi && game.actors.some(a => (a.id !== actor.id) && stessiNomi(nuovi, nomiDi(a)) && stessiNomi(nomiDi(a), nuovi)) ) avvisi.push(`un altro attore ha già i nomi «${aspetto}» e «${vero}»: le pagine e «Rivela il nome» potrebbero prendere quello`);
  const piano = { attore: actor.id, da: daNome, a: nuovo, prototipo: !!pr, token: perScena.reduce((t, y) => t + y.token.length, 0),
    pagine: elenco, pagineDiPiuAttori: diPiu, lasciate, avvisi,
    // niente da cambiare: né nomi, né token, né pagine (anche coi due nomi uguali a quelli che ha)
    niente: (!vero && !prima) || ((nuovo === daNome) && !pr && !perScena.length && !perJournal.size && !!vero && !!prima
      && (prima.aspetto === aspetto) && (prima.vero === vero) && (prima.rivelato === !!rivelato)) };
  if ( prova ) return piano;
  // prima token e pagine, poi l'attore
  for ( const y of perScena ) await y.scena.updateEmbeddedDocuments("Token", y.token);
  for ( const [j, us] of perJournal ) await j.updateEmbeddedDocuments("JournalEntryPage", us.map(operatori));
  await actor.update(operatori(upd));
  return piano;
}

/** La finestra di «Doppio nome…», dal menu ⋮ della scheda dell'attore o del suo token: i nomi, poi il piano da confermare. */
async function finestraDoppioNome(attore) {
  const actor = delMondo(attore);
  if ( !actor ) { ui.notifications.warn("«Doppio nome»: serve un attore del mondo, non di un compendio."); return; }
  const n = nomiDi(actor);
  const esc = v => { const t = String(v ?? ""); return foundry.utils.escapeHTML?.(t) ?? globalThis.Handlebars?.escapeExpression?.(t) ?? t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); };
  // il colore del testo dal tema della finestra: con le applicazioni chiare e l'interfaccia scura, il testo dei dialoghi resterebbe
  // bianco sul fondo chiaro. Non --color-text-primary, che un modulo come Swipe VTT mette bianco su tutto il body: --gdr-testo del
  // foglio del modulo, per tema, e in mancanza --color-form-label, quello delle etichette
  const content = `<div style="color:var(--gdr-testo, var(--color-form-label, inherit))"><p>Le giocatrici leggono il nome che descrive finché non riveli quello vero; poi li leggono insieme: «Nome che descrive: Nome vero».
    Il nome che descrive va senza articolo davanti («Oste del Gallo Rosso»). Lascia vuoto il nome vero per togliere il doppio nome.</p>
    <div class="form-group"><label>Nome che descrive</label><input type="text" name="aspetto" value="${esc(n?.aspetto ?? actor.name)}"></div>
    <div class="form-group"><label>Nome vero</label><input type="text" name="vero" value="${esc(n?.vero ?? "")}"></div>
    <div class="form-group"><label>Già rivelato</label><input type="checkbox" name="rivelato" ${n?.rivelato ? "checked" : ""}></div>
    <div class="form-group"><label>Rinomina anche le sue pagine senza doppio nome</label><input type="checkbox" name="pagine" checked></div>
    <p class="hint">Le pagine che hanno già il suo doppio nome lo seguono sempre.</p></div>`;
  const api = foundry.applications.api.DialogV2;
  let dati;
  try {
    dati = await api.input({ window: { title: `Doppio nome · ${actor.name}` }, position: { width: 520 }, content,
      ok: { label: "Avanti", icon: "fa-solid fa-arrow-right" }, rejectClose: false });
  } catch(err) { return; }
  if ( !dati ) return;
  const scelta = { aspetto: dati.aspetto, vero: dati.vero, rivelato: !!dati.rivelato, pagine: !!dati.pagine };
  try {
    // il piano, da confermare: cosa cambia, e le pagine omonime che non tocca
    const p = await impostaDoppioNome(actor, { ...scelta, prova: true });
    const voci = xs => `<ul>${xs.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
    if ( p.niente ) { ui.notifications.info(escAvviso(`«Doppio nome»: niente da cambiare su «${p.da}».`)); return; }
    const piano = (p.avvisi.length ? `<p><strong>Attenzione:</strong></p>${voci(p.avvisi)}` : "")
      + `<p>${(p.da === p.a) ? `«${esc(p.a)}» tiene il nome` : `«${esc(p.da)}» diventa «${esc(p.a)}»`}${p.token ? `, con ${p.token} token nelle scene` : ""}.</p>`
      + (p.pagine.length ? `<p>Pagine di journal:</p>${voci(p.pagine)}` : (scelta.pagine ? "<p>Nessuna pagina di journal da cambiare.</p>" : ""))
      + (p.pagineDiPiuAttori.length ? `<p>Pagine di più personaggi, che seguono i nomi nuovi:</p>${voci(p.pagineDiPiuAttori)}` : "")
      + (p.lasciate.length ? `<p>Pagine con lo stesso nome che non tocco (di un altro personaggio, o rinominate a mano):</p>${voci(p.lasciate)}` : "");
    const si = await api.confirm({ window: { title: `Doppio nome · ${actor.name}` }, position: { width: 520 }, content: `<div style="color:var(--gdr-testo, var(--color-form-label, inherit))">${piano}</div>`, yes: { label: "Salva" }, no: { label: "Annulla" }, rejectClose: false });
    if ( !si ) return;
    const r = await impostaDoppioNome(actor, scelta);
    ui.notifications.info(escAvviso(`«${r.da}» ora è «${r.a}»${r.token ? `, con ${r.token} token` : ""}${r.pagine.length ? `; ${r.pagine.length === 1 ? "una pagina" : `${r.pagine.length} pagine`} di journal` : ""}.`));
  } catch(err) { ui.notifications.error(escAvviso(`«Doppio nome»: ${err.message}`)); }
}

/**
 * Gli attori del mondo di una pagina col doppio nome: quelli che segue («attori» nel flag), o quello coi suoi stessi due nomi;
 * se la pagina è rivelata; quanti attori mancano nel mondo. null se la pagina non ha un doppio nome.
 */
export function attoriDellaPagina(pagina) {
  const n = nomiDi(pagina);
  if ( !n ) return null;
  const coi = x => game.actors.find(a => { const m = nomiDi(a); return !!m && (m.aspetto === x.aspetto) && (m.vero === x.vero); }) ?? null;
  const attori = n.attori ? n.attori.map(coi) : [game.actors.find(a => stessiNomi(nomiDi(a), n)) ?? null];
  return { n, rivelata: !!n.rivelato && portaRivelato(pagina, n), attori, mancano: attori.filter(a => !a).length };
}

/**
 * «Rivela il nome» dalla pagina di journal, anche per una pagina legata a più attori. Una pagina non rivelata: si rivelano i suoi
 * attori che non lo sono ancora, e con loro la pagina; una rivelata: si nascondono quelli rivelati. Tutto passa da rivelaNome, sugli
 * attori: token, voci e pagine solo GM cambiano insieme, come dalla scheda.
 * @returns {Promise<object[]|undefined>} in prova, il piano di rivelaNome (o il motivo per cui non fa niente)
 */
export async function rivelaPagina(pagina, { prova = false } = {}) {
  const fuori = (msg, esito) => { if ( !prova ) ui.notifications.warn(escAvviso(`«Rivela il nome»: ${msg}`)); return prova ? [{ esito }] : undefined; };
  if ( !game.user.isGM ) return fuori("è solo per il GM.", "non GM");
  const x = attoriDellaPagina(pagina);
  if ( !x ) return fuori(`la pagina «${pagina?.name}» non ha un doppio nome.`, "senza doppio nome");
  const presenti = x.attori.filter(Boolean);
  if ( !presenti.length ) return fuori(`nessun attore del mondo ha i due nomi della pagina «${pagina.name}».`, "senza attori");
  // con più attori, una pagina si rivela solo quando ci sono tutti: senza uno, non si rivela a metà
  if ( !x.rivelata && x.mancano ) return fuori(`${x.mancano === 1 ? "manca un attore" : `mancano ${x.mancano} attori`} della pagina «${pagina.name}»: non rivelo niente.`, "attori mancanti");
  const riv = a => { const m = nomiDi(a); return !!m?.rivelato && portaRivelato(a, m); };
  const daCambiare = presenti.filter(a => x.rivelata ? riv(a) : !riv(a));
  if ( !daCambiare.length ) return fuori(`gli attori della pagina «${pagina.name}» sono già ${x.rivelata ? "nascosti" : "rivelati"}: per riallinearla, usa «Rivela il nome» dalla scheda di uno di loro, due volte.`, "niente da cambiare");
  return rivelaNome({ prova, attori: daCambiare });
}

/** La pagina che la finestra del journal mostra: quella in vista, o la voce attiva dell'indice. */
function paginaInVista(app) {
  const j = app?.document;
  return j?.pages?.get?.(app?.pageId) ?? j?.pages?.get?.(app?.element?.querySelector?.(".toc li.active[data-page-id]")?.dataset?.pageId) ?? null;
}

/** La voce «Rivela il nome» nel menu ⋮ in testa alla scheda dell'attore (o del suo token), per il GM, sui PNG col doppio nome. */
export function registraRivelaNome() {
  // e nel menu ⋮ del journal, per la pagina aperta, se il journal ha pagine col doppio nome
  Hooks.on("getHeaderControlsJournalEntrySheet", (app, controls) => {
    const j = app.document;
    if ( !game.user.isGM || !j || j.pack || !j.pages?.some?.(p => nomiDi(p)) || controls.some(c => c.action === AZIONE_PAGINA) ) return;
    app.options.actions[AZIONE_PAGINA] = () => {
      const p = paginaInVista(app);
      if ( !p || !nomiDi(p) ) { ui.notifications.warn("«Rivela il nome»: apri la pagina del personaggio, una pagina col doppio nome."); return; }
      return rivelaPagina(p);
    };
    controls.push({ action: AZIONE_PAGINA, icon: "fa-solid fa-user-secret", label: "Rivela o nascondi il nome (pagina aperta)" });
  });
  // le stesse voci nel menu del tasto destro sugli attori della barra. V14 descrive le voci con label, onClick e visible; V13 con
  // name, callback e condition. La voce sa di quale attore è dal data-entry-id della riga.
  Hooks.on("getActorContextOptions", (app, voci) => {
    try {
      if ( !game.user.isGM || !Array.isArray(voci) ) return;
      const riga = (...a) => a.find(x => x?.dataset?.entryId) ?? a.find(x => x?.[0]?.dataset?.entryId)?.[0] ?? null;
      // solo la barra degli attori del mondo: un compendio di attori lancia lo stesso hook, e un suo attore può avere l'id di uno del
      // mondo
      if ( app?.collection?.metadata || app?.collection?.pack ) return;
      const attore = (...a) => { const li = riga(...a); const x = li ? game.actors?.get(li.dataset.entryId) : null; return (x && !x.pack) ? x : null; };
      const rivelato = x => { const n = nomiDi(x); return !!n && n.rivelato && portaRivelato(x, n); };
      const v14 = (game.release?.generation ?? 13) >= 14;
      const voce = (label, icon, visibile, clic) => v14
        ? { label, icon: `<i class="${icon}"></i>`, group: "gdr-strumenti", visible: (...a) => { try { return visibile(attore(...a)); } catch(err) { return false; } }, onClick: (...a) => { const x = attore(...a); if ( x ) return clic(x); } }
        : { name: label, icon: `<i class="${icon}"></i>`, group: "gdr-strumenti", condition: (...a) => { try { return visibile(attore(...a)); } catch(err) { return false; } }, callback: (...a) => { const x = attore(...a); if ( x ) return clic(x); } };
      voci.push(
        voce("Rivela il nome", "fa-solid fa-eye", x => !!x && !!nomiDi(x) && !rivelato(x), x => rivelaNome({ attori: [x] })),
        voce("Nascondi il nome", "fa-solid fa-eye-slash", x => !!x && rivelato(x), x => rivelaNome({ attori: [x] })),
        voce("Doppio nome…", "fa-solid fa-masks-theater", x => !!x, x => finestraDoppioNome(x))
      );
    } catch(err) { console.warn("gdr-strumenti, voci del menu degli attori:", err); }
  });
  Hooks.on("renderActorDirectory", (app, html) => { try { nomeInteroNellaBarra(html ?? app?.element); } catch(err) { console.warn("gdr-strumenti, nome intero nella barra degli attori:", err); } });
  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    const actor = app.document ?? app.actor;
    if ( !game.user.isGM || !actor || actor.pack ) return;
    // «Doppio nome…»: dare, cambiare o togliere i due nomi, a mano, anche a un attore di una giocatrice
    if ( !controls.some(c => c.action === AZIONE_DOPPIO) ) {
      app.options.actions[AZIONE_DOPPIO] = () => finestraDoppioNome(actor);
      controls.push({ action: AZIONE_DOPPIO, icon: "fa-solid fa-masks-theater", label: "Doppio nome…" });
    }
    const n = nomiDi(actor);
    if ( !n || controls.some(c => c.action === AZIONE) ) return;
    // l'azione della scheda: dnd5e 6.0.6 la chiama dal menu, e così si fa anche in V13, dove le voci non hanno onClick
    app.options.actions[AZIONE] = () => rivelaNome({ attori: [actor] });
    controls.push({
      action: AZIONE,
      icon: n.rivelato ? "fa-solid fa-eye-slash" : "fa-solid fa-eye",
      label: n.rivelato ? `Nascondi il nome (torna «${senzaTag(n.aspetto)}»)` : `Rivela il nome: «${senzaTag(n.vero)}»`
    });
  });
}
