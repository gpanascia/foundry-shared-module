/**
 * Il caricatore: il controllo dei dati delle scene (note, tasselli e disegni su una scena che c'è) e delle macro di una
 * riga. La forma del file, campo per campo; quello che dipende dal mondo (la scena, i livelli, le pagine delle note, le immagini, le
 * funzioni del modulo) lo controlla scene.mjs. I valori si normalizzano qui, nella forma in cui si confrontano col mondo.
 * Formato: docs/caricatore.md, «Le scene» e «Le macro».
 */
import { percorsoValido } from "./comune.mjs";

const ID = /^[A-Za-z0-9]{16}$/;
const SHA = /^[0-9a-f]{64}$/;
const COLORE = /^#[0-9a-fA-F]{6}$/;
const LIVELLO = /^[A-Za-z0-9]{16}$/;
export const ANCORE = ["centro", "sotto", "sopra", "sinistra", "destra"];
export const FORME = ["rettangolo", "ellisse", "poligono"];
// una macro è una riga sola, che chiama una funzione del modulo, con argomenti in JSON: la logica sta nel modulo, rivisto una volta.
// Due forme: quella breve, e quella delle macro dei mondi nel README, che col modulo spento dà il messaggio fisso MODULO_SPENTO
// invece dell'errore di Foundry. Gli argomenti sono sempre JSON (controllaMacro), e il resto della riga è fisso: niente altro codice.
export const MODULO_SPENTO = "Modulo «GDR · Strumenti comuni» non attivo o non caricato: attivalo in «Gestisci moduli», poi ricarica con Ctrl+F5.";
const BREVE = /^(?:await\s+)?game\.modules\.get\("gdr-strumenti"\)\.api\.([A-Za-z][A-Za-z0-9]*)\((.*)\);?$/;
const GUIDATA = new RegExp(`^return game\\.modules\\.get\\("gdr-strumenti"\\)\\?\\.api\\?\\.([A-Za-z][A-Za-z0-9]*)\\?\\.\\((.*)\\) \\?\\? ui\\.notifications\\.error\\(${
  JSON.stringify(MODULO_SPENTO).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\);?$`);
// come una RegExp: exec dà [riga, funzione, argomenti], o null
export const COMANDO = { exec: c => BREVE.exec(c) ?? GUIDATA.exec(c) };
export const DECISIONE = v => (typeof v === "string") && (v.trim().length >= 10) && /\b20\d\d-\d\d-\d\d\b/.test(v);

const oggetto = v => !!v && (typeof v === "object") && !Array.isArray(v);
const intero = (v, min, max) => Number.isInteger(v) && (v >= min) && (v <= max);
const numero = (v, min, max) => (typeof v === "number") && Number.isFinite(v) && (v >= min) && (v <= max);
const COORD = 100000;
const CHIAVI_VIETATE = ["__proto__", "constructor", "prototype"];
/** Tutte le chiavi e i testi di un valore JSON, a ogni livello: i flag del mondo li riceve anche chi gioca, come i testi. */
export const testiDi = v => (Array.isArray(v) ? v.flatMap(testiDi) : oggetto(v) ? Object.entries(v).flatMap(([k, z]) => [k, ...testiDi(z)]) : (typeof v === "string") ? [v] : []);
/** Una chiave che Foundry non scriverebbe così com'è (col punto la espande, «-=» toglie, «==» sostituisce) o che c'è già in ogni oggetto. */
const chiaveStorta = v => (Array.isArray(v) ? v.some(chiaveStorta) : oggetto(v) ? Object.entries(v).some(([k, z]) => k.includes(".") || k.startsWith("-=") || k.startsWith("==") || CHIAVI_VIETATE.includes(k) || (k in Object.prototype) || chiaveStorta(z)) : false);

/**
 * I campi di ogni genere: le chiavi dei dati che entrano in un campo (un campo si confronta e si scrive tutto insieme), e quelli
 * che valgono solo alla nascita. Un campo che i dati non danno non si tocca.
 */
