/**
 * Prove dell'indice dei journal che si richiude (scripts/indice.mjs), in Node, con jsdom: un indice
 * come quello di V14 (elenco piatto di li.page con levelN, intestazioni di categoria, titoli dentro le pagine), una finestra finta.
 * Si lanciano dalla cartella prove/, dopo npm install (jsdom): node prove-indice.mjs
 * Escono con codice 1 se una prova non passa. Non sostituiscono la prova nei mondi (README.md, «L'indice dei journal che si
 * richiude»).
 */
import { createRequire } from "node:module";

const jsdom = createRequire(process.env.GDR_NODE_MODULES ? `${process.env.GDR_NODE_MODULES}/` : import.meta.url)("jsdom");
const { window } = new jsdom.JSDOM("<!doctype html><body></body>");
globalThis.HTMLElement = window.HTMLElement;
const { applicaIndice, gruppi, leggiAperti, CLASSI } = await import("../modulo/scripts/indice.mjs");

let falliti = 0, fatti = 0;
const prova = (nome, cond, dettaglio) => { fatti++; if ( !cond ) { falliti++; console.log(`KO · ${nome}${dettaglio !== undefined ? `\n     ${JSON.stringify(dettaglio)}` : ""}`); } else console.log(`ok · ${nome}`); };
const tick = () => new Promise(r => setTimeout(r, 0));

// un localStorage finto, e uno che non salva
const memoria = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const rotto = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };

// il Diario di prova: due quartieri, luoghi e personaggi; una categoria; un titolo dentro una pagina
const PAGINE = [
  ["q1", 1, "Il Borgo alto"], ["l1", 2, "Il Gallo Rosso"], ["p1", 3, "L'oste"], ["p2", 3, "La cuoca"], ["l2", 2, "Il mercato"],
  ["q2", 1, "Il Porto"], ["l3", 2, "Il molo"],
  ["CAT"], ["x1", 2, "Una voce sotto la categoria"], ["x2", 3, "Un suo figlio"], ["s1", 1, "Una pagina sola"]
];
function finestra({ pagine = PAGINE, attiva = null, cerca = "" } = {}) {
  const doc = window.document;
  const radice = doc.createElement("div");
  radice.innerHTML = `<aside><search><input type="search" value="${cerca}"></search><ol class="toc"></ol></aside><section class="journal-entry-pages"></section>`;
  const ol = radice.querySelector(".toc");
  for ( const [id, livello, nome] of pagine ) {
    const li = doc.createElement("li");
    if ( id === "CAT" ) { li.className = "category"; li.textContent = "Una categoria"; ol.append(li); continue; }
    li.className = `text level${livello} page${id === attiva ? " active" : ""}`;
    li.dataset.pageId = id;
    li.innerHTML = `<div class="page-heading"><span class="page-number">1</span><span class="page-title">${nome}</span></div>`;
    if ( id === "l1" ) li.innerHTML += `<ol class="headings"><li data-anchor="sala" class="heading level1">La sala</li></ol>`;
    li.dataset.action = "goToPage";
    ol.append(li);
  }
  // come V14: le azioni si gestiscono con un ascolto sulla finestra, che cerca [data-action]
  radice.addEventListener("click", ev => { const a = ev.target.closest("[data-action]"); if ( a ) radice.__clicVoce = a.dataset.pageId; });
  doc.body.replaceChildren(radice);
  const livelli = new Map(pagine.filter(p => p[0] !== "CAT").map(([id, l]) => [id, l]));
  const app = { document: { uuid: "JournalEntry.Diario0000000001" }, pageId: attiva, entry: { pages: { get: id => (livelli.has(id) ? { title: { level: livelli.get(id) } } : null) } } };
  return { radice, ol, app };
}
const nascoste = ol => [...ol.querySelectorAll(`li.${CLASSI.nascosta}`)].map(li => li.dataset.pageId);
const frecce = ol => [...ol.querySelectorAll(`.${CLASSI.freccia}`)].map(b => b.dataset.gdrGruppo);
const freccia = (ol, id) => ol.querySelector(`.${CLASSI.freccia}[data-gdr-gruppo="${id}"]`);

