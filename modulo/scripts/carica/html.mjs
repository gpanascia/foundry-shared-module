/**
 * Il caricatore, l'HTML delle pagine: il controllo dell'HTML ammesso, i collegamenti @GDR, la forma canonica e l'impronta del
 * testo, la diagnosi di una pagina cambiata.
 * Formato e regole: docs/caricatore.md, «L'HTML ammesso».
 *
 * Non chiama Foundry: usa solo DOMParser (in un documento inerte, che non scarica immagini e non esegue codice) e lo SHA-256 di comune.mjs,
 * così si prova anche fuori dal mondo.
 */
import { sha256, percorsoValido } from "./comune.mjs";

const ELEMENTI = new Set(["p", "br", "strong", "em", "b", "i", "u", "s", "sub", "sup", "span", "div", "section", "h1", "h2", "h3", "h4",
  "h5", "h6", "ul", "ol", "li", "blockquote", "hr", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "img", "figure", "figcaption",
  "code", "pre"]);
const TITOLI = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
// «gdr-figura»: le immagini delle voci, alte al massimo quanto un'immagine orizzontale 3:2 alla stessa larghezza (styles/gdr-strumenti.css)
export const CLASSI_FISSE = Object.freeze(["secret", "revealed", "gdr-regola", "gdr-figura"]);
const ALLINEAMENTI = new Set(["left", "center", "right", "justify"]);
// i collegamenti del file di dati: @GDR[bersaglio]{etichetta}, con «#titolo» facoltativo nel bersaglio
const COLLEGAMENTO = /@GDR\[([^\[\]{}<>]+)\]\{([^{}\[\]<>]+)\}/g;
// i comandi di Foundry che i dati non portano: ogni @Parola[ che non sia un @GDR completo, gli arricchitori come &Reference[, e i
// tiri in linea
const COMANDO = /[@&][A-Za-z][A-Za-z0-9]*\[/g;

/** Il documento inerte di un HTML. */
export const analizza = html => new DOMParser().parseFromString(String(html ?? ""), "text/html");

const spazi = s => String(s ?? "").replace(/\s+/g, " ").trim();

/** Il testo di un HTML, con gli spazi ridotti; i collegamenti di Foundry contano per la loro etichetta. */
export const testoPiano = html => spazi(analizza(String(html ?? "").replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, "$1")).body.textContent);

/** I titoli di un HTML, col loro testo, nell'ordine. */
export const titoliDi = html => [...analizza(html).body.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h => spazi(h.textContent));

/** Lo stile scritto sempre allo stesso modo: «a: b; c:d» → «a:b;c:d», in ordine. */
const stileCanonico = s => String(s ?? "").split(";").map(d => d.split(":")).filter(d => (d.length >= 2) && d[0].trim())
  .map(([k, ...v]) => `${k.trim().toLowerCase()}:${spazi(v.join(":")).toLowerCase()}`).sort().join(";");

const IN_LINEA = new Set(["strong", "em", "b", "i", "u", "s", "sub", "sup", "span", "code", "a", "img", "br"]);
// le riscritture equivalenti che un editor può fare (ProseMirror, salvando una pagina): <b> come <strong>, <i> come <em>
const SINONIMI = { b: "strong", i: "em" };

/**
 * La forma canonica di un HTML: elementi, attributi in ordine (classi in ordine, stile canonico), testo con gli spazi ridotti a uno,
 * senza commenti. Due HTML con la stessa forma si leggono allo stesso modo. Non contano: una riscrittura del server come
 * «text-align: center» → «text-align:center»; <b> per <strong> e <i> per <em>; uno <span> senza attributi (resta il suo contenuto);
 * un paragrafo vuoto; un <p> solo dentro una voce d'elenco, una cella o una citazione; gli spazi fra due blocchi o in testa e in
 * coda a un blocco. Contano: un blocco rivelato, una parola, uno spazio
 * fra due parole («Il <strong>gruppo</strong>» non è «Il<strong>gruppo</strong>»), un'immagine.
 */
