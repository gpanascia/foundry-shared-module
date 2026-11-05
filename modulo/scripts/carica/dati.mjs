/**
 * Il caricatore, il controllo dei dati: la forma del file, campo per campo, con l'elenco chiuso delle operazioni e dei campi, i
 * parametri della campagna, i riferimenti fra documenti, l'HTML di ogni pagina e le regole fisse che si vedono già nei dati.
 * Formato: docs/caricatore.md, «Il file di dati».
 *
 * Non chiama Foundry (l'HTML lo legge con DOMParser): si prova anche fuori dal mondo. Quello che dipende dal mondo (i documenti che
 * ci sono già, i bersagli dei collegamenti per id, le immagini) lo controlla journal.mjs.
 */
import { FORMATO, percorsoValido } from "./comune.mjs";
import { controllaHtml, controllaPerProprietarie, paroleTrovate, contieneNome, testoPiano } from "./html.mjs";
import { controllaScena, controllaMacro, testiDi, controllaFlagsMondo } from "./dati-scene.mjs";
import { controllaDaParte } from "./da-parte.mjs";

const RIF = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CARICO = /^[a-z0-9][a-z0-9-]{2,59}$/;
const ID = /^[A-Za-z0-9]{16}$/;
const SHA = /^[0-9a-f]{64}$/;
const TIPI_CARTELLA = ["JournalEntry", "Actor", "RollTable", "Item", "Scene", "Macro"];
const OPERAZIONI = ["cartella", "journal", "tabella", "attore", "scena", "macro", "daParte"]; // cartelle e journal; Roll Table e attori; scene e macro; i documenti da mettere da parte
const VISIBILITA = ["nessuna", "osservatore", "proprietarie"];
export const BERSAGLIO_ID = /^(JournalEntry|Actor|Item|RollTable|Macro)\.([A-Za-z0-9]{16})$/;
export const BERSAGLIO_PAGINA = /^JournalEntry\.([A-Za-z0-9]{16})\.JournalEntryPage\.([A-Za-z0-9]{16})$/;
export const BERSAGLIO_CARICO = /^([a-z0-9][a-z0-9-]{2,59})\/([a-z0-9][a-z0-9-]{0,79})$/;