// --- i gruppi, puri ---------------------------------------------------------------------------------------------------------------
{
  const { capi, antenati } = gruppi([{ id: "a", livello: 1 }, { id: "b", livello: 2 }, { id: "c", livello: 3 }, { id: "d", livello: 2 }, null, { id: "e", livello: 3 }, { id: "f", livello: 1 }, { id: "g", livello: 1 }]);
  prova("gruppi: capi coi loro discendenti, un'intestazione chiude", JSON.stringify([...capi]) === JSON.stringify([["a", ["b", "c", "d"]], ["b", ["c"]]]) && JSON.stringify(antenati.get("c")) === '["a","b"]' && JSON.stringify(antenati.get("e")) === "[]", [...capi]);
  const g2 = gruppi([{ id: "a", livello: 1 }, { id: "b", livello: 3 }, { id: "c", livello: 2 }]);
  prova("gruppi: un salto di livello (1, 3, 2): tutti e due sotto la prima", JSON.stringify(g2.capi.get("a")) === '["b","c"]' && !g2.capi.has("b"), [...g2.capi]);
}

// --- all'apertura: tutto chiuso ---------------------------------------------------------------------------------------------------
let F = finestra(), S = memoria();
applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
prova("frecce solo sulle voci con voci sotto (quartieri, il luogo coi personaggi, la voce sotto la categoria)", JSON.stringify(frecce(F.ol)) === '["q1","l1","q2","x1"]', frecce(F.ol));
prova("all'inizio i gruppi sono chiusi: si vedono i quartieri, la voce sotto la categoria e la pagina sola", JSON.stringify(nascoste(F.ol)) === '["l1","p1","p2","l2","l3","x2"]', nascoste(F.ol));
prova("il titolo dentro una pagina non è una voce, e la categoria resta", !F.ol.querySelector(`li[data-anchor].${CLASSI.capo}`) && !F.ol.querySelector(`li.category.${CLASSI.nascosta}`));
prova("niente scritto nel browser finché non si apre niente", !S.m.size);

// --- la freccia fra numero e titolo col rientro del livello, gli spazi, le linee guida (dalla 1.12.0) -------------------------------
{ const li = id => F.ol.querySelector(`li[data-page-id="${id}"]`);
  const prima = id => li(id).querySelector(".page-title").previousElementSibling;
  prova("la freccia sta fra il numero e il titolo", prima("q1")?.classList.contains("gdr-indice-freccia") && prima("q1").previousElementSibling?.classList.contains("page-number"));
  prova("il rientro del livello passa alla freccia: 0, 16, 32 px", freccia(F.ol, "q1").style.marginLeft === "0px" && freccia(F.ol, "l1").style.marginLeft === "16px" && li("p1").querySelector(".gdr-indice-spazio").style.marginLeft === "32px", [freccia(F.ol, "q1").style.marginLeft, freccia(F.ol, "l1").style.marginLeft]);
  prova("le voci senza freccia hanno uno spazio uguale, fra numero e titolo", prima("p1")?.classList.contains("gdr-indice-spazio") && prima("s1")?.classList.contains("gdr-indice-spazio") && !li("p1").querySelector(".gdr-indice-freccia"));
  prova("l'indice coi gruppi toglie il rientro dal titolo (classe sull'indice)", F.ol.classList.contains("gdr-indice-rientro"));
  prova("tutto chiuso: niente linee guida", !F.ol.querySelector(".gdr-indice-barre"));
  prova("gli spazi non sono letti dagli screen reader", li("p1").querySelector(".gdr-indice-spazio").getAttribute("aria-hidden") === "true"); }
{ const G = finestra({ pagine: [["a", 1, "A"], ["b", 1, "B"]] }); applicaIndice(G.app, G.radice, { store: memoria(), utente: "u1" });
  prova("journal senza gerarchia: niente spazi, linee né classe del rientro", !G.ol.querySelector(".gdr-indice-spazio, .gdr-indice-barre") && !G.ol.classList.contains("gdr-indice-rientro")); }
