/**
 * Il caricatore, le parti comuni: costanti, impronte, id fissi, rapporto, lettura dei dati, guardie, scrittura controllata,
 * blocco fra le schede, salvataggio del rapporto.
 * Formato e regole: docs/caricatore.md.
 *
 * Le funzioni pure (impronte, id, JSON stabile) non chiamano Foundry: si provano anche fuori dal mondo.
 */
export const MODULO = "gdr-strumenti";
export const STRUMENTO = "gdr-strumenti/carica";
export const VERSIONE = "1.19.0";
export const FORMATO = "gdr-carico/1";
// le versioni su cui il caricatore è verificato: dopo un aggiornamento di Foundry o di dnd5e si ferma, finché non è riverificato
// con la prova a vuoto sui carichi già fatti e la versione nuova non è scritta qui, con la sua revisione
export const VERIFICATO = Object.freeze({ core: "14.369", sistema: "dnd5e", sistemaVersione: "6.0.6" });
// il segno nei dati dei documenti: flags["gdr-strumenti"].carico
export const SEGNO = "carico";
export const DENSITA = 100000;                                  // come CONST.SORT_INTEGER_DENSITY

// --- impronte, id, JSON ---------------------------------------------------------------------------------------------------------
const esadecimale = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

// SHA-256 in JavaScript, per quando il browser non dà crypto.subtle: la pagina di Foundry su un indirizzo che non è un contesto
// sicuro, come un http senza TLS. Lo standard FIPS 180-4; le prove lo confrontano con quello di Node.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256Js(dati) {
  // come crypto.subtle.digest: un ArrayBuffer o una sua vista, se no TypeError
  if ( !(dati instanceof ArrayBuffer) && !ArrayBuffer.isView(dati) ) throw new TypeError("SHA-256: serve un ArrayBuffer o una sua vista");
  const b = (dati instanceof Uint8Array) ? dati : ArrayBuffer.isView(dati) ? new Uint8Array(dati.buffer, dati.byteOffset, dati.byteLength) : new Uint8Array(dati);
  const n = b.length, blocchi = Math.ceil((n + 9) / 64), m = new Uint8Array(blocchi * 64);
  m.set(b); m[n] = 0x80;
  const bit = n * 8, v = new DataView(m.buffer);
  v.setUint32(m.length - 8, Math.floor(bit / 0x100000000)); v.setUint32(m.length - 4, bit >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for ( let i = 0; i < blocchi; i++ ) {
    for ( let t = 0; t < 16; t++ ) W[t] = v.getUint32(i * 64 + t * 4);
    for ( let t = 16; t < 64; t++ ) {
      const s0 = r(W[t - 15], 7) ^ r(W[t - 15], 18) ^ (W[t - 15] >>> 3), s1 = r(W[t - 2], 17) ^ r(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, h] = H;
    for ( let t = 0; t < 64; t++ ) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), o = new DataView(out.buffer);
  H.forEach((x, k) => o.setUint32(k * 4, x));
  return out;
}
/** Le 32 byte dello SHA-256: crypto.subtle se il browser lo dà, se no quello in JavaScript, che dà lo stesso risultato. */
async function digest(buf) {
  const s = globalThis.crypto?.subtle;
  if ( s ) { try { return new Uint8Array(await s.digest("SHA-256", buf)); } catch(err) { if ( err instanceof TypeError ) throw err; } }   // rifiutato dal browser: si calcola qui
  return sha256Js(buf);
}

/** SHA-256 in esadecimale di un testo (UTF-8) o di un buffer. */
export async function sha256(dato) {
  const buf = (typeof dato === "string") ? new TextEncoder().encode(dato) : dato;
  return esadecimale(await digest(buf));
}

const ALFABETO = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** L'id fisso di un documento del carico: 16 caratteri alfanumerici, come quelli di Foundry, dal mondo, dal carico e dal rif. */
export async function idFisso(mondo, carico, rif) {
  const h = await digest(new TextEncoder().encode(`gdr-carico/id/${mondo}/${carico}/${rif}`));
  return [...h.slice(0, 16)].map(b => ALFABETO[b % 62]).join("");
}

/** La chiave del segno: dal carico e dal rif, senza scriverli in chiaro nei dati del documento (le giocatrici leggono i dati delle pagine che vedono). */
export async function chiaveDi(carico, rif) {
  return (await sha256(`gdr-carico/chiave/${carico}/${rif}`)).slice(0, 24);
}

/**
 * Un aggiornamento con le chiavi «-=» (togliere una chiave) nella forma di V14, `ForcedDeletion`, dove Foundry la ha: «-=» è deprecato
 * dalla 14 e sparisce con la 16. Solo al momento di scrivere: piano, firma e verifica tengono «-=», che si clona e si serializza.
 * Le chiavi sono quelle piatte di un aggiornamento («flags.x.-=nomi»).
 */
export function operatori(upd) {
  const FD = globalThis.foundry?.data?.operators?.ForcedDeletion;
  if ( !FD || !upd || (typeof upd !== "object") || Array.isArray(upd) ) return upd;
  const out = {};
  for ( const [k, v] of Object.entries(upd) ) {
    const parti = k.split("."), ultima = parti.at(-1);
    if ( ultima.startsWith("-=") && (v === null) ) out[[...parti.slice(0, -1), ultima.slice(2)].join(".")] = new FD();
    else out[k] = v;
  }
  return out;
}

/** JSON con le chiavi in ordine: la stessa struttura dà sempre lo stesso testo (per la firma del piano). */
export function jsonStabile(v) {
  if ( Array.isArray(v) ) return `[${v.map(jsonStabile).join(",")}]`;
  if ( v && (typeof v === "object") ) return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${jsonStabile(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** L'indirizzo di un file di Data/ nel server, anche con un prefisso di percorso di Foundry. */
const rotta = p => (globalThis.foundry?.utils?.getRoute ? foundry.utils.getRoute(p) : `/${p}`);

/** Un percorso in Data/: lettere, cifre, «_», «-», «.» e «/», senza «..», senza «/» in testa. */
export const percorsoValido = p => (typeof p === "string") && /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(p) && !p.split("/").some(x => (x === "") || (x === "..") || (x === "."));

// --- il rapporto ------------------------------------------------------------------------------------------------------------------
export function nuovoRapporto(modo) {
  return {
    strumento: STRUMENTO, versione: VERSIONE, modo: modo ?? null, avvio: new Date().toISOString(),
    utente: globalThis.game?.user?.name ?? null, mondo: globalThis.game?.world?.id ?? null,
    core: globalThis.game?.version ?? null, sistema: globalThis.game?.system ? `${game.system.id} ${game.system.version}` : null,
    connessi: globalThis.game?.users?.filter(u => u.active).map(u => u.name) ?? [],
    carico: null, titolo: null, dati: null,
    problemi: [], avvisi: [], note: [], piano: [], saltati: [], firma: null, vedrebbero: {}, corrispondenze: [],
    consenti: null, numeri: null, daConvertire: [], scritto: [], errori: [], verifica: [], esito: null, salvato: null
  };
}

// --- i dati: dal file in Data/ o dal testo, con l'impronta ----------------------------------------------------------------------
const OPZIONI = ["modo", "utente", "file", "testo", "sha256", "firma", "consenti"];


/** Controlla le opzioni della chiamata; i problemi vanno nel rapporto. */
export function controllaOpzioni(opzioni, report) {
  if ( !opzioni || (typeof opzioni !== "object") || Array.isArray(opzioni) ) { report.problemi.push("opzioni: serve un oggetto, per esempio { modo: \"prova\", utente, file, sha256 }"); return false; }
  for ( const k of Object.keys(opzioni) ) if ( !OPZIONI.includes(k) ) report.problemi.push(`opzioni: «${k}» non è un'opzione del caricatore (${OPZIONI.join(", ")})`);
  if ( !["prova", "applica"].includes(opzioni.modo) ) report.problemi.push(`opzioni: modo «${opzioni.modo}», atteso «prova» o «applica»`);
  if ( (typeof opzioni.utente !== "string") || !opzioni.utente ) report.problemi.push("opzioni: manca «utente», il nome dell'utente che lancia il caricatore");
  if ( (opzioni.file === undefined) === (opzioni.testo === undefined) ) report.problemi.push("opzioni: serve uno solo fra «file» e «testo»");
  if ( (opzioni.file !== undefined) && !percorsoValido(opzioni.file) ) report.problemi.push(`opzioni: «file» non è un percorso di Data/ valido: ${opzioni.file}`);
  if ( (opzioni.testo !== undefined) && (typeof opzioni.testo !== "string") ) report.problemi.push("opzioni: «testo» deve essere il file di dati come testo");
  if ( !/^[0-9a-f]{64}$/.test(opzioni.sha256 ?? "") ) report.problemi.push("opzioni: «sha256» deve essere l'impronta SHA-256 del file, 64 cifre esadecimali minuscole");
  if ( (opzioni.modo === "applica") && !/^[0-9a-f]{64}$/.test(opzioni.firma ?? "") ) report.problemi.push("opzioni: con «applica» serve «firma», quella della prova");
  if ( (opzioni.modo === "prova") && (opzioni.firma !== undefined) ) report.problemi.push("opzioni: «firma» serve solo con «applica»");
  // «consenti» non serve più: chi è connesso non ferma il caricatore (sotto, «le guardie»); si accetta ancora, per i carichi
  // scritti prima, e il rapporto dice che non conta
  if ( opzioni.consenti !== undefined ) {
    const c = opzioni.consenti;
    if ( !Array.isArray(c) || [...c.keys()].some(k => (typeof c[k] !== "string") || !c[k]) ) report.avvisi.push("opzioni: «consenti» non serve più dalla 1.12.0 (chi è connesso non ferma il caricatore): non conta, e si può togliere");
    else { report.consenti = [...new Set(c)]; report.avvisi.push("opzioni: «consenti» non serve più dalla 1.12.0 (chi è connesso non ferma il caricatore): non conta, e si può togliere"); }
  }
  return !report.problemi.length;
}

/** Legge i dati, controlla l'impronta dei byte e li interpreta come JSON; null se non va. */
export async function leggiDati(opzioni, report) {
  let buf;
  try {
    if ( opzioni.testo !== undefined ) buf = new TextEncoder().encode(opzioni.testo).buffer;
    else {
      const r = await fetch(`${rotta(opzioni.file)}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      if ( !r.ok ) { report.problemi.push(`dati: ${opzioni.file} non letto (HTTP ${r.status})`); return null; }
      buf = await r.arrayBuffer();
    }
  } catch(err) { report.problemi.push(`dati: ${opzioni.file ?? "testo"} non letto: ${err.message}`); return null; }
  const sha = await sha256(buf);
  report.dati = { fonte: opzioni.file ?? "testo", byte: buf.byteLength, sha256: sha };
  if ( sha !== opzioni.sha256 ) { report.problemi.push(`dati: SHA-256 ${sha}, atteso ${opzioni.sha256}`); return null; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buf)); }
  catch(err) { report.problemi.push(`dati: non sono un JSON valido in UTF-8: ${err.message}`); return null; }
}

/** Scarica un file del mondo e controlla la sua impronta; restituisce il motivo se non torna, null se torna. */
export async function controllaFile(percorso, atteso) {
  try {
    const r = await fetch(`${rotta(percorso)}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
    if ( !r.ok ) return `HTTP ${r.status}`;
    const sha = await sha256(await r.arrayBuffer());
    return (sha === atteso) ? null : `SHA-256 ${sha}, atteso ${atteso}`;
  } catch(err) { return err.message; }
}

/** Un file servito da Foundry (un'icona di Foundry, «icons/…»): c'è? Il motivo se non c'è, null se c'è. */
export async function esisteFile(percorso) {
  try {
    const r = await fetch(`${rotta(percorso)}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
    return r.ok ? null : `HTTP ${r.status}`;
  } catch(err) { return err.message; }
}

// --- le guardie --------------------------------------------------------------------------------------------------------------------
/** Chi lancia, il mondo, le versioni, chi altro è connesso. */
export function guardie(report, opzioni, dati) {
  const L = CONST.USER_ROLES;
  if ( (game.user.name !== opzioni.utente) || (game.user.role !== L.GAMEMASTER) ) report.problemi.push(`utente: lancia «${game.user.name}» (ruolo ${game.user.role}); serve «${opzioni.utente}», l'utente dell'ingresso, col ruolo Gamemaster pieno`);
  if ( game.world.id !== dati.mondo ) report.problemi.push(`mondo: aperto «${game.world.id}», i dati sono per «${dati.mondo}»`);
  if ( game.version !== VERIFICATO.core ) report.problemi.push(`Foundry ${game.version}: il caricatore è verificato sulla ${VERIFICATO.core}; dopo un aggiornamento si riverifica con la prova a vuoto sui carichi già fatti (README, «Le regole fisse», 7)`);
  if ( (game.system.id !== VERIFICATO.sistema) || (game.system.version !== VERIFICATO.sistemaVersione) ) report.problemi.push(`sistema ${game.system.id} ${game.system.version}: il caricatore è verificato su ${VERIFICATO.sistema} ${VERIFICATO.sistemaVersione}`);
  // chi altro è connesso non ferma il caricatore: nessuna presenza è un impedimento tecnico, perché il caricatore si ferma già se un
  // documento cambia fra la prova e la scrittura (la firma, la fotografia del mondo, lo stato di ogni documento). I due rischi che il
  // caricatore non vede sono scritti nell'avviso
  const altri = game.users.filter(u => u.active && (u.id !== game.user.id));
  if ( altri.length ) {
    const nomi = altri.map(u => `${u.name}${u.isGM ? ` (GM${dati.campagna.ammessi.includes(u.name) ? ", ammesso" : ""})` : ""}`);
    const giocatrici = altri.some(u => !u.isGM), gm = altri.some(u => u.isGM);
    report.avvisi.push(`connessi anche: ${nomi.join(", ")}. Non fermano il caricatore${giocatrici ? "; una giocatrice connessa vede subito quello che i dati le rendono visibile (pagine, note della scena, attori), e se il carico si ferma a metà vede uno stato a metà" : ""}${gm ? "; un GM con un documento aperto in modifica (una pagina, una scheda, una configurazione), se poi salva, riporta indietro quello che scrive il caricatore: va chiuso prima di «applica»" : ""}`);
  }
}

// --- scrittura controllata ---------------------------------------------------------------------------------------------------------
/**
 * Una scrittura conta come fatta solo se Foundry restituisce i documenti attesi (con gli id attesi, se dati).
 * @returns il risultato, o null (l'errore è nel rapporto)
 */
export async function scrivi(report, voce, fn, idAttesi = null) {
  try {
    const r = await fn();
    const docs = Array.isArray(r) ? r : (r ? [r] : []);
    if ( !docs.length ) { report.errori.push(`${voce}: Foundry non ha restituito niente`); return null; }
    if ( idAttesi ) {
      const ids = docs.map(d => d?.id ?? d?._id);
      if ( (ids.length !== idAttesi.length) || idAttesi.some((id, i) => ids[i] !== id) ) {
        report.errori.push(`${voce}: Foundry ha restituito ${ids.length} documenti (${ids.join(", ")}), attesi ${idAttesi.length} (${idAttesi.join(", ")})`);
        return null;
      }
    }
    report.scritto.push(voce);
    return r;
  } catch(err) { report.errori.push(`${voce}: ${err.message}`); return null; }
}

// --- il blocco fra le schede dello stesso browser ------------------------------------------------------------------------------------
/**
 * Esegue fn col blocco del caricatore. Le Web Locks valgono per tutte le schede dello stesso browser e dello stesso indirizzo:
 * due schede dello stesso browser non scrivono insieme. Le Web Locks ci sono solo in un contesto sicuro: su un indirizzo http senza
 * TLS mancano, e resta un blocco per scheda, con un avviso nel rapporto; fra le schede, e fra i browser, vale il blocco del mondo
 * (prendiBlocco), che il caricatore prende sempre prima di scrivere.
 * @returns true se fn è partita, false se il blocco era preso
 */
export async function colBlocco(fn, report = null) {
  const nome = `${MODULO}-carica`;
  if ( globalThis.navigator?.locks?.request ) {
    let partita = false;
    await navigator.locks.request(nome, { ifAvailable: true }, async blocco => {
      if ( !blocco ) return;
      partita = true;
      await fn();
    });
    return partita;
  }
  report?.avvisi.push("il browser non dà le Web Locks (la pagina non è un contesto sicuro): il blocco fra le schede vale solo per questa; vale il blocco del mondo");
  if ( globalThis.gdrCaricoInCorso ) return false;
  globalThis.gdrCaricoInCorso = true;
  try { await fn(); } finally { globalThis.gdrCaricoInCorso = false; }
  return true;
}

// --- il rapporto in Data/ ------------------------------------------------------------------------------------------------------------
/** Salva il rapporto nella cartella dei rapporti e lo rilegge; il risultato va in report.salvato. */
export async function salvaRapporto(report, cartella, abbr) {
  try {
    const ora = new Date(), due = x => String(x).padStart(2, "0");
    const stamp = `${ora.getFullYear()}${due(ora.getMonth() + 1)}${due(ora.getDate())}-${due(ora.getHours())}${due(ora.getMinutes())}${due(ora.getSeconds())}${String(ora.getMilliseconds()).padStart(3, "0")}`;
    const nome = `${abbr}-carico-${report.carico}-rapporto-${stamp}.json`;
    report.salvato = `Data/${cartella}/${nome}`;                  // il percorso va anche nel file; se non va, sotto si sostituisce
    const testo = JSON.stringify(report);
    const FP = foundry.applications.apps.FilePicker.implementation;
    const up = await FP.upload("data", cartella, new File([testo], nome, { type: "application/json" }), {}, { notify: false });
    const percorso = String(up?.path ?? "").replace(/^\/+/, "");
    const url = /^https?:/.test(percorso) ? percorso : rotta(percorso);
    const riletto = percorso ? await fetch(`${url}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(60000) }).then(r => r.ok ? r.text() : null) : null;
    report.salvato = (riletto === testo) ? `Data/${percorso}` : `non salvato, o riletto diverso (${percorso || "nessun percorso"})`;
  } catch(err) { report.salvato = `non salvato: ${err.message}`; }
}

// --- il registro dei documenti scritti e il blocco nel mondo ------------------------------------------------------------------------
// Due impostazioni di mondo del modulo, nascoste: il registro (per ogni carico, la chiave di ogni documento scritto, col suo tipo,
// il suo id e, per una pagina, il suo journal), così un documento tolto dal GM non si ricrea in silenzio; e il blocco del carico
// in corso, che vale per tutti i browser. Ogni client le riceve: nel registro ci sono solo impronte (del carico e dei documenti) e
// id; nel blocco, per i minuti del carico, il nome del carico e dell'utente (un nome di carico è senza spoiler, come un rif).
export const IMPOSTAZIONE_REGISTRO = "carichi";
export const IMPOSTAZIONE_BLOCCO = "caricoInCorso";
const SCADENZA_BLOCCO = 15 * 60 * 1000;                          // un blocco più vecchio di 15 minuti è di un carico interrotto

/** Registra le due impostazioni: si chiama all'avvio del modulo (main.mjs, init). */
export function registraImpostazioni() {
  game.settings.register(MODULO, IMPOSTAZIONE_REGISTRO, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULO, IMPOSTAZIONE_BLOCCO, { scope: "world", config: false, type: Object, default: {} });
}

const uguali = (a, b) => jsonStabile(a) === jsonStabile(b);

/** La chiave di un carico nel registro: un'impronta, non il nome. */
const chiaveCarico = async carico => (await sha256(`gdr-carico/registro/${carico}`)).slice(0, 24);

/** Il registro di un carico: chiave → { tipo, id, journal? }; null se non si legge. */
export async function leggiRegistro(carico) {
  const k = await chiaveCarico(carico);
  try { return foundry.utils.deepClone(game.settings.get(MODULO, IMPOSTAZIONE_REGISTRO)?.[k] ?? {}); } catch(err) { return null; }
}

/**
 * Aggiunge al registro del carico le voci date e ne toglie le chiavi in «togli»; il risultato va nel rapporto. Si chiama col blocco
 * del mondo preso: il registro è un oggetto solo per tutti i carichi, e due scritture insieme si perderebbero le voci.
 */
export async function aggiornaRegistro(report, carico, voci, togli = []) {
  if ( !voci.length && !togli.length ) return true;
  const k = await chiaveCarico(carico);
  // se il registro ha già tutto, non si scrive
  let tolti = togli.length;
  try {
    const ora = game.settings.get(MODULO, IMPOSTAZIONE_REGISTRO)?.[k] ?? {};
    if ( voci.every(v => uguali(ora[v.chiave], { tipo: v.tipo, id: v.id, ...(v.journal ? { journal: v.journal } : {}) })) && togli.every(c => !ora[c]) ) return true;
    tolti = togli.filter(c => ora[c]).length;                // nel rapporto solo quelle che c'erano
  } catch(err) { /* si prova a scrivere, e l'errore va nel rapporto */ }
  const r = await scrivi(report, `registro del caricatore: ${voci.length} documenti${tolti ? `, ${tolti} tolti` : ""}`, async () => {
    const tutto = foundry.utils.deepClone(game.settings.get(MODULO, IMPOSTAZIONE_REGISTRO) ?? {});
    const prima = jsonStabile(tutto[k] ?? {});
    tutto[k] ??= {};
    for ( const v of voci ) tutto[k][v.chiave] = { tipo: v.tipo, id: v.id, ...(v.journal ? { journal: v.journal } : {}) };
    for ( const c of togli ) delete tutto[k][c];
    if ( jsonStabile(tutto[k]) !== prima ) await game.settings.set(MODULO, IMPOSTAZIONE_REGISTRO, tutto);
    const ora = game.settings.get(MODULO, IMPOSTAZIONE_REGISTRO)?.[k] ?? {};
    return (voci.every(v => ora[v.chiave]?.id === v.id) && togli.every(c => !ora[c])) ? [ora] : null;
  });
  return !!r;
}

/**
 * Prende il blocco del mondo per il carico: lo scrive, aspetta, lo rilegge. Restituisce il gettone, o il motivo per cui non c'è.
 * Due utenti in browser diversi non scrivono insieme: la seconda trova il blocco della prima (o lo rilegge diverso dal suo).
 */
export async function prendiBlocco(carico) {
  const ora = Date.now();
  const b = game.settings.get(MODULO, IMPOSTAZIONE_BLOCCO) ?? {};
  if ( b.gettone && ((ora - (b.avvio ?? 0)) < SCADENZA_BLOCCO) ) return { motivo: `un altro carico è in corso nel mondo: «${b.carico}» di ${b.utente}, partito alle ${new Date(b.avvio).toLocaleTimeString()}` };
  const gettone = foundry.utils.randomID(16);
  await game.settings.set(MODULO, IMPOSTAZIONE_BLOCCO, { gettone, carico, utente: game.user.name, avvio: ora });
  await new Promise(r => setTimeout(r, 1500));
  const ri = game.settings.get(MODULO, IMPOSTAZIONE_BLOCCO) ?? {};
  if ( ri.gettone !== gettone ) return { motivo: `un altro carico ha preso il blocco del mondo insieme a questo: «${ri.carico}» di ${ri.utente}` };
  return { gettone, vecchio: b.gettone ? `blocco scaduto di «${b.carico}» (${b.utente}), lasciato da un carico interrotto` : null };
}

/** Lascia il blocco del mondo, se è ancora il suo. */
export async function lasciaBlocco(gettone) {
  try { if ( (game.settings.get(MODULO, IMPOSTAZIONE_BLOCCO) ?? {}).gettone === gettone ) await game.settings.set(MODULO, IMPOSTAZIONE_BLOCCO, {}); } catch(err) { /* il blocco scade da sé */ }
}