export function canonico(html) {
  const out = [];
  const inLinea = n => (n?.nodeType === 3) || ((n?.nodeType === 1) && IN_LINEA.has(n.tagName.toLowerCase()));
  const visita = n => {
    const figli = [...n.childNodes].filter(c => (c.nodeType === 1) || (c.nodeType === 3));
    for ( const [i, c] of figli.entries() ) {
      if ( c.nodeType === 3 ) {
        let t = c.nodeValue.replace(/\s+/g, " ");
        // gli spazi contano solo fra contenuti in linea: in testa o in coda a un blocco, o accanto a un blocco, no
        if ( !inLinea(figli[i - 1]) && !IN_LINEA.has(n.tagName?.toLowerCase()) ) t = t.replace(/^ /, "");
        if ( !inLinea(figli[i + 1]) && !IN_LINEA.has(n.tagName?.toLowerCase()) ) t = t.replace(/ $/, "");
        if ( !inLinea(figli[i - 1]) && !inLinea(figli[i + 1]) ) t = t.trim();
        if ( t ) out.push({ t });
      }
      else {
        const tag0 = c.tagName.toLowerCase();
        const tag = SINONIMI[tag0] ?? tag0;
        if ( (tag === "span") && !c.attributes.length ) { visita(c); continue; }
        if ( (tag === "p") && !c.attributes.length && !spazi(c.textContent) && !c.querySelector("img,br,hr") ) continue;
        const attr = [...c.attributes].map(a => {
          const k = a.name.toLowerCase();
          let v = a.value;
          if ( k === "class" ) v = [...new Set(v.split(/\s+/).filter(Boolean))].sort().join(" ");
          else if ( k === "style" ) v = stileCanonico(v);
          else v = spazi(v);
          return `${k}=${JSON.stringify(v)}`;
        }).sort();
        out.push(`<${tag}${attr.length ? ` ${attr.join(" ")}` : ""}>`);
        // ProseMirror mette il testo di una voce d'elenco, di una cella o di una citazione dentro un <p>: un <p> solo, senza
        // attributi, lì dentro non conta
        // (anche in una voce con un elenco annidato dopo: <li><p>uno</p><ul>…</ul></li> vale <li>uno<ul>…</ul></li>)
        const figliEl = [...c.children], resto = [...c.childNodes].filter(y => (y.nodeType === 3) && spazi(y.nodeValue));
        const pp = figliEl.filter(y => !["ul", "ol"].includes(y.tagName.toLowerCase()));
        if ( ["li", "td", "th", "blockquote"].includes(tag) && (pp.length === 1) && (figliEl[0] === pp[0]) && !resto.length
          && (pp[0].tagName.toLowerCase() === "p") && !pp[0].attributes.length ) { visita(pp[0]); for ( const y of figliEl.slice(1) ) visita({ childNodes: [y], tagName: tag }); }
        else visita(c);
        out.push(`</${tag}>`);
      }
    }
  };
  const d = analizza(html);
  visita(d.head);
  visita(d.body);
  // i testi vicini (uno <span> tolto li lascia separati) contano come un testo solo
  const fusi = [];
  for ( const x of out ) {
    if ( (typeof x === "object") && (typeof fusi.at(-1) === "object") ) fusi.at(-1).t += x.t;
    else fusi.push((typeof x === "object") ? { t: x.t } : x);
  }
  return fusi.map(x => (typeof x === "object") ? `#${JSON.stringify(x.t.replace(/ {2,}/g, " "))}` : x).join("");
}

/** L'impronta del testo di una pagina: SHA-256 della forma canonica. */
export const impronta = async html => sha256(canonico(html));

/** Quanti blocchi segreti rivelati, quante parentesi quadre da riempire («[il verso, come l'ha detto al tavolo]»). */
export const rivelati = html => analizza(html).body.querySelectorAll("section.secret.revealed").length;
export const parentesi = html => (testoPiano(html).match(/\[[^\[\]]{3,}\]/g) ?? []).length;

/** Perché due testi sono diversi, per il rapporto: testo, blocchi rivelati, parentesi riempite, struttura. */
export function diagnosi(ora, prima) {
  const motivi = [];
  if ( testoPiano(ora) !== testoPiano(prima) ) motivi.push("testo");
  const r1 = rivelati(ora), r0 = rivelati(prima);
  if ( r1 !== r0 ) motivi.push(`blocchi rivelati ${r0} → ${r1}`);
  const p1 = parentesi(ora), p0 = parentesi(prima);
  if ( p1 < p0 ) motivi.push(`parentesi da riempire ${p0} → ${p1}`);
  if ( !motivi.length ) motivi.push("struttura o attributi");
  return motivi;
}