F = finestra(); S = memoria(); applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
freccia(F.ol, "q1").click(); freccia(F.ol, "l1").click();
{ const li = id => F.ol.querySelector(`li[data-page-id="${id}"]`);
  const linee = id => [...(li(id).querySelector(":scope > .gdr-indice-barre")?.children ?? [])];
  const di = id => linee(id).map(b => `${b.dataset.gdrGruppo}/${b.style.getPropertyValue("--gdr-h")}/${b.dataset.gdrProf}${b.hasAttribute("data-gdr-inizio") ? "/i" : ""}${b.hasAttribute("data-gdr-fine") ? "/f" : ""}`);
  prova("aperti Borgo alto e Gallo Rosso: la linea del quartiere parte sotto la sua freccia e arriva al mercato", JSON.stringify(di("q1")) === '["q1/250/0/i"]' && JSON.stringify(di("l2")) === '["q1/250/0/f"]', [di("q1"), di("l2")]);
  prova("il luogo aperto: la linea del quartiere e la sua, che parte sotto la sua freccia e finisce sull'ultimo personaggio", JSON.stringify(di("l1")) === '["q1/250/0","l1/250/1/i"]' && JSON.stringify(di("p2")) === '["q1/250/0","l1/250/1/f"]', [di("l1"), di("p2")]);
  prova("la linea sta sotto la freccia del capo: base + (livello − 1) × 16 + 12 − 1", linee("p1")[0].style.left === "calc(var(--gdr-base, 62px) + 11px)" && linee("p1")[1].style.left === "calc(var(--gdr-base, 62px) + 27px)", linee("p1").map(b => b.style.left));
  prova("un quartiere chiuso non ha linee", !li("q2").querySelector(".gdr-indice-barre"));
  applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
  prova("rifare il disegno non duplica spazi e linee", F.ol.querySelectorAll(".gdr-indice-barre").length === 5 && F.ol.querySelectorAll(".gdr-indice-spazio").length === 6, [F.ol.querySelectorAll(".gdr-indice-barre").length, F.ol.querySelectorAll(".gdr-indice-spazio").length]); }
F = finestra(); S = memoria(); applicaIndice(F.app, F.radice, { store: S, utente: "u1" });

{ F.app.entry.pages.get = id => ({ title: { level: Object.fromEntries(PAGINE.filter(p => p[0] !== "CAT").map(([i, l]) => [i, l]))[id] }, name: { q1: "Il Borgo alto", l1: "Il Gallo Rosso" }[id] ?? id }); }
{ // la tavolozza dal colore del testo dei titoli, non dal tema: in dnd5e l'indice resta scuro (testo chiaro) anche col tema chiaro
  const G = finestra(); G.radice.classList.add("theme-light");
  const testo = c => G.ol.querySelectorAll(".page-title").forEach(x => { x.style.color = c; });
  testo("rgb(232, 227, 217)"); applicaIndice(G.app, G.radice, { store: memoria(), utente: "u1" });
  prova("testo chiaro (fondo scuro), anche dentro un tema chiaro: tavolozza scura", !G.ol.hasAttribute("data-gdr-chiaro"));
  testo("rgb(25, 24, 19)"); applicaIndice(G.app, G.radice, { store: memoria(), utente: "u1" });
  prova("testo scuro (fondo chiaro): tavolozza chiara", G.ol.hasAttribute("data-gdr-chiaro"));
  testo("rgb(232, 227, 217)"); applicaIndice(G.app, G.radice, { store: memoria(), utente: "u1" });
  prova("e torna scura", !G.ol.hasAttribute("data-gdr-chiaro"));
  prova("il nome intero sul titolo, che la freccia accorcia", G.ol.querySelector('li[data-page-id="l1"] .page-title').title === "Il Gallo Rosso" || G.ol.querySelector('li[data-page-id="l1"] .page-title').title === "l1"); }
F = finestra(); S = memoria(); applicaIndice(F.app, F.radice, { store: S, utente: "u1" });