export const CAMPI = Object.freeze({
  nota: { posizione: ["x", "y"], pagina: ["pagina"], testo: ["testo"], icona: ["icona"], tinta: ["tinta"], dimensioneIcona: ["dimensioneIcona"],
    dimensioneTesto: ["dimensioneTesto"], ancoraTesto: ["ancoraTesto"], ordine: ["ordine"] },
  tassello: { immagine: ["immagine"], area: ["x", "y", "larghezza", "altezza"], ordine: ["ordine"] },
  disegno: { area: ["x", "y", "forma"], testo: ["testo"], dimensioneTesto: ["dimensioneTesto"], coloreTesto: ["coloreTesto"], riempimento: ["riempimento"],
    bordo: ["bordo"], ordine: ["ordine"] }
});
const NASCITA = { nota: ["livello", "flagsMondo", "decisione"], tassello: ["livello", "visibile", "decisione", "bloccato", "flagsMondo"],
  disegno: ["livello", "visibile", "decisione", "bloccato", "flagsMondo"] };
const OBBLIGATORI = { nota: ["livello", "x", "y", "pagina", "icona"], tassello: ["livello", "x", "y", "larghezza", "altezza", "immagine"], disegno: ["livello", "x", "y", "forma"] };
const GENERE = { note: "nota", tasselli: "tassello", disegni: "disegno" };

/**
 * Una chiave dei dati, controllata e normalizzata; i problemi in P. Restituisce undefined se non va.
 * h: { P, file, usati, testoSemplice, parole }
 */