/**
 * Il corpo che le giocatrici possono leggere: tutto, salvo i blocchi segreti non rivelati del riquadro per il DM. Chi possiede
 * la pagina vede anche i blocchi segreti (in Foundry, secrets: isOwner): per lei non si toglie niente.
 */
function corpoVisibile(doc, riquadroDM, proprietaria) {
  const body = doc.body.cloneNode(true);
  if ( !proprietaria && riquadroDM ) for ( const s of body.querySelectorAll("section.secret:not(.revealed)") ) if ( spazi(s.textContent).startsWith(riquadroDM) ) s.remove();
  return body;
}

/**
 * Il controllo di quello che legge una giocatrice proprietaria della pagina, che vede anche i blocchi segreti: nessun blocco
 * segreto, nessuna parola da DM, nessun riquadro per il DM.
 */
export function controllaPerProprietarie(html, o) {
  const doc = analizza(html);
  const problemi = [];
  const n = doc.body.querySelectorAll("section.secret").length;
  if ( n ) problemi.push(`una giocatrice proprietaria della pagina vede i blocchi segreti (${n}): in una pagina delle giocatrici non ce ne vanno`);
  const testo = spazi(doc.body.textContent);
  const trovate = paroleTrovate(testo, o.paroleDM ?? []);
  if ( trovate.length ) problemi.push(`parole da DM in una pagina che una giocatrice possiede: ${trovate.join(", ")}`);
  if ( o.riquadroDM && testo.includes(o.riquadroDM) ) problemi.push(`il riquadro «${o.riquadroDM}» in una pagina che una giocatrice possiede`);
  return problemi;
}

/** Un blocco segreto rivelato che comincia col titolo del riquadro per il DM. */
export const riquadroRivelato = (html, riquadroDM) => [...analizza(html).body.querySelectorAll("section.secret.revealed")].some(x => spazi(x.textContent).startsWith(riquadroDM));

/** Le parole da DM in un testo: l'elenco di quelle trovate. */
export const paroleTrovate = (testo, paroleDM) => paroleDM.filter(re => re.test(testo)).map(re => re.source);

/**
 * Un nome (un nome vero) in un testo, anche HTML, a parola intera e senza distinzione fra maiuscole e minuscole; in un
 * testo, però, un nome con la maiuscola conta solo dove comincia con una maiuscola (sotto).
 */