// --- un clic apre, e non arriva alla voce -----------------------------------------------------------------------------------------
freccia(F.ol, "q1").click();
prova("clic sul quartiere: si vedono i luoghi, non i personaggi del luogo chiuso", JSON.stringify(nascoste(F.ol)) === '["p1","p2","l3","x2"]', nascoste(F.ol));
prova("il clic sulla freccia non apre la pagina", F.radice.__clicVoce === undefined);
prova("lo stato si ricorda per persona e journal", JSON.stringify([...leggiAperti("u1", F.app.document.uuid, S)]) === '["q1"]' && !leggiAperti("u2", F.app.document.uuid, S).size);
prova("la freccia dice aperto", freccia(F.ol, "q1").getAttribute("aria-expanded") === "true" && freccia(F.ol, "q2").getAttribute("aria-expanded") === "false");
freccia(F.ol, "l1").click();
prova("clic sul luogo: si vedono i suoi personaggi", JSON.stringify(nascoste(F.ol)) === '["l3","x2"]', nascoste(F.ol));
freccia(F.ol, "q1").click();
prova("richiudere il quartiere nasconde anche i personaggi del luogo aperto", JSON.stringify(nascoste(F.ol)) === '["l1","p1","p2","l2","l3","x2"]', nascoste(F.ol));
freccia(F.ol, "q1").click();
prova("riaperto il quartiere, il luogo è ancora aperto", JSON.stringify(nascoste(F.ol)) === '["l3","x2"]', nascoste(F.ol));

// --- un nuovo render (un indice nuovo): lo stato torna --------------------------------------------------------------------------
F = finestra(); applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
prova("nuova finestra: i gruppi aperti prima restano aperti", JSON.stringify(nascoste(F.ol)) === '["l3","x2"]', nascoste(F.ol));
F = finestra(); applicaIndice(F.app, F.radice, { store: S, utente: "u2" });
prova("un'altra persona nello stesso browser: tutto chiuso", nascoste(F.ol).length === 6, nascoste(F.ol));
applicaIndice(F.app, F.radice, { store: S, utente: "u2" });
prova("rifare il disegno non duplica le frecce", F.ol.querySelectorAll(`.${CLASSI.freccia}`).length === 4);

// --- la pagina in vista apre da sola i suoi gruppi ---------------------------------------------------------------------------------
S = memoria();
F = finestra({ attiva: "p2" }); applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
prova("pagina in vista (un personaggio): si aprono il suo quartiere e il suo luogo", JSON.stringify(nascoste(F.ol)) === '["l3","x2"]', nascoste(F.ol));
prova("l'apertura da sola non si scrive nel browser", !S.m.size);
freccia(F.ol, "l1").click();
prova("richiuso a mano il luogo della pagina in vista: resta chiuso", JSON.stringify(nascoste(F.ol)) === '["p1","p2","l3","x2"]' && !leggiAperti("u1", F.app.document.uuid, S).has("l1"), nascoste(F.ol));
applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
prova("ridisegnato con la stessa pagina in vista: resta chiuso", nascoste(F.ol).includes("p1"), nascoste(F.ol));
const scorse = []; window.HTMLElement.prototype.scrollIntoView = function () { scorse.push(this.dataset.pageId); };
F.ol.querySelector('li[data-page-id="p2"]').classList.remove("active");
F.ol.querySelector('li[data-page-id="l3"]').classList.add("active");
await tick();
prova("cambia la pagina in vista (un pin, un link, «Scopri»): si apre il gruppo della nuova, gli altri restano come sono", JSON.stringify(nascoste(F.ol)) === '["p1","p2","x2"]', nascoste(F.ol));
prova("e l'indice scorre fino alla voce in vista, ora visibile", JSON.stringify(scorse) === '["l3"]', scorse);
applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
prova("un render con la stessa pagina in vista non fa scorrere l'indice", scorse.length === 1, scorse);
F.ol.querySelector('li[data-page-id="l3"]').classList.remove("active");
F.ol.querySelector('li[data-page-id="p1"]').classList.add("active");
await tick();
prova("pagina in vista dentro un gruppo richiuso a mano: si riapre", JSON.stringify(nascoste(F.ol)) === '["x2"]', nascoste(F.ol));
delete window.HTMLElement.prototype.scrollIntoView;
F = finestra(); F.app.pageId = "x2"; applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
prova("nessuna voce attiva: vale la pagina della finestra", !nascoste(F.ol).includes("x2"), nascoste(F.ol));