function valore(k, v, d, h, genere) {
  const no = msg => { h.P.push(`${d}: ${msg}`); return undefined; };
  switch ( k ) {
    // note e tasselli: interi, come li tiene Foundry; un disegno può avere coordinate frazionarie
    case "x": case "y": return ((genere === "disegno") ? numero(v, -COORD, COORD) : intero(v, -COORD, COORD)) ? v : no(`${k} deve essere un numero${genere === "disegno" ? "" : " intero"} (le coordinate di Foundry)`);
    case "larghezza": case "altezza": return numero(v, 1, COORD) ? v : no(`${k} deve essere un numero positivo`);
    case "ordine": return intero(v, -1e9, 1e9) ? v : no("ordine deve essere un numero intero");
    case "pagina": return ((typeof v === "string") && v.length && (v.length <= 120)) ? v : no("pagina deve essere il rif di una pagina o di un journal del file, carico/rif, o l'UUID di una pagina o di un journal");
    case "testo":
      if ( (typeof v !== "string") || (v.length > 500) || !h.testoSemplice(v) || (v !== v.trim()) ) return no("testo deve essere testo semplice, senza spazi in testa o in fondo (fino a 500 caratteri)");
      // il testo sta nei dati della scena, che riceve anche chi gioca: niente parole da DM, anche in una nota che porta a una pagina solo GM
      h.parole(v, d);
      return v;
    case "icona": case "immagine": {
      if ( !percorsoValido(v) || !/\.(webp|png|jpe?g|svg)$/i.test(v) ) return no(`${k} «${v}» non è un'immagine in Data/`);
      if ( !h.file.has(v) && !v.startsWith("icons/") ) return no(`${k} «${v}» deve essere elencata in file (le icone di Foundry, «icons/…», no)`);
      if ( h.file.has(v) ) h.usati.add(v);
      h.parole(v.replace(/[-_./]/g, " "), `${d}, file ${v}`);
      return v;
    }
    case "tinta": case "coloreTesto": return COLORE.test(v ?? "") ? v.toLowerCase() : no(`${k} deve essere un colore come «#ffffff»`);
    // i limiti di Foundry: fuori, Foundry rifiuterebbe il valore
    case "dimensioneIcona": return intero(v, 32, 512) ? v : no("dimensioneIcona deve essere un intero fra 32 e 512");
    case "dimensioneTesto": { const max = (genere === "nota") ? 128 : 256; return intero(v, 8, max) ? v : no(`dimensioneTesto deve essere un intero fra 8 e ${max}`); }
    case "ancoraTesto": return ANCORE.includes(v) ? v : no(`ancoraTesto «${v}» (${ANCORE.join(", ")})`);
    case "forma": {
      if ( !oggetto(v) || Object.keys(v).some(z => !["tipo", "larghezza", "altezza", "punti"].includes(z)) || !FORME.includes(v.tipo) ) return no(`forma deve dire { "tipo": ${FORME.map(f => `«${f}»`).join(", ")}, "larghezza", "altezza", "punti" }`);
      if ( !numero(v.larghezza, 0, COORD) || !numero(v.altezza, 0, COORD) ) return no("forma: larghezza e altezza devono essere numeri");
      const punti = v.punti ?? [];
      if ( !Array.isArray(punti) || (punti.length % 2) || (punti.length > 2000) || !punti.every(p => numero(p, -COORD, COORD)) ) return no("forma: punti deve essere un elenco pari di numeri (x1, y1, x2, y2, …)");
      if ( (v.tipo === "poligono") !== (punti.length >= 6) ) return no("forma: un poligono ha almeno tre punti, le altre forme nessuno");
      return { tipo: v.tipo, larghezza: v.larghezza, altezza: v.altezza, punti: [...punti] };
    }
    case "riempimento":
      if ( v === null ) return null;
      if ( !oggetto(v) || Object.keys(v).some(z => !["colore", "alpha"].includes(z)) || !COLORE.test(v.colore ?? "") || !numero(v.alpha, 0, 1) ) return no("riempimento deve essere null o { \"colore\": \"#…\", \"alpha\": 0-1 }");
      return { colore: v.colore.toLowerCase(), alpha: v.alpha };
    case "bordo":
      if ( v === null ) return null;
      if ( !oggetto(v) || Object.keys(v).some(z => !["colore", "spessore", "alpha"].includes(z)) || !COLORE.test(v.colore ?? "") || !intero(v.spessore, 1, 100) || !numero(v.alpha, 0, 1) ) return no("bordo deve essere null o { \"colore\": \"#…\", \"spessore\": 1-100, \"alpha\": 0-1 }");
      return { colore: v.colore.toLowerCase(), spessore: v.spessore, alpha: v.alpha };
    case "livello": return LIVELLO.test(v ?? "") ? v : no(`livello «${v}» deve essere l'id di un livello della scena (16 lettere e cifre)`);
    case "visibile": case "bloccato": return (typeof v === "boolean") ? v : no(`${k} deve essere true o false`);
    case "decisione": return DECISIONE(v) ? v.trim() : no("decisione deve essere la decisione del GM, con la data (AAAA-MM-GG)");
    case "flagsMondo": {
      if ( !oggetto(v) ) return no("flagsMondo deve essere un oggetto (i flag «world» dell'elemento)");
      const s = JSON.stringify(v);
      if ( s.length > 4000 ) return no("flagsMondo è più lungo di 4000 caratteri");
      if ( chiaveStorta(v) ) return no("flagsMondo: chiavi senza punti, senza «-=» o «==» in testa, e niente __proto__, constructor, prototype o altri nomi di ogni oggetto (toString…)");
      for ( const t of testiDi(v) ) h.parole(t, `${d}, flagsMondo`);
      return JSON.parse(s);
    }
  }
  return no(`campo «${k}» sconosciuto per ${genere}`);
}

const MEZZO = Symbol("a metà");
/** Il valore di un campo, dalle chiavi dei dati (o di «precedente»): undefined se non c'è, MEZZO se c'è solo in parte. */
function campoDa(genere, campo, o) {
  const chiavi = CAMPI[genere][campo];
  if ( chiavi.every(k => o[k] === undefined) ) return undefined;
  if ( chiavi.some(k => o[k] === undefined) ) return MEZZO;
  if ( chiavi.length === 1 ) return o[chiavi[0]];
  return Object.fromEntries(chiavi.map(k => [k, o[k]]));
}

/** I flag del mondo di una pagina (dati.mjs): gli stessi controlli di quelli di un elemento. undefined se non vanno (problema in h.P). */
export const controllaFlagsMondo = (v, d, h) => valore("flagsMondo", v, d, h, "pagina");

/**
 * Un'operazione «scena»: la scena per id, e dentro le note, i tasselli e i disegni.
 * h: { P, avvisi, campi, nuovoRif, nuovoId, file, usati, testoSemplice, parole, BERSAGLIO_ID, BERSAGLIO_PAGINA, BERSAGLIO_CARICO, RIF, carico }
 */