export function contieneNome(testo, nome) {
  // testo e nome con la stessa forma: trattini, punti, barre e trattini bassi come spazi, gli apostrofi tipografici dritti
  const forma = x => spazi(String(x ?? "").replace(/[-_./]/g, " ").replace(/[\u2018\u2019\u02bc]/g, "'"));
  const n = forma(nome);
  if ( !n ) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^\\p{L}\\p{N}])`, "giu");
  const t = forma(testoPiano(String(testo ?? "")));
  // un nome vero con la maiuscola, in un testo (non nel nome di un file): conta solo dove anche lì comincia con la maiuscola, così una
  // parola comune uguale al nome non lo fa scattare (il nome vero «Rosa» e «una rosa rossa»). Nei nomi dei file, che si scrivono in
  // minuscolo, conta comunque
  const grezzo = String(testo ?? "").trim();
  const file = /\.(webp|png|jpe?g|gif|svg|avif|bmp|webm|mp4|ogg|mp3)$/i.test(grezzo) || (!/\s/.test(grezzo) && grezzo.includes("/"));
  const minuscola = c => (c !== c.toUpperCase()), maiuscola = c => (c !== c.toLowerCase());
  const conMaiuscola = maiuscola(n[0]);
  for ( const m of t.matchAll(re) ) if ( file || !conMaiuscola || !minuscola(m[2][0]) ) return true;
  return false;
}

/** Il testo che le giocatrici leggono di una pagina: senza i blocchi segreti non rivelati. */
export function testoVisibile(html) {
  const body = analizza(html).body;
  for ( const s of body.querySelectorAll("section.secret:not(.revealed)") ) s.remove();
  return spazi(body.textContent);
}

/**
 * Controlla l'HTML di una pagina contro l'HTML ammesso.
 * @param {string} html
 * @param {object} o  { classi: string[] ammesse oltre alle fisse, soloGM: bool, riquadroDM: string, paroleDM: RegExp[] }
 * @returns {{ problemi: string[], immagini: string[], collegamenti: {bersaglio: string, ancora: string|null, etichetta: string}[], titoli: string[] }}
 */
export function controllaHtml(html, o) {
  const problemi = [], immagini = [], collegamenti = [];
  if ( typeof html !== "string" ) return { problemi: ["l'HTML non è un testo"], immagini, collegamenti, titoli: [] };
  const doc = analizza(html);
  const classi = new Set([...CLASSI_FISSE, ...(o.classi ?? [])]);
  const idSegreti = new Set();
  const intero = s => /^[0-9]{1,3}$/.test(s);
  // un <style>, un <script> o un <meta> in testa all'HTML il parser li mette nella testa del documento: lì non ci va niente
  for ( const el of doc.head.querySelectorAll("*") ) problemi.push(`elemento <${el.tagName.toLowerCase()}> fuori dal corpo`);
  for ( const el of doc.body.querySelectorAll("*") ) {
    const tag = el.tagName.toLowerCase();
    const dove = `<${tag}>`;
    if ( !ELEMENTI.has(tag) ) { problemi.push(`elemento ${dove} non ammesso`); continue; }
    for ( const a of el.attributes ) {
      const k = a.name.toLowerCase(), v = a.value;
      if ( k === "class" ) {
        for ( const c of v.split(/\s+/).filter(Boolean) ) {
          if ( !classi.has(c) ) problemi.push(`${dove}: classe «${c}» non ammessa`);
          // Foundry nasconde ai non proprietari solo section.secret: su un altro elemento la classe non nasconde niente
          else if ( ["secret", "revealed"].includes(c) && (tag !== "section") ) problemi.push(`${dove}: classe «${c}» fuori da <section> (Foundry nasconde solo section.secret)`);
        }
        if ( el.classList.contains("revealed") && !el.classList.contains("secret") ) problemi.push(`${dove}: classe «revealed» senza «secret»`);
      }
      else if ( k === "style" ) {
        const dich = v.split(";").map(d => d.trim()).filter(Boolean);
        for ( const d of dich ) {
          const [p, ...r] = d.split(":");
          if ( (p.trim().toLowerCase() !== "text-align") || !ALLINEAMENTI.has(r.join(":").trim().toLowerCase()) ) problemi.push(`${dove}: stile «${d}» non ammesso (solo text-align)`);
        }
      }
      else if ( (k === "id") && (tag === "section") && el.classList.contains("secret") ) {
        if ( !/^secret-[A-Za-z0-9-]{1,60}$/.test(v) ) problemi.push(`${dove}: id «${v}» del blocco segreto non valido (secret-…)`);
        else if ( idSegreti.has(v) ) problemi.push(`${dove}: id «${v}» del blocco segreto ripetuto nella pagina`);
        idSegreti.add(v);
      }
      else if ( (k === "src") && (tag === "img") ) { if ( !percorsoValido(v) ) problemi.push(`${dove}: src «${v}» non è un percorso del mondo valido`); else immagini.push(v); }
      else if ( (k === "alt") && (tag === "img") ) { /* testo: si controlla con le parole da DM */ }
      else if ( ["colspan", "rowspan"].includes(k) && ["td", "th"].includes(tag) ) { if ( !intero(v) ) problemi.push(`${dove}: ${k} «${v}» non è un numero`); }
      else if ( (k === "start") && (tag === "ol") ) { if ( !intero(v) ) problemi.push(`${dove}: start «${v}» non è un numero`); }
      else problemi.push(`${dove}: attributo «${k}» non ammesso`);
    }
    if ( (tag === "section") && el.classList.contains("secret") && !el.hasAttribute("id") ) problemi.push(`${dove}: blocco segreto senza id`);
    if ( (tag === "img") && !el.hasAttribute("src") ) problemi.push(`${dove}: immagine senza src`);
    if ( !o.soloGM && (tag === "section") && el.classList.contains("secret") && el.querySelector("h1,h2,h3,h4,h5,h6") ) problemi.push(`${dove}: titolo dentro un blocco segreto, in una pagina che si mostra (Foundry lo mette nell'indice)`);
  }
  // il testo: i commenti no, i comandi di Foundry no, i collegamenti solo nella forma @GDR[…]{…}
  const camm = doc.createTreeWalker(doc.documentElement, 128 | 4);    // commenti e testo
  for ( let n = camm.nextNode(); n; n = camm.nextNode() ) {
    if ( n.nodeType === 8 ) { problemi.push("commento HTML non ammesso"); continue; }
    const t = n.nodeValue;
    if ( t.includes("[[") ) problemi.push(`tiro in linea «[[…» non ammesso: «${spazi(t).slice(0, 60)}»`);
    const ok = [...t.matchAll(COLLEGAMENTO)];
    for ( const m of ok ) {
      const [b, ...a] = m[1].split("#");
      collegamenti.push({ bersaglio: b.trim(), ancora: a.length ? spazi(a.join("#")) : null, etichetta: m[2] });
    }
    const resto = t.replace(COLLEGAMENTO, "");
    for ( const m of resto.matchAll(COMANDO) ) problemi.push(`comando «${m[0]}…» non ammesso${m[0].startsWith("@GDR") ? " (un collegamento va scritto @GDR[bersaglio]{etichetta}, in un testo solo)" : ""}`);
    if ( /@GDR/.test(resto) ) problemi.push(`collegamento @GDR scritto male: «${spazi(t).slice(0, 80)}»`);
  }
  // dove le giocatrici leggono: le parole da DM, il riquadro per il DM e le classi della campagna fuori da un blocco segreto chiuso
  if ( !o.soloGM ) {
    const corpo = corpoVisibile(doc, o.riquadroDM ?? null, false);
    const testo = spazi(corpo.textContent);
    const vis = `${testo} ${[...doc.body.querySelectorAll("img[alt]")].map(i => i.getAttribute("alt")).join(" ")}`;
    const trovate = paroleTrovate(vis, o.paroleDM ?? []);
    if ( trovate.length ) problemi.push(`parole da DM nel testo che le giocatrici leggono: ${trovate.join(", ")}`);
    if ( o.riquadroDM && testo.includes(o.riquadroDM) ) problemi.push(`il riquadro «${o.riquadroDM}» fuori da un blocco segreto chiuso tutto suo: le giocatrici lo leggerebbero`);
    for ( const c of (o.classi ?? []) ) if ( corpo.querySelector(`.${c}`) ) problemi.push(`classe «${c}» fuori da un blocco segreto chiuso del riquadro, in una pagina che si mostra`);
  }
  return { problemi, immagini, collegamenti, titoli: [...doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h => spazi(h.textContent)) };
}

/**
 * Sostituisce i collegamenti @GDR coi collegamenti di Foundry, nel documento inerte, e restituisce l'HTML da scrivere.
 * @param {string} html
 * @param {(c: {bersaglio, ancora, etichetta}) => string|null} risolvi  il testo @UUID[…]{…}, o null se non si risolve
 */
export function sostituisciCollegamenti(html, risolvi) {
  const doc = analizza(html);
  const camm = doc.createTreeWalker(doc.body, 4);
  const nodi = [];
  for ( let n = camm.nextNode(); n; n = camm.nextNode() ) if ( n.nodeValue.includes("@GDR[") ) nodi.push(n);
  let mancati = 0;
  for ( const n of nodi ) {
    n.nodeValue = n.nodeValue.replace(COLLEGAMENTO, (tutto, b, etichetta) => {
      const [bb, ...a] = b.split("#");
      const u = risolvi({ bersaglio: bb.trim(), ancora: a.length ? spazi(a.join("#")) : null, etichetta });
      if ( u === null ) { mancati++; return tutto; }
      return u;
    });
  }
  return { html: doc.body.innerHTML, mancati };
}