// --- ricerca e trascinamento: tutto -----------------------------------------------------------------------------------------------
S = memoria();
F = finestra({ cerca: "oste" }); applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
prova("con del testo nella ricerca: si vede tutto", F.ol.classList.contains(CLASSI.tutto));
const input = F.radice.querySelector("search input");
input.value = ""; input.dispatchEvent(new window.Event("input"));
prova("ricerca vuotata: di nuovo i gruppi", !F.ol.classList.contains(CLASSI.tutto));
input.value = "molo"; input.dispatchEvent(new window.Event("input"));
prova("ricerca riempita dopo: tutto", F.ol.classList.contains(CLASSI.tutto));
input.value = ""; input.dispatchEvent(new window.Event("input"));
F.ol.querySelector('li[data-page-id="q2"]').dispatchEvent(new window.Event("dragstart", { bubbles: true }));
prova("al dragstart la voce trascinata non si sposta subito", !F.ol.classList.contains(CLASSI.tutto));
await tick();
prova("durante un trascinamento: tutto", F.ol.classList.contains(CLASSI.tutto));
F.ol.dispatchEvent(new window.Event("dragend", { bubbles: true }));
prova("finito il trascinamento: di nuovo i gruppi", !F.ol.classList.contains(CLASSI.tutto));
{ // lo scorrimento compensato: la voce trascinata resta dov'era (con le misure finte: jsdom non calcola il layout)
  Object.defineProperty(F.ol, "scrollHeight", { value: 2000, configurable: true }); Object.defineProperty(F.ol, "clientHeight", { value: 600, configurable: true });
  let st = 100; Object.defineProperty(F.ol, "scrollTop", { get: () => st, set: v => { st = v; }, configurable: true });
  const li = F.ol.querySelector('li[data-page-id="q2"]');
  li.getBoundingClientRect = () => ({ top: F.ol.classList.contains(CLASSI.tutto) ? 900 : 300 });
  li.dispatchEvent(new window.Event("dragstart", { bubbles: true }));
  await tick();
  prova("all'apertura per il trascinamento, l'indice scorre di quanto è scesa la voce", st === 700, st);
  F.ol.dispatchEvent(new window.Event("dragend", { bubbles: true }));
  prova("alla fine del trascinamento, scorre di nuovo indietro", st === 100, st);
  delete li.getBoundingClientRect; }

// --- il fuoco della tastiera resta sulla freccia; due finestre dello stesso journal non si cancellano lo stato -------------------
S = memoria();
F = finestra(); applicaIndice(F.app, F.radice, { store: S, utente: "u1" });
freccia(F.ol, "q2").focus(); freccia(F.ol, "q2").click();
prova("dopo un clic, il fuoco è sulla freccia nuova dello stesso gruppo", window.document.activeElement?.dataset?.gdrGruppo === "q2", window.document.activeElement?.outerHTML?.slice(0, 80));
{ const A = finestra(); applicaIndice(A.app, A.radice, { store: S, utente: "u1" });
  const B = finestra(); applicaIndice(B.app, B.radice, { store: S, utente: "u1" });
  freccia(A.ol, "q1").click(); freccia(B.ol, "l1").click();
  prova("due finestre dello stesso journal: ognuna aggiunge il suo gruppo, senza cancellare quello dell'altra", JSON.stringify([...leggiAperti("u1", A.app.document.uuid, S)].sort()) === '["l1","q1","q2"]', [...leggiAperti("u1", A.app.document.uuid, S)]); }

// --- le giocatrici: solo le pagine che vedono -------------------------------------------------------------------------------------
F = finestra({ pagine: [["q1", 1, "Il Borgo alto"], ["l2", 2, "Il mercato"], ["q2", 1, "Il Porto"], ["s1", 1, "Una pagina sola"]] });
applicaIndice(F.app, F.radice, { store: memoria(), utente: "giocatrice" });
prova("una giocatrice che vede solo il mercato sotto il Borgo alto: freccia lì, non sul Porto", JSON.stringify(frecce(F.ol)) === '["q1"]', frecce(F.ol));