export function controllaScena(op, dove, h) {
  const P = h.P;
  const d0 = `${dove} (scena${op.nome ? ` «${op.nome}»` : ""})`;
  if ( !h.campi(op, ["op", "id", "nome", "note", "tasselli", "disegni"], d0, ["id"]) ) return null;
  if ( op.id === undefined ) return null;
  if ( !ID.test(op.id) ) { P.push(`${d0}: id «${op.id}» non valido (l'id della scena, 16 lettere e cifre)`); return null; }
  if ( (op.nome !== undefined) && ((typeof op.nome !== "string") || !op.nome || (op.nome.length > 255)) ) P.push(`${d0}: nome deve essere il nome della scena`);
  const S = { id: op.id, nome: op.nome ?? null, elementi: [] };
  for ( const lista of ["note", "tasselli", "disegni"] ) {
    if ( op[lista] === undefined ) continue;
    if ( !Array.isArray(op[lista]) || (op[lista].length > 500) ) { P.push(`${d0}: ${lista} deve essere un elenco (al massimo 500)`); continue; }
    const genere = GENERE[lista];
    op[lista].forEach((e, i) => {
      const d = `${d0}, ${genere} ${i + 1}${e?.rif ? ` («${e.rif}»)` : ""}`;
      const chiaviDati = [...new Set(Object.values(CAMPI[genere]).flat())];
      if ( !h.campi(e, ["rif", "id", ...chiaviDati, ...NASCITA[genere], "precedente", "aggiorna", "ricrea", "accetta"], d, ["rif"]) ) return;
      if ( (e.ricrea !== undefined) && (e.ricrea !== true) ) P.push(`${d}: ricrea, se c'è, vale true`);
      if ( (e.aggiorna !== undefined) && (typeof e.aggiorna !== "boolean") ) P.push(`${d}: aggiorna deve essere true o false`);
      if ( (e.accetta !== undefined) && !SHA.test(e.accetta ?? "") ) P.push(`${d}: accetta deve essere l'impronta dell'elemento nel mondo, come la dà la prova (64 cifre esadecimali)`);
      // senza «id» l'elemento lo crea questo carico (adesso o in un giro di prima): i dati lo dicono tutto
      if ( e.id === undefined ) for ( const k of OBBLIGATORI[genere] ) if ( e[k] === undefined ) P.push(`${d}: manca «${k}» (un elemento senza «id» lo crea il caricatore)`);
      const v = {};
      for ( const k of [...chiaviDati, ...NASCITA[genere]] ) if ( e[k] !== undefined ) { const z = valore(k, e[k], d, h, genere); if ( z !== undefined ) v[k] = z; }
      const x = { genere, rif: e.rif, id: h.nuovoId(e.id, d), scena: op.id, campi: {}, precedente: null, nascita: {}, aggiorna: e.aggiorna !== false,
        ricrea: e.ricrea === true, accetta: e.accetta ?? null, decisione: v.decisione ?? null, flagsPrima: null };
      for ( const c of Object.keys(CAMPI[genere]) ) {
        const z = campoDa(genere, c, e);
        if ( z === MEZZO ) { P.push(`${d}: ${CAMPI[genere][c].join(", ")} vanno insieme`); continue; }
        // sui valori normalizzati: se una chiave non va, il problema è già in P
        const n = (z === undefined) ? undefined : campoDa(genere, c, v);
        if ( (n !== undefined) && (n !== MEZZO) ) x.campi[c] = n;
      }
      for ( const k of NASCITA[genere] ) if ( v[k] !== undefined ) x.nascita[k] = v[k];
      // un flag a null toglierebbe il flag (o ne scriverebbe uno vuoto): il caricatore non toglie flag
      const nulli = Object.keys(x.nascita.flagsMondo ?? {}).filter(f => x.nascita.flagsMondo[f] === null);
      if ( nulli.length ) P.push(`${d}: flagsMondo ${nulli.join(", ")} null: il caricatore non toglie flag`);
      if ( (genere !== "nota") && (x.nascita.visibile === true) && !x.decisione ) P.push(`${d}: visibile alla nascita vuole la decisione del GM, con la data`);
      if ( (genere !== "nota") && x.decisione && (x.nascita.visibile !== true) ) P.push(`${d}: decisione senza una visibilità da giustificare`);
      // i flag del mondo di un elemento che c'è: li guarda il piano, flag per flag, col mondo (scene.mjs)
      const soloNascita = Object.keys(x.nascita).filter(k => ["livello", "visibile", "bloccato"].includes(k));
      if ( (e.id !== undefined) && soloNascita.length ) h.avvisi.push(`${d}: ${soloNascita.join(", ")} valgono solo alla nascita, e l'elemento c'è già (ha l'id): non si cambiano`);
      if ( (genere === "nota") && x.campi.pagina ) {
        const b = x.campi.pagina;
        if ( h.RIF.test(b) ) h.daRisolvere.push({ rif: b, d });
        else if ( h.BERSAGLIO_CARICO.test(b) ) { if ( b.startsWith(`${h.carico}/`) ) P.push(`${d}: un documento di questo carico si scrive col suo rif`); }
        else if ( !h.BERSAGLIO_PAGINA.test(b) && !/^JournalEntry\.[A-Za-z0-9]{16}$/.test(b) ) P.push(`${d}: pagina «${b}» non riconosciuta (rif, carico/rif, JournalEntry.id o l'UUID di una pagina)`);
      }
      if ( e.precedente !== undefined ) {
        if ( e.id === undefined ) P.push(`${d}: precedente vale solo per un elemento che c'è già, dato col suo id`);
        else if ( h.campi(e.precedente, [...chiaviDati, "flagsMondo"], `${d}, precedente`) ) {
          const pv = {};
          for ( const [k, z] of Object.entries(e.precedente) ) {
            // i flag del mondo di prima: ogni flag da correggere, com'è adesso nel mondo, e nei dati, in «flagsMondo», come deve diventare.
            // null: un flag che non c'era
            if ( k === "flagsMondo" ) {
              if ( !oggetto(z) || !Object.keys(z).length ) { P.push(`${d}, precedente: flagsMondo deve essere un oggetto, coi flag del mondo da correggere com'erano`); continue; }
              const sp = JSON.stringify(z);
              if ( (sp.length > 4000) || chiaveStorta(z) ) { P.push(`${d}, precedente: flagsMondo non valido (fino a 4000 caratteri, chiavi come in flagsMondo)`); continue; }
              const fuori = Object.keys(z).filter(f => !Object.hasOwn(x.nascita.flagsMondo ?? {}, f));
              if ( fuori.length ) { P.push(`${d}, precedente: i flag ${fuori.join(", ")} non sono in flagsMondo, che dice come devono diventare`); continue; }
              const uguale = Object.keys(z).filter(f => JSON.stringify(z[f]) === JSON.stringify(x.nascita.flagsMondo[f]));
              if ( uguale.length ) { P.push(`${d}, precedente: i flag ${uguale.join(", ")} sono uguali in flagsMondo: niente da correggere`); continue; }
              x.flagsPrima = JSON.parse(sp);
              continue;
            }
            // l'icona o l'immagine di prima non va elencata in file: c'era
            if ( ["icona", "immagine"].includes(k) ) { if ( percorsoValido(z) ) pv[k] = z; else P.push(`${d}, precedente: ${k} non è un percorso valido`); continue; }
            if ( k === "pagina" ) { if ( (z === null) || h.BERSAGLIO_PAGINA.test(z ?? "") || /^JournalEntry\.[A-Za-z0-9]{16}$/.test(z ?? "") ) pv[k] = z; else P.push(`${d}, precedente: pagina è l'UUID di prima (una pagina o un journal), o null`); continue; }
            if ( k === "testo" ) { if ( typeof z === "string" ) pv[k] = z; else P.push(`${d}, precedente: testo deve essere un testo`); continue; }
            const n = valore(k, z, `${d}, precedente`, { ...h, parole: () => {} }, genere);
            if ( n !== undefined ) pv[k] = n;
          }
          x.precedente = {};
          for ( const c of Object.keys(CAMPI[genere]) ) {
            const z = campoDa(genere, c, pv);
            if ( z === MEZZO ) P.push(`${d}, precedente: ${CAMPI[genere][c].join(", ")} vanno insieme (o una non va)`);
            else if ( z !== undefined ) x.precedente[c] = z;
          }
        }
      }
      if ( h.nuovoRif(e.rif, d, genere, x) ) S.elementi.push(x);
    });
  }
  if ( !S.elementi.length ) h.avvisi.push(`${d0}: nessun elemento`);
  return S;
}