const PACCO = /^[a-z0-9][a-z0-9_-]*\.[a-z0-9][a-z0-9_-]*$/i;
const FORMULA = /^([1-9]\d?)?d([1-9]\d{0,2})$/;                         // un tiro solo, «1d12», «d20», «2d6»
const TAGLIE = ["tiny", "sm", "med", "lg", "huge", "grg"];
const ABILITA = ["acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv", "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"];
// il testo di una voce di Roll Table e il nome di un attore sono testo semplice: niente codice, niente comandi di Foundry
const testoSemplice = v => (typeof v === "string") && !/[<>]|@[A-Za-z]+\[|\[\[|&[A-Za-z]+\[/.test(v);

const oggetto = v => !!v && (typeof v === "object") && !Array.isArray(v);
const nomeValido = v => (typeof v === "string") && (v.trim() === v) && (v.length >= 1) && (v.length <= 255) && !/[\u0000-\u001f]/.test(v);

/**
 * Controlla i dati e li restituisce in forma normalizzata, o null se hanno problemi (nel rapporto).
 * @param {*} g  i dati come letti dal JSON
 * @param {object} report
 */
export function controllaDati(g, report) {
  const P = report.problemi;
  const campi = (o, ammessi, dove, obbligatori = []) => {
    if ( !oggetto(o) ) { P.push(`${dove}: serve un oggetto`); return false; }
    for ( const k of Object.keys(o) ) if ( !ammessi.includes(k) ) P.push(`${dove}: campo sconosciuto «${k}»`);
    for ( const k of obbligatori ) if ( o[k] === undefined ) P.push(`${dove}: manca «${k}»`);
    return true;
  };
  if ( !campi(g, ["formato", "carico", "titolo", "mondo", "generato", "campagna", "file", "operazioni"], "dati", ["formato", "carico", "titolo", "mondo", "generato", "campagna", "file", "operazioni"]) ) return null;
  if ( g.formato !== FORMATO ) { P.push(`dati: formato «${g.formato}», il caricatore conosce «${FORMATO}»`); return null; }
  if ( !CARICO.test(g.carico ?? "") ) P.push(`dati: carico «${g.carico}» non valido (minuscole, cifre e trattini, 3-60)`);
  if ( (typeof g.titolo !== "string") || !g.titolo || (g.titolo.length > 200) ) P.push("dati: titolo mancante o più lungo di 200 caratteri");
  if ( !/^[a-z0-9][a-z0-9-]{0,63}$/.test(g.mondo ?? "") ) P.push(`dati: mondo «${g.mondo}» non valido`);
  if ( campi(g.generato, ["da", "commit", "il"], "dati, generato", ["da", "commit", "il"]) ) {
    for ( const k of ["da", "commit", "il"] ) if ( (typeof g.generato[k] !== "string") || !g.generato[k] || (g.generato[k].length > 300) ) P.push(`dati, generato: «${k}» deve essere un testo`);
  }
  report.carico = CARICO.test(g.carico ?? "") ? g.carico : null;
  report.titolo = (typeof g.titolo === "string") ? g.titolo.slice(0, 200) : null;

  // --- i parametri della campagna -------------------------------------------------------------------------------------------------
  const campagna = { abbr: null, suffissoSoloGM: null, riquadroDM: null, classi: [], paroleDM: [], ammessi: [], cartellaRapporti: null };
  const c = g.campagna;
  if ( campi(c, Object.keys(campagna), "campagna", Object.keys(campagna)) ) {
    if ( /^[a-z]{2,6}$/.test(c.abbr ?? "") ) campagna.abbr = c.abbr; else P.push(`campagna: abbr «${c.abbr}» non valida (2-6 minuscole)`);
    if ( (typeof c.suffissoSoloGM === "string") && /^\([^()]{1,30}\)$/.test(c.suffissoSoloGM) ) campagna.suffissoSoloGM = c.suffissoSoloGM;
    else P.push(`campagna: suffissoSoloGM «${c.suffissoSoloGM}» non valido (fra parentesi, come «(solo GM)»)`);
    if ( (typeof c.riquadroDM === "string") && (c.riquadroDM.trim().length >= 3) && (c.riquadroDM.length <= 60) ) campagna.riquadroDM = c.riquadroDM.trim();
    else P.push("campagna: riquadroDM deve essere il titolo del riquadro per il DM (3-60 caratteri)");
    if ( Array.isArray(c.classi) && (c.classi.length <= 20) && c.classi.every(x => /^[a-z][a-z0-9-]{0,40}$/.test(x ?? "")) ) campagna.classi = [...new Set(c.classi)];
    else P.push("campagna: classi deve essere un elenco di nomi di classe (minuscole, cifre e trattini), al massimo 20");
    if ( Array.isArray(c.paroleDM) && (c.paroleDM.length >= 1) && (c.paroleDM.length <= 50) ) {
      for ( const s of c.paroleDM ) {
        if ( (typeof s !== "string") || !s || (s.length > 200) ) { P.push("campagna: paroleDM, ogni voce è un'espressione regolare come testo (1-200 caratteri)"); continue; }
        try { campagna.paroleDM.push(new RegExp(s, "iu")); } catch(err) { P.push(`campagna: paroleDM «${s}» non è un'espressione regolare valida: ${err.message}`); }
      }
    } else P.push("campagna: paroleDM deve essere un elenco di 1-50 espressioni regolari");
    if ( Array.isArray(c.ammessi) && (c.ammessi.length <= 10) && c.ammessi.every(nomeValido) ) campagna.ammessi = [...new Set(c.ammessi)];
    else P.push("campagna: ammessi deve essere un elenco di nomi di utenti GM (al massimo 10)");
    if ( percorsoValido(c.cartellaRapporti) ) campagna.cartellaRapporti = c.cartellaRapporti;
    else P.push(`campagna: cartellaRapporti «${c.cartellaRapporti}» non è un percorso di Data/ valido`);
  }
  if ( campagna.abbr && report.carico && !report.carico.startsWith(`${campagna.abbr}-`) ) P.push(`dati: il carico «${report.carico}» deve cominciare con «${campagna.abbr}-», l'abbreviazione della campagna: nello stesso mondo stanno più campagne`);
  const suff = campagna.suffissoSoloGM;
  // il suffisso senza distinzione fra maiuscole e minuscole: «(Solo GM)» è una pagina solo GM come «(solo GM)»
  const soloGM = nome => !!suff && (typeof nome === "string") && nome.toLowerCase().endsWith(suff.toLowerCase());
  const opzHtml = { classi: campagna.classi, riquadroDM: campagna.riquadroDM ?? "", paroleDM: campagna.paroleDM };
  const parole = (testo, dove) => { const t = paroleTrovate(testo, campagna.paroleDM); if ( t.length ) P.push(`${dove}: parole da DM nel nome, che le giocatrici leggono: ${t.join(", ")}`); };

  // --- i file ------------------------------------------------------------------------------------------------------------------------
  const file = new Map();
  if ( !Array.isArray(g.file) || (g.file.length > 500) ) P.push("dati: file deve essere un elenco (al massimo 500)");
  else g.file.forEach((f, i) => {
    const dove = `file ${i + 1}`;
    if ( !campi(f, ["percorso", "sha256"], dove, ["percorso", "sha256"]) ) return;
    if ( !percorsoValido(f.percorso) || !/\.(webp|png|jpe?g)$/i.test(f.percorso) ) P.push(`${dove}: percorso «${f.percorso}» non valido (un'immagine in Data/)`);
    else if ( file.has(f.percorso) ) P.push(`${dove}: «${f.percorso}» ripetuto`);
    if ( !SHA.test(f.sha256 ?? "") ) P.push(`${dove}: sha256 non valido`);
    file.set(f.percorso, f.sha256);
  });
  const usati = new Set();

  // --- le operazioni -------------------------------------------------------------------------------------------------------------------
  const rif = new Map();                                             // rif → { genere, oggetto, journal? }
  const ids = new Set();
  const cartelle = [], journal = [], tabelle = [], attori = [], scene = [], macro = [], daParte = [];
  const nuovoRif = (r, dove, genere, ogg, extra = {}) => {
    if ( !RIF.test(r ?? "") ) { P.push(`${dove}: rif «${r}» non valido (minuscole, cifre e trattini, fino a 80)`); return false; }
    if ( rif.has(r) ) { P.push(`${dove}: rif «${r}» già usato`); return false; }
    rif.set(r, { genere, oggetto: ogg, ...extra });
    return true;
  };
  const nuovoId = (id, dove) => {
    if ( id === undefined ) return null;
    if ( !ID.test(id ?? "") ) { P.push(`${dove}: id «${id}» non valido (16 lettere e cifre)`); return null; }
    if ( ids.has(id) ) { P.push(`${dove}: id «${id}» già usato da un altro documento del file`); return null; }
    ids.add(id);
    return id;
  };
  // una cartella: null, il rif di una cartella del file (già dichiarata, del tipo giusto), o { id }
  const cartellaDi = (v, tipo, dove) => {
    if ( v === null ) return null;
    if ( typeof v === "string" ) {
      const x = rif.get(v);
      if ( !x || (x.genere !== "cartella") ) { P.push(`${dove}: «${v}» non è il rif di una cartella dichiarata prima`); return undefined; }
      if ( x.oggetto.tipo !== tipo ) { P.push(`${dove}: la cartella «${v}» è di tipo ${x.oggetto.tipo}, serve ${tipo}`); return undefined; }
      return { rif: v };
    }
    if ( campi(v, ["id"], dove, ["id"]) && ID.test(v.id ?? "") ) return { id: v.id };
    P.push(`${dove}: serve null, il rif di una cartella del file o { "id": "…" }`);
    return undefined;
  };

  // --- una Roll Table (tappa 2): sempre solo GM, nasce a None; le voci sono testo semplice, la descrizione HTML ammesso ------------
  const tabella = (op, dove) => {
    const d = `${dove} (tabella «${op.nome}»)`;
    if ( !campi(op, ["op", "rif", "nome", "id", "cartella", "formula", "descrizione", "voci", "privata", "precedente", "aggiorna", "ricrea", "accetta"], d, ["rif", "nome", "cartella", "formula", "voci"]) ) return;
    if ( (op.ricrea !== undefined) && (op.ricrea !== true) ) P.push(`${d}: ricrea, se c'è, vale true`);
    if ( (op.aggiorna !== undefined) && (typeof op.aggiorna !== "boolean") ) P.push(`${d}: aggiorna deve essere true o false`);
    if ( (op.accetta !== undefined) && !SHA.test(op.accetta ?? "") ) P.push(`${d}: accetta deve essere l'impronta della tabella nel mondo, come la dà la prova (64 cifre esadecimali)`);
    if ( !nomeValido(op.nome) || !testoSemplice(op.nome) ) P.push(`${d}: nome non valido`); else parole(op.nome, d);
    const m = FORMULA.exec(op.formula ?? "");
    if ( !m ) P.push(`${d}: formula «${op.formula}» non ammessa (un tiro solo, come «1d12»)`);
    const lo = m ? Number(m[1] ?? 1) : 1, hi = m ? lo * Number(m[2]) : 1;
    const x = { rif: op.rif, nome: op.nome, id: nuovoId(op.id, d), cartella: cartellaDi(op.cartella, "RollTable", `${d}, cartella`), formula: op.formula,
      descrizione: "", voci: [], precedente: null, aggiorna: op.aggiorna !== false, ricrea: op.ricrea === true, accetta: op.accetta ?? null, privata: op.privata === true };
    if ( (op.privata !== undefined) && (typeof op.privata !== "boolean") ) P.push(`${d}: privata deve essere true o false`);
    // una tabella privata lo dice a chi la tira: il modo di tiro lo sceglie chi tira, in chat, non la tabella
    if ( (op.privata === true) && !/privat/i.test(testoPiano(op.descrizione ?? "")) ) report.avvisi.push(`${d}: è privata, e la descrizione non dice di tirarla in privato`);
    // le descrizioni: HTML ammesso, come in una pagina solo GM, senza immagini e senza collegamenti (una tabella si tira in chat)
    const html = (h, dh) => {
      if ( (typeof h !== "string") || (h.length > 200000) ) { P.push(`${dh}: deve essere un testo HTML (anche "")`); return ""; }
      const c = controllaHtml(h, { ...opzHtml, soloGM: true });
      for ( const q of c.problemi ) P.push(`${dh}: ${q}`);
      if ( c.immagini.length ) P.push(`${dh}: niente immagini nelle tabelle`);
      if ( c.collegamenti.length ) P.push(`${dh}: niente collegamenti nelle tabelle`);
      return h;
    };
    if ( op.descrizione !== undefined ) x.descrizione = html(op.descrizione, `${d}, descrizione`);
    if ( !Array.isArray(op.voci) || !op.voci.length || (op.voci.length > 200) ) P.push(`${d}: voci deve essere un elenco di 1-200 voci`);
    else {
      const coperti = new Map();
      op.voci.forEach((v, k) => {
        const dv = `${d}, voce ${k + 1}`;
        if ( !campi(v, ["da", "a", "testo", "descrizione"], dv, ["da", "a", "testo"]) ) return;
        if ( !Number.isInteger(v.da) || !Number.isInteger(v.a) || (v.da > v.a) || (v.da < lo) || (v.a > hi) ) { P.push(`${dv}: da ${v.da} a ${v.a} fuori dal tiro (${lo}-${hi})`); return; }
        if ( !testoSemplice(v.testo) || !v.testo.trim() || (v.testo !== v.testo.trim()) || (v.testo.length > 1000) ) P.push(`${dv}: testo deve essere testo semplice, senza codice e senza spazi in testa o in fondo (1-1000 caratteri)`);
        else { const t = paroleTrovate(v.testo, campagna.paroleDM); if ( t.length ) P.push(`${dv}: parole da DM nel testo della voce, che va in chat: ${t.join(", ")}`); }                                     // il testo di una voce va in chat, anche a un tiro a vista
        for ( let n = v.da; n <= v.a; n++ ) { if ( coperti.has(n) ) P.push(`${dv}: il ${n} è già della voce ${coperti.get(n)}`); coperti.set(n, k + 1); }
        x.voci.push({ da: v.da, a: v.a, testo: v.testo, descrizione: (v.descrizione === undefined) ? "" : html(v.descrizione, `${dv}, descrizione`) });
      });
      x.voci.sort((p, q) => p.da - q.da);                            // in ordine di tiro, come le legge il mondo
      const scoperti = []; if ( m ) for ( let n = lo; n <= hi; n++ ) if ( !coperti.has(n) ) scoperti.push(n);
      if ( scoperti.length ) report.avvisi.push(`${d}: il tiro ${op.formula} non ha una voce per ${scoperti.join(" ")}`);
    }
    if ( op.precedente !== undefined ) {
      if ( op.id === undefined ) P.push(`${d}: precedente vale solo per una tabella che c'è già, data col suo id`);
      if ( campi(op.precedente, ["nome", "formula", "descrizione", "voci"], `${d}, precedente`) ) {
        const pr = op.precedente;
        if ( (pr.voci !== undefined) && (!Array.isArray(pr.voci) || !pr.voci.every(v => oggetto(v) && Number.isInteger(v.da) && Number.isInteger(v.a) && (typeof v.testo === "string") && ((v.descrizione === undefined) || (typeof v.descrizione === "string")))) ) P.push(`${d}, precedente: voci come quelle dei dati`);
        for ( const k of ["nome", "formula", "descrizione"] ) if ( (pr[k] !== undefined) && (typeof pr[k] !== "string") ) P.push(`${d}, precedente: ${k} deve essere un testo`);
        x.precedente = JSON.parse(JSON.stringify(pr));
        if ( Array.isArray(x.precedente.voci) ) x.precedente.voci.sort((p, q) => p.da - q.da);
      }
    }
    if ( nuovoRif(op.rif, d, "tabella", x) ) tabelle.push(x);
  };

  // --- un attore dal compendio (tappa 2): nasce a None, dalle statistiche del compendio coi ritocchi del vocabolario chiuso -----------
  const attore = (op, dove) => {
    const d = `${dove} (attore «${op.nome}»)`;
    if ( !campi(op, ["op", "rif", "nome", "id", "cartella", "compendio", "srd", "nomeVero", "token", "img", "ritocchi", "compendioOggetti", "atteso", "precedente", "ricrea"], d,
      ["rif", "nome", "cartella", "compendio", "srd", "token"]) ) return;
    if ( (op.ricrea !== undefined) && (op.ricrea !== true) ) P.push(`${d}: ricrea, se c'è, vale true`);
    // il nome dell'attore lo leggono le giocatrici (token, chat): niente parole da DM; il nome vero sta solo nei dati dell'attore
    if ( !nomeValido(op.nome) || !testoSemplice(op.nome) ) P.push(`${d}: nome non valido`); else parole(op.nome, d);
    if ( (op.nomeVero !== undefined) && (!nomeValido(op.nomeVero) || !testoSemplice(op.nomeVero) || (op.nomeVero === op.nome)) ) P.push(`${d}: nomeVero non valido, o uguale al nome`);
    if ( !PACCO.test(op.compendio ?? "") ) P.push(`${d}: compendio «${op.compendio}» non valido (come «dnd5e.actors24»)`);
    if ( (typeof op.srd !== "string") || !op.srd || (op.srd.length > 200) ) P.push(`${d}: srd deve essere il nome della creatura nel compendio`);
    if ( !["uno", "molti"].includes(op.token) ) P.push(`${d}: token «${op.token}», ammessi «uno» (collegato all'attore) e «molti» (non collegato, numerato)`);
    if ( op.img !== undefined ) {
      if ( !percorsoValido(op.img) || !file.has(op.img) ) P.push(`${d}: img «${op.img}» deve essere un'immagine elencata in file`);
      else { usati.add(op.img); parole(op.img.replace(/[-_./]/g, " "), `${d}, file ${op.img}`); }
    }
    const r = { via: [], sostituisci: {}, rinomina: {}, taglia: null, abilita: [], vantaggio: [], senzaArmatura: false };
    if ( op.ritocchi !== undefined && campi(op.ritocchi, ["via", "sostituisci", "rinomina", "taglia", "abilita", "vantaggio", "senzaArmatura"], `${d}, ritocchi`) ) {
      const t = op.ritocchi, dr = `${d}, ritocchi`;
      const nomi = (v, k) => { if ( (v !== undefined) && (!Array.isArray(v) || !v.every(n => nomeValido(n))) ) { P.push(`${dr}: ${k} deve essere un elenco di nomi`); return []; } return [...new Set(v ?? [])]; };
      r.via = nomi(t.via, "via");
      if ( t.sostituisci !== undefined ) { if ( oggetto(t.sostituisci) && Object.entries(t.sostituisci).every(([a, b]) => nomeValido(a) && nomeValido(b)) ) r.sostituisci = { ...t.sostituisci }; else P.push(`${dr}: sostituisci deve dire { "oggetto di prima": "oggetto del compendio" }`); }
      if ( t.rinomina !== undefined ) {
        if ( oggetto(t.rinomina) && Object.entries(t.rinomina).every(([a, b]) => nomeValido(a) && oggetto(b) && nomeValido(b.nome) && Object.keys(b).every(k => ["nome", "img"].includes(k)) && ((b.img === undefined) || percorsoValido(b.img))) ) r.rinomina = JSON.parse(JSON.stringify(t.rinomina));
        else P.push(`${dr}: rinomina deve dire { "oggetto": { "nome": "…", "img": "icons/…" } } (img facoltativa)`);
      }
      if ( t.taglia !== undefined ) { if ( TAGLIE.includes(t.taglia) ) r.taglia = t.taglia; else P.push(`${dr}: taglia «${t.taglia}» (${TAGLIE.join(", ")})`); }
      r.abilita = nomi(t.abilita, "abilita"); r.vantaggio = nomi(t.vantaggio, "vantaggio");
      for ( const s of [...r.abilita, ...r.vantaggio] ) if ( !ABILITA.includes(s) ) P.push(`${dr}: abilità «${s}» (${ABILITA.join(", ")})`);
      if ( (t.senzaArmatura !== undefined) && (typeof t.senzaArmatura !== "boolean") ) P.push(`${dr}: senzaArmatura deve essere true o false`); else r.senzaArmatura = t.senzaArmatura === true;
      const tutti = [...r.via, ...Object.keys(r.sostituisci), ...Object.keys(r.rinomina)];
      if ( new Set(tutti).size !== tutti.length ) P.push(`${dr}: uno stesso oggetto in più ritocchi`);
    }
    if ( Object.keys(r.sostituisci).length && !PACCO.test(op.compendioOggetti ?? "") ) P.push(`${d}: con sostituisci serve compendioOggetti, il compendio degli oggetti (come «dnd5e.equipment24»)`);
    if ( (op.compendioOggetti !== undefined) && !Object.keys(r.sostituisci).length ) P.push(`${d}: compendioOggetti serve solo con sostituisci`);
    let atteso = null;
    if ( op.atteso !== undefined && campi(op.atteso, ["ca", "taglia", "abilita", "vantaggio", "armi"], `${d}, atteso`) ) {
      const a = op.atteso, da = `${d}, atteso`;
      atteso = {};
      if ( a.ca !== undefined ) { if ( Number.isInteger(a.ca) && (a.ca > 0) && (a.ca < 40) ) atteso.ca = a.ca; else P.push(`${da}: ca deve essere un numero intero`); }
      if ( a.taglia !== undefined ) { if ( TAGLIE.includes(a.taglia) ) atteso.taglia = a.taglia; else P.push(`${da}: taglia «${a.taglia}»`); }
      for ( const k of ["abilita", "vantaggio"] ) if ( a[k] !== undefined ) { if ( Array.isArray(a[k]) && a[k].every(s => ABILITA.includes(s)) ) atteso[k] = [...a[k]]; else P.push(`${da}: ${k} deve essere un elenco di abilità`); }
      if ( a.armi !== undefined ) {
        if ( oggetto(a.armi) && Object.entries(a.armi).every(([n, v]) => nomeValido(n) && Array.isArray(v) && (v.length === 2) && v.every(z => (typeof z === "string") && z)) ) atteso.armi = JSON.parse(JSON.stringify(a.armi));
        else P.push(`${da}: armi deve dire { "arma": ["+5", "1d4 + 3"] }`);
      }
    }
    let precedente = null;
    if ( op.precedente !== undefined ) {
      // il ritratto di prima vale solo per un attore dato col suo id; i nomi di prima anche per uno che il caricatore ritrova da sé
      if ( (op.id === undefined) && (op.precedente?.img !== undefined) ) P.push(`${d}: precedente con img vale solo per un attore che c'è già, dato col suo id`);
      // anche i nomi di prima («nome», e «nomeVero» se c'era), per rinominare un attore scritto da uno script di prima
      if ( campi(op.precedente, ["img", "nome", "nomeVero"], `${d}, precedente`) ) {
        const pr = op.precedente;
        if ( (pr.img === undefined) && (pr.nome === undefined) ) P.push(`${d}, precedente: serve img o nome`);
        if ( (pr.img !== undefined) && (typeof pr.img !== "string") ) P.push(`${d}, precedente: img deve essere un testo`);
        if ( (pr.nome !== undefined) && (!nomeValido(pr.nome) || !testoSemplice(pr.nome)) ) P.push(`${d}, precedente: nome non valido`);
        if ( (pr.nomeVero !== undefined) && ((pr.nome === undefined) || !nomeValido(pr.nomeVero) || !testoSemplice(pr.nomeVero)) ) P.push(`${d}, precedente: nomeVero non valido, o senza nome`);
        precedente = { ...(pr.img !== undefined ? { img: pr.img } : {}), ...(pr.nome !== undefined ? { nome: pr.nome, nomeVero: pr.nomeVero ?? null } : {}) };
      }
    }
    if ( r.senzaArmatura && (atteso?.ca === undefined) ) report.avvisi.push(`${d}: senzaArmatura senza «atteso.ca»: se il compendio dà la CA come valore fisso, togliere l'armatura non la cambia; la CA che deve uscire va nei dati`);
    const x = { rif: op.rif, nome: op.nome, id: nuovoId(op.id, d), cartella: cartellaDi(op.cartella, "Actor", `${d}, cartella`), compendio: op.compendio, srd: op.srd,
      nomeVero: op.nomeVero ?? null, token: op.token, img: op.img ?? null, ritocchi: r, compendioOggetti: op.compendioOggetti ?? null, atteso, precedente, ricrea: op.ricrea === true };
    if ( nuovoRif(op.rif, d, "attore", x) ) attori.push(x);
  };

  // le scene e le macro (tappa 3): la forma in dati-scene.mjs, con gli strumenti di qui
  const daRisolvere = [], sceneViste = new Set();
  const hScene = { P, avvisi: report.avvisi, campi, nuovoRif, nuovoId, cartellaDi, file, usati, testoSemplice, nomeValido, daRisolvere,
    parole: (t, d) => { const z = paroleTrovate(t, campagna.paroleDM); if ( z.length ) P.push(`${d}: parole da DM, che anche chi gioca riceve coi dati: ${z.join(", ")}`); },
    RIF, BERSAGLIO_ID, BERSAGLIO_PAGINA, BERSAGLIO_CARICO, carico: g.carico, uuidVisti: new Set() };
  if ( !Array.isArray(g.operazioni) || !g.operazioni.length || (g.operazioni.length > 500) ) { P.push("dati: operazioni deve essere un elenco di 1-500 operazioni"); return null; }
  g.operazioni.forEach((op, i) => {
    const dove = `operazione ${i + 1}`;
    if ( !oggetto(op) ) { P.push(`${dove}: serve un oggetto`); return; }
    if ( !OPERAZIONI.includes(op.op) ) { P.push(`${dove}: op «${op.op}» sconosciuta (${OPERAZIONI.join(", ")})`); return; }
    if ( op.op === "cartella" ) {
      const d = `${dove} (cartella «${op.nome}»)`;
      if ( !campi(op, ["op", "rif", "tipo", "nome", "padre", "id", "ricrea"], d, ["rif", "tipo", "nome", "padre"]) ) return;
      if ( (op.ricrea !== undefined) && (op.ricrea !== true) ) P.push(`${d}: ricrea, se c'è, vale true`);
      if ( !TIPI_CARTELLA.includes(op.tipo) ) P.push(`${d}: tipo «${op.tipo}» non ammesso (${TIPI_CARTELLA.join(", ")})`);
      if ( !nomeValido(op.nome) ) P.push(`${d}: nome non valido`); else parole(op.nome, d);
      const x = { rif: op.rif, tipo: op.tipo, nome: op.nome, padre: cartellaDi(op.padre, op.tipo, `${d}, padre`), id: nuovoId(op.id, d), ricrea: op.ricrea === true };
      if ( nuovoRif(op.rif, d, "cartella", x) ) cartelle.push(x);
      return;
    }
    if ( op.op === "tabella" ) { tabella(op, dove); return; }
    if ( op.op === "attore" ) { attore(op, dove); return; }
    if ( op.op === "scena" ) {
      if ( op.id && sceneViste.has(op.id) ) { P.push(`${dove}: la scena ${op.id} ha già un'operazione: una per scena`); return; }
      if ( op.id ) sceneViste.add(op.id);
      const x = controllaScena(op, dove, hScene);
      if ( x ) scene.push(x);
      return;
    }
    if ( op.op === "macro" ) { const x = controllaMacro(op, dove, hScene); if ( x ) macro.push(x); return; }
    if ( op.op === "daParte" ) { const x = controllaDaParte(op, dove, hScene); if ( x ) daParte.push(x); return; }
    // journal
    const d = `${dove} (journal «${op.nome}»)`;
    if ( !campi(op, ["op", "rif", "nome", "id", "cartella", "crea", "pagine", "ordine", "ricrea"], d, ["rif", "nome", "cartella", "pagine"]) ) return;
    if ( (op.ricrea !== undefined) && (op.ricrea !== true) ) P.push(`${d}: ricrea, se c'è, vale true`);
    if ( !nomeValido(op.nome) ) P.push(`${d}: nome non valido`);
    const jSoloGM = soloGM(op.nome);
    if ( !jSoloGM ) parole(op.nome ?? "", d);
    if ( (op.crea !== undefined) && (typeof op.crea !== "boolean") ) P.push(`${d}: crea deve essere true o false`);
    const J = { rif: op.rif, nome: op.nome, id: nuovoId(op.id, d), cartella: cartellaDi(op.cartella, "JournalEntry", `${d}, cartella`),
      crea: op.crea !== false, soloGM: jSoloGM, pagine: [], ordine: null, ricrea: op.ricrea === true };
    if ( !nuovoRif(op.rif, d, "journal", J) ) return;
    journal.push(J);
    if ( !Array.isArray(op.pagine) || (op.pagine.length > 500) ) { P.push(`${d}: pagine deve essere un elenco (al massimo 500)`); return; }
    op.pagine.forEach((p, k) => {
      const dp = `${d}, pagina ${k + 1} («${p?.nome}»)`;
      if ( !campi(p, ["rif", "nome", "id", "tipo", "livello", "html", "src", "didascalia", "visibilita", "decisione", "precedente", "aggiorna", "ricrea", "accetta", "flagsMondo", "nomeVero", "attori"], dp, ["rif", "nome", "tipo"]) ) return;
      if ( (p.ricrea !== undefined) && (p.ricrea !== true) ) P.push(`${dp}: ricrea, se c'è, vale true`);
      if ( (p.accetta !== undefined) && !SHA.test(p.accetta ?? "") ) P.push(`${dp}: accetta deve essere l'impronta del testo nel mondo, come la dà la prova (64 cifre esadecimali)`);
      if ( !nomeValido(p.nome) ) P.push(`${dp}: nome non valido`);
      const pSoloGM = jSoloGM || soloGM(p.nome);
      if ( !pSoloGM ) parole(p.nome ?? "", dp);
      const x = { rif: p.rif, nome: p.nome, id: nuovoId(p.id, dp), tipo: p.tipo, livello: p.livello ?? 1, html: null, src: null, didascalia: null,
        visibilita: { tipo: "nessuna" }, decisione: null, precedente: null, aggiorna: p.aggiorna !== false, soloGM: pSoloGM, controllo: null,
        ricrea: p.ricrea === true, accetta: p.accetta ?? null, flagsMondo: null, nomeVero: null, attori: null };
      // il nome vero: la pagina porta il nome che descrive il personaggio finché «Rivela il nome» non le dà quello vero, insieme
      // all'attore con gli stessi due nomi (README.md, «Il doppio nome»). Una pagina solo GM resta solo GM anche col nome vero
      if ( p.nomeVero !== undefined ) {
        if ( !nomeValido(p.nomeVero) || !testoSemplice(p.nomeVero) || (p.nomeVero === p.nome) ) P.push(`${dp}: nomeVero non valido, o uguale al nome`);
        else if ( !jSoloGM && (soloGM(p.nomeVero) !== soloGM(p.nome)) ) P.push(`${dp}: nomeVero e nome devono essere tutti e due solo GM, o nessuno dei due`);
        else { x.nomeVero = p.nomeVero; if ( !pSoloGM ) parole(p.nomeVero, `${dp}, nomeVero`); }
      }
      // gli attori che la pagina segue (per esempio la voce di una coppia): prende il nome vero quando li sanno tutti
      if ( p.attori !== undefined ) {
        const ok = Array.isArray(p.attori) && p.attori.length && (p.attori.length <= 10) && p.attori.every(a => oggetto(a) && campi(a, ["nome", "nomeVero"], `${dp}, attori`, ["nome", "nomeVero"])
          && nomeValido(a.nome) && nomeValido(a.nomeVero) && testoSemplice(a.nome) && testoSemplice(a.nomeVero) && (a.nome !== a.nomeVero));
        if ( !ok ) P.push(`${dp}: attori deve essere un elenco (da 1 a 10) di { "nome", "nomeVero" } diversi fra loro`);
        else if ( !p.nomeVero ) P.push(`${dp}: attori vale solo con nomeVero, il nome vero della pagina`);
        else if ( new Set(p.attori.map(a => a.nome)).size !== p.attori.length ) P.push(`${dp}: attori ripetuti`);
        else x.attori = p.attori.map(a => ({ aspetto: a.nome, vero: a.nomeVero }));
      }
      // i flag del mondo (tappa 3, per gli strumenti del mondo come «Scopri»): alla nascita, e su una pagina che c'è solo quelli che mancano
      if ( p.flagsMondo !== undefined ) x.flagsMondo = controllaFlagsMondo(p.flagsMondo, dp, hScene) ?? null;
      if ( ![1, 2, 3].includes(x.livello) ) P.push(`${dp}: livello ${p.livello}, ammessi 1, 2 o 3`);
      if ( (p.aggiorna !== undefined) && (typeof p.aggiorna !== "boolean") ) P.push(`${dp}: aggiorna deve essere true o false`);
      if ( p.tipo === "text" ) {
        if ( (p.src !== undefined) || (p.didascalia !== undefined) ) P.push(`${dp}: src e didascalia sono delle pagine immagine`);
        if ( (typeof p.html !== "string") || (p.html.length > 2000000) ) P.push(`${dp}: html deve essere un testo (anche "", al massimo 2 MB)`);
        else {
          x.html = p.html;
          x.controllo = controllaHtml(p.html, { ...opzHtml, soloGM: pSoloGM });
          for ( const q of x.controllo.problemi ) P.push(`${dp}: ${q}`);
          for ( const s of x.controllo.immagini ) { usati.add(s); if ( !file.has(s) ) P.push(`${dp}: l'immagine ${s} non è elencata in file`); }
        }
      } else if ( p.tipo === "image" ) {
        if ( p.html !== undefined ) P.push(`${dp}: html è delle pagine di testo`);
        if ( p.accetta !== undefined ) P.push(`${dp}: accetta è delle pagine di testo`);
        if ( !percorsoValido(p.src) || !file.has(p.src) ) P.push(`${dp}: src «${p.src}» deve essere un'immagine elencata in file`);
        else { x.src = p.src; usati.add(p.src); }
        if ( (typeof p.didascalia !== "string") || (p.didascalia.length > 500) ) P.push(`${dp}: didascalia deve essere un testo (anche "")`);
        else { x.didascalia = p.didascalia; if ( !pSoloGM ) parole(p.didascalia, dp); }
      } else P.push(`${dp}: tipo «${p.tipo}», ammessi «text» e «image»`);
      // la visibilità alla nascita, con la decisione che la giustifica; le pagine solo GM nascono sempre a None
      const v = p.visibilita ?? "nessuna";
      if ( VISIBILITA.includes(v) ) x.visibilita = { tipo: v };
      else if ( oggetto(v) && campi(v, ["osservatoreSolo"], `${dp}, visibilita`, ["osservatoreSolo"]) && Array.isArray(v.osservatoreSolo)
        && v.osservatoreSolo.length && (v.osservatoreSolo.length <= 10) && v.osservatoreSolo.every(nomeValido) ) x.visibilita = { tipo: "osservatoreSolo", utenti: [...new Set(v.osservatoreSolo)] };
      else P.push(`${dp}: visibilita non valida («nessuna», «osservatore», «proprietarie» o { "osservatoreSolo": ["…"] })`);
      if ( x.visibilita.tipo !== "nessuna" ) {
        if ( pSoloGM ) P.push(`${dp}: una pagina solo GM nasce sempre a None (regola fissa 1)`);
        if ( (typeof p.decisione !== "string") || (p.decisione.trim().length < 10) || !/\b20\d\d-\d\d-\d\d\b/.test(p.decisione) ) P.push(`${dp}: con una visibilità diversa da «nessuna» serve la decisione del GM che la giustifica, con la data (AAAA-MM-GG)`);
        else x.decisione = p.decisione.trim();
      } else if ( p.decisione !== undefined ) P.push(`${dp}: decisione senza una visibilità da giustificare`);
      // chi possiede la pagina vede anche i blocchi segreti: con «proprietarie» niente blocchi segreti, niente riquadro, niente parole da DM
      if ( (x.visibilita.tipo === "proprietarie") && (x.html !== null) ) for ( const q of controllaPerProprietarie(x.html, opzHtml) ) P.push(`${dp}: ${q}`);
      // il nome dei file delle immagini lo leggono le giocatrici che aprono l'immagine
      if ( !pSoloGM ) for ( const f of [x.src, ...(x.controllo?.immagini ?? [])].filter(Boolean) ) parole(f.replace(/[-_./]/g, " "), `${dp}, file ${f}`);
      if ( p.precedente !== undefined ) {
        if ( (p.id === undefined) ) P.push(`${dp}: precedente vale solo per una pagina che c'è già, data con il suo id`);
        if ( campi(p.precedente, ["nome", "livello", "html", "src", "didascalia"], `${dp}, precedente`) ) {
          const pr = p.precedente;
          if ( (pr.nome !== undefined) && !nomeValido(pr.nome) ) P.push(`${dp}, precedente: nome non valido`);
          if ( (pr.livello !== undefined) && ![1, 2, 3].includes(pr.livello) ) P.push(`${dp}, precedente: livello non valido`);
          for ( const k of ["html", "src", "didascalia"] ) if ( (pr[k] !== undefined) && (typeof pr[k] !== "string") ) P.push(`${dp}, precedente: ${k} deve essere un testo`);
          x.precedente = { ...pr };
        }
      }
      if ( nuovoRif(p.rif, dp, "pagina", x, { journal: J }) ) J.pagine.push(x);
    });
    // dove vanno le pagine nuove
    if ( op.ordine !== undefined ) {
      const dov = `${d}, ordine`;
      if ( campi(op.ordine, ["sequenza", "contigua", "seMancaAncora"], dov, ["sequenza"]) ) {
        const o = op.ordine;
        const ordine = { sequenza: [], contigua: o.contigua !== false, seMancaAncora: o.seMancaAncora ?? "problema" };
        if ( (o.contigua !== undefined) && (typeof o.contigua !== "boolean") ) P.push(`${dov}: contigua deve essere true o false`);
        if ( !["problema", "rimanda"].includes(ordine.seMancaAncora) ) P.push(`${dov}: seMancaAncora «${o.seMancaAncora}», ammessi «problema» e «rimanda»`);
        const visti = new Set();
        if ( !Array.isArray(o.sequenza) || !o.sequenza.length ) P.push(`${dov}: sequenza deve essere un elenco non vuoto`);
        else for ( const [k, s] of o.sequenza.entries() ) {
          const ds = `${dov}, voce ${k + 1}`;
          let voce = null, chiave = null;
          if ( typeof s === "string" ) {
            const x = J.pagine.find(p => p.rif === s);
            if ( !x ) P.push(`${ds}: «${s}» non è il rif di una pagina di questo journal`);
            else { voce = { rif: s }; chiave = `rif:${s}`; }
          } else if ( oggetto(s) && (Object.keys(s).length === 1) && ID.test(s.id ?? "") ) { voce = { id: s.id }; chiave = `id:${s.id}`; }
          else if ( oggetto(s) && campi(s, ["carico", "rif"], ds, ["carico", "rif"]) && CARICO.test(s.carico ?? "") && RIF.test(s.rif ?? "") ) {
            if ( s.carico === g.carico ) P.push(`${ds}: una pagina di questo carico si scrive col suo rif`);
            else { voce = { carico: s.carico, rif: s.rif }; chiave = `carico:${s.carico}/${s.rif}`; }
          } else P.push(`${ds}: serve il rif di una pagina del journal, { "id": "…" } o { "carico": "…", "rif": "…" }`);
          if ( chiave && visti.has(chiave) ) P.push(`${ds}: ripetuta`);
          else if ( voce ) { visti.add(chiave); ordine.sequenza.push(voce); }
        }
        for ( const p of J.pagine ) if ( !visti.has(`rif:${p.rif}`) ) P.push(`${dov}: la pagina «${p.rif}» del journal non è nella sequenza`);
        J.ordine = ordine;
      }
    }
  });

  // --- i collegamenti: la forma del bersaglio e, per i rif, che esista nel file --------------------------------------------------------
  for ( const J of journal ) for ( const p of J.pagine ) for ( const l of (p.controllo?.collegamenti ?? []) ) {
    const dl = `journal «${J.nome}», pagina «${p.nome}», collegamento «${l.etichetta}»`;
    const b = l.bersaglio;
    if ( RIF.test(b) ) {
      const x = rif.get(b);
      if ( !x || !["pagina", "journal"].includes(x.genere) ) P.push(`${dl}: «${b}» non è il rif di una pagina o di un journal del file`);
      else if ( l.ancora && (x.genere !== "pagina") ) P.push(`${dl}: una sezione («#${l.ancora}») ha senso solo in una pagina`);
    } else if ( BERSAGLIO_CARICO.test(b) ) { if ( b.startsWith(`${g.carico}/`) ) P.push(`${dl}: un documento di questo carico si scrive col suo rif`); }
    else if ( BERSAGLIO_PAGINA.test(b) ) { /* si controlla nel mondo */ }
    else if ( BERSAGLIO_ID.test(b) ) {
      if ( l.ancora ) P.push(`${dl}: una sezione («#${l.ancora}») ha senso solo in una pagina`);
      // una macro si esegue col clic, una tabella si tira: da una pagina che le giocatrici leggono, no
      if ( !p.soloGM && /^(Macro|RollTable)\./.test(b) ) P.push(`${dl}: una pagina che si mostra non porta a una macro o a una tabella`);
    }
    else P.push(`${dl}: bersaglio «${b}» non riconosciuto (rif, carico/rif, Tipo.id)`);
  }
  // le Roll Table si tirano in chat: niente nomi veri degli attori di questo file (quelli degli altri si controllano nel mondo)
  // e niente nomi veri in quello che le giocatrici leggono degli attori: il nome, gli oggetti rinominati o sostituiti, il file del ritratto
  // (nei messaggi, mai il nome vero: il rapporto finisce in un file del server)
  for ( const a of attori.filter(a => a.nomeVero) ) {
    // una tabella «privata» si tira solo in privato: le descrizioni sono del GM, e possono avere i nomi veri; nome e testo delle voci no
    for ( const t of tabelle ) if ( [t.nome, ...(t.privata ? [] : [t.descrizione]), ...t.voci.flatMap(v => [v.testo, ...(t.privata ? [] : [v.descrizione])])].some(z => contieneNome(z, a.nomeVero)) ) P.push(`tabella «${t.nome}»: c'è il nome vero dell'attore «${a.nome}», che finirebbe in chat quando si tira`);
    for ( const b of attori ) {
      const visti = [b.nome, ...Object.values(b.ritocchi.rinomina).map(r => r.nome), ...Object.values(b.ritocchi.sostituisci), b.img ?? ""];
      if ( visti.some(z => contieneNome(z, a.nomeVero)) ) P.push(`attore «${b.nome}»: nel nome, negli oggetti o nel file del ritratto c'è il nome vero dell'attore «${a.nome}», che le giocatrici leggerebbero`);
    }
  }
  // le pagine delle note per rif: una pagina o un journal del file (dichiarati anche dopo la scena)
  for ( const { rif: r, d } of daRisolvere ) { const x = rif.get(r); if ( !x || !["pagina", "journal"].includes(x.genere) ) P.push(`${d}: pagina «${r}» non è il rif di una pagina o di un journal del file`); }
  // nei testi di note e disegni, niente nomi veri degli attori del file: stanno nei dati della scena, che riceve anche chi gioca
  for ( const a of attori.filter(a => a.nomeVero) ) for ( const J of journal ) for ( const p of J.pagine ) {
    if ( testiDi(p.flagsMondo ?? null).some(z => contieneNome(z, a.nomeVero)) ) P.push(`journal «${J.nome}», pagina «${p.nome}»: nei flag del mondo c'è il nome vero dell'attore «${a.nome}»`);
  }
  for ( const a of attori.filter(a => a.nomeVero) ) for ( const S of scene ) for ( const e of S.elementi ) {
    if ( [e.campi.testo, e.campi.icona, e.campi.immagine, ...testiDi(e.nascita.flagsMondo ?? null)].some(z => z && contieneNome(z, a.nomeVero)) ) P.push(`scena ${S.id}, ${e.genere} «${e.rif}»: nel testo, nel nome del file o nei flag del mondo c'è il nome vero dell'attore «${a.nome}»`);
  }
  for ( const f of file.keys() ) if ( !usati.has(f) ) report.avvisi.push(`file: ${f} è elencato ma nessuna pagina lo usa`);
  if ( P.length ) return null;
  return { carico: g.carico, titolo: g.titolo, mondo: g.mondo, generato: g.generato, campagna, file, cartelle, journal, tabelle, attori, scene, macro, daParte, rif };
}