// --- un journal senza gerarchia, un browser che non salva, una finestra senza indice ------------------------------------------------
F = finestra({ pagine: [["a", 1, "A"], ["b", 1, "B"]] });
applicaIndice(F.app, F.radice, { store: memoria(), utente: "u1" });
prova("journal senza gerarchia: niente frecce, niente nascosto", !frecce(F.ol).length && !nascoste(F.ol).length);
F = finestra(); applicaIndice(F.app, F.radice, { store: rotto, utente: "u1" });
freccia(F.ol, "q1").click();
prova("browser che non salva: il clic apre lo stesso", !nascoste(F.ol).includes("l1"), nascoste(F.ol));
{ const r = window.document.createElement("div"); let errore = null; try { applicaIndice({ document: { uuid: "x" } }, r, { store: memoria() }); } catch (e) { errore = e; }
  prova("finestra senza indice: niente, senza errori", !errore); }
F = finestra(); const S2 = memoria(); S2.setItem("gdr-strumenti.indice", "non è json"); applicaIndice(F.app, F.radice, { store: S2, utente: "u1" });
prova("stato salvato rovinato: tutto chiuso, senza errori", nascoste(F.ol).length === 6);
freccia(F.ol, "q1").click();
prova("e il primo clic lo riscrive pulito", JSON.stringify([...leggiAperti("u1", F.app.document.uuid, S2)]) === '["q1"]');

// --- la pagina in vista dentro un gruppo richiuso a mano: la freccia del capo lo dice -------------------------------------------
F = finestra({ attiva: "p1" }); applicaIndice(F.app, F.radice, { store: memoria(), utente: "u1" });
freccia(F.ol, "q1").click();
prova("pagina in vista in un gruppo richiuso: la freccia del capo è segnata", freccia(F.ol, "q1").classList.contains("gdr-indice-dentro") && !freccia(F.ol, "q2").classList.contains("gdr-indice-dentro"));
// --- la riga: senza un contenitore, la freccia va nella voce, non in un titolo o in un link -----------------------------------
{ const G = finestra({ pagine: [["a", 1, "A"], ["b", 2, "B"]] });
  for ( const li of G.ol.querySelectorAll("li") ) li.innerHTML = `<a class="page-title">${li.dataset.pageId}</a>`;
  applicaIndice(G.app, G.radice, { store: memoria(), utente: "u1" });
  const a = G.ol.querySelector('li[data-page-id="a"]');
  prova("voce con un solo link: la freccia è figlia della voce, non del link", freccia(G.ol, "a")?.parentElement === a && !a.querySelector("a .gdr-indice-freccia"));
  for ( const li of G.ol.querySelectorAll("li") ) { li.querySelectorAll(".gdr-indice-freccia, .gdr-indice-spazio, .gdr-indice-barre").forEach(x => x.remove()); li.textContent = li.dataset.pageId; }
  applicaIndice(G.app, G.radice, { store: memoria(), utente: "u1" });
  prova("voce di solo testo: la freccia è figlia della voce", freccia(G.ol, "a")?.parentElement === a); }

// --- il livello dal documento, non dalla classe -----------------------------------------------------------------------------------
F = finestra({ pagine: [["a", 1, "A"], ["b", 1, "B"]] }); F.app.entry.pages.get = id => ({ title: { level: id === "b" ? 2 : 1 } });
applicaIndice(F.app, F.radice, { store: memoria(), utente: "u1" });
prova("il livello si legge dalla pagina (title.level) prima che dalla classe", JSON.stringify(frecce(F.ol)) === '["a"]', frecce(F.ol));