/** Un'operazione «macro»: una riga sola, che chiama una funzione del modulo. h come sopra, con cartellaDi e nomeValido. */
export function controllaMacro(op, dove, h) {
  const P = h.P;
  const d = `${dove} (macro «${op.nome}»)`;
  if ( !h.campi(op, ["op", "rif", "nome", "id", "cartella", "comando", "img", "precedente", "aggiorna", "ricrea", "accetta"], d, ["rif", "nome", "cartella", "comando"]) ) return null;
  if ( (op.ricrea !== undefined) && (op.ricrea !== true) ) P.push(`${d}: ricrea, se c'è, vale true`);
  if ( (op.aggiorna !== undefined) && (typeof op.aggiorna !== "boolean") ) P.push(`${d}: aggiorna deve essere true o false`);
  if ( (op.accetta !== undefined) && !SHA.test(op.accetta ?? "") ) P.push(`${d}: accetta deve essere l'impronta della macro nel mondo, come la dà la prova (64 cifre esadecimali)`);
  if ( !h.nomeValido(op.nome) || !h.testoSemplice(op.nome) ) P.push(`${d}: nome non valido`);
  const comando = c => {
    if ( (typeof c !== "string") || /[\r\n]/.test(c) || (c.length > 2000) ) return "deve essere una riga sola (fino a 2000 caratteri)";
    const m = COMANDO.exec(c.trim());
    if ( !m ) return "deve chiamare una funzione del modulo: game.modules.get(\"gdr-strumenti\").api.nome(argomenti in JSON), o nella forma col messaggio delle macro dei mondi (README del modulo, «Le macro dei mondi»)";
    if ( m[1] === "carica" ) return "una macro non lancia il caricatore";
    let args;
    try { args = JSON.parse(`[${m[2]}]`); } catch(err) { return `gli argomenti devono essere JSON: ${err.message}`; }
    // in JavaScript «__proto__» in un oggetto letterale non è una chiave come in JSON: non si usa
    if ( chiaveStorta(args) ) return "gli argomenti non usano chiavi con punti, «-=», «==», __proto__, constructor, prototype o altri nomi di ogni oggetto";
    return null;
  };
  const no = comando(op.comando);
  if ( no ) P.push(`${d}: comando ${no}`);
  if ( op.img !== undefined ) {
    if ( !percorsoValido(op.img) || (!h.file.has(op.img) && !op.img.startsWith("icons/")) ) P.push(`${d}: img «${op.img}» deve essere elencata in file, o un'icona di Foundry («icons/…»)`);
    else if ( h.file.has(op.img) ) h.usati.add(op.img);
  }
  const x = { rif: op.rif, nome: op.nome, id: h.nuovoId(op.id, d), cartella: h.cartellaDi(op.cartella, "Macro", `${d}, cartella`),
    campi: { nome: op.nome, comando: (typeof op.comando === "string") ? op.comando.trim() : op.comando, ...(op.img !== undefined ? { img: op.img } : {}) },
    precedente: null, aggiorna: op.aggiorna !== false, ricrea: op.ricrea === true, accetta: op.accetta ?? null };
  if ( op.precedente !== undefined ) {
    if ( op.id === undefined ) P.push(`${d}: precedente vale solo per una macro che c'è già, data col suo id`);
    else if ( h.campi(op.precedente, ["nome", "comando", "img"], `${d}, precedente`) ) {
      for ( const k of ["nome", "comando", "img"] ) if ( (op.precedente[k] !== undefined) && (typeof op.precedente[k] !== "string") ) P.push(`${d}, precedente: ${k} deve essere un testo`);
      x.precedente = { ...op.precedente, ...(typeof op.precedente.comando === "string" ? { comando: op.precedente.comando.trim() } : {}) };
    }
  }
  return h.nuovoRif(op.rif, d, "macro", x) ? x : null;
}