// --- i titoli della pagina aperti, spostati sotto il titolo della voce (dalla 1.12.2), con misure finte -----------------------------
{ F = finestra(); const S3 = memoria();
  applicaIndice(F.app, F.radice, { store: S3, utente: "u1" }); freccia(F.ol, "q1").click();
  const l1 = F.ol.querySelector('li[data-page-id="l1"]'), ol = l1.querySelector("ol.headings"), tit = l1.querySelector(".page-title");
  const largo = (el, w) => Object.defineProperty(el, "offsetWidth", { configurable: true, get: () => w });
  const rett = (el, left) => { el.getBoundingClientRect = () => ({ left, top: 0, width: 200, height: 20, right: left + 200, bottom: 20 }); };
  largo(l1, 200); largo(ol, 168); rett(l1, 0); rett(ol, 32); rett(tit, 94);
  ol.style.marginLeft = "";
  applicaIndice(F.app, F.radice, { store: S3, utente: "u1" });
  prova("l'elenco dei titoli si sposta del rientro del titolo (94 − 32)", ol.style.marginLeft === "62px" && ol.dataset.gdrSpostato === "", [ol.style.marginLeft, ol.dataset.gdrSpostato]);
  prova("il titolo dentro la pagina ha il nome intero al passaggio del mouse", ol.querySelector("li").title === "La sala");
  rett(ol, 94);
  applicaIndice(F.app, F.radice, { store: S3, utente: "u1" });
  prova("ridisegno con l'elenco già al suo posto: lo spostamento non si somma, torna allo stile di prima", ol.style.marginLeft === "" && !("gdrSpostato" in ol.dataset) && !ol.querySelector("li").hasAttribute("title"), [ol.style.marginLeft]);
  rett(ol, 32); largo(ol, 0);
  applicaIndice(F.app, F.radice, { store: S3, utente: "u1" });
  prova("indice non visibile: niente spostamento, niente errori", ol.style.marginLeft === "" && !("gdrSpostato" in ol.dataset)); }

// --- 1.15.1: il nome intero al passaggio del mouse nella barra degli attori, per gli attori rivelati -----------------------------------
{ const { nomeInteroNellaBarra } = await import("../modulo/scripts/rivela-nome.mjs");
  const att = (id, name, nomi) => ({ id, name, flags: nomi ? { "gdr-strumenti": { nomi } } : {} });
  const elenco = [att("a1", "Oste del Gallo Rosso: Mara Vell", { aspetto: "Oste del Gallo Rosso", vero: "Mara Vell", rivelato: true }),
    att("a2", "Dama forestiera", { aspetto: "Dama forestiera", vero: "Ilaria Venti", rivelato: false }), att("a3", "Guardia del borgo alto", null)];
  globalThis.game = { ...(globalThis.game ?? {}), actors: new Map(elenco.map(a => [a.id, a])) };
  const doc = window.document, ol = doc.createElement("ol");
  ol.innerHTML = elenco.map(a => `<li class="directory-item entry actor" data-entry-id="${a.id}"><a class="entry-name">${a.name}</a></li>`).join("");
  nomeInteroNellaBarra(ol);
  const t = id => ol.querySelector(`[data-entry-id="${id}"] .entry-name`).getAttribute("title");
  prova("barra degli attori: il nome intero al passaggio del mouse solo sugli attori rivelati", (t("a1") === "Oste del Gallo Rosso: Mara Vell") && (t("a2") === null) && (t("a3") === null), [t("a1"), t("a2"), t("a3")]);
  nomeInteroNellaBarra(ol);
  // tornato al nome che descrive, sulla stessa voce: il title messo da qui se ne va
  elenco[0].name = "Oste del Gallo Rosso"; elenco[0].flags["gdr-strumenti"].nomi.rivelato = false; nomeInteroNellaBarra(ol);
  prova("barra degli attori: tornato al nome che descrive, il title se ne va", t("a1") === null, t("a1"));
  elenco[0].name = "Oste del Gallo Rosso: Mara Vell"; elenco[0].flags["gdr-strumenti"].nomi.rivelato = true; nomeInteroNellaBarra(ol);
  prova("barra degli attori: un secondo disegno non cambia niente, e una barra senza voci non dà errori", (t("a1") === "Oste del Gallo Rosso: Mara Vell") && (() => { try { nomeInteroNellaBarra(null); nomeInteroNellaBarra(doc.createElement("div")); return true; } catch { return false; } })()); }

console.log(`\n${fatti - falliti} su ${fatti} prove passate`);
process.exit(falliti ? 1 : 0);
