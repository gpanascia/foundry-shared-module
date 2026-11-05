/**
 * Prove del caricatore (scripts/carica*), in Node, fuori dal mondo: le parti pure (HTML, controllo dei dati,
 * ordinamento) e il giro intero su un Foundry finto (finto-foundry.mjs): prova, applica, verifica, rilancio, ritocchi del GM,
 * pagine di uno script di prima, guardie.
 * Si lanciano dalla cartella prove/, dopo npm install (jsdom):
 *   node prove.mjs
 *   node prove.mjs --senza-subtle (o GDR_SENZA_SUBTLE=1): le stesse prove come in un browser senza crypto.subtle
 * Con GDR_NODE_MODULES=/percorso/node_modules, jsdom si prende da lì.
 * Escono con codice 1 se una prova non passa. Non sostituiscono la prova a vuoto nel mondo (docs/caricatore.md).
 */
import { createRequire } from "node:module";
import { preparaMondo, Journal, Pagina, Cartella, Compendio, Tabella, Attore, Scena, Macro } from "./finto-foundry.mjs";

const jsdom = createRequire(process.env.GDR_NODE_MODULES ? `${process.env.GDR_NODE_MODULES}/` : import.meta.url)("jsdom");
// --senza-subtle, o GDR_SENZA_SUBTLE=1: tutte le prove come in un browser che non dà crypto.subtle (la pagina di Foundry su un http senza TLS)
if ( process.env.GDR_SENZA_SUBTLE || process.argv.includes("--senza-subtle") ) Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
const mondo = preparaMondo({ jsdom });
const M = "../modulo/scripts";
const { carica } = await import(`${M}/carica.mjs`);
const { canonico, controllaHtml, sostituisciCollegamenti, testoPiano } = await import(`${M}/carica/html.mjs`);
const { calcolaSort, controllaGenitori } = await import(`${M}/carica/journal.mjs`);
const { sha256, sha256Js, idFisso, jsonStabile, registraImpostazioni } = await import(`${M}/carica/comune.mjs`);
registraImpostazioni();

let falliti = 0, fatti = 0;
const prova = (nome, cond, dettaglio) => { fatti++; if ( !cond ) { falliti++; console.log(`KO · ${nome}${dettaglio ? `\n     ${typeof dettaglio === "string" ? dettaglio : JSON.stringify(dettaglio, null, 1).slice(0, 2500)}` : ""}`); } else console.log(`ok · ${nome}`); };

// --- lo SHA-256 senza crypto.subtle (1.8.4) -----------------------------------------------------------------------------------------
{
  const hex = u => [...u].map(b => b.toString(16).padStart(2, "0")).join("");
  const enc = t => new TextEncoder().encode(t);
  prova("SHA-256 in JavaScript: i vettori dello standard", (hex(sha256Js(enc(""))) === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    && (hex(sha256Js(enc("abc"))) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    && (hex(sha256Js(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))) === "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"));
  const { createHash, randomBytes } = await import("node:crypto");
  let uguali = true;
  for ( const n of [0, 55, 56, 63, 64, 65, 127, 128, 1000, 70000] ) { const b = randomBytes(n); if ( hex(sha256Js(new Uint8Array(b))) !== createHash("sha256").update(b).digest("hex") ) uguali = false; }
  const ab = randomBytes(300); if ( hex(sha256Js(ab.buffer.slice(ab.byteOffset, ab.byteOffset + 300))) !== createHash("sha256").update(ab).digest("hex") ) uguali = false;
  prova("SHA-256 in JavaScript: uguale a quello di Node, sui bordi dei blocchi e da un ArrayBuffer", uguali);
  const grande = randomBytes(5000), vista = new Uint8Array(grande.buffer, grande.byteOffset + 13, 3000), dv = new DataView(grande.buffer, grande.byteOffset + 7, 2000);
  prova("SHA-256 in JavaScript: viste con lo scarto (Uint8Array e DataView)", (hex(sha256Js(vista)) === createHash("sha256").update(grande.subarray(13, 3013)).digest("hex"))
    && (hex(sha256Js(dv)) === createHash("sha256").update(grande.subarray(7, 2007)).digest("hex")));
  let tipo = null; try { sha256Js("testo"); } catch(err) { tipo = err; }
  prova("SHA-256 in JavaScript: un testo o un oggetto qualunque è un TypeError, come con crypto.subtle", tipo instanceof TypeError);
  // i due rami nella stessa esecuzione: con crypto.subtle (se c'è) e senza, sullo stesso testo e sullo stesso id fisso
  const ID_ATTESO = "PtMDqbF4J092qYlG";                // idFisso("mondo-prova", "xx-citta", "p-voci") con crypto.subtle di Node
  const conSubtle = [await sha256("àèì «prova» 🎲"), await idFisso("mondo-prova", "xx-citta", "p-voci")];
  const cr = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  const senza = [await sha256("àèì «prova» 🎲"), await idFisso("mondo-prova", "xx-citta", "p-voci")];
  Object.defineProperty(globalThis, "crypto", cr);
  prova("impronte e id fissi uguali con e senza crypto.subtle", JSON.stringify(conSubtle) === JSON.stringify(senza), { conSubtle, senza });
  prova("l'id fisso di un documento è quello calcolato con crypto.subtle", senza[1] === ID_ATTESO, senza[1]);
}

// --- HTML ------------------------------------------------------------------------------------------------------------------------------
const opz = { classi: ["dnd-gm-hint"], soloGM: false, riquadroDM: "Nota per il DM", paroleDM: [/\bPG\b/iu, /§/u] };
prova("canonico: la riscrittura dello stile del server non conta", canonico('<p style="text-align: center">a</p>') === canonico('<p style="text-align:center">a</p>'));
prova("canonico: spazi e a capo fra i blocchi non contano", canonico("<p>a  b</p>\n<p>c</p>") === canonico("<p>a b</p><p>c</p>"));
prova("canonico: un blocco rivelato conta", canonico('<section class="secret" id="secret-a"><p>x</p></section>') !== canonico('<section class="secret revealed" id="secret-a"><p>x</p></section>'));
prova("canonico: l'ordine delle classi non conta", canonico('<div class="a b"></div>') === canonico('<div class="b a"></div>'));
let c = controllaHtml('<p>Testo con @GDR[foglio#Il retro]{il foglio} e @GDR[Macro.MacroSussurraXXX]{Sussurra a…}.</p>', opz);
prova("collegamenti @GDR letti, con la sezione", !c.problemi.length && (c.collegamenti.length === 2) && (c.collegamenti[0].ancora === "Il retro") && (c.collegamenti[1].bersaglio === "Macro.MacroSussurraXXX"), c);
c = controllaHtml('<p>@UUID[Actor.abcdefghijklmnop]{x} e [[/r 1d20]]</p><script>alert(1)</script><p onclick="x">a</p><p style="color:red">b</p>', opz);
prova("vietati: @UUID, tiri in linea, script, on*, stile non ammesso", ["@UUID", "tiro in linea", "<script>", "onclick", "color:red"].every(s => c.problemi.some(q => q.includes(s))), c.problemi);
c = controllaHtml('<style>p{}</style><p>a</p>', opz);
prova("vietato: <style> in testa", c.problemi.some(q => q.includes("<style>")), c.problemi);
c = controllaHtml('<section class="secret" id="secret-x"><h2>Titolo</h2></section>', opz);
prova("titolo in un blocco segreto di una pagina che si mostra: problema", c.problemi.some(q => q.includes("titolo dentro un blocco segreto")), c.problemi);
prova("titolo in un blocco segreto di una pagina solo GM: ammesso", !controllaHtml('<section class="secret" id="secret-x"><h2>Titolo</h2></section>', { ...opz, soloGM: true }).problemi.length);
c = controllaHtml('<p>I PG arrivano.</p><section class="secret" id="secret-nota"><div class="dnd-gm-hint"><p><strong>Nota per il DM</strong></p><p>I PG non lo sanno, §4.</p></div></section>', opz);
prova("parole da DM fuori dal riquadro: problema; dentro: no", (c.problemi.length === 1) && c.problemi[0].includes("PG") && !c.problemi[0].includes("§"), c.problemi);
c = controllaHtml('<section class="secret"><p>a</p></section><section class="secret" id="secret-a"></section><section class="secret" id="secret-a"></section>', opz);
prova("blocchi segreti: senza id e id ripetuto", c.problemi.some(q => q.includes("senza id")) && c.problemi.some(q => q.includes("ripetuto")), c.problemi);
c = controllaHtml('<p>@GDR[x]{<em>a</em>}</p>', opz);
prova("@GDR spezzato da un elemento: problema", c.problemi.length > 0, c.problemi);
const s = sostituisciCollegamenti('<p>Vai a @GDR[a]{qui}.</p>', l => `@UUID[JournalEntry.X]{${l.etichetta}}`);
prova("sostituzione dei collegamenti", (s.mancati === 0) && s.html.includes("@UUID[JournalEntry.X]{qui}"), s);

// --- ordinamento -----------------------------------------------------------------------------------------------------------------------
const pag = (chiave, sort, livello = 1) => ({ chiave, sort, livello, nome: chiave });
let r = calcolaSort([{ chiave: "gazza", sort: 100000 }, { chiave: "n1" }, { chiave: "n2" }], [pag("gazza", 100000)], true);
prova("in coda dopo la Gazza", !r.problemi.length && (r.sort.get("n1") === 200000) && (r.sort.get("n2") === 300000), r);
r = calcolaSort([{ chiave: "a", sort: 100 }, { chiave: "n1" }, { chiave: "b", sort: 400 }], [pag("a", 100), pag("b", 400)], true);
prova("fra due pagine", !r.problemi.length && (r.sort.get("n1") === 250), r);
r = calcolaSort([{ chiave: "a", sort: 100 }, { chiave: "n1" }, { chiave: "n2" }, { chiave: "b", sort: 101 }], [pag("a", 100), pag("b", 101)], true);
prova("niente posto fra due sort vicini: problema", r.problemi.length === 1, r);
r = calcolaSort([{ chiave: "b", sort: 400 }, { chiave: "a", sort: 100 }], [pag("a", 100), pag("b", 400)], true);
prova("pagine che ci sono già fuori ordine: problema", r.problemi.some(q => q.includes("spostate")), r);
r = calcolaSort([{ chiave: "a", sort: 100 }, { chiave: "n1" }], [pag("a", 100), pag("x", 150, 2), pag("y", 300)], false);
prova("in coda: dopo la pagina fissa e la sua figlia, prima della pagina dopo", (r.sort.get("n1") === 225) && !r.problemi.length, r);
r = calcolaSort([{ chiave: "a", sort: 100 }, { chiave: "n1" }], [pag("a", 100), pag("x", 150, 2), pag("y", 300)], true);
prova("in coda, contigua: la figlia estranea in mezzo è un problema", r.problemi.some(q => q.includes("altre pagine")), r);
let gp = controllaGenitori([pag("a", 100), pag("x", 150, 2)], [pag("a", 100), pag("n1", 125), pag("x", 150, 2)], new Set(["a", "n1"]));
prova("genitori: una pagina estranea di livello 2 che cambierebbe madre è un problema", gp.some(q => q.includes("«x»")), gp);
gp = controllaGenitori([pag("a", 100), pag("x", 150, 2)], [pag("a", 100), pag("x", 150, 2), pag("n1", 200, 2)], new Set(["a", "n1"]));
prova("genitori: una pagina nuova di livello 2 in coda non cambia le madri degli altri", !gp.length, gp);
gp = controllaGenitori([pag("a", 100), pag("x", 200)], [pag("a", 100), pag("n1", 200), pag("x", 200)], new Set(["a", "n1"]));
prova("genitori: lo stesso sort di una pagina estranea è un problema", gp.some(q => q.includes("stesso sort")), gp);
r = calcolaSort([{ chiave: "a", sort: 100 }, { chiave: "b", sort: 100 }], [pag("a", 100), pag("b", 100)], false);
prova("due pagine della sequenza con lo stesso sort: problema col motivo giusto", r.problemi.some(q => q.includes("stesso sort")), r);
r = calcolaSort([{ chiave: "a", sort: 100 }, { chiave: "b", sort: 400 }], [pag("a", 100), pag("x", 200), pag("b", 400)], true);
prova("contigua: una pagina estranea in mezzo è un problema", r.problemi.some(q => q.includes("altre pagine")), r);
r = calcolaSort([{ chiave: "n1" }, { chiave: "n2" }], [pag("x", 500)], false);
prova("senza pagine fisse: in fondo al journal", (r.sort.get("n1") === 100500) && (r.sort.get("n2") === 200500), r);

// --- il giro intero ---------------------------------------------------------------------------------------------------------------------
const enc = s2 => new TextEncoder().encode(s2);
const IMG = "worlds/mondo-finto/handout/xx-a1b2c3.webp";
mondo.file.set(IMG, enc("immagine finta"));
const IMG_SHA = await sha256(enc("immagine finta"));
// il journal del gruppo c'è già, con la Gazza, scritto da uno script di prima; e una cartella di journal
const cartellaJ = await Cartella.create({ _id: "cartJ00000000000", name: "Capitolo 2", type: "JournalEntry" }, { keepId: true });
const gruppo = await Journal.create({ _id: "gruppo0000000000", name: "Il gruppo", folder: cartellaJ.id, ownership: { default: 0 } }, { keepId: true });
const [gazza] = await gruppo.createEmbeddedDocuments("JournalEntryPage", [{ _id: "gazza00000000000", name: "La Gazza", sort: 100000, ownership: { default: 0 }, text: { content: "<p>Notizie.</p>" } }], { keepId: true });
const vecchia = (await gruppo.createEmbeddedDocuments("JournalEntryPage", [{ _id: "vecchia000000000", name: "Una moneta", sort: 900000, ownership: { default: 0 }, text: { content: '<p style="text-align: center">Una moneta.</p>' } }], { keepId: true }))[0];
const campagna = { abbr: "xx", suffissoSoloGM: "(solo GM)", riquadroDM: "Nota per il DM", classi: ["dnd-gm-hint"], paroleDM: ["\\bPG\\b", "§"], ammessi: ["Gamemaster", "Marco"], cartellaRapporti: "scambio" };
const nota = '<section class="secret" id="secret-nota-dm"><div class="dnd-gm-hint"><p><strong>Nota per il DM</strong></p><p>Mostrala quando lo trovano.</p></div></section>';
const datiBase = () => ({
  formato: "gdr-carico/1", carico: "xx-scena3", titolo: "Prova", mondo: "mondo-finto",
  generato: { da: "xx/foundry/genera.py", commit: "abc1234", il: "2026-01-10T18:00:00Z" },
  campagna, file: [{ percorso: IMG, sha256: IMG_SHA }],
  operazioni: [
    { op: "cartella", rif: "cartella-scena", tipo: "JournalEntry", nome: "Scena 3", padre: { id: cartellaJ.id } },
    { op: "journal", rif: "scena-gm", nome: "Scena 3 (solo GM)", cartella: "cartella-scena", pagine: [
      { rif: "regole", nome: "Regole dello scontro (solo GM)", tipo: "text", html: '<h2>Le leve</h2><p>Vedi @GDR[sussurri]{i sussurri} e @GDR[biglietto]{il biglietto}.</p><div class="gdr-regola"><p><strong>Regola</strong> CD 15.</p></div>' },
      { rif: "sussurri", nome: "Sussurri (solo GM)", tipo: "text", livello: 2, html: '<p>Manda @GDR[regole#Le leve]{le leve}.</p>' }
    ] },
    { op: "journal", rif: "gruppo", id: gruppo.id, nome: "Il gruppo", cartella: { id: cartellaJ.id }, crea: false, pagine: [
      { rif: "biglietto", nome: "Il biglietto", tipo: "text", html: `<p style="text-align: center"><img src="${IMG}" alt="Il biglietto"></p><p>Ci vediamo al porto.</p>${nota}` },
      { rif: "foglio", nome: "Un foglio", tipo: "image", src: IMG, didascalia: "" },
      { rif: "nodo", nome: "Il mercato", tipo: "text", html: "", visibilita: "osservatore", decisione: "GM, 2026-01-10: sì, a Observer da subito" }
    ], ordine: { sequenza: [{ id: gazza.id }, "nodo", "biglietto", "foglio"] } }
  ]
});
const lancia = async (dati, modo, firma, extra = {}) => {
  const testo = JSON.stringify(dati);
  return carica({ modo, utente: "Lucia", testo, sha256: await sha256(testo), ...(firma ? { firma } : {}), ...extra });
};

let d = datiBase();
let p1 = await lancia(d, "prova");
prova("prova pulita su un mondo dove manca tutto", p1.esito === "prova pulita", { problemi: p1.problemi, avvisi: p1.avvisi });
prova("il piano: 1 cartella, 1 journal, 5 pagine (7 creazioni)", p1.piano.filter(x => x.azione === "crea").length === 7, p1.piano);
prova("la prova non scrive", !game.journal.some(j => j.name === "Scena 3 (solo GM)") && ![...mondo.file.keys()].some(k => k.includes("rapporto")));
let a1 = await lancia(d, "applica", "0".repeat(64));
prova("applica con una firma sbagliata: fermato", (a1.esito === "fermato") && a1.problemi.some(q => q.includes("firma")), a1.problemi);
a1 = await lancia(d, "applica", p1.firma);
prova("applica: OK", a1.esito === "OK", { problemi: a1.problemi, errori: a1.errori, verifica: a1.verifica.filter(v => v.startsWith("KO")) });
prova("applica: la verifica è tutta OK", a1.verifica.length && a1.verifica.every(v => v.startsWith("OK")), a1.verifica);
prova("applica: il rapporto è salvato e riletto", /^Data\/scambio\/xx-carico-xx-scena3-rapporto-/.test(a1.salvato ?? ""), a1.salvato);
const J = game.journal.find(j => j.name === "Scena 3 (solo GM)");
const idFJ = await idFisso("mondo-finto", "xx-scena3", "scena-gm");
prova("il journal nuovo ha l'id fisso, a None, nella cartella nuova", J && (J.id === idFJ) && (J.ownership.default === 0) && (J.folder?.name === "Scena 3") && (J.folder?.folder?.id === cartellaJ.id));
const regole = J?.pages.find(x => x.name.startsWith("Regole"));
const sussurri = J?.pages.find(x => x.name.startsWith("Sussurri"));
prova("collegamento con sezione: l'ancora la calcola slugifyHeading", sussurri?.text.content.includes(`@UUID[JournalEntry.${J.id}.JournalEntryPage.${regole.id}#le-leve]{le leve}`), sussurri?.text.content);
const big = gruppo.pages.find(x => x.name === "Il biglietto");
prova("collegamento verso una pagina dell'altro journal", regole?.text.content.includes(`@UUID[JournalEntry.${gruppo.id}.JournalEntryPage.${big?.id}]{il biglietto}`), regole?.text.content);
const ord = gruppo.pages.contents.sort((x, y) => x.sort - y.sort).map(x => x.name);
prova("l'ordine del journal del gruppo: Gazza, nodo, biglietto, foglio, e la pagina di prima in fondo", JSON.stringify(ord) === JSON.stringify(["La Gazza", "Il mercato", "Il biglietto", "Un foglio", "Una moneta"]), ord);
const nodo = gruppo.pages.find(x => x.name === "Il mercato");
prova("il nodo a Observer, con la sua decisione nel piano; il biglietto a None", (nodo?.ownership.default === 2) && (big?.ownership.default === 0) && p1.piano.some(x => x.decisione?.includes("Observer")));
prova("le corrispondenze ci sono per tutti i documenti del file", a1.corrispondenze.length === 8, a1.corrispondenze);

// rilancio con gli stessi dati: niente da fare
let p2 = await lancia(d, "prova");
prova("rilancio: niente da fare", (p2.esito === "prova pulita") && !p2.piano.length, { piano: p2.piano, problemi: p2.problemi });

// i dati cambiano il testo di una pagina: si aggiorna
d = datiBase(); d.operazioni[1].pagine[1].html = '<p>Manda @GDR[regole#Le leve]{le leve}, poi aspetta.</p>';
p2 = await lancia(d, "prova");
prova("dati cambiati: il piano aggiorna il testo", (p2.esito === "prova pulita") && (p2.piano.length === 1) && (p2.piano[0].azione === "aggiorna") && p2.piano[0].campi.includes("testo"), p2);
let a2 = await lancia(d, "applica", p2.firma);
prova("dati cambiati: applica OK", (a2.esito === "OK") && sussurri.text.content.includes("poi aspetta"), { esito: a2.esito, problemi: a2.problemi, verifica: a2.verifica });

// il GM rinomina una pagina in Foundry: i dati vecchi si fermano; i dati col nome nuovo rinnovano il segno
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: big.id, name: "Al porto!" }]);
p2 = await lancia(d, "prova");
prova("ritocco del GM (nome) che i dati non toccano: un avviso, la pagina resta", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("ritoccata in Foundry (nome)")) && !p2.piano.some(x => x.nome === "Il biglietto"), { problemi: p2.problemi, avvisi: p2.avvisi, piano: p2.piano });
const dNome = datiBase(); dNome.operazioni[2].pagine[0].nome = "Il biglietto di Ottone";
p2 = await lancia(dNome, "prova");
prova("ritocco del GM (nome) e dati che vogliono un altro nome: problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("nel mondo «Al porto!»")), p2.problemi);
d.operazioni[2].pagine[0].nome = "Al porto!";
p2 = await lancia(d, "prova");
prova("ritocco riportato nei dati: si rinnova solo il segno", (p2.esito === "prova pulita") && (p2.piano.length === 1) && (p2.piano[0].azione === "segna"), p2.piano);
a2 = await lancia(d, "applica", p2.firma);
prova("segno rinnovato: OK", a2.esito === "OK", { problemi: a2.problemi, verifica: a2.verifica.filter(v => v.startsWith("KO")) });

// un blocco rivelato in Foundry: i dati che cambiano quella pagina si fermano, con il motivo
const html0 = big.text.content;
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: big.id, "text.content": html0.replace('class="secret"', 'class="secret revealed"') }]);
d.operazioni[2].pagine[0].html = d.operazioni[2].pagine[0].html.replace("Ci vediamo al porto.", "Ci vediamo al porto, stanotte.");
p2 = await lancia(d, "prova");
prova("blocco rivelato in Foundry: problema col motivo", p2.problemi.some(q => q.includes("blocchi rivelati 0 → 1")), p2.problemi);
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: big.id, "text.content": html0 }]);

// una pagina di uno script di prima: senza «precedente» non si aggiorna; con «precedente» uguale al mondo sì
d = datiBase(); d.operazioni[2].pagine[0].nome = "Al porto!";
d.operazioni[2].pagine.push({ rif: "moneta", id: vecchia.id, nome: "Una moneta", tipo: "text", html: '<p style="text-align: center">Una moneta d\'oro.</p>' });
d.operazioni[2].ordine.sequenza.push("moneta");
p2 = await lancia(d, "prova");
prova("pagina di uno script di prima, diversa, senza precedente: problema", p2.problemi.some(q => q.includes("Una moneta") && q.includes("precedente")), p2.problemi);
d.operazioni[2].pagine.at(-1).precedente = { nome: "Una moneta", livello: 1, html: '<p style="text-align: center">Una moneta.</p>' };
p2 = await lancia(d, "prova");
prova("con precedente uguale al mondo: si aggiorna", (p2.esito === "prova pulita") && p2.piano.some(x => (x.nome === "Una moneta") && (x.azione === "aggiorna")), { problemi: p2.problemi, piano: p2.piano });
a2 = await lancia(d, "applica", p2.firma);
prova("aggiornata, e da ora col segno", (a2.esito === "OK") && vecchia.flags["gdr-strumenti"]?.carico?.chiave, { esito: a2.esito, problemi: a2.problemi, verifica: a2.verifica.filter(v => v.startsWith("KO")) });

// il mondo cambia fra la prova e «applica»: la firma non torna
d = datiBase(); d.operazioni[2].pagine[0].nome = "Al porto!"; d.operazioni[1].pagine.push({ rif: "nuova", nome: "Cosa dicono (solo GM)", tipo: "text", html: "<p>Niente.</p>" });
p2 = await lancia(d, "prova");
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: gazza.id, "text.content": "<p>Notizie nuove.</p>" }]);
a2 = await lancia(d, "applica", p2.firma);
prova("mondo cambiato dopo la prova: firma che non torna, niente scritto", (a2.esito === "fermato") && a2.problemi.some(q => q.includes("firma")) && !J.pages.some(x => x.name.startsWith("Cosa dicono")), a2.problemi);

// una pagina con «aggiorna: false» diversa dai dati: un avviso; il resto del carico va, e la verifica la ritrova com'era
d = datiBase(); d.operazioni[2].pagine[0].nome = "Al porto!"; d.operazioni[2].pagine[0].aggiorna = false; d.operazioni[2].pagine[0].html += "<p>Poscritto.</p>";
d.operazioni[1].pagine.push({ rif: "dicono", nome: "Cosa dicono (solo GM)", tipo: "text", html: "<p>Niente.</p>" });
p2 = await lancia(d, "prova");
prova("aggiorna: false: un avviso, non un problema", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("di non aggiornarla")), { problemi: p2.problemi, avvisi: p2.avvisi });
a2 = await lancia(d, "applica", p2.firma);
prova("aggiorna: false: applica OK, verifica tutta OK", (a2.esito === "OK") && !big.text.content.includes("Poscritto"), { esito: a2.esito, problemi: a2.problemi, verifica: a2.verifica.filter(v => v.startsWith("KO")) });

// guardie: chi altro è connesso è un avviso e non ferma niente; l'avviso dice i due rischi che il caricatore non vede
const dConn = structuredClone(d);
for ( const [uid, chi, gm] of [["pl1aaaaaaaaaaaaa", "Alba", false], ["gm3ccccccccccccc", "Nadia", true]] ) {
  dConn.operazioni[1].pagine.push({ rif: `connessi-${chi.toLowerCase()}`, nome: `Coi connessi ${chi} (solo GM)`, tipo: "text", html: "<p>Si scrive.</p>" });
  game.users.get(uid).active = true;
  p2 = await lancia(dConn, "prova");
  prova(`${chi} connessa: la prova si fa, con un avviso che dice il rischio, senza note da scollegare`, (p2.esito === "prova pulita") && !!p2.firma && p2.avvisi.some(q => q.includes(chi) && q.includes("Non fermano il caricatore") && q.includes(gm ? "documento aperto in modifica" : "vede subito quello che i dati le rendono visibile")) && !p2.note.some(q => q.includes("scollegati")) && !p2.problemi.length, { esito: p2.esito, problemi: p2.problemi, avvisi: p2.avvisi, note: p2.note });
  a2 = await lancia(dConn, "applica", p2.firma);
  prova(`${chi} connessa: applica scrive`, (a2.esito === "OK") && game.journal.contents.some(j => j.pages.contents.some(x => x.name === `Coi connessi ${chi} (solo GM)`)), { esito: a2.esito, problemi: a2.problemi });
  game.users.get(uid).active = false;
}
// la firma non dipende da chi è connesso: prova con Alba fuori, «applica» con Alba dentro, stessa firma, scrive
{ const dF2 = structuredClone(dConn); dF2.operazioni[1].pagine.push({ rif: "connessi-firma", nome: "Coi connessi firma (solo GM)", tipo: "text", html: "<p>Firma.</p>" });
  const pf = await lancia(dF2, "prova");
  game.users.get("pl1aaaaaaaaaaaaa").active = true;
  const pf2 = await lancia(dF2, "prova");
  const af = await lancia(dF2, "applica", pf.firma);
  game.users.get("pl1aaaaaaaaaaaaa").active = false;
  prova("la firma non dipende da chi è connesso: uguale con Alba fuori e dentro, e «applica» con Alba dentro scrive", (pf.firma === pf2.firma) && (af.esito === "OK") && game.journal.contents.some(j => j.pages.contents.some(x => x.name === "Coi connessi firma (solo GM)")), { f1: pf.firma, f2: pf2.firma, esito: af.esito, problemi: af.problemi }); }
game.users.get("gm1aaaaaaaaaaaaa").active = true;
p2 = await lancia(d, "prova");
prova("GM ammesso connesso: un avviso che lo dice ammesso, non un problema", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("Gamemaster (GM, ammesso)")), { problemi: p2.problemi, avvisi: p2.avvisi });
game.users.get("gm1aaaaaaaaaaaaa").active = false;
p2 = await carica({ modo: "prova", utente: "Ugo", testo: JSON.stringify(d), sha256: await sha256(JSON.stringify(d)) });
prova("utente diverso da chi lancia: fermato", (p2.esito === "fermato") && p2.problemi.some(q => q.includes("utente")), p2.problemi);
game.version = "14.370";
p2 = await lancia(d, "prova");
prova("Foundry aggiornato: fermato finché non è riverificato", (p2.esito === "fermato") && p2.problemi.some(q => q.includes("14.370")), p2.problemi);
game.version = "14.369";

// dati sbagliati
const sbaglia = async (fn, atteso, nome) => { const x = datiBase(); fn(x); const r2 = await lancia(x, "prova"); prova(nome, ["fermato", "prova con problemi"].includes(r2.esito) && r2.problemi.some(q => q.includes(atteso)), r2.problemi); };
await sbaglia(x => { x.operazioni[1].pagine[0].colore = "rosso"; }, "campo sconosciuto «colore»", "campo sconosciuto: problema");
await sbaglia(x => { x.operazioni[1].pagine[0].visibilita = "osservatore"; x.operazioni[1].pagine[0].decisione = "GM, oggi, così"; }, "regola fissa 1", "pagina solo GM a Observer: problema");
await sbaglia(x => { x.operazioni[2].pagine[2].decisione = undefined; }, "decisione del GM", "visibilità senza decisione: problema");
await sbaglia(x => { x.operazioni[2].pagine[0].html += "<p>I PG ridono.</p>"; }, "parole da DM", "parola da DM in una pagina che si mostra: problema");
await sbaglia(x => { x.operazioni[2].pagine[0].html = '<p>@GDR[regole]{le regole}</p>'; }, "documento solo GM", "pagina che si mostra verso una solo GM: problema");
await sbaglia(x => { x.operazioni.push({ op: "suono", rif: "a" }); }, "op «suono» sconosciuta", "operazione sconosciuta: problema");
await sbaglia(x => { x.file = []; }, "non è elencata in file", "immagine non elencata: problema");
await sbaglia(x => { x.formato = "gdr-carico/2"; }, "formato", "formato sconosciuto: problema");
await sbaglia(x => { x.operazioni[2].ordine.sequenza.pop(); }, "non è nella sequenza", "pagina fuori dalla sequenza: problema");
mondo.file.set(IMG, enc("immagine cambiata"));
p2 = await lancia(datiBase(), "prova");
prova("immagine nel mondo con un'altra impronta: problema", p2.problemi.some(q => q.includes("SHA-256")), p2.problemi);
mondo.file.set(IMG, enc("immagine finta"));

// rimanda: la pagina dopo cui vanno le nuove non c'è ancora
const dr = datiBase();
dr.carico = "xx-scena4";
dr.operazioni = [{ op: "journal", rif: "gruppo", id: gruppo.id, nome: "Il gruppo", cartella: { id: cartellaJ.id }, crea: false,
  pagine: [{ rif: "lettera", nome: "Una lettera", tipo: "text", html: "<p>Cara amica.</p>" }],
  ordine: { sequenza: [{ carico: "xx-citta", rif: "gazza-2" }, "lettera"], seMancaAncora: "rimanda" } }];
dr.file = [];
p2 = await lancia(dr, "prova");
prova("rimanda: nota, niente piano", (p2.esito === "prova pulita") && !p2.piano.length && p2.note.some(q => q.includes("si rimandano")), { problemi: p2.problemi, note: p2.note });
dr.operazioni.push({ op: "journal", rif: "gm4", nome: "Scena 4 (solo GM)", cartella: null, pagine: [{ rif: "s4", nome: "Note", tipo: "text", html: "<p>Vedi @GDR[lettera]{la lettera}.</p>" }] });
p2 = await lancia(dr, "prova");
prova("rimanda: una pagina che porta a una pagina rimandata è un problema", p2.problemi.some(q => q.includes("rimandate")), p2.problemi);

// una scrittura che non riesce: ci si ferma, il rapporto lo dice e si salva
const df = datiBase(); df.carico = "xx-scena5"; df.operazioni = [{ op: "journal", rif: "gm5", nome: "Scena 5 (solo GM)", cartella: null, pagine: [{ rif: "s5", nome: "Note", tipo: "text", html: "<p>a</p>" }] }]; df.file = [];
p2 = await lancia(df, "prova");
globalThis.__finto.fallisci = "journal";
a2 = await lancia(df, "applica", p2.firma);
globalThis.__finto.fallisci = null;
prova("scrittura non riuscita: da guardare, rapporto salvato", (a2.esito === "da guardare") && a2.errori.some(q => q.includes("errore finto")) && /^Data\//.test(a2.salvato ?? ""), { esito: a2.esito, errori: a2.errori, salvato: a2.salvato });

// rule 6: una pagina solo GM che una giocatrice vede già
const tocca = gruppo.pages.get(gazza.id);
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: gazza.id, name: "Appunti del DM (solo GM)", ownership: { default: 2 } }]);
p2 = await lancia(datiBase(), "prova");
prova("pagina solo GM visibile nel journal toccato: problema", p2.problemi.some(q => q.includes("la vede già")), p2.problemi);
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: gazza.id, name: "La Gazza", ownership: { default: 0 } }]);

// --- casi limite ------------------------------------------------------------------------------------------------------------------------
const opzP = { classi: ["dnd-gm-hint"], soloGM: false, riquadroDM: "Nota per il DM", paroleDM: [/\bPG\b/iu] };
c = controllaHtml('<div class="dnd-gm-hint"><p><strong>Nota per il DM</strong></p><p>Il mittente è Klaus.</p></div>', opzP);
prova("riquadro fuori dal blocco segreto in una pagina che si mostra: problema", c.problemi.some(q => q.includes("riquadro")) && c.problemi.some(q => q.includes("dnd-gm-hint")), c.problemi);
c = controllaHtml('<div class="secret"><p>a</p></div><span class="revealed">b</span>', opzP);
prova("classi secret e revealed fuori da <section>: problema", c.problemi.filter(q => q.includes("fuori da <section>")).length === 2, c.problemi);
c = controllaHtml('<p>&Reference[blinded]{accecata}</p>', opzP);
prova("arricchitore &Reference: problema", c.problemi.some(q => q.includes("&Reference")), c.problemi);
prova("canonico: <b> come <strong>, <i> come <em>, span vuoto, p vuoto", canonico("<p><b>a</b> <i>b</i><span>c</span></p><p></p>") === canonico("<p><strong>a</strong> <em>b</em>c</p>"));
prova("canonico: il <p> di ProseMirror dentro un <li> non conta", canonico("<ul><li>uno</li></ul>") === canonico("<ul><li><p>uno</p></li></ul>"));
prova("canonico: uno spazio fra due parole conta", canonico("<p>Il <strong>gruppo</strong></p>") !== canonico("<p>Il<strong>gruppo</strong></p>"));
await sbaglia(x => { x.operazioni[2].pagine[2].visibilita = "proprietarie"; x.operazioni[2].pagine[2].html = nota; }, "proprietaria", "pagina delle proprietarie con un blocco segreto: problema");
await sbaglia(x => { x.operazioni[2].pagine[1].src = "worlds/mondo-finto/handout/xx-pg-traditore.webp"; x.file.push({ percorso: "worlds/mondo-finto/handout/xx-pg-traditore.webp", sha256: IMG_SHA }); }, "file", "nome del file con una parola da DM in una pagina che si mostra: problema");
await sbaglia(x => { x.operazioni[2].pagine[2].decisione = "GM: sì, a Observer"; }, "con la data", "decisione senza la data: problema");
await sbaglia(x => { x.carico = "yy-scena3"; }, "deve cominciare con «xx-»", "carico senza l'abbreviazione della campagna: problema");
await sbaglia(x => { x.operazioni[1].pagine[0].html = '<p>@GDR[Macro.MacroSussurraXXX]{x}</p>'; x.operazioni[2].pagine[0].html = '<p>@GDR[Macro.MacroSussurraXXX]{la macro}</p>'; }, "macro o a una tabella", "pagina che si mostra verso una macro: problema");

// una pagina che si mostra rinominata solo GM nei dati: problema
let db = datiBase(); db.operazioni[2].pagine[0].nome = "Al porto! (solo GM)";
p2 = await lancia(db, "prova");
prova("pagina che si mostra che i dati vogliono solo GM: problema", p2.problemi.some(q => q.includes("i dati la vogliono solo GM")), p2.problemi);

// una pagina tolta dal GM: il rilancio non la ricrea in silenzio; con «ricrea» sì
const db0 = () => { const x = datiBase(); x.operazioni[2].pagine[0].nome = "Al porto!"; return x; };
const foglio = gruppo.pages.find(x => x.name === "Un foglio");
gruppo.pages.delete(foglio.id);
p2 = await lancia(db0(), "prova");
prova("pagina tolta dal GM: problema, non si ricrea", p2.problemi.some(q => q.includes("non c'è più") && q.includes("Un foglio")), p2.problemi);
db = db0(); db.operazioni[2].pagine[1].ricrea = true;
p2 = await lancia(db, "prova");
prova("con «ricrea»: si ricrea", (p2.esito === "prova pulita") && p2.piano.some(x => (x.azione === "crea") && (x.nome === "Un foglio")), { problemi: p2.problemi, piano: p2.piano });
a2 = await lancia(db, "applica", p2.firma);
prova("ricreata: OK", a2.esito === "OK", { problemi: a2.problemi, errori: a2.errori, verifica: a2.verifica.filter(v => v.startsWith("KO")) });

// una pagina che i dati spostano in un altro journal: problema, non doppione
db = db0(); const spostata = db.operazioni[1].pagine.pop(); db.operazioni.push({ op: "journal", rif: "altro", nome: "Altro (solo GM)", cartella: null, pagine: [spostata] });
p2 = await lancia(db, "prova");
prova("pagina spostata dai dati in un altro journal: problema", p2.problemi.some(q => q.includes("in un altro journal")), p2.problemi);

// un blocco rivelato in Foundry su una pagina che i dati non cambiano: avviso; le altre si aggiornano
const bigl = gruppo.pages.find(x => x.name === "Al porto!");
const h0 = bigl.text.content;
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: bigl.id, "text.content": h0.replace('class="secret"', 'class="secret revealed"') }]);
db = db0(); db.operazioni[1].pagine[0].html += "<p>Aggiunta.</p>";
p2 = await lancia(db, "prova");
prova("blocco rivelato su una pagina che i dati non cambiano: avviso; l'altra si aggiorna", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("Al porto!") && q.includes("ritoccata")) && p2.piano.some(x => x.nome.startsWith("Regole") && (x.azione === "aggiorna")), { problemi: p2.problemi, avvisi: p2.avvisi, piano: p2.piano });
a2 = await lancia(db, "applica", p2.firma);
prova("applicato senza toccare il blocco rivelato", (a2.esito === "OK") && bigl.text.content.includes("secret revealed"), { problemi: a2.problemi, verifica: a2.verifica.filter(v => v.startsWith("KO")) });
// «accetta»: il testo del mondo preso come ultima scrittura, poi i dati lo riscrivono; ma mai sopra un blocco rivelato
const dAcc = db0(); dAcc.operazioni[1].pagine[0].html += "<p>Aggiunta.</p>"; dAcc.operazioni[2].pagine[0].html = dAcc.operazioni[2].pagine[0].html.replace("Ci vediamo", "Ci vediamo stanotte");
p2 = await lancia(dAcc, "prova");
const accetta = (p2.problemi.find(q => q.includes("«accetta»")) ?? "").match(/"([0-9a-f]{64})"/)?.[1];
prova("conflitto sul testo: la prova dà l'impronta per «accetta»", !!accetta, p2.problemi);
// con un conflitto il piano si ferma lì: le pagine nuove non si mettono in ordine e non entrano nel piano
const dNuova = structuredClone(dAcc); dNuova.operazioni[2].pagine.push({ rif: "p-nuova-conflitto", nome: "Nuova (solo GM)", tipo: "text", livello: 1, html: "<p>Nuova.</p>" });
dNuova.operazioni[2].ordine.sequenza.push("p-nuova-conflitto");
const p3 = await lancia(dNuova, "prova");
prova("conflitto: il piano si ferma prima delle pagine nuove", p3.problemi.some(q => q.includes("«accetta»")) && !p3.piano.some(x => x.nome === "Nuova (solo GM)"), { problemi: p3.problemi, piano: p3.piano });
dAcc.operazioni[2].pagine[0].accetta = accetta;
p2 = await lancia(dAcc, "prova");
prova("con «accetta», ma col blocco rivelato nel mondo: problema", p2.problemi.some(q => q.includes("blocchi rivelati")), p2.problemi);
await gruppo.updateEmbeddedDocuments("JournalEntryPage", [{ _id: bigl.id, "text.content": h0 }]);

// una pagina di un altro carico, adottata (id non fisso), si trova per segno
const dAd = datiBase(); dAd.carico = "xx-scena6"; dAd.file = [];
dAd.operazioni = [{ op: "journal", rif: "gm6", nome: "Scena 6 (solo GM)", cartella: null, pagine: [{ rif: "s6", nome: "Note", tipo: "text", html: "<p>Vedi @GDR[xx-scena3/moneta]{la moneta}.</p>" }] }];
db = db0(); db.operazioni[2].pagine.push({ rif: "moneta", id: vecchia.id, nome: "Una moneta", tipo: "text", html: '<p style="text-align: center">Una moneta d\'oro.</p>' }); db.operazioni[2].ordine.sequenza.push("moneta");
p2 = await lancia(db, "prova"); a2 = await lancia(db, "applica", p2.firma);
p2 = await lancia(dAd, "prova");
prova("collegamento carico/rif verso una pagina adottata: si trova per segno", (p2.esito === "prova pulita") && p2.piano.length, p2.problemi);

// senza «ordine», una pagina nuova in mezzo al file va in mezzo
const dOrd = datiBase(); dOrd.carico = "xx-scena7"; dOrd.file = [];
dOrd.operazioni = [{ op: "journal", rif: "gm7", nome: "Scena 7 (solo GM)", cartella: null, pagine: [{ rif: "uno", nome: "Uno", tipo: "text", html: "<p>1</p>" }, { rif: "tre", nome: "Tre", tipo: "text", html: "<p>3</p>" }] }];
p2 = await lancia(dOrd, "prova"); a2 = await lancia(dOrd, "applica", p2.firma);
dOrd.operazioni[0].pagine.splice(1, 0, { rif: "due", nome: "Due", tipo: "text", html: "<p>2</p>" });
p2 = await lancia(dOrd, "prova"); a2 = await lancia(dOrd, "applica", p2.firma);
const j7 = game.journal.find(j => j.name === "Scena 7 (solo GM)");
prova("senza «ordine»: la pagina nuova va al suo posto nel file", (a2.esito === "OK") && (JSON.stringify(j7.pages.contents.sort((x, y) => x.sort - y.sort).map(x => x.name)) === '["Uno","Due","Tre"]'), { esito: a2.esito, problemi: a2.problemi, verifica: a2.verifica });

// una pagina nuova di livello 2 che renderebbe figlia una pagina del GM: problema
await j7.createEmbeddedDocuments("JournalEntryPage", [{ name: "Appunto del GM", sort: j7.pages.find(x => x.name === "Tre").sort + 1000, title: { level: 2 } }]);
dOrd.operazioni[0].pagine.push({ rif: "quattro", nome: "Quattro", tipo: "text", livello: 1, html: "<p>4</p>" });
dOrd.operazioni[0].pagine.splice(3, 0, { rif: "tre-bis", nome: "Tre bis", tipo: "text", livello: 1, html: "<p>3b</p>" });
p2 = await lancia(dOrd, "prova");
prova("pagina nuova dopo una pagina con una figlia del GM: va dopo la figlia, nessun problema", (p2.esito === "prova pulita") && (p2.piano.find(x => x.nome === "Tre bis")?.sort > j7.pages.find(x => x.name === "Appunto del GM").sort), { problemi: p2.problemi, piano: p2.piano });
dOrd.operazioni[0].pagine.find(x => x.rif === "tre").livello = 2;
p2 = await lancia(dOrd, "prova");
prova("un livello cambiato dai dati che cambierebbe la madre di una pagina del GM: problema", p2.problemi.some(q => q.includes("Appunto del GM") && q.includes("figlia")), p2.problemi);
dOrd.operazioni[0].pagine.find(x => x.rif === "tre").livello = 1;

// il blocco nel mondo: un altro carico in corso ferma «applica»
const dLk = datiBase(); dLk.carico = "xx-scena8"; dLk.file = []; dLk.operazioni = [{ op: "journal", rif: "gm8", nome: "Scena 8 (solo GM)", cartella: null, pagine: [{ rif: "s8", nome: "Note", tipo: "text", html: "<p>a</p>" }] }];
p2 = await lancia(dLk, "prova");
await game.settings.set("gdr-strumenti", "caricoInCorso", { gettone: "altro", carico: "xx-altro", utente: "Ugo", avvio: Date.now() });
a2 = await lancia(dLk, "applica", p2.firma);
prova("un altro carico in corso nel mondo: fermato", (a2.esito === "fermato") && a2.problemi.some(q => q.includes("un altro carico è in corso")), a2.problemi);
await game.settings.set("gdr-strumenti", "caricoInCorso", {});
a2 = await lancia(dLk, "applica", p2.firma);
prova("col blocco libero: OK, e il blocco si lascia", (a2.esito === "OK") && !game.settings.get("gdr-strumenti", "caricoInCorso").gettone, a2.problemi);

// due titoli con la stessa ancora: problema
const dAn = datiBase(); dAn.carico = "xx-scena9"; dAn.file = [];
dAn.operazioni = [{ op: "journal", rif: "gm9", nome: "Scena 9 (solo GM)", cartella: null, pagine: [
  { rif: "a9", nome: "A", tipo: "text", html: "<h2>Città</h2><h2>Citta</h2>" }, { rif: "b9", nome: "B", tipo: "text", html: "<p>@GDR[a9#Città]{la città}</p>" }] }];
p2 = await lancia(dAn, "prova");
prova("due titoli con la stessa ancora: problema", p2.problemi.some(q => q.includes("ancora")), p2.problemi);

// --- casi limite: ordine e registro --------------------------------------------------------------------------------------------------
prova("canonico: <li><p>uno</p><ul>…</ul></li> come <li>uno<ul>…</ul></li>", canonico("<ul><li><p>uno</p><ul><li>due</li></ul></li></ul>") === canonico("<ul><li>uno<ul><li>due</li></ul></li></ul>"));
// un ritocco del GM durante il carico, fra le creazioni e gli aggiornamenti: non si sovrascrive
const dR = datiBase(); dR.carico = "xx-scena10"; dR.file = [];
dR.operazioni = [{ op: "journal", rif: "u10", nome: "Uno (solo GM)", cartella: null, pagine: [{ rif: "b10", nome: "B", tipo: "text", html: "<p>b</p>" }] },
  { op: "journal", rif: "d10", nome: "Due (solo GM)", cartella: null, pagine: [{ rif: "c10", nome: "C", tipo: "text", html: "<p>c</p>" }] }];
p2 = await lancia(dR, "prova"); a2 = await lancia(dR, "applica", p2.firma);
dR.operazioni[0].pagine.push({ rif: "n10", nome: "Nuova", tipo: "text", html: "<p>n</p>" });
dR.operazioni[1].pagine[0].html = "<p>c, dai dati</p>";
p2 = await lancia(dR, "prova");
const j10 = game.journal.find(j => j.name === "Due (solo GM)");
globalThis.__finto.dopoCrea = async () => j10.updateEmbeddedDocuments("JournalEntryPage", [{ _id: j10.pages.find(x => x.name === "C").id, "text.content": "<p>c, ritoccata dal GM</p>" }]);
a2 = await lancia(dR, "applica", p2.firma);
prova("ritocco del GM durante il carico: non si sovrascrive, da guardare", (a2.esito === "da guardare") && j10.pages.find(x => x.name === "C").text.content.includes("dal GM") && a2.errori.some(q => q.includes("cambiate durante il carico")), { esito: a2.esito, errori: a2.errori });

// un collegamento a una sezione di una pagina ritoccata che resta com'è: problema
const dS = datiBase(); dS.carico = "xx-scena11"; dS.file = [];
dS.operazioni = [{ op: "journal", rif: "g11", nome: "Scena 11 (solo GM)", cartella: null, pagine: [
  { rif: "a11", nome: "A", tipo: "text", html: "<h2>Le leve</h2><p>x</p>" }, { rif: "b11", nome: "B", tipo: "text", html: "<p>b</p>" }] }];
p2 = await lancia(dS, "prova"); a2 = await lancia(dS, "applica", p2.firma);
const j11 = game.journal.find(j => j.name === "Scena 11 (solo GM)");
await j11.updateEmbeddedDocuments("JournalEntryPage", [{ _id: j11.pages.find(x => x.name === "A").id, "text.content": "<h2>Le leve del porto</h2><p>x</p>" }]);
dS.operazioni[0].pagine[1].html = "<p>Vedi @GDR[a11#Le leve]{le leve}.</p>";
p2 = await lancia(dS, "prova");
prova("sezione di una pagina ritoccata che resta com'è: problema", p2.problemi.some(q => q.includes("la sezione «Le leve»")), { problemi: p2.problemi, avvisi: p2.avvisi });

// il registro non si scrive: non si scrive niente
const dG = datiBase(); dG.carico = "xx-scena12"; dG.file = []; dG.operazioni = [{ op: "journal", rif: "g12", nome: "Scena 12 (solo GM)", cartella: null, pagine: [{ rif: "a12", nome: "A", tipo: "text", html: "<p>a</p>" }] }];
p2 = await lancia(dG, "prova");
globalThis.__finto.fallisciRegistro = true;
const setVero = game.settings.set;
game.settings.set = async (m, k, v) => { if ( k === "carichi" ) throw new Error("registro finto non scrivibile"); return setVero(m, k, v); };
a2 = await lancia(dG, "applica", p2.firma);
game.settings.set = setVero;
prova("registro non scrivibile: niente scritto", (a2.esito === "fermato") && !game.journal.some(j => j.name === "Scena 12 (solo GM)"), { esito: a2.esito, problemi: a2.problemi });

// senza «ordine»: una pagina spostata dal GM non ferma un carico che cambia solo un'altra pagina
const dO = datiBase(); dO.carico = "xx-scena13"; dO.file = [];
dO.operazioni = [{ op: "journal", rif: "g13", nome: "Scena 13 (solo GM)", cartella: null, pagine: ["a", "b", "c"].map(n => ({ rif: `${n}13`, nome: n.toUpperCase(), tipo: "text", html: `<p>${n}</p>` })) }];
p2 = await lancia(dO, "prova"); a2 = await lancia(dO, "applica", p2.firma);
const j13 = game.journal.find(j => j.name === "Scena 13 (solo GM)");
await j13.updateEmbeddedDocuments("JournalEntryPage", [{ _id: j13.pages.find(x => x.name === "A").id, sort: 999999 }]);
dO.operazioni[0].pagine[1].html = "<p>b nuova</p>";
p2 = await lancia(dO, "prova");
prova("senza «ordine»: un ordine ritoccato non ferma l'aggiornamento di un'altra pagina", (p2.esito === "prova pulita") && p2.piano.some(x => x.nome === "B"), p2.problemi);
// in coda, dopo una pagina con una figlia del GM: la nuova va dopo la figlia
await j13.updateEmbeddedDocuments("JournalEntryPage", [{ _id: j13.pages.find(x => x.name === "A").id, sort: 100000 }]);
const cS = j13.pages.find(x => x.name === "C").sort;
await j13.createEmbeddedDocuments("JournalEntryPage", [{ name: "Appunto su C", sort: cS + 10, title: { level: 2 } }]);
dO.operazioni[0].pagine.push({ rif: "d13", nome: "D", tipo: "text", html: "<p>d</p>" });
p2 = await lancia(dO, "prova");
prova("in coda dopo una pagina con una figlia: la nuova va dopo la figlia", (p2.esito === "prova pulita") && (p2.piano.find(x => x.nome === "D")?.sort > cS + 10), { problemi: p2.problemi, piano: p2.piano });

// le pagine rimandate: la nota non dice «tutto come nei dati»
dr.operazioni.pop();
p2 = await lancia(dr, "prova");
prova("rimandate: la nota dice che restano da caricare", p2.note.some(q => q.includes("niente da fare per ora")) && !p2.note.some(q => q.includes("è già tutto come nei dati")), p2.note);

// --- casi limite: pagine ritrovate e ritocchi -------------------------------------------------------------------------------------------
// una pagina ritrovata, tolta dal GM durante il carico: resta nel registro, e il rilancio non la ricrea
const dT = datiBase(); dT.carico = "xx-scena14"; dT.file = [];
dT.operazioni = [{ op: "journal", rif: "g14", nome: "Scena 14 (solo GM)", cartella: null, pagine: [{ rif: "a14", nome: "A", tipo: "text", html: "<p>a</p>" }] }];
p2 = await lancia(dT, "prova"); a2 = await lancia(dT, "applica", p2.firma);
const j14 = game.journal.find(j => j.name === "Scena 14 (solo GM)");
dT.operazioni[0].pagine.push({ rif: "n14", nome: "N", tipo: "text", html: "<p>n</p>" });
p2 = await lancia(dT, "prova");
globalThis.__finto.dopoCrea = async () => { j14.pages.delete(j14.pages.find(x => x.name === "A").id); };
a2 = await lancia(dT, "applica", p2.firma);
p2 = await lancia(dT, "prova");
prova("pagina ritrovata e tolta durante il carico: il rilancio non la ricrea", p2.problemi.some(q => q.includes("«A»") && q.includes("non c'è più")), { problemi: p2.problemi, piano: p2.piano });
// una pagina del GM trascinata fra due pagine dei dati: la nuova va nell'intervallo libero, senza fermarsi
const dV = datiBase(); dV.carico = "xx-scena15"; dV.file = [];
dV.operazioni = [{ op: "journal", rif: "g15", nome: "Scena 15 (solo GM)", cartella: null, pagine: [{ rif: "a15", nome: "A", tipo: "text", html: "<p>a</p>" }, { rif: "b15", nome: "B", tipo: "text", html: "<p>b</p>" }] }];
p2 = await lancia(dV, "prova"); a2 = await lancia(dV, "applica", p2.firma);
const j15 = game.journal.find(j => j.name === "Scena 15 (solo GM)");
const [sa, sb] = ["A", "B"].map(n => j15.pages.find(x => x.name === n).sort);
await j15.createEmbeddedDocuments("JournalEntryPage", [{ name: "Del GM", sort: Math.floor((sa + sb) / 2) }]);
dV.operazioni[0].pagine.splice(1, 0, { rif: "n15", nome: "N", tipo: "text", html: "<p>n</p>" });
p2 = await lancia(dV, "prova");
const sn = p2.piano.find(x => x.nome === "N")?.sort;
prova("pagina del GM in mezzo: la nuova va nell'intervallo libero", (p2.esito === "prova pulita") && (sn > sa) && (sn < Math.floor((sa + sb) / 2)), { problemi: p2.problemi, sn });
// il riquadro rivelato, con &nbsp; o con un tag in mezzo al titolo: avviso
const { riquadroRivelato } = await import(`${M}/carica/html.mjs`);
prova("riquadro rivelato riconosciuto anche con &nbsp; e un tag in mezzo", riquadroRivelato('<section class="secret revealed" id="secret-a"><p><strong>Nota&nbsp;per il <em>D</em>M</strong></p></section>', "Nota per il DM"));

// «consenti» non serve più dalla 1.12.0: si accetta, con un avviso, e non conta; chi entra dopo i controlli non ferma la scrittura
const dC = { ...datiBase(), carico: "xx-consenti", operazioni: [{ op: "journal", rif: "g-consenti", nome: "Consenti (solo GM)", cartella: null, pagine: [{ rif: "c1", nome: "C1", tipo: "text", html: "<p>c</p>" }] }] };
game.users.get("pl1aaaaaaaaaaaaa").active = true; game.users.get("gm3ccccccccccccc").active = true;
p2 = await lancia(dC, "prova", null, { consenti: ["Alba"] });
prova("consenti: accettato, con l'avviso che non serve più", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("«consenti» non serve più")) && (p2.consenti?.[0] === "Alba"), { avvisi: p2.avvisi, consenti: p2.consenti });
a2 = await lancia(dC, "applica", p2.firma, { consenti: ["Alba"] });
prova("consenti: con Alba e Nadia connessi «applica» scrive", (a2.esito === "OK") && !!game.journal.find(j => j.name === "Consenti (solo GM)"), { esito: a2.esito, problemi: a2.problemi });
game.users.get("gm3ccccccccccccc").active = false;
dC.operazioni[0].pagine.push({ rif: "c2", nome: "C2", tipo: "text", html: "<p>c2</p>" });
p2 = await lancia(dC, "prova");
setTimeout(() => { game.users.get("pl2bbbbbbbbbbbbb").active = true; }, 300);
a2 = await lancia(dC, "applica", p2.firma);
prova("connessa dopo i controlli: si scrive lo stesso", (a2.esito === "OK") && !!game.journal.find(j => j.name === "Consenti (solo GM)").pages.find(x => x.name === "C2"), { esito: a2.esito, problemi: a2.problemi });
game.users.get("pl2bbbbbbbbbbbbb").active = false;
p2 = await lancia(dC, "prova", null, { consenti: ["Nessuna"] });
prova("consenti: un nome qualunque non ferma più (non conta)", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("«consenti» non serve più")), p2.problemi);
p2 = await lancia(dC, "prova", null, { consenti: "Alba" });
prova("consenti che non è un elenco: un avviso, non ferma", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("«consenti» non serve più")), { esito: p2.esito, problemi: p2.problemi });
game.users.get("pl1aaaaaaaaaaaaa").active = false;

// --- tappa 2: Roll Table e attori dal compendio ------------------------------------------------------------------------------------
const MM = "multiattaccoXXXX", MAZZA = "mazzaXXXXXXXXXXX", COTTA = "cottaXXXXXXXXXXX";
const prete = { _id: "preteXXXXXXXXXXX", name: "Priest", type: "npc", img: "systems/dnd5e/prete.webp", system: { source: { rules: "2024" }, traits: { size: "med" }, skills: {} },
  prototypeToken: { name: "Priest", texture: { src: "modules/premium/prete.webp" }, randomImg: true },
  items: [{ _id: MAZZA, name: "Mace", type: "weapon", system: { description: { value: "<p>[[/attack]]</p>" }, properties: [] }, sort: 1 },
    { _id: COTTA, name: "Chain Shirt", type: "equipment", system: { type: { value: "medium" } }, sort: 2 },
    { _id: MM, name: "Multiattack", type: "feat", system: { description: { value: `<p>Two attacks with [[/item .${MAZZA}]].</p>` } }, sort: 3 }] };
const popolano = { _id: "popolanoXXXXXXXX", name: "Commoner", type: "npc", system: { source: { rules: "2024" }, traits: { size: "med" }, skills: {} }, prototypeToken: { name: "Commoner", texture: { src: "systems/dnd5e/popolano.webp" } }, items: [] };
const popolano14 = { ...popolano, _id: "popolano14XXXXXX", system: { ...popolano.system, source: { rules: "2014" } } };
const randello = { _id: "randelloXXXXXXXX", name: "Club", type: "weapon", system: { source: { rules: "2024" }, description: { value: "<p>Un randello.</p>" }, properties: ["lgt"] } };
game.packs.set("dnd5e.actors24", new Compendio("dnd5e.actors24", "Actor", [prete, popolano, popolano14]));
game.packs.set("dnd5e.equipment24", new Compendio("dnd5e.equipment24", "Item", [randello]));
const RIT = "worlds/mondo-finto/tokens/xx-r1.webp", RIT2 = "worlds/mondo-finto/tokens/xx-r2.webp";
mondo.file.set(RIT, enc("ritratto")); mondo.file.set(RIT2, enc("ritratto due"));
const shaRit = { r1: await sha256(enc("ritratto")), r2: await sha256(enc("ritratto due")) };
const datiT2 = () => ({ ...datiBase(), carico: "xx-tappa2", file: [{ percorso: RIT, sha256: shaRit.r1 }, { percorso: RIT2, sha256: shaRit.r2 }], operazioni: [
  { op: "cartella", rif: "c-tab", tipo: "RollTable", nome: "Tabelle", padre: null },
  { op: "cartella", rif: "c-att", tipo: "Actor", nome: "Attori", padre: null },
  { op: "tabella", rif: "t1", nome: "Per strada", cartella: "c-tab", formula: "1d4", descrizione: "<p>Da tirare in privato.</p>",
    voci: [{ da: 1, a: 1, testo: "Un carro", descrizione: "<p><strong>Per il DM.</strong> Niente.</p>" }, { da: 2, a: 3, testo: "Una rissa" }] },
  { op: "attore", rif: "a1", nome: "La sacerdotessa", nomeVero: "Mirta", cartella: "c-att", compendio: "dnd5e.actors24", srd: "Priest", token: "uno", img: RIT,
    ritocchi: { senzaArmatura: true, sostituisci: { "Mace": "Club" }, taglia: "sm", abilita: ["acr"], vantaggio: ["acr"] }, compendioOggetti: "dnd5e.equipment24", atteso: { taglia: "sm", abilita: ["acr"], vantaggio: ["acr"] } },
  { op: "attore", rif: "a2", nome: "Il garzone", cartella: "c-att", compendio: "dnd5e.actors24", srd: "Commoner", token: "molti" }
] });
let tt2 = datiT2();
p2 = await lancia(tt2, "prova");
prova("tappa 2: prova pulita (2 cartelle, 1 tabella, 2 attori), con l'avviso del 4 scoperto", (p2.esito === "prova pulita") && (p2.piano.filter(x => x.azione === "crea").length === 5) && p2.avvisi.some(q => q.includes("non ha una voce per 4")), { problemi: p2.problemi, piano: p2.piano, avvisi: p2.avvisi });
a2 = await lancia(tt2, "applica", p2.firma);
prova("tappa 2: applica OK, verifica tutta OK", (a2.esito === "OK") && a2.verifica.length && a2.verifica.every(v => v.startsWith("OK")), { esito: a2.esito, problemi: a2.problemi, errori: a2.errori, verifica: a2.verifica.filter(v => v.startsWith("KO")) });
const tbT = game.tables.find(t => t.name === "Per strada"), sacT = game.actors.find(a => a.name === "La sacerdotessa"), garT = game.actors.find(a => a.name === "Il garzone");
prova("tabella: id fisso, a None, nella cartella, 2 voci col testo e i range", !!tbT && (tbT.ownership.default === 0) && (tbT.folder?.name === "Tabelle") && (tbT.results.size === 2) && tbT.results.contents.some(r => (r.name === "Una rissa") && (r.range[1] === 3)), tbT?.toObject());
prova("attore: a None, nella cartella, col ritratto, col doppio nome, token collegato, neutrale, col nome d'aspetto",
  !!sacT && (sacT.ownership.default === 0) && (sacT.folder?.name === "Attori") && (sacT.img === RIT) && (sacT.flags["gdr-strumenti"].nomi?.vero === "Mirta") && (sacT.prototypeToken.actorLink === true)
  && (sacT.prototypeToken.disposition === 0) && (sacT.prototypeToken.name === "La sacerdotessa"), sacT?.toObject());
const itSac = sacT?._items ?? [];
prova("ritocchi: senza la cotta, il randello al posto della mazza con lo stesso _id, il richiamo della Multiattacco regge, taglia, abilità, vantaggio",
  !itSac.some(i => i.name === "Chain Shirt") && itSac.some(i => (i.name === "Club") && (i._id === MAZZA)) && (sacT.system.traits.size === "sm") && (sacT.system.skills.acr.value === 1) && (sacT.system.skills.acr.roll.mode === 1), itSac);
prova("token del compendio in un modulo non attivo: l'immagine di default", (sacT?.prototypeToken.texture.src === "icons/svg/mystery-man.svg") && (sacT?.prototypeToken.randomImg === false), sacT?.prototypeToken);
prova("attore «molti»: token non collegato, numerato; senza ritratto resta quello del compendio", !!garT && (garT.prototypeToken.actorLink === false) && (garT.prototypeToken.appendNumber === true) && !garT.flags["gdr-strumenti"].nomi, garT?.toObject());
prova("mondo non in metri: niente da convertire, né nota", !a2.daConvertire.length && !a2.note.some(q => q.includes("in metri")), { daConvertire: a2.daConvertire, note: a2.note });
p2 = await lancia(tt2, "prova");
prova("tappa 2, rilancio: niente da fare", (p2.esito === "prova pulita") && !p2.piano.length, { problemi: p2.problemi, piano: p2.piano });
// la tabella cambia nei dati: le voci si aggiornano; una voce in più si aggiunge
tt2.operazioni[2].voci[1].testo = "Una rissa fra carrettieri"; tt2.operazioni[2].voci.push({ da: 4, a: 4, testo: "Niente" });
p2 = await lancia(tt2, "prova");
prova("tabella cambiata nei dati: aggiorna le voci", (p2.esito === "prova pulita") && p2.piano.some(x => (x.cosa === "tabella") && (x.azione === "aggiorna") && x.campi.includes("voci")), { problemi: p2.problemi, piano: p2.piano });
a2 = await lancia(tt2, "applica", p2.firma);
prova("tabella aggiornata: 3 voci, la seconda nuova, verifica OK", (a2.esito === "OK") && (tbT.results.size === 3) && tbT.results.contents.some(r => r.name === "Una rissa fra carrettieri") && a2.verifica.every(v => v.startsWith("OK")), { esito: a2.esito, problemi: a2.problemi, errori: a2.errori, verifica: a2.verifica.filter(v => v.startsWith("KO")) });
// il GM rinomina la tabella in Foundry: i dati non cambiano il nome → resta com'è, avviso; i dati cambiano anche il nome → conflitto
await tbT.update({ name: "Per strada (mia)" });
p2 = await lancia(tt2, "prova");
prova("tabella rinominata in Foundry, dati uguali: un avviso, niente da fare", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("ritoccata")) && !p2.piano.length, { problemi: p2.problemi, avvisi: p2.avvisi, piano: p2.piano });
tt2.operazioni[2].nome = "Per le strade";
p2 = await lancia(tt2, "prova");
const accTT = (p2.problemi.find(q => q.includes("«accetta»")) ?? "").match(/"([0-9a-f]{64})"/)?.[1];
prova("tabella rinominata in Foundry e nei dati: conflitto, con l'impronta per «accetta»", (p2.esito === "prova con problemi") && !!accTT, p2.problemi);
tt2.operazioni[2].accetta = accTT;
p2 = await lancia(tt2, "prova");
prova("con «accetta»: si aggiorna il nome", (p2.esito === "prova pulita") && p2.piano.some(x => (x.cosa === "tabella") && x.campi?.includes("nome")), { problemi: p2.problemi, piano: p2.piano });
delete tt2.operazioni[2].accetta; tt2.operazioni[2].nome = "Per strada"; await tbT.update({ name: "Per strada" });
// una voce in meno nei dati: il caricatore non toglie
const tt3 = structuredClone(tt2); tt3.operazioni[2].voci.pop();
p2 = await lancia(tt3, "prova");
prova("tabella con una voce in meno nei dati: problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("non toglie voci")), p2.problemi);
// il ritratto cambia nei dati: si aggiorna; il GM l'ha cambiato in Foundry: conflitto
tt2.operazioni[3].img = RIT2;
p2 = await lancia(tt2, "prova");
prova("ritratto cambiato nei dati: aggiorna", (p2.esito === "prova pulita") && p2.piano.some(x => (x.cosa === "attore") && (x.azione === "aggiorna")), { problemi: p2.problemi, piano: p2.piano });
await sacT.update({ img: "worlds/mondo-finto/altro.webp" });
p2 = await lancia(tt2, "prova");
prova("ritratto cambiato in Foundry e nei dati: problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("ritratto")), p2.problemi);
await sacT.update({ img: RIT }); tt2.operazioni[3].img = RIT;
// un attore non del carico con il nome vero di uno nuovo; il nome vero in una tabella; regole 2014 escluse
const tt4 = structuredClone(tt2); tt4.carico = "xx-tappa2b"; tt4.operazioni = [{ op: "attore", rif: "a9", nome: "Il fabbro", nomeVero: "Mirta", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno" }];
p2 = await lancia(tt4, "prova");
prova("un attore del mondo ha già quel nome vero: problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("uno dei suoi nomi")), p2.problemi);
tt4.operazioni = [{ op: "tabella", rif: "t9", nome: "Altro", cartella: null, formula: "1d2", voci: [{ da: 1, a: 2, testo: "Arriva Mirta" }] }];
p2 = await lancia(tt4, "prova");
prova("il nome vero di un attore del mondo in una tabella: problema, senza scriverlo nel rapporto", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("nome vero")) && !JSON.stringify(p2.problemi).includes("Mirta"), p2.problemi);
tt4.operazioni = [{ op: "attore", rif: "a8", nome: "Il fabbro", nomeVero: "Brunone", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno" },
  { op: "tabella", rif: "t8", nome: "Altro", cartella: null, formula: "1d2", voci: [{ da: 1, a: 2, testo: "Arriva BRUNONE" }] }];
p2 = await lancia(tt4, "prova");
prova("il nome vero di un attore dei dati in una tabella: problema nei dati, senza scriverlo nel rapporto", (p2.esito === "fermato") && p2.problemi.some(q => q.includes("nome vero") && q.includes("Il fabbro")) && !JSON.stringify(p2.problemi).includes("runone"), p2.problemi);
// una tabella di uno script di prima, adottata con «precedente»
const tabVecchia = await Tabella.create({ name: "Porto", formula: "1d2", description: "", ownership: { default: 0 }, results: [{ type: "text", name: "Un gabbiano", range: [1, 2] }] });
tt4.operazioni = [{ op: "tabella", rif: "t7", id: tabVecchia.id, nome: "Porto", cartella: null, formula: "1d2", voci: [{ da: 1, a: 2, testo: "Due gabbiani" }] }];
p2 = await lancia(tt4, "prova");
prova("tabella di uno script di prima, senza «precedente», diversa dai dati: conflitto", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("precedente")), p2.problemi);
tt4.operazioni[0].precedente = { nome: "Porto", formula: "1d2", descrizione: "", voci: [{ da: 1, a: 2, testo: "Un gabbiano" }] };
p2 = await lancia(tt4, "prova");
a2 = await lancia(tt4, "applica", p2.firma);
prova("con «precedente»: aggiornata e segnata", (a2.esito === "OK") && (tabVecchia.results.contents[0].name === "Due gabbiani") && !!tabVecchia.flags["gdr-strumenti"]?.carico, { esito: a2.esito, problemi: a2.problemi, errori: a2.errori, verifica: a2.verifica });
// voci fuori ordine nei dati: si ordinano, e il rilancio non vede differenze
const tt5 = { ...datiBase(), carico: "xx-tappa2c", file: [], operazioni: [{ op: "tabella", rif: "t5", nome: "Disordine", cartella: null, formula: "1d4", voci: [{ da: 3, a: 4, testo: "Tardi" }, { da: 1, a: 2, testo: "Presto" }] }] };
p2 = await lancia(tt5, "prova"); a2 = await lancia(tt5, "applica", p2.firma);
p2 = await lancia(tt5, "prova");
prova("voci fuori ordine nei dati: verifica OK e rilancio senza differenze", (a2.esito === "OK") && (p2.esito === "prova pulita") && !p2.piano.length && !p2.avvisi.some(q => q.includes("ritoccata")), { a: a2.verifica, p: p2.piano, av: p2.avvisi });
// aggiorna: false su una tabella diversa dai dati, in un carico che scrive altro: niente falso KO
const tdis = game.tables.find(t => t.name === "Disordine"); await tdis.update({ formula: "1d4", name: "Disordine!" });
tt5.operazioni[0].aggiorna = false; tt5.operazioni.push({ op: "tabella", rif: "t6", nome: "Seconda", cartella: null, formula: "1d2", voci: [{ da: 1, a: 2, testo: "Sì" }] });
p2 = await lancia(tt5, "prova"); a2 = await lancia(tt5, "applica", p2.firma);
prova("aggiorna: false su una tabella diversa: avviso, e la verifica non dà KO", (a2.esito === "OK") && p2.avvisi.some(q => q.includes("di non aggiornarla")), { esito: a2.esito, verifica: a2.verifica.filter(v => v.startsWith("KO")) });
// «accetta» sbagliato: un avviso, ignorato
tt5.operazioni[0].aggiorna = true; tt5.operazioni[0].accetta = "0".repeat(64);
p2 = await lancia(tt5, "prova");
prova("«accetta» che non è l'impronta del mondo: avviso, e resta il conflitto o il ritocco", p2.avvisi.some(q => q.includes("ignorato")), { problemi: p2.problemi, avvisi: p2.avvisi });
// un attore creato senza ritratto: un ritratto dato dopo si aggiorna
const tt6 = { ...datiBase(), carico: "xx-tappa2d", file: [{ percorso: RIT, sha256: shaRit.r1 }], operazioni: [{ op: "attore", rif: "a6", nome: "Il facchino", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "molti" }] };
p2 = await lancia(tt6, "prova"); a2 = await lancia(tt6, "applica", p2.firma);
tt6.operazioni[0].img = RIT;
p2 = await lancia(tt6, "prova");
prova("attore creato senza ritratto, poi il ritratto nei dati: aggiorna", (a2.esito === "OK") && (p2.esito === "prova pulita") && p2.piano.some(x => (x.cosa === "attore") && (x.azione === "aggiorna")), { problemi: p2.problemi, piano: p2.piano });
// i nomi veri non stanno in quello che le giocatrici leggono degli attori; i nomi si confrontano senza maiuscole
const tt7 = { ...datiBase(), carico: "xx-tappa2e", file: [], operazioni: [{ op: "attore", rif: "a7", nome: "La serva di Mirta", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "molti" }] };
p2 = await lancia(tt7, "prova");
prova("il nome vero di un attore del mondo nel nome di uno nuovo: problema, senza scriverlo", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("nome vero") && q.includes(sacT.id)), p2.problemi);
tt7.operazioni[0].nome = "mirta";
p2 = await lancia(tt7, "prova");
prova("un nome uguale a un nome vero del mondo, in minuscolo: problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("uno dei suoi nomi")), p2.problemi);
await sbaglia(x => { x.operazioni.push({ op: "attore", rif: "ay", nome: "Il fabbro", nomeVero: "Ottone", cartella: null, compendio: "dnd5e.actors24", srd: "Priest", token: "uno", ritocchi: { rinomina: { "Mace": { nome: "La mazza di Ottone" } } } }); }, "nome vero", "il nome vero in un oggetto rinominato: problema");
// il compendio del tipo sbagliato; una voce fuori dal tiro
tt7.operazioni[0] = { op: "attore", rif: "a7", nome: "Il portiere", cartella: null, compendio: "dnd5e.equipment24", srd: "Club", token: "molti" };
p2 = await lancia(tt7, "prova");
prova("compendio di oggetti per un attore: problema col motivo", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("serve Actor")), p2.problemi);
await sbaglia(x => { x.operazioni.push({ op: "tabella", rif: "tx", nome: "X", cartella: null, formula: "1d4", voci: [{ da: 1, a: 5, testo: "a" }] }); }, "fuori dal tiro", "voce fuori dal tiro: problema");
// via: un oggetto citato dalla Multiattacco senza «or» lascia un richiamo rotto (problema); con «or» il richiamo si toglie
tt7.operazioni[0] = { op: "attore", rif: "a7", nome: "Il portiere", cartella: null, compendio: "dnd5e.actors24", srd: "Priest", token: "molti", ritocchi: { via: ["Mace"] } };
p2 = await lancia(tt7, "prova");
prova("via di un oggetto citato dalla Multiattacco: richiamo rotto, problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("richiami")), p2.problemi);
const prete2 = structuredClone(prete); prete2._id = "prete2XXXXXXXXXX"; prete2.name = "Priest Two";
prete2.items[2].system.description.value = `<p>Two attacks with [[/item .${MAZZA}]] or [[/item .${COTTA}]].</p>`;
game.packs.get("dnd5e.actors24").docs.set(prete2._id, prete2);
tt7.operazioni[0] = { op: "attore", rif: "a7", nome: "Il portiere", cartella: null, compendio: "dnd5e.actors24", srd: "Priest Two", token: "molti", ritocchi: { via: ["Chain Shirt"] } };
p2 = await lancia(tt7, "prova");
prova("via con «or»: il richiamo si toglie, prova pulita", (p2.esito === "prova pulita"), p2.problemi);
// durante «applica»: un omonimo che compare, una voce cambiata dal GM, una creazione che non riesce
const tt8 = { ...datiBase(), carico: "xx-tappa2f", file: [], operazioni: [
  { op: "journal", rif: "j8", nome: "Otto (solo GM)", cartella: null, pagine: [{ rif: "p8", nome: "Otto", tipo: "text", html: "<p>otto</p>" }] },
  { op: "attore", rif: "a8", nome: "Il cocchiere", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "molti" }] };
p2 = await lancia(tt8, "prova");
mondo.dopoCrea = null; globalThis.__finto.dopoCrea = async () => { await Attore.create({ name: "Il cocchiere" }); };
a2 = await lancia(tt8, "applica", p2.firma);
prova("un omonimo compare durante «applica»: l'attore non si crea", (a2.esito === "da guardare") && a2.errori.some(q => q.includes("è comparso")) && (game.actors.filter(a => a.name === "Il cocchiere").length === 1), { esito: a2.esito, errori: a2.errori });
game.actors.delete(game.actors.find(a => a.name === "Il cocchiere").id);
const tt10 = { ...datiBase(), carico: "xx-tappa2h", file: [], operazioni: [
  { op: "journal", rif: "j10", nome: "Dieci (solo GM)", cartella: null, pagine: [{ rif: "p10", nome: "Dieci", tipo: "text", html: "<p>dieci</p>" }] },
  { op: "tabella", rif: "t10", nome: "Dieci", cartella: null, formula: "1d2", voci: [{ da: 1, a: 1, testo: "Uno" }, { da: 2, a: 2, testo: "Due" }] }] };
p2 = await lancia(tt10, "prova"); a2 = await lancia(tt10, "applica", p2.firma);
const t10 = game.tables.find(t => t.name === "Dieci");
tt10.operazioni[0].pagine.push({ rif: "p11", nome: "Undici", tipo: "text", html: "<p>undici</p>" }); tt10.operazioni[1].voci[1].testo = "Due e mezzo";
p2 = await lancia(tt10, "prova");
globalThis.__finto.dopoCrea = async () => { const v = t10.results.contents.find(r => r.name === "Uno"); await t10.updateEmbeddedDocuments("TableResult", [{ _id: v.id, name: "Uno del GM" }]); };
a2 = await lancia(tt10, "applica", p2.firma);
prova("una voce cambiata durante «applica»: la tabella non si aggiorna", (p2.esito === "prova pulita") && (a2.esito === "da guardare") && a2.errori.some(q => q.includes("cambiati durante il carico")) && t10.results.contents.some(r => r.name === "Due"), { p: p2.problemi, esito: a2.esito, errori: a2.errori });
const tt9 = { ...datiBase(), carico: "xx-tappa2g", file: [], operazioni: [{ op: "attore", rif: "a9", nome: "Il barcaiolo", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "molti" }] };
p2 = await lancia(tt9, "prova");
globalThis.__finto.fallisci = "attore";
a2 = await lancia(tt9, "applica", p2.firma);
globalThis.__finto.fallisci = null;
p2 = await lancia(tt9, "prova");
prova("una creazione di attore che non riesce: da guardare, e al rilancio si crea di nuovo (il registro è pulito)", (a2.esito === "da guardare") && (p2.esito === "prova pulita") && p2.piano.some(x => (x.cosa === "attore") && (x.azione === "crea")), { a: a2.errori, p: p2.problemi });
// casi limite
const { contieneNome } = await import(`${M}/carica/html.mjs`);
prova("contieneNome: trattini, punti, apostrofi tipografici, parola intera", contieneNome("Arriva Jean-Luc.", "Jean-Luc") && contieneNome("xx-jean-luc-ritratto.webp", "Jean-Luc") && contieneNome("L’oste", "L'oste") && !contieneNome("Mirtamente", "Mirta"));
// 1.13.0: un nome vero che è anche una parola comune («Rosa» e «una rosa rossa»)
prova("contieneNome: un nome con la maiuscola, in un testo, conta solo con la maiuscola; nei nomi dei file sempre",
  !contieneNome("<p>una rosa rossa sul tavolo</p>", "Rosa") && contieneNome("<p>Chiedi a Rosa.</p>", "Rosa") && contieneNome("<p>Rosa rossa a parte</p>", "Rosa")
  && contieneNome("ROSA CI ASPETTA", "Rosa") && contieneNome("worlds/x/tokens/rosa-ritratto.webp", "Rosa") && contieneNome("rosa_ritratto.png", "Rosa")
  && !contieneNome("la rosa, e poi Rosaria", "Rosa") && contieneNome("una rosa rossa", "rosa") && !contieneNome("elara vensk", "Elara Vensk"));
// la scrittura delle voci non riesce: il segno resta quello di prima, e il rilancio riprende
const tt14 = { ...datiBase(), carico: "xx-tappa2l", file: [], operazioni: [{ op: "tabella", rif: "t14", nome: "Quattordici", cartella: null, formula: "1d2", voci: [{ da: 1, a: 1, testo: "Uno" }, { da: 2, a: 2, testo: "Due" }] }] };
p2 = await lancia(tt14, "prova"); a2 = await lancia(tt14, "applica", p2.firma);
const t14 = game.tables.find(t => t.name === "Quattordici");
tt14.operazioni[0].voci[1].testo = "Due e tre quarti";
p2 = await lancia(tt14, "prova");
const segno14 = JSON.stringify(t14.flags["gdr-strumenti"].carico);
globalThis.__finto.fallisci = "voci";
a2 = await lancia(tt14, "applica", p2.firma);
globalThis.__finto.fallisci = null;
p2 = await lancia(tt14, "prova");
prova("voci non scritte: segno di prima, e il rilancio le aggiorna (niente falso ritocco)", (a2.esito === "da guardare") && (JSON.stringify(t14.flags["gdr-strumenti"].carico) === segno14) && p2.piano.some(x => (x.cosa === "tabella") && (x.azione === "aggiorna")) && !p2.avvisi.some(q => q.includes("ritoccata")), { a: a2.errori, p: p2.piano, av: p2.avvisi });
a2 = await lancia(tt14, "applica", p2.firma);
// cambia solo la descrizione di una voce: si aggiorna quella sola
tt14.operazioni[0].voci[0].descrizione = "<p>Nota.</p>";
p2 = await lancia(tt14, "prova");
a2 = await lancia(tt14, "applica", p2.firma);
prova("cambia solo la descrizione di una voce: aggiornata quella, verifica OK", (a2.esito === "OK") && a2.scritto.some(q => q.includes("1 voci aggiornate")) && t14.results.contents.some(r => r.description === "<p>Nota.</p>"), { esito: a2.esito, scritto: a2.scritto, errori: a2.errori });
// una voce con uno spazio in fondo, una parola da DM nel testo: problemi
await sbaglia(x => { x.operazioni.push({ op: "tabella", rif: "tx", nome: "X", cartella: null, formula: "1d2", voci: [{ da: 1, a: 2, testo: "Uno " }] }); }, "spazi in testa o in fondo", "testo di una voce con uno spazio in fondo: problema");
await sbaglia(x => { x.operazioni.push({ op: "tabella", rif: "tx", nome: "X", cartella: null, formula: "1d2", voci: [{ da: 1, a: 2, testo: "I PG arrivano" }] }); }, "parole da DM nel testo", "parola da DM nel testo di una voce: problema");
// taglia grande: il token 2×2; senzaArmatura senza la CA attesa: avviso
const tt11 = { ...datiBase(), carico: "xx-tappa2i", file: [], operazioni: [{ op: "attore", rif: "a11", nome: "Il gigante buono", cartella: null, compendio: "dnd5e.actors24", srd: "Priest", token: "uno", ritocchi: { taglia: "lg", senzaArmatura: true } }] };
p2 = await lancia(tt11, "prova"); a2 = await lancia(tt11, "applica", p2.firma);
const gig = game.actors.find(a => a.name === "Il gigante buono");
prova("taglia grande: token 2×2, verifica OK; senzaArmatura senza CA attesa: avviso", (a2.esito === "OK") && (gig?.prototypeToken.width === 2) && (gig?.prototypeToken.height === 2) && p2.avvisi.some(q => q.includes("atteso.ca")), { esito: a2.esito, pt: gig?.prototypeToken, av: p2.avvisi, ko: a2.verifica.filter(v => v.startsWith("KO")) });
// un attore di uno script di prima col ritratto del GM: adottato senza img, poi un img nei dati → problema (serve «precedente»)
const vecchio = await Attore.create({ name: "Il mugnaio", img: "worlds/mondo-finto/ritratto-del-gm.webp", ownership: { default: 0 } });
const tt12 = { ...datiBase(), carico: "xx-tappa2j", file: [{ percorso: RIT2, sha256: shaRit.r2 }], operazioni: [{ op: "attore", rif: "a12", id: vecchio.id, nome: "Il mugnaio", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno" }] };
p2 = await lancia(tt12, "prova"); a2 = await lancia(tt12, "applica", p2.firma);
tt12.operazioni[0].img = RIT2;
p2 = await lancia(tt12, "prova");
prova("attore adottato col ritratto del GM, poi un ritratto nei dati: problema, non si sovrascrive", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("ritratto")) && (vecchio.img === "worlds/mondo-finto/ritratto-del-gm.webp"), p2.problemi);
// il nome vero in una pagina che si mostra: problema; dentro un blocco segreto chiuso: no
const tt13 = { ...datiBase(), carico: "xx-tappa2k", file: [], operazioni: [{ op: "journal", rif: "j13", nome: "Tredici", cartella: null, pagine: [{ rif: "p13", nome: "La sacerdotessa", tipo: "text", html: "<p>Si chiama Mirta.</p>" }] }] };
p2 = await lancia(tt13, "prova");
prova("il nome vero di un attore del mondo in una pagina che si mostra: problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("nome vero") && q.includes(sacT.id)), p2.problemi);
tt13.operazioni[0].pagine[0].html = '<p>Una sacerdotessa.</p><section class="secret" id="secret-n13"><p><strong>Il nome.</strong> Si chiama Mirta.</p></section>';
p2 = await lancia(tt13, "prova");
prova("il nome vero dentro un blocco segreto chiuso: si può", (p2.esito === "prova pulita"), p2.problemi);
// una tabella «privata»: le descrizioni possono avere i nomi veri (del mondo e dei dati); il testo delle voci no
const tt15 = { ...datiBase(), carico: "xx-tappa2m", file: [], operazioni: [
  { op: "attore", rif: "a15", nome: "Il fornaio", nomeVero: "Gualtiero", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno" },
  { op: "tabella", rif: "t15", nome: "Privata", cartella: null, formula: "1d2", privata: true, descrizione: "<p>Da tirare in privato.</p>",
    voci: [{ da: 1, a: 2, testo: "Un fornaio", descrizione: "<p><strong>Per il DM.</strong> È Gualtiero; con lui Mirta.</p>" }] }] };
p2 = await lancia(tt15, "prova");
prova("tabella privata: nomi veri nelle descrizioni, si può", (p2.esito === "prova pulita"), p2.problemi);
tt15.operazioni[1].voci[0].testo = "Arriva Gualtiero";
p2 = await lancia(tt15, "prova");
prova("tabella privata: il nome vero nel testo di una voce resta un problema", (p2.esito === "fermato") && p2.problemi.some(q => q.includes("nome vero")), p2.problemi);
tt15.operazioni[1].voci[0].testo = "Arriva Mirta";
p2 = await lancia(tt15, "prova");
prova("tabella privata: il nome vero del mondo nel testo di una voce resta un problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("nome vero") && q.includes(sacT.id)), p2.problemi);
tt15.operazioni[1].voci[0].testo = "Un fornaio"; tt15.operazioni[1].nome = "Gualtiero e gli altri";
p2 = await lancia(tt15, "prova");
prova("tabella privata: il nome vero nel nome della tabella resta un problema", (p2.esito === "fermato") && p2.problemi.some(q => q.includes("nome vero")), p2.problemi);
tt15.operazioni[1].nome = "Privata"; tt15.operazioni[1].descrizione = "<p>Una tabella.</p>";
p2 = await lancia(tt15, "prova");
prova("tabella privata che non dice di tirarla in privato: avviso", p2.avvisi.some(q => q.includes("non dice di tirarla in privato")), p2.avvisi);
tt15.operazioni[1].descrizione = "<p>Da tirare in privato. Con Mirta.</p>"; tt15.operazioni[1].voci[0].descrizione = "<p>Niente.</p>"; delete tt15.operazioni[1].privata;
p2 = await lancia(tt15, "prova");
prova("senza privata, il nome vero del mondo nella descrizione della tabella è un problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("nome vero")), p2.problemi);
await sbaglia(x => { x.operazioni.push({ op: "tabella", rif: "tx", nome: "X", cartella: null, formula: "1d2", privata: "true", voci: [{ da: 1, a: 2, testo: "a" }] }); }, "privata deve essere true o false", "privata non booleano: problema");
tt15.operazioni[1].descrizione = "<p>Da tirare in privato.</p>"; tt15.operazioni[1].voci[0].descrizione = "<p><strong>Per il DM.</strong> È Gualtiero; con lui Mirta.</p>";
tt15.operazioni[1].voci[0].testo = "Un fornaio"; delete tt15.operazioni[1].privata;
p2 = await lancia(tt15, "prova");
prova("senza privata, il nome vero in una descrizione è un problema", (p2.esito === "fermato") && p2.problemi.some(q => q.includes("nome vero")), p2.problemi);
// dati sbagliati della tappa 2
await sbaglia(x => { x.operazioni.push({ op: "tabella", rif: "tx", nome: "X", cartella: null, formula: "1d4+1", voci: [{ da: 1, a: 1, testo: "a" }] }); }, "formula", "formula con un modificatore: problema");
await sbaglia(x => { x.operazioni.push({ op: "tabella", rif: "tx", nome: "X", cartella: null, formula: "1d4", voci: [{ da: 1, a: 2, testo: "a" }, { da: 2, a: 3, testo: "b" }] }); }, "già della voce", "voci che si sovrappongono: problema");
await sbaglia(x => { x.operazioni.push({ op: "tabella", rif: "tx", nome: "X", cartella: null, formula: "1d4", voci: [{ da: 1, a: 4, testo: "<b>a</b>" }] }); }, "testo semplice", "codice nel testo di una voce: problema");
await sbaglia(x => { x.operazioni.push({ op: "attore", rif: "ax", nome: "Il PG strano", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno" }); }, "parole da DM", "parola da DM nel nome di un attore: problema");
await sbaglia(x => { x.operazioni.push({ op: "attore", rif: "ax", nome: "X", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno", ritocchi: { sostituisci: { "Mace": "Club" } } }); }, "compendioOggetti", "sostituisci senza compendio degli oggetti: problema");
await sbaglia(x => { x.operazioni.push({ op: "attore", rif: "ax", nome: "X", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno", ritocchi: { pugni: true } }); }, "campo sconosciuto «pugni»", "ritocco fuori dal vocabolario: problema");

// --- tappa 3: note, tasselli e disegni sulle scene, e le macro di una riga ------------------------------------------------------------
const SC = "scenaMappaXXXXXX", LV = "defaultLevel0000";
const scena = new Scena({ _id: SC, name: "Mappa" }); game.scenes.set(SC, scena);
const diario = await Journal.create({ _id: "diarioXXXXXXXXXX", name: "Diario", ownership: { default: 2 } }, { keepId: true });
const [porto, rocca] = await diario.createEmbeddedDocuments("JournalEntryPage", [
  { _id: "portoXXXXXXXXXXX", name: "Porto", sort: 100, ownership: { default: 2 }, text: { content: "<p>Il porto.</p>" } },
  { _id: "roccaXXXXXXXXXXX", name: "Borgo Rocca (solo GM)", sort: 200, ownership: { default: 0 }, text: { content: "<p>Rocca.</p>" } }], { keepId: true });
const PORTO = `JournalEntry.${diario.id}.JournalEntryPage.${porto.id}`, ROCCA = `JournalEntry.${diario.id}.JournalEntryPage.${rocca.id}`;
const PIN = "worlds/mondo-finto/mappe/pin-taverna-aa11.webp", PIN2 = "worlds/mondo-finto/mappe/pin-tempio-bb22.webp", TAS = "worlds/mondo-finto/mappe/quartiere-porto-cc33.webp", TAS2 = "worlds/mondo-finto/mappe/quartiere-porto-dd44.webp";
for ( const f of [PIN, PIN2, TAS, TAS2] ) mondo.file.set(f, enc(`img ${f}`));
mondo.file.set("icons/svg/book.svg", enc("<svg/>"));
const shaF = async f => sha256(enc(`img ${f}`));
// le note di uno script di prima: legate al Porto, coi flag del mondo
await scena.createEmbeddedDocuments("Note", [
  { _id: "notaLanternaXXXX", entryId: diario.id, pageId: porto.id, x: 500, y: 600, levels: [LV], texture: { src: PIN, tint: "#ffffff" }, iconSize: 44, text: "La Lanterna Verde", fontSize: 26, flags: { world: { wgMappa: { punto: 3, voce: false } } } },
  { _id: "notaRoccaXXXXXXX", entryId: diario.id, pageId: porto.id, x: 900, y: 100, levels: [LV], texture: { src: PIN, tint: "#ffffff" }, iconSize: 44, text: "Rocca Grigia", fontSize: 26, flags: { world: { wgMappa: { punto: 9, voce: false } } } }], { keepId: true });
game.modules.set("gdr-strumenti", { active: true, api: { versione: "1.6.0", sussurraA: async () => null, sincrona: () => null } });
const datiT3 = () => ({ ...datiBase(), carico: "xx-tappa3",
  file: [PIN, PIN2, TAS, TAS2].map(f => ({ percorso: f, sha256: null })),
  operazioni: [
    { op: "journal", rif: "luoghi", nome: "Luoghi", cartella: null, pagine: [{ rif: "p-lanterna", nome: "La Lanterna Verde", tipo: "text", html: "<p>Una taverna sul molo.</p>" }] },
    { op: "scena", id: SC, nome: "Mappa",
      note: [
        { rif: "pin-lanterna", id: "notaLanternaXXXX", pagina: "p-lanterna", precedente: { pagina: PORTO } },
        { rif: "pin-rocca", id: "notaRoccaXXXXXXX", pagina: ROCCA, testo: "Rocca Grigia", precedente: { pagina: PORTO } },
        { rif: "pin-nuovo", livello: LV, x: 700, y: 700, pagina: "p-lanterna", icona: PIN2, testo: "Un tempio", dimensioneIcona: 44, ancoraTesto: "sotto", flagsMondo: { wgMappa: { punto: 40 } } }],
      tasselli: [{ rif: "t-porto", livello: LV, x: 1024, y: 768, larghezza: 512, altezza: 400, immagine: TAS, ordine: 105, flagsMondo: { wgMappa: { quartiere: "porto" } } }],
      disegni: [{ rif: "d-nome", livello: LV, x: 100, y: 100, forma: { tipo: "rettangolo", larghezza: 300, altezza: 60 }, testo: "Borgomare", dimensioneTesto: 40, coloreTesto: "#222222", riempimento: null, bordo: null }] },
    { op: "macro", rif: "m-sussurra", nome: "Sussurra (prova)", cartella: null, comando: 'game.modules.get("gdr-strumenti").api.sussurraA()', img: "icons/svg/book.svg" }] });
const segnoDiF = d => d?.flags?.["gdr-strumenti"]?.carico ?? null;
const conSha = async x => { for ( const f of x.file ) f.sha256 = await shaF(f.percorso); return x; };
let d3 = await conSha(datiT3());
p2 = await lancia(d3, "prova");
const pn = (n, cosa = null) => p2.piano.find(x => (x.nome === n) && (!cosa || (x.cosa === cosa)));
prova("tappa 3: prova pulita: 1 journal e 1 pagina, 2 note ricollegate, 1 nota, 1 tassello, 1 disegno, 1 macro", (p2.esito === "prova pulita")
  && (pn("pin-lanterna")?.azione === "aggiorna") && (pn("pin-rocca")?.azione === "aggiorna") && (pn("pin-nuovo")?.azione === "crea") && (pn("d-nome")?.azione === "crea")
  && p2.piano.some(x => (x.cosa === "tassello") && (x.azione === "crea") && (x.visibile === false)) && p2.piano.some(x => (x.cosa === "macro") && (x.azione === "crea")), { esito: p2.esito, problemi: p2.problemi, piano: p2.piano });
prova("tappa 3: ricollegare al posto nuovo: le giocatrici non la vedono più (avviso), solo i campi dei dati", p2.avvisi.some(q => q.includes("«pin-lanterna»") && q.includes("non la vedranno più") && q.includes("Alba"))
  && (JSON.stringify(pn("pin-lanterna")?.campi) === '["pagina"]') && (JSON.stringify(pn("pin-rocca")?.campi) === '["pagina"]'), { avvisi: p2.avvisi, piano: p2.piano });
let a3 = await lancia(d3, "applica", p2.firma);
prova("tappa 3: applica OK, verifica tutta OK", (a3.esito === "OK") && a3.verifica.length && a3.verifica.every(v => v.startsWith("OK")), { esito: a3.esito, problemi: a3.problemi, errori: a3.errori, verifica: a3.verifica });
const luoghi = game.journal.find(j => j.name === "Luoghi"), pLanterna = luoghi?.pages.find(x => x.name === "La Lanterna Verde");
const nB = scena.notes.get("notaLanternaXXXX"), nBl = scena.notes.get("notaRoccaXXXXXXX");
prova("nota ricollegata: la pagina nuova, senza spostarla, coi flag del mondo e l'icona di prima, col segno", !!pLanterna && (nB.entryId === luoghi.id) && (nB.pageId === pLanterna.id) && (nB.x === 500) && (nB.y === 600)
  && (nB.flags.world.wgMappa.punto === 3) && (nB.texture.src === PIN) && !!nB.flags["gdr-strumenti"]?.carico, nB);
prova("Rocca Grigia: alla pagina solo GM, il testo com'era", (nBl.pageId === rocca.id) && (nBl.text === "Rocca Grigia"), nBl);
const nN = scena.notes.find(n => n.text === "Un tempio"), tP = scena.tiles.contents[0], dW = scena.drawings.contents[0], mS = game.macros.find(m => m.name === "Sussurra (prova)");
prova("nota nuova: id fisso, livello, icona, ancora, flag del mondo", !!nN && (nN.id === await idFisso("mondo-finto", "xx-tappa3", "pin-nuovo")) && nN.levels.includes(LV) && (nN.texture.src === PIN2) && (nN.textAnchor === 1) && (nN.flags.world.wgMappa.punto === 40), nN);
prova("tassello nuovo: nascosto, bloccato, nel livello, coi flag", !!tP && tP.hidden && tP.locked && tP.levels.includes(LV) && (tP.texture.src === TAS) && (tP.width === 512) && (tP.sort === 105) && (tP.flags.world.wgMappa.quartiere === "porto"), tP);
prova("disegno nuovo: nascosto, rettangolo senza riempimento né bordo, col testo", !!dW && dW.hidden && (dW.shape.type === "r") && (dW.fillType === 0) && (dW.strokeWidth === 0) && (dW.text === "Borgomare") && (dW.textColor === "#222222"), dW);
prova("macro: a None, di script, la riga del comando, l'icona", !!mS && (mS.ownership.default === 0) && (mS.type === "script") && (mS.command === 'game.modules.get("gdr-strumenti").api.sussurraA()') && (mS.img === "icons/svg/book.svg"), mS);
const reg3 = Object.values(game.settings.get("gdr-strumenti", "carichi")).find(r => Object.values(r).some(v => v.tipo === "Drawing"));
prova("registro: note, tassello, disegno con l'id della scena, e la macro", !!reg3 && Object.values(reg3).some(v => (v.tipo === "Note") && v.id.startsWith(`${SC}.`)) && Object.values(reg3).some(v => v.tipo === "Macro"), reg3);
p2 = await lancia(d3, "prova");
prova("tappa 3, rilancio: niente da fare", (p2.esito === "prova pulita") && !p2.piano.length, { problemi: p2.problemi, piano: p2.piano });
// il GM (o «Scopri») mostra il tassello e cambia l'icona del pin: i dati non danno quei campi, non si tocca niente
tP.hidden = false; nB.texture.src = "worlds/mondo-finto/mappe/foto-lanterna.webp";
p2 = await lancia(d3, "prova");
prova("tassello mostrato e icona cambiata in Foundry, campi che i dati non danno: niente da fare", (p2.esito === "prova pulita") && !p2.piano.length, { problemi: p2.problemi, piano: p2.piano });
// i dati danno l'icona che il pin aveva: «Scopri» l'ha cambiata, il segno la conosce, è un ritocco e resta com'è
let d3b = structuredClone(d3); d3b.operazioni[1].note[0].icona = PIN;
p2 = await lancia(d3b, "prova");
prova("campo nuovo nei dati, uguale all'ultima scrittura: il ritocco di «Scopri» resta com'è", (p2.esito === "prova pulita") && !p2.piano.length && p2.avvisi.some(q => q.includes("«pin-lanterna»") && q.includes("ritoccato")), { problemi: p2.problemi, avvisi: p2.avvisi, piano: p2.piano });
// i dati vogliono un'altra icona ancora: conflitto, con «accetta»
d3b.operazioni[1].note[0].icona = PIN2;
p2 = await lancia(d3b, "prova");
const acc3 = (p2.problemi.find(q => q.includes("«accetta»")) ?? "").match(/"([0-9a-f]{64})"/)?.[1];
prova("campo nuovo nei dati, diverso dal mondo: conflitto con l'impronta per «accetta»", (p2.esito === "prova con problemi") && !!acc3, p2.problemi);
d3b.operazioni[1].note[0].accetta = acc3;
p2 = await lancia(d3b, "prova");
prova("con «accetta»: il mondo è l'ultima scrittura, l'icona dei dati la cambia", (p2.esito === "prova pulita") && (pn("pin-lanterna")?.azione === "aggiorna") && (JSON.stringify(pn("pin-lanterna")?.campi) === '["icona"]'), { problemi: p2.problemi, piano: p2.piano });
// il tassello: l'immagine nuova nei dati si scrive, la visibilità resta quella del GM
let d3c = await conSha(structuredClone(d3)); d3c.operazioni[1].tasselli[0].immagine = TAS2;
p2 = await lancia(d3c, "prova");
a3 = await lancia(d3c, "applica", p2.firma);
prova("tassello con l'immagine nuova: aggiornato, resta visibile come l'ha messo il GM, verifica OK", (a3.esito === "OK") && (tP.texture.src === TAS2) && (tP.hidden === false) && a3.verifica.every(v => v.startsWith("OK")), { esito: a3.esito, problemi: a3.problemi, errori: a3.errori, verifica: a3.verifica });
// una nota che le giocatrici vedrebbero: serve la decisione del GM
let d3d = await conSha(structuredClone(d3c)); d3d.operazioni[1].note.push({ rif: "pin-porto", livello: LV, x: 10, y: 10, pagina: PORTO, icona: PIN, testo: "Il porto" });
p2 = await lancia(d3d, "prova");
prova("nota nuova legata a una pagina delle giocatrici, senza decisione: problema", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("«pin-porto»") && q.includes("decisione")), p2.problemi);
d3d.operazioni[1].note.at(-1).decisione = "GM, 2026-01-12: il pin del porto si vede";
p2 = await lancia(d3d, "prova");
prova("con la decisione: crea, e il rapporto dice chi la vede", (p2.esito === "prova pulita") && (JSON.stringify(pn("pin-porto")?.vedono) === '["Alba","Bruna"]'), { problemi: p2.problemi, piano: p2.piano });
let d3e = await conSha(structuredClone(d3c)); d3e.operazioni[1].note[1].pagina = PORTO;
p2 = await lancia(d3e, "prova");
prova("ricollegare a una pagina che le giocatrici vedono, senza decisione: problema", p2.problemi.some(q => q.includes("«pin-rocca»") && q.includes("la vedrebbero anche")), p2.problemi);
// tolto dal GM: non si ricrea in silenzio; con «ricrea» sì
scena.drawings.delete(dW.id);
p2 = await lancia(d3c, "prova");
prova("disegno tolto dal GM: problema, non si ricrea", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("«d-nome»") && q.includes("non c'è più")), p2.problemi);
d3c.operazioni[1].disegni[0].ricrea = true;
p2 = await lancia(d3c, "prova");
prova("con «ricrea»: si ricrea", (p2.esito === "prova pulita") && (pn("d-nome")?.azione === "crea"), p2.problemi);
// la macro: ritoccata in Foundry e cambiata nei dati: conflitto; un campo che Foundry non tiene: la prova lo vede
mS.command = 'game.modules.get("gdr-strumenti").api.sussurraA({"a":1})';
let d3f = await conSha(structuredClone(d3)); d3f.operazioni[2].comando = 'game.modules.get("gdr-strumenti").api.sussurraA({"b":2})';
p2 = await lancia(d3f, "prova");
prova("macro ritoccata in Foundry e cambiata nei dati: conflitto", p2.problemi.some(q => q.includes("macro «Sussurra (prova)»") && q.includes("«accetta»")), p2.problemi);
globalThis.__finto.scarta = "textAnchor";
let d3g = await conSha(datiT3()); d3g.carico = "xx-tappa3b"; d3g.operazioni = [d3g.operazioni[0], { op: "scena", id: SC, note: [{ ...d3g.operazioni[1].note[2], rif: "pin-b" }] }];
d3g.operazioni[0].nome = "Luoghi B";
p2 = await lancia(d3g, "prova");
globalThis.__finto.scarta = null;
prova("un campo che Foundry non tiene: la prova costruisce in memoria e lo dice", p2.problemi.some(q => q.includes("costruito in memoria") && q.includes("ancoraTesto")), p2.problemi);
// un file con la sola scena, che ricollega una nota a una pagina di un altro carico (carico/rif), come i pin della città
await scena.createEmbeddedDocuments("Note", [{ _id: "notaSoloXXXXXXXX", entryId: diario.id, pageId: porto.id, x: 5, y: 5, levels: [LV], texture: { src: PIN }, text: "Locanda Storta" }], { keepId: true });
const dSolo = { ...datiBase(), carico: "xx-pin", file: [], operazioni: [{ op: "scena", id: SC, note: [{ rif: "pin-locanda", id: "notaSoloXXXXXXXX", pagina: "xx-tappa3/p-lanterna", precedente: { pagina: PORTO } }] }] };
p2 = await lancia(dSolo, "prova");
a3 = p2.esito === "prova pulita" ? await lancia(dSolo, "applica", p2.firma) : p2;
prova("solo una scena: nota ricollegata a una pagina di un altro carico (carico/rif), verifica OK", (a3.esito === "OK") && (scena.notes.get("notaSoloXXXXXXXX").pageId === pLanterna.id) && a3.verifica.every(v => v.startsWith("OK")), { esito: a3.esito, problemi: a3.problemi, errori: a3.errori, verifica: a3.verifica });
// i dati sbagliati della tappa 3
const sbaglia3 = async (fn, atteso, nome) => { const x = await conSha(datiT3()); x.carico = "xx-tappa3z"; x.operazioni[0].nome = "Luoghi Z"; fn(x); const r3 = await lancia(x, "prova"); prova(nome, ["fermato", "prova con problemi"].includes(r3.esito) && r3.problemi.some(q => q.includes(atteso)), r3.problemi); };
await sbaglia3(x => { x.operazioni[2].comando = 'game.settings.set("core", "x", 1)'; }, "deve chiamare una funzione del modulo", "macro che non chiama il modulo: problema");
await sbaglia3(x => { x.operazioni[2].comando = 'game.modules.get("gdr-strumenti").api.carica({})'; }, "non lancia il caricatore", "macro che lancia il caricatore: problema");
await sbaglia3(x => { x.operazioni[2].comando = 'game.modules.get("gdr-strumenti").api.sussurraA()\nalert(1)'; }, "una riga sola", "macro su due righe: problema");
await sbaglia3(x => { x.operazioni[2].comando = 'game.modules.get("gdr-strumenti").api.sussurraA(x => 1)'; }, "JSON", "argomenti non JSON: problema");
await sbaglia3(x => { x.operazioni[2].comando = 'game.modules.get("gdr-strumenti").api.nonCe()'; }, "la funzione «nonCe» non c'è", "funzione che il modulo non ha: problema");
await sbaglia3(x => { delete x.operazioni[1].note[2].livello; }, "manca «livello»", "nota nuova senza livello: problema");
await sbaglia3(x => { delete x.operazioni[1].tasselli[0].y; }, "x, y, larghezza, altezza vanno insieme", "area a metà: problema");
await sbaglia3(x => { x.operazioni[1].tasselli[0].visibile = true; }, "visibile alla nascita vuole la decisione", "tassello visibile senza decisione: problema");
await sbaglia3(x => { x.operazioni[1].note[2].pagina = "m-sussurra"; }, "non è il rif di una pagina", "nota verso una macro del file: problema");
await sbaglia3(x => { x.operazioni[1].note[2].testo = "Qui i PG"; }, "parole da DM", "parola da DM nel testo di una nota: problema");
await sbaglia3(x => { x.operazioni[1].disegni[0].testo = "La casa di Mirta"; }, "nome vero", "nome vero del mondo nel testo di un disegno: problema");
await sbaglia3(x => { x.operazioni[1].note[2].livello = "altroLivello0000"; }, "il livello altroLivello0000 non c'è", "livello che la scena non ha: problema");
await sbaglia3(x => { x.operazioni[1].id = "scenaNonCeXXXXXX"; }, "non c'è nel mondo", "scena che non c'è: problema");
await sbaglia3(x => { x.operazioni.push({ op: "scena", id: SC, note: [] }); }, "una per scena", "due operazioni per la stessa scena: problema");
await sbaglia3(x => { x.operazioni[1].disegni[0].forma = { tipo: "poligono", larghezza: 10, altezza: 10, punti: [0, 0] }; }, "almeno tre punti", "poligono con un punto: problema");
await sbaglia3(x => { x.operazioni[1].note[2].icona = "worlds/mondo-finto/mappe/non-elencata.webp"; }, "deve essere elencata in file", "icona fuori da file: problema");

// sicurezza: flag del mondo, argomenti delle macro, funzioni ereditate, macro che le giocatrici lanciano
await sbaglia3(x => { x.operazioni[1].note[2].flagsMondo = { "wgMappa.punto": 1 }; }, "chiavi senza punti", "flag del mondo con una chiave col punto: problema");
await sbaglia3(x => { x.operazioni[1].note[2].flagsMondo = { wgMappa: { nota: "per i PG" } }; }, "parole da DM", "parola da DM nei flag del mondo: problema");
await sbaglia3(x => { x.operazioni[1].note[2].flagsMondo = { wgMappa: { nome: "Mirta" } }; }, "nome vero", "nome vero del mondo nei flag: problema");
await sbaglia3(x => { x.operazioni[2].comando = 'game.modules.get("gdr-strumenti").api.sussurraA({"__proto__":{"a":1}})'; }, "__proto__", "argomenti con __proto__: problema");
await sbaglia3(x => { x.operazioni[2].comando = 'game.modules.get("gdr-strumenti").api.constructor()'; }, "la funzione «constructor» non c'è", "funzione ereditata (constructor): problema");
mS.command = 'game.modules.get("gdr-strumenti").api.sussurraA()'; mS.ownership.default = 2;
p2 = await lancia(d3f, "prova");
prova("macro che le giocatrici vedono, col comando che cambia: problema", p2.problemi.some(q => q.includes("macro «Sussurra (prova)»") && q.includes("una giocatrice la vede")), p2.problemi);
mS.ownership.default = 0;
// la pagina della nota cambia visibilità fra il piano e la scrittura: non si scrive la nota
const dW1 = { ...datiBase(), carico: "xx-pin-w1", file: [{ percorso: PIN, sha256: await shaF(PIN) }], operazioni: [{ op: "scena", id: SC, note: [{ rif: "pin-w1", livello: LV, x: 1, y: 1, pagina: ROCCA, icona: PIN, testo: "Un castello" }] }] };
p2 = await lancia(dW1, "prova");
const setPrima = game.settings.set;
game.settings.set = async (m, k, v) => { if ( k === "carichi" ) rocca.ownership.default = 2; return setPrima(m, k, v); };
a3 = await lancia(dW1, "applica", p2.firma);
game.settings.set = setPrima; rocca.ownership.default = 0;
prova("pagina della nota mostrata durante il carico: la nota non si scrive", (p2.esito === "prova pulita") && (a3.esito === "da guardare") && a3.errori.some(q => q.includes("la visibilità della pagina")) && !scena.notes.some(n => n.text === "Un castello"), { prova: p2.problemi, esito: a3.esito, errori: a3.errori });

// logica: il segno con tutti i campi, l'avviso di «precedente», il riempimento, i problemi delle pagine prima
let d3h = await conSha(structuredClone(d3c)); d3h.operazioni[1].note[2].tinta = "#8A7F70";
p2 = await lancia(d3h, "prova");
prova("campo aggiunto ai dati dopo la nascita (tinta, in maiuscolo): si aggiorna, senza conflitto", (p2.esito === "prova pulita") && (JSON.stringify(pn("pin-nuovo")?.campi) === '["tinta"]'), { problemi: p2.problemi, piano: p2.piano });
a3 = await lancia(d3h, "applica", p2.firma);
prova("tinta aggiornata, verifica OK", (a3.esito === "OK") && (nN.texture.tint === "#8a7f70"), { esito: a3.esito, errori: a3.errori, verifica: a3.verifica });
p2 = await lancia(d3h, "prova");
prova("«precedente» su un elemento col segno: avviso", p2.avvisi.some(q => q.includes("«pin-lanterna»") && q.includes("«precedente» non conta più")), p2.avvisi);
let d3i = await conSha(structuredClone(d3h)); d3i.operazioni[0].pagine.push({ rif: "p-x", id: "nonCeXXXXXXXXXXX", nome: "Tolta", tipo: "text", html: "<p>x</p>" });
p2 = await lancia(d3i, "prova");
prova("problemi nelle pagine: la nota dice che scene e macro non sono controllate", (p2.esito !== "prova pulita") && p2.note.some(q => q.includes("scene, macro e documenti da mettere da parte non sono ancora controllati")), { problemi: p2.problemi, note: p2.note });
// un elemento di uno script di prima già uguale ai dati: solo il segno; aggiorna false; pagina null in precedente; JournalEntry.<id>
await scena.createEmbeddedDocuments("Note", [{ _id: "notaUgualeXXXXXX", entryId: diario.id, pageId: null, x: 7, y: 7, levels: [LV], texture: { src: PIN }, text: "Il Diario" },
  { _id: "notaSciolaXXXXXX", entryId: null, pageId: null, x: 8, y: 8, levels: [LV], texture: { src: PIN }, text: "Sciolta" }], { keepId: true });
await scena.createEmbeddedDocuments("Drawing", [{ _id: "disegnoVecchioXX", x: 1, y: 1, levels: [LV], shape: { type: "e", width: 10, height: 10, points: [] }, fillType: 1, fillColor: "#ff0000", fillAlpha: 0.5, strokeWidth: 2, strokeColor: "#000000", strokeAlpha: 1, hidden: true }], { keepId: true });
const dVar = { ...datiBase(), carico: "xx-varie", file: [], operazioni: [{ op: "scena", id: SC,
  note: [{ rif: "n-uguale", id: "notaUgualeXXXXXX", pagina: `JournalEntry.${diario.id}` }, { rif: "n-sciolta", id: "notaSciolaXXXXXX", pagina: ROCCA, precedente: { pagina: null } }],
  disegni: [{ rif: "d-vecchio", id: "disegnoVecchioXX", x: 1, y: 1, forma: { tipo: "ellisse", larghezza: 10, altezza: 10 }, riempimento: { colore: "#FF0000", alpha: 0.5 }, bordo: null, precedente: { x: 1, y: 1, forma: { tipo: "ellisse", larghezza: 10, altezza: 10 }, bordo: { colore: "#000000", spessore: 2, alpha: 1 } } }] }] };
p2 = await lancia(dVar, "prova");
prova("uguale ai dati: solo il segno; da nessuna pagina a una solo GM: aggiorna, non la vedono più; ellisse col bordo tolto: aggiorna", (p2.esito === "prova pulita") && (pn("n-uguale")?.azione === "segna")
  && (pn("n-sciolta")?.azione === "aggiorna") && p2.avvisi.some(q => q.includes("«n-sciolta»") && q.includes("non la vedranno più")) && (JSON.stringify(pn("d-vecchio")?.campi) === '["bordo"]'), { problemi: p2.problemi, avvisi: p2.avvisi, piano: p2.piano });
a3 = await lancia(dVar, "applica", p2.firma);
prova("varie: applica OK, il disegno senza bordo e ancora nascosto", (a3.esito === "OK") && (scena.drawings.get("disegnoVecchioXX").strokeWidth === 0) && scena.drawings.get("disegnoVecchioXX").hidden && a3.verifica.every(v => v.startsWith("OK")), { esito: a3.esito, errori: a3.errori, verifica: a3.verifica });
dVar.operazioni[0].disegni[0].riempimento = null; dVar.operazioni[0].disegni[0].aggiorna = false;
p2 = await lancia(dVar, "prova");
prova("aggiorna: false: un avviso, niente da fare", (p2.esito === "prova pulita") && !p2.piano.some(x => x.nome === "d-vecchio") && p2.avvisi.some(q => q.includes("«d-vecchio»") && q.includes("non aggiornarlo")), { avvisi: p2.avvisi, piano: p2.piano });
// i flag del mondo di un elemento che c'è (dalla 1.10.0): si correggono solo con quelli di prima in «precedente» (il segnaposto di Rocca Grigia)
const SEG0 = { punto: 12, quartiere: "mercato", nascosta: "paginaMercatoXXX" }, SEG1 = { ...SEG0, nascosta: "paginaRoccaXXXXX" };
await scena.createEmbeddedDocuments("Note", [{ _id: "notaSegnaposXXXX", entryId: diario.id, pageId: null, x: 9, y: 9, levels: [LV], texture: { src: PIN }, text: "Un castello",
  flags: { world: { wgSegnaposto: SEG0, wgAltro: 1 } } }], { keepId: true });
const nSeg = () => scena.notes.get("notaSegnaposXXXX");
const dFl = (el) => ({ ...datiBase(), carico: "xx-flag", file: [], operazioni: [{ op: "scena", id: SC, note: [{ rif: "seg-12", id: "notaSegnaposXXXX", ...el }] }] });
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: SEG1 } }), "prova");
prova("flag del mondo senza «precedente» su un elemento che c'è: solo alla nascita, un avviso, nessun flag nel piano", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("«seg-12»") && q.includes("wgSegnaposto sono diversi dai dati e valgono solo alla nascita") && q.includes("«precedente.flagsMondo»"))
  && !(pn("seg-12")?.campi ?? []).length, { esito: p2.esito, avvisi: p2.avvisi, problemi: p2.problemi, piano: p2.piano });
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: SEG1 }, precedente: { flagsMondo: { wgSegnaposto: { ...SEG0, nascosta: "altraPaginaXXXXX" } } } }), "prova");
prova("flag del mondo diverso da «precedente»: problema, decide il GM", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("«seg-12»") && q.includes("wgSegnaposto") && q.includes("decide il GM")), p2.problemi);
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: SEG1 }, precedente: { flagsMondo: { wgAltro: 1 } } }), "prova");
prova("«precedente» con un flag che non è in flagsMondo: problema", (p2.esito !== "prova pulita") && p2.problemi.some(q => q.includes("wgAltro") && q.includes("non sono in flagsMondo")), p2.problemi);
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: null }, precedente: { flagsMondo: { wgSegnaposto: SEG0 } } }), "prova");
prova("flag da togliere (null): problema", (p2.esito !== "prova pulita") && p2.problemi.some(q => q.includes("non toglie flag")), p2.problemi);
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: SEG1 }, precedente: { flagsMondo: { wgSegnaposto: { ...SEG0, nascosta: "altraPaginaXXXXX" } } }, aggiorna: false }), "prova");
prova("aggiorna: false con un flag cambiato da altri: un avviso, non un problema", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("«seg-12»") && q.includes("flag wgSegnaposto") && q.includes("non aggiornarlo")), { problemi: p2.problemi, avvisi: p2.avvisi });
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: { punto: 12 } }, precedente: { flagsMondo: { wgSegnaposto: SEG0 } } }), "prova");
prova("un valore nuovo con meno sottochiavi: problema, con il perché", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("«seg-12»") && q.includes("una sottochiave che c'è nel mondo e non nei dati non si toglie")), p2.problemi);
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: { ...SEG1, chi: "Mirta" } }, precedente: { flagsMondo: { wgSegnaposto: SEG0 } } }), "prova");
prova("nome vero nei flag da correggere: problema", (p2.esito !== "prova pulita") && p2.problemi.some(q => q.includes("nome vero")), p2.problemi);
{ const dCorsa = dFl({ flagsMondo: { wgSegnaposto: SEG1 }, precedente: { flagsMondo: { wgSegnaposto: SEG0 } } });
  p2 = await lancia(dCorsa, "prova");
  await scena.updateEmbeddedDocuments("Note", [{ _id: "notaSegnaposXXXX", "flags.world.wgAltro": 2 }]);
  a3 = await lancia(dCorsa, "applica", p2.firma);
  prova("un flag cambiato fra la prova e «applica»: non si scrive", (a3.esito !== "OK") && (JSON.stringify(nSeg().flags.world.wgSegnaposto) === JSON.stringify(SEG0)), { esito: a3.esito, errori: a3.errori });
  await scena.updateEmbeddedDocuments("Note", [{ _id: "notaSegnaposXXXX", "flags.world.wgAltro": 1 }]); }
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: SEG1 }, precedente: { flagsMondo: { wgSegnaposto: SEG0 } }, aggiorna: false }), "prova");
prova("flag da correggere con aggiorna: false: un avviso, niente da fare", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("«seg-12»") && q.includes("flag wgSegnaposto") && q.includes("non aggiornarlo")), { avvisi: p2.avvisi, piano: p2.piano });
const dFlOk = dFl({ flagsMondo: { wgSegnaposto: SEG1 }, precedente: { flagsMondo: { wgSegnaposto: SEG0 } } });
p2 = await lancia(dFlOk, "prova");
prova("flag del mondo come in «precedente»: si corregge, e il piano dice il prima e il dopo", (p2.esito === "prova pulita") && (pn("seg-12")?.azione === "aggiorna") && (JSON.stringify(pn("seg-12")?.campi) === '["flag wgSegnaposto"]')
  && (pn("seg-12")?.flags?.wgSegnaposto?.prima?.nascosta === SEG0.nascosta) && (pn("seg-12")?.flags?.wgSegnaposto?.dopo?.nascosta === SEG1.nascosta), { problemi: p2.problemi, piano: p2.piano });
a3 = await lancia(dFlOk, "applica", p2.firma);
prova("flag corretto, gli altri flag e i campi com'erano, col segno che tiene il flag scritto, verifica OK", (a3.esito === "OK") && (JSON.stringify(nSeg().flags.world.wgSegnaposto) === JSON.stringify(SEG1)) && (nSeg().flags.world.wgAltro === 1)
  && (nSeg().text === "Un castello") && (JSON.stringify(nSeg().flags["gdr-strumenti"]?.carico?.flags?.wgSegnaposto) === JSON.stringify(SEG1)) && a3.verifica.every(v => v.startsWith("OK")), { esito: a3.esito, errori: a3.errori, verifica: a3.verifica, flags: nSeg().flags });
p2 = await lancia(dFlOk, "prova");
prova("rilancio: il flag è già come nei dati, niente da fare; «precedente.flagsMondo» si può togliere", (p2.esito === "prova pulita") && !p2.piano.some(x => (x.nome === "seg-12") && x.azione) && p2.avvisi.some(q => q.includes("«seg-12»") && q.includes("si può togliere")), { avvisi: p2.avvisi, piano: p2.piano });
await scena.updateEmbeddedDocuments("Note", [{ _id: "notaSegnaposXXXX", "flags.world.wgSegnaposto": SEG0 }]);
p2 = await lancia(dFlOk, "prova");
prova("flag rimesso a mano al valore di «precedente» dopo la correzione: è un ritocco, resta com'è (l'ultima scrittura è nel segno)", (p2.esito === "prova pulita") && !p2.piano.some(x => (x.nome === "seg-12") && (x.azione === "aggiorna")) && p2.avvisi.some(q => q.includes("«seg-12»") && q.includes("ritoccati in Foundry")), { problemi: p2.problemi, avvisi: p2.avvisi, piano: p2.piano });
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: { ...SEG1, nascosta: "terzaPaginaXXXXX" } } }), "prova");
prova("dopo un ritocco, i dati che vogliono un valore nuovo: problema, decide il GM", (p2.esito === "prova con problemi") && p2.problemi.some(q => q.includes("«seg-12»") && q.includes("nel segno") && q.includes("decide il GM")), p2.problemi);
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: null } }), "prova");
prova("dopo la correzione, un flag a null senza «precedente»: problema, non si toglie", (p2.esito !== "prova pulita") && p2.problemi.some(q => q.includes("non toglie flag")) && !!nSeg().flags.world.wgSegnaposto, p2.problemi);
p2 = await lancia(dFl({ flagsMondo: { wgSegnaposto: SEG1 }, precedente: { flagsMondo: { wgSegnaposto: SEG1 } } }), "prova");
prova("«precedente» uguale ai dati: problema, niente da correggere", (p2.esito !== "prova pulita") && p2.problemi.some(q => q.includes("niente da correggere")), p2.problemi);
// un flag che non c'era (null in «precedente»), su un tassello
await scena.createEmbeddedDocuments("Tile", [{ _id: "tassFlagXXXXXXXX", x: 0, y: 0, width: 10, height: 10, levels: [LV], texture: { src: TAS }, hidden: true }], { keepId: true });
const dTf = { ...datiBase(), carico: "xx-flag-t", file: [], operazioni: [{ op: "scena", id: SC, tasselli: [{ rif: "t-flag", id: "tassFlagXXXXXXXX", flagsMondo: { wgMappa: { quartiere: "porto" } }, precedente: { flagsMondo: { wgMappa: null } } }] }] };
p2 = await lancia(dTf, "prova");
a3 = await lancia(dTf, "applica", p2.firma);
prova("tassello: un flag che non c'era si aggiunge, ancora nascosto", (a3.esito === "OK") && (scena.tiles.get("tassFlagXXXXXXXX").flags.world?.wgMappa?.quartiere === "porto") && scena.tiles.get("tassFlagXXXXXXXX").hidden, { esito: a3.esito, problemi: p2.problemi, errori: a3.errori });
// un elemento nato da un carico, senza id nei dati: un flag cambiato nei dati è un avviso
{ const d3z = await conSha(structuredClone(d3h)); d3z.operazioni[1].note[2].flagsMondo = { wgMappa: { punto: 41 } };
  p2 = await lancia(d3z, "prova");
  prova("flag cambiato nei dati di un elemento senza id: un avviso, non si cambia", p2.avvisi.some(q => q.includes("«pin-nuovo»") && q.includes("valgono solo alla nascita")) && !p2.piano.some(x => (x.nome === "pin-nuovo") && (x.campi ?? []).some(c => c.startsWith("flag"))), { esito: p2.esito, avvisi: p2.avvisi, problemi: p2.problemi }); }
// una scrittura della scena che non riesce: si ferma; il rilancio riprende
const dF = { ...datiBase(), carico: "xx-fallisce", file: [{ percorso: PIN, sha256: await shaF(PIN) }], operazioni: [{ op: "scena", id: SC, note: [{ rif: "n-f", livello: LV, x: 3, y: 3, pagina: ROCCA, icona: PIN, testo: "F" }] }] };
p2 = await lancia(dF, "prova");
globalThis.__finto.fallisci = "scena";
a3 = await lancia(dF, "applica", p2.firma);
globalThis.__finto.fallisci = null;
p2 = await lancia(dF, "prova");
prova("scrittura della scena non riuscita: da guardare, niente nota; il rilancio la crea", (a3.esito === "da guardare") && !scena.notes.some(n => n.text === "F") && (pn("n-f")?.azione === "crea"), { esito: a3.esito, errori: a3.errori, problemi: p2.problemi });
// la macro di uno script di prima, presa col suo id e «precedente»
const mV = await Macro.create({ _id: "macroVecchiaXXXX", name: "Vecchia", type: "script", command: 'game.modules.get("gdr-strumenti").api.sussurraA()' }, { keepId: true });
const dM = { ...datiBase(), carico: "xx-macro", file: [], operazioni: [{ op: "macro", rif: "m-v", id: mV.id, nome: "Vecchia", cartella: null, comando: 'game.modules.get("gdr-strumenti").api.sussurraA({"a":1})', precedente: { comando: 'game.modules.get("gdr-strumenti").api.sussurraA()', nome: "Vecchia" } }] };
p2 = await lancia(dM, "prova");
a3 = await lancia(dM, "applica", p2.firma);
prova("macro di uno script di prima: il comando nuovo, verifica OK", (a3.esito === "OK") && (mV.command === 'game.modules.get("gdr-strumenti").api.sussurraA({"a":1})') && a3.verifica.every(v => v.startsWith("OK")), { problemi: p2.problemi, esito: a3.esito, errori: a3.errori, verifica: a3.verifica });
await sbaglia3(x => { x.operazioni.push({ op: "macro", rif: "m2", nome: "Vecchia", cartella: null, comando: 'game.modules.get("gdr-strumenti").api.sussurraA()' }); }, "c'è già, non di questo carico", "macro omonima di un'altra: problema");
// 1.8.3: una cartella che c'è già, non scritta da un carico (fatta a mano o da uno script), si usa invece di fermarsi
{
  const { Cartella } = await import("./finto-foundry.mjs");
  const dA = n => ({ ...datiBase(), carico: `xx-adotta${n.toLowerCase()}`, file: [], operazioni: [
    { op: "cartella", rif: "c-q", tipo: "JournalEntry", nome: `Quartiere ${n}`, padre: null },
    { op: "journal", rif: "j-q", nome: `Quartiere ${n} (solo GM)`, cartella: "c-q", pagine: [{ rif: "p-q", nome: "Note (solo GM)", tipo: "text", html: "<p>Note.</p>" }] }] });
  const fa = await Cartella.create({ _id: "cartellaAManoAAA", name: "Quartiere A", type: "JournalEntry" }, { keepId: true });
  let pA = await lancia(dA("A"), "prova");
  prova("cartella omonima fatta a mano: si usa quella, e il piano lo dice", (pA.esito === "prova pulita") && pA.piano.some(x => (x.azione === "adotta") && (x.cosa === "cartella") && (x.id === fa.id)) && !pA.piano.some(x => (x.azione === "crea") && (x.cosa === "cartella")), { esito: pA.esito, problemi: pA.problemi, piano: pA.piano });
  let aA = await lancia(dA("A"), "applica", pA.firma);
  const jA = game.journal.find(j => j.name === "Quartiere A (solo GM)");
  prova("cartella omonima fatta a mano: il journal nuovo ci va dentro, nessuna cartella nuova, la cartella non si tocca", (aA.esito === "OK") && (jA?.folder?.id === fa.id) && (game.folders.filter(f => f.name === "Quartiere A").length === 1) && !segnoDiF(fa), { esito: aA.esito, errori: aA.errori });
  pA = await lancia(dA("A"), "prova");
  prova("cartella usata: al giro dopo si ritrova allo stesso modo, senza problemi", (pA.esito === "prova pulita") && pA.piano.some(x => (x.azione === "adotta") && (x.id === fa.id)), { esito: pA.esito, problemi: pA.problemi });
  await Cartella.create({ _id: "cartellaAManoBB1", name: "Quartiere B", type: "JournalEntry" }, { keepId: true });
  await Cartella.create({ _id: "cartellaAManoBB2", name: "Quartiere B", type: "JournalEntry" }, { keepId: true });
  const pB = await lancia(dA("B"), "prova");
  prova("due cartelle omonime: problema, come prima", pB.problemi.some(q => q.includes("c'è già, non di questo carico")), pB.problemi);
  await Cartella.create({ _id: "cartellaAltroCCC", name: "Quartiere C", type: "JournalEntry", flags: { "gdr-strumenti": { carico: { chiave: "un-altro-carico" } } } }, { keepId: true });
  const pC = await lancia(dA("C"), "prova");
  prova("cartella omonima scritta da un altro carico: problema, come prima", pC.problemi.some(q => q.includes("c'è già, non di questo carico")), pC.problemi);
  prova("cartella usata: nelle corrispondenze del rapporto, col segno «adottata», e non nel registro", pA.corrispondenze?.some(c => (c.id === fa.id) && c.adottata)
    && !Object.values(game.settings.get("gdr-strumenti", "carichi")).some(r => Object.values(r).some(v => v.id === fa.id)), pA.corrispondenze);
  // una madre usata, con una figlia nuova dentro
  const fm = await Cartella.create({ _id: "cartellaMadreEEE", name: "Quartiere E", type: "JournalEntry" }, { keepId: true });
  const dE = { ...dA("E"), operazioni: [{ op: "cartella", rif: "c-q", tipo: "JournalEntry", nome: "Quartiere E", padre: null },
    { op: "cartella", rif: "c-f", tipo: "JournalEntry", nome: "Luoghi E", padre: "c-q" },
    { op: "journal", rif: "j-q", nome: "Luoghi E (solo GM)", cartella: "c-f", pagine: [{ rif: "p-q", nome: "Note (solo GM)", tipo: "text", html: "<p>Note.</p>" }] }] };
  let pE = await lancia(dE, "prova"); let aE = await lancia(dE, "applica", pE.firma);
  const fFiglia = game.folders.find(f => f.name === "Luoghi E");
  prova("madre usata, figlia nuova: la figlia nasce dentro la madre che c'era", (aE.esito === "OK") && (fFiglia?.folder?.id === fm.id), { esito: aE.esito, errori: aE.errori, problemi: aE.problemi });
  // la cartella usata che sparisce fra la prova e «applica»
  const ff = await Cartella.create({ _id: "cartellaSparisce", name: "Quartiere F", type: "JournalEntry" }, { keepId: true });
  const pF = await lancia(dA("F"), "prova");
  game.folders.delete(ff.id);
  const aF = await lancia(dA("F"), "applica", pF.firma);
  prova("cartella usata che sparisce prima di «applica»: fermato, niente journal", (aF.esito === "fermato") && !game.journal.some(j => j.name === "Quartiere F (solo GM)"), { esito: aF.esito, problemi: aF.problemi });
  // una cartella che il carico aveva scritto, tolta e rifatta a mano: problema; con «ricrea» si usa quella, e il registro si pulisce
  const dG = dA("G"); let pG = await lancia(dG, "prova"); await lancia(dG, "applica", pG.firma);
  const fG = game.folders.find(f => f.name === "Quartiere G"); const jG = game.journal.find(j => j.name === "Quartiere G (solo GM)");
  game.folders.delete(fG.id); jG._folder = null;
  await Cartella.create({ _id: "cartellaRifattaGG", name: "Quartiere G", type: "JournalEntry" }, { keepId: true });
  pG = await lancia(dG, "prova");
  prova("cartella del carico tolta e rifatta a mano: problema", pG.problemi.some(q => q.includes("l'ha già scritto questo carico")), pG.problemi);
  const dGr = dA("G"); dGr.operazioni[0].ricrea = true;
  pG = await lancia(dGr, "prova");
  const aG = await lancia(dGr, "applica", pG.firma);
  pG = await lancia(dG, "prova");
  prova("con «ricrea» si usa quella rifatta, e al giro dopo, senza «ricrea», niente problema", (aG.esito === "OK") && pG.piano.some(x => (x.azione === "adotta") && (x.id === "cartellaRifattaGG")) && !pG.problemi.some(q => q.includes("l'ha già scritto")), { a: aG.esito, errori: aG.errori, problemi: pG.problemi });
  prova("con «ricrea» e la cartella rifatta: la voce di prima tolta dal registro", !Object.values(game.settings.get("gdr-strumenti", "carichi")).some(r => Object.values(r).some(v => v.id === fG.id)));
  // un carico già fatto, con una cartella usata: la prova dice «niente da fare», e «applica» dà OK senza scrivere
  pA = await lancia(dA("A"), "prova");
  aA = await lancia(dA("A"), "applica", pA.firma);
  prova("carico già fatto con una cartella usata: «niente da fare», applica OK", pA.note.some(q => q.startsWith("niente da fare")) && (aA.esito === "OK") && aA.note.some(q => q.startsWith("niente da fare")), { pn: pA.note, esito: aA.esito, an: aA.note });
  await Cartella.create({ _id: "cartellaAltroDDD", name: "Quartiere D", type: "Actor" }, { keepId: true });
  const pD = await lancia(dA("D"), "prova");
  prova("cartella omonima di un altro tipo: non si usa, se ne crea una", (pD.esito === "prova pulita") && pD.piano.some(x => (x.azione === "crea") && (x.cosa === "cartella")), { esito: pD.esito, problemi: pD.problemi });
}
// 1.8.1: la forma col messaggio delle macro dei mondi, che col modulo spento dice di attivarlo
{
  const { MODULO_SPENTO } = await import(`${M}/carica/dati-scene.mjs`);
  const guidata = (fn, args = "", msg = MODULO_SPENTO) => `return game.modules.get("gdr-strumenti")?.api?.${fn}?.(${args}) ?? ui.notifications.error(${JSON.stringify(msg)});`;
  const cmd = guidata("sussurraA", '{"a":2}');
  const dG = { ...dM, operazioni: [{ ...dM.operazioni[0], comando: cmd, precedente: undefined }] };
  delete dG.operazioni[0].precedente;
  p2 = await lancia(dG, "prova");
  a3 = await lancia(dG, "applica", p2.firma);
  prova("macro nella forma col messaggio: ammessa, il comando nuovo, verifica OK", (p2.esito === "prova pulita") && (a3.esito === "OK") && (mV.command === cmd) && a3.verifica.every(v => v.startsWith("OK")), { problemi: p2.problemi, esito: a3.esito, errori: a3.errori });
  // il comando eseguito come lo esegue Foundry (il corpo di una funzione async): col modulo attivo, che non c'è, e presente ma spento
  const uiPrima = globalThis.ui, modPrima = game.modules.get("gdr-strumenti"), esegui = new (Object.getPrototypeOf(async function () {}).constructor)(cmd);
  const errori = [], chiamate = [];
  try {
    globalThis.ui = { notifications: { error: m => { errori.push(m); return m; } } };
    game.modules.set("gdr-strumenti", { active: true, api: { sussurraA: async (...a) => { chiamate.push(a); } } });
    await esegui();
    prova("macro nella forma col messaggio, col modulo attivo: la funzione con gli argomenti, nessun messaggio", !errori.length && (JSON.stringify(chiamate) === '[[{"a":2}]]'), { errori, chiamate });
    game.modules.delete("gdr-strumenti"); errori.length = 0;
    await esegui();
    prova("macro nella forma col messaggio, senza il modulo: il messaggio che dice di attivarlo", (errori.length === 1) && (errori[0] === MODULO_SPENTO), errori);
    game.modules.set("gdr-strumenti", { active: false }); errori.length = 0;
    await esegui();
    prova("macro nella forma col messaggio, col modulo installato ma spento: il messaggio", (errori.length === 1) && (errori[0] === MODULO_SPENTO), errori);
  } finally { game.modules.set("gdr-strumenti", modPrima); globalThis.ui = uiPrima; }
  await sbaglia3(x => { x.operazioni[2].comando = guidata("sussurraA", "", "Altro messaggio"); }, "deve chiamare una funzione del modulo", "forma col messaggio, con un altro messaggio: problema");
  await sbaglia3(x => { x.operazioni[2].comando = guidata("sussurraA") + " alert(1);"; }, "deve chiamare una funzione del modulo", "forma col messaggio, con altro codice dopo: problema");
  await sbaglia3(x => { x.operazioni[2].comando = guidata("sussurraA").replace("return ", ""); }, "deve chiamare una funzione del modulo", "forma col messaggio senza return: problema");
  await sbaglia3(x => { x.operazioni[2].comando = guidata("sussurraA", "x => 1"); }, "JSON", "forma col messaggio, argomenti non JSON: problema");
  await sbaglia3(x => { x.operazioni[2].comando = guidata("carica", "{}"); }, "non lancia il caricatore", "forma col messaggio che lancia il caricatore: problema");
  await sbaglia3(x => { x.operazioni[2].comando = guidata("nonCe"); }, "la funzione «nonCe» non c'è", "forma col messaggio, funzione che il modulo non ha: problema");
  await sbaglia3(x => { x.operazioni[2].comando = guidata("sincrona"); }, "deve essere async", "forma col messaggio, funzione non async: problema");
  { const dS = { ...dM, operazioni: [{ ...dM.operazioni[0], comando: 'game.modules.get("gdr-strumenti").api.sincrona()' }] }; delete dS.operazioni[0].precedente;
    const pS = await lancia(dS, "prova");
    prova("forma breve con una funzione non async: ammessa come prima", (pS.esito === "prova pulita") && !pS.problemi.length, pS.problemi); }
  await sbaglia3(x => { x.operazioni[2].comando = guidata("sussurraA", "1) ?? alert(1)"); }, "JSON", "forma col messaggio, codice dentro gli argomenti: problema");
  await sbaglia3(x => { x.operazioni[2].comando = "await " + guidata("sussurraA").slice("return ".length); }, "deve chiamare una funzione del modulo", "forma col messaggio con await al posto di return: problema");
  await sbaglia3(x => { x.operazioni[2].comando = "await " + guidata("sussurraA"); }, "deve chiamare una funzione del modulo", "forma col messaggio con await davanti: problema");
}
await sbaglia3(x => { x.operazioni[1].note[2].x = 700.5; }, "numero intero", "coordinate non intere: problema");
await sbaglia3(x => { x.operazioni[1].note[2].dimensioneIcona = 16; }, "fra 32 e 512", "icona più piccola di quanto tiene Foundry: problema");
await sbaglia3(x => { x.operazioni[1].note[1].id = "notaLanternaXXXX"; }, "già usato", "lo stesso id in due elementi: problema");
{ const x = await conSha(structuredClone(d3h)); x.operazioni[1].note[0].pagina = "JournalEntry.nonCeXXXXXXXXXXX.JournalEntryPage.nonCeXXXXXXXXXXX"; const r3 = await lancia(x, "prova");
  prova("nota verso una pagina che non c'è: problema", r3.problemi.some(q => q.includes("«pin-lanterna»") && q.includes("non c'è nel mondo")), r3.problemi); }
// i flag del mondo delle pagine: alla nascita, e su una pagina che c'è solo quelli che mancano
let d3k = await conSha(structuredClone(d3h)); d3k.operazioni[0].pagine[0].flagsMondo = { wgVoce: true };
p2 = await lancia(d3k, "prova");
prova("flag del mondo su una pagina che c'è: si aggiungono", (p2.esito === "prova pulita") && p2.piano.some(x => (x.cosa === "pagina") && (x.nome === "La Lanterna Verde") && (JSON.stringify(x.campi) === '["flag del mondo"]')), { problemi: p2.problemi, piano: p2.piano });
a3 = await lancia(d3k, "applica", p2.firma);
prova("flag del mondo aggiunto, verifica OK; il rilancio non ha niente da fare", (a3.esito === "OK") && (pLanterna.flags.world?.wgVoce === true) && a3.verifica.every(v => v.startsWith("OK")) && !(await lancia(d3k, "prova")).piano.length, { esito: a3.esito, errori: a3.errori, verifica: a3.verifica });
pLanterna.flags.world.wgVoce = "no";
p2 = await lancia(d3k, "prova");
prova("flag del mondo diverso nel mondo: resta com'è, con un avviso", (p2.esito === "prova pulita") && !p2.piano.length && p2.avvisi.some(q => q.includes("«wgVoce»")), { avvisi: p2.avvisi, piano: p2.piano });
pLanterna.flags.world.wgVoce = true;
await sbaglia(x => { x.operazioni[1].pagine[0].flagsMondo = { "a.b": 1 }; }, "chiavi senza punti", "flag del mondo di una pagina con una chiave col punto: problema");

// casi limite: «==» nelle chiavi, i nomi di ogni oggetto, i nomi veri del mondo nei flag di una pagina che si mostra
await sbaglia(x => { x.operazioni[1].pagine[0].flagsMondo = { "==wgVoce": true }; }, "«==»", "flag del mondo con «==» in testa: problema");
await sbaglia(x => { x.operazioni[1].pagine[0].flagsMondo = { toString: 1 }; }, "toString", "flag del mondo con un nome di ogni oggetto: problema");
await sbaglia(x => { x.operazioni[2].pagine[0].flagsMondo = { wgChi: "Mirta" }; }, "nome vero", "nome vero del mondo nei flag di una pagina che si mostra: problema");

// --- 1.7.0: il tiro privato delle tabelle «privata» e la conversione in metri degli attori nuovi ------------------------------------
const { rendiPrivato } = await import(`${M}/tiro-privato.mjs`);
const tP15 = { op: "tabella", rif: "t-priv", nome: "Sempre privata", cartella: null, formula: "1d2", privata: true, descrizione: "<p>Da tirare in privato.</p>", voci: [{ da: 1, a: 2, testo: "Un fornaio" }] };
const dPriv = { ...datiBase(), carico: "xx-privata", file: [], operazioni: [tP15] };
p2 = await lancia(dPriv, "prova"); a3 = await lancia(dPriv, "applica", p2.firma);
const tPriv = game.tables.find(t => t.name === "Sempre privata");
prova("tabella privata nuova: col segno «privata» del modulo, verifica OK", (a3.esito === "OK") && (tPriv?.flags["gdr-strumenti"]?.privata === true) && a3.verifica.every(v => v.startsWith("OK")), { esito: a3.esito, errori: a3.errori, verifica: a3.verifica });
delete tPriv.flags["gdr-strumenti"].privata;
p2 = await lancia(dPriv, "prova");
prova("tabella privata senza il segno nel mondo: si aggiunge", (p2.esito === "prova pulita") && p2.piano.some(x => (x.nome === "Sempre privata") && (x.azione === "aggiorna") && x.campi.includes("privata")), { problemi: p2.problemi, piano: p2.piano });
a3 = await lancia(dPriv, "applica", p2.firma);
prova("segno «privata» aggiunto, il rilancio non ha niente da fare", (a3.esito === "OK") && (tPriv.flags["gdr-strumenti"].privata === true) && !(await lancia(dPriv, "prova")).piano.length, { esito: a3.esito, errori: a3.errori });
const dNoPriv = structuredClone(dPriv); delete dNoPriv.operazioni[0].privata;
p2 = await lancia(dNoPriv, "prova");
prova("i dati non la dicono più privata: resta privata nel mondo, con un avviso", (p2.esito === "prova pulita") && p2.avvisi.some(q => q.includes("si tira sempre in privato")), p2.avvisi);
const msgFinto = (tid, whisper = []) => { const m = { whisper, blind: false, getFlag: (s, k) => ((s === "core") && (k === "RollTable")) ? tid : undefined, updateSource(u) { Object.assign(this, u); } }; return m; };
let mF = msgFinto(tPriv.id);
prova("tiro privato: il messaggio di una tabella privata va ai soli GM", rendiPrivato(mF, {}) && (JSON.stringify(mF.whisper) === JSON.stringify(game.users.filter(u => u.isGM).map(u => u.id))), mF);
mF = msgFinto(tbT.id);
prova("tiro privato: una tabella senza il segno resta com'è", !rendiPrivato(mF, {}) && !mF.whisper.length, mF);
mF = msgFinto(tPriv.id, ["pl1aaaaaaaaaaaaa"]);
prova("tiro privato: un messaggio già sussurrato resta com'è", !rendiPrivato(mF, {}) && (mF.whisper.length === 1), mF);
mF = msgFinto(null);
prova("tiro privato: un messaggio che non viene da una tabella resta com'è", !rendiPrivato(mF, {}), mF);
// la conversione in metri: in un mondo con le unità metriche di dnd5e, gli attori nuovi nascono convertiti, col segno della macro
const guardia = { _id: "guardiaXXXXXXXXX", name: "Guard", type: "npc", system: { source: { rules: "2024" }, traits: { size: "med" }, skills: {},
  attributes: { movement: { speeds: { walk: 30, swim: 15 }, units: null }, senses: { ranges: { darkvision: 60 }, units: null } } },
  prototypeToken: { name: "Guard", texture: { src: "systems/dnd5e/guardia.webp" }, sight: { range: 60 } },
  items: [{ _id: "lanciaXXXXXXXXXX", name: "Spear", type: "weapon", system: { range: { value: 20, long: 60, reach: null, units: "ft" }, weight: { value: 3, units: "lb" } }, sort: 1 }] };
game.packs.get("dnd5e.actors24").docs.set(guardia._id, guardia);
game.settings.register("dnd5e", "metricLengthUnits", { scope: "world", config: false, type: Boolean, default: true });
const dMetri = { ...datiBase(), carico: "xx-metri", file: [], operazioni: [{ op: "attore", rif: "a-guardia", nome: "La guardia", cartella: null, compendio: "dnd5e.actors24", srd: "Guard", token: "molti" }] };
p2 = await lancia(dMetri, "prova");
prova("mondo in metri: la prova dice che l'attore nasce convertito", (p2.esito === "prova pulita") && (p2.piano.find(x => x.nome === "La guardia")?.inMetri > 0) && p2.note.some(q => q.includes("unità metriche")), { problemi: p2.problemi, piano: p2.piano, note: p2.note });
a3 = await lancia(dMetri, "applica", p2.firma);
const gM = game.actors.find(a => a.name === "La guardia");
const lancia3 = gM?._items?.find(i => i.name === "Spear");
prova("attore in metri: movimento, sensi, vista del token, gittata e peso dell'arma, col segno della macro; verifica OK", (a3.esito === "OK") && (gM.system.attributes.movement.speeds.walk === 9) && (gM.system.attributes.movement.units === "m") && (gM.system.attributes.senses.ranges.darkvision === 18)
  && (gM.prototypeToken.sight.range === 18) && (lancia3?.system.range.value === 6) && (lancia3?.system.range.long === 18) && (lancia3?.system.weight.value === 1.5) && (lancia3?.system.weight.units === "kg")
  && !!gM.flags.world?.metric && !a3.daConvertire.length && a3.verifica.every(v => v.startsWith("OK")), { esito: a3.esito, problemi: a3.problemi, errori: a3.errori, verifica: a3.verifica, sistema: gM?.system, token: gM?.prototypeToken, arma: lancia3 });
await game.settings.set("dnd5e", "metricLengthUnits", false);

// casi limite della 1.7.0
const { registraTiroPrivato, tabellaDi } = await import(`${M}/tiro-privato.mjs`);
prova("tiro privato: l'id della tabella anche con la chiave col punto nei dati", tabellaDi({ getFlag: () => undefined }, { flags: { "core.RollTable": tPriv.id } }) === tPriv.id);
let agganci = {}; globalThis.Hooks = { on: (n, f) => { agganci[n] = f; } }; globalThis.ui = { notifications: { error: () => {} } };
registraTiroPrivato();
const rotto = tid => ({ whisper: [], getFlag: () => tid, updateSource() { throw new Error("finto"); } });
prova("tiro privato: un errore sul messaggio di una tabella privata lo ferma", agganci.preCreateChatMessage(rotto(tPriv.id), {}) === false);
{ const getVero = game.tables.get; let volte = 0; game.tables.get = function(id) { if ( !volte++ ) throw new Error("finto"); return getVero.call(this, id); };
  const r = agganci.preCreateChatMessage(rotto(tbT.id), {}); game.tables.get = getVero;
  prova("tiro privato: un errore sul messaggio di un'altra tabella non lo ferma", (volte >= 2) && (r !== false), { volte, r }); }
mF = msgFinto(tPriv.id); mF.applyMode = function(m) { this.modo = m; this.whisper = ["gm1aaaaaaaaaaaaa"]; }; const opzMsg = { messageMode: "public" };
prova("tiro privato: col modo «gm» di V14, anche nelle opzioni", rendiPrivato(mF, {}, opzMsg) && (mF.modo === "gm") && (opzMsg.messageMode === "gm") && (mF.whisper.length === 1), { mF, opzMsg });
mF = msgFinto(tPriv.id); mF.applyRollMode = function(m) { this.modo = m; this.whisper = ["gm1aaaaaaaaaaaaa"]; };
prova("tiro privato: prima della V14, col vecchio metodo", rendiPrivato(mF, {}) && (mF.modo === "gmroll") && (mF.whisper.length === 1), mF);
await game.settings.set("dnd5e", "metricLengthUnits", true);
const segnata = { ...guardia, _id: "segnataXXXXXXXXX", name: "Guard Metric", flags: { world: { metric: { v: 1 } } } };
const italiana = { ...guardia, _id: "italianaXXXXXXXX", name: "Guard IT", flags: { "dnd5e-it-translation": { converted: true } } };
game.packs.get("dnd5e.actors24").docs.set(segnata._id, segnata); game.packs.get("dnd5e.actors24").docs.set(italiana._id, italiana);
for ( const [srd, atteso, nome] of [["Guard Metric", "già convertito in metri", "attore del compendio già in metri: problema"], ["Guard IT", "non lo segna", "attore toccato dal modulo italiano: problema, non si crea"]] ) {
  const dx = { ...datiBase(), carico: "xx-metri2", file: [], operazioni: [{ op: "attore", rif: "a-x", nome: "Un'altra guardia", cartella: null, compendio: "dnd5e.actors24", srd, token: "molti" }] };
  const r3 = await lancia(dx, "prova");
  prova(nome, r3.problemi.some(q => q.includes(atteso)), r3.problemi);
}
await game.settings.set("dnd5e", "metricLengthUnits", false);

// --- 1.9.0: mettere da parte invece di cancellare ---------------------------------------------------------------------------------------
{
  const DEC = "GM, 2026-01-14: da togliere";
  await scena.createEmbeddedDocuments("Note", [{ _id: "notaFaroXXXXXXXX", entryId: diario.id, pageId: porto.id, x: 50, y: 50, levels: [LV], texture: { src: PIN }, text: "Il Faro", flags: { world: { wgMappa: { punto: 24 } } } }], { keepId: true });
  const [molo] = await diario.createEmbeddedDocuments("JournalEntryPage", [{ _id: "moloVecchioXXXXX", name: "Molo vecchio", sort: 300, ownership: { default: 2 }, text: { content: "<p>Il molo.</p>" } }], { keepId: true });
  const vecchio = await Attore.create({ _id: "attoreVecchioXXX", name: "Il vecchio", ownership: { default: 2, pl1aaaaaaaaaaaaa: 3 } }, { keepId: true });
  const tabV = await Tabella.create({ _id: "tabellaVecchiaXX", name: "Incontri vecchi", formula: "1d4", ownership: { default: 0 } }, { keepId: true });
  const macV = await Macro.create({ _id: "macroVecchiaXXXX", name: "Vecchia macro", command: "1", ownership: { default: 0 } }, { keepId: true });
  const jV = await Journal.create({ _id: "journalVecchioXX", name: "Appunti vecchi", ownership: { default: 2 } }, { keepId: true });
  await jV.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaJVXXXXXXXX", name: "Uno", sort: 100, ownership: { default: -1 }, text: { content: "<p>x</p>" } }], { keepId: true });
  const dP = () => ({ ...datiBase(), carico: "xx-daparte", file: [], operazioni: [
    { op: "cartella", rif: "via-a", tipo: "Actor", nome: "Da togliere", padre: null },
    { op: "cartella", rif: "via-t", tipo: "RollTable", nome: "Da togliere", padre: null },
    { op: "cartella", rif: "via-m", tipo: "Macro", nome: "Da togliere", padre: null },
    { op: "cartella", rif: "via-j", tipo: "JournalEntry", nome: "Da togliere", padre: null },
    { op: "daParte", rif: "dp-faro", uuid: `Scene.${SC}.Note.notaFaroXXXXXXXX`, nome: "Il Faro", pagina: ROCCA, decisione: DEC },
    { op: "daParte", rif: "dp-molo", uuid: `JournalEntry.${diario.id}.JournalEntryPage.${molo.id}`, nome: "Molo vecchio", decisione: DEC },
    { op: "daParte", rif: "dp-vecchio", uuid: `Actor.${vecchio.id}`, nome: "Il vecchio", cartella: "via-a", decisione: DEC },
    { op: "daParte", rif: "dp-tabella", uuid: `RollTable.${tabV.id}`, nome: "Incontri vecchi", cartella: "via-t", decisione: DEC },
    { op: "daParte", rif: "dp-macro", uuid: `Macro.${macV.id}`, nome: "Vecchia macro", cartella: "via-m", decisione: DEC },
    { op: "daParte", rif: "dp-journal", uuid: `JournalEntry.${jV.id}`, nome: "Appunti vecchi", cartella: "via-j", decisione: DEC }] });
  let r = await lancia(dP(), "prova");
  const dp = r.piano.filter(x => x.azione === "mettiDaParte");
  prova("daParte: prova pulita, sei documenti da mettere da parte, con chi li vedeva", (r.esito === "prova pulita") && (dp.length === 6)
    && dp.find(x => x.cosa === "nota")?.vedevano.includes("Alba") && (dp.find(x => x.cosa === "pagina")?.nuovoNome === "Molo vecchio (da togliere)"), { esito: r.esito, problemi: r.problemi, piano: r.piano });
  // il mondo che cambia fra la prova e «applica»: la firma non torna
  await scena.updateEmbeddedDocuments("Note", [{ _id: "notaFaroXXXXXXXX", x: 51 }]);
  const rx = await lancia(dP(), "applica", r.firma);
  prova("daParte: una nota spostata dopo la prova: la firma non torna, non si scrive", (rx.esito === "fermato") && rx.problemi.some(q => q.includes("la firma")) && !scena.notes.get("notaFaroXXXXXXXX").flags["gdr-strumenti"], rx.problemi);
  r = await lancia(dP(), "prova");
  const a = await lancia(dP(), "applica", r.firma);
  prova("daParte: applica OK, verifica tutta OK", (a.esito === "OK") && a.verifica.some(v => v.includes("daParte «dp-faro»")) && a.verifica.every(v => v.startsWith("OK")), { esito: a.esito, problemi: a.problemi, errori: a.errori, verifica: a.verifica });
  const nT = scena.notes.get("notaFaroXXXXXXXX");
  prova("daParte: la nota legata alla pagina solo GM, col segno e la pagina di prima, nello stesso punto", (nT.entryId === diario.id) && (nT.pageId === rocca.id) && (nT.x === 51)
    && (nT.flags["gdr-strumenti"].daParte.prima.pageId === porto.id) && (nT.flags.world.wgMappa.punto === 24), nT);
  prova("daParte: la pagina a None, col nome «(da togliere)», nel suo journal", (molo.name === "Molo vecchio (da togliere)") && (molo.ownership.default === 0) && !molo.testUserPermission(game.users.get("pl1aaaaaaaaaaaaa"), "LIMITED"), molo);
  const cA = game.folders.find(f => (f.type === "Actor") && (f.name === "Da togliere"));
  prova("daParte: l'attore nella cartella, a None anche per chi l'aveva da proprietaria, col nome e la visibilità di prima nel segno", (vecchio.folder?.id === cA?.id) && (vecchio.ownership.default === 0) && (vecchio.ownership.pl1aaaaaaaaaaaaa === 0)
    && (vecchio.flags["gdr-strumenti"].daParte.prima.ownership.pl1aaaaaaaaaaaaa === 3) && (vecchio.name === "Il vecchio"), vecchio);
  prova("daParte: tabella, macro e journal nelle loro cartelle", (tabV.folder?.name === "Da togliere") && (macV.folder?.name === "Da togliere") && (jV.folder?.name === "Da togliere") && (jV.ownership.default === 0));
  r = await lancia(dP(), "prova");
  prova("daParte: rilancio: niente da fare, già da parte", (r.esito === "prova pulita") && !r.piano.some(x => x.azione === "mettiDaParte") && r.note.some(q => q.includes("niente da fare")) && (r.saltati.filter(q => q.includes("già da parte")).length === 6), { problemi: r.problemi, piano: r.piano, saltati: r.saltati });
  scena.notes.delete("notaFaroXXXXXXXX");
  r = await lancia(dP(), "prova");
  prova("daParte: la nota cancellata dal GM: il lavoro è finito, nessun problema", (r.esito === "prova pulita") && r.saltati.some(q => q.includes("dp-faro") && q.includes("il lavoro è finito")), { problemi: r.problemi, saltati: r.saltati });
  // i problemi
  await scena.createEmbeddedDocuments("Note", [{ _id: "notaFaro2XXXXXXX", entryId: diario.id, pageId: porto.id, x: 60, y: 60, levels: [LV], texture: { src: PIN }, text: "Il Faro" }], { keepId: true });
  const vecchio2 = await Attore.create({ _id: "attoreVecchio2XX", name: "Il vecchio 2", ownership: { default: 0 } }, { keepId: true });
  const dQ = op => ({ ...datiBase(), carico: "xx-daparte2", file: [], operazioni: [{ op: "cartella", rif: "via-a", tipo: "Actor", nome: "Via", padre: null }, op] });
  const sbagliaDP = async (op, atteso, nome) => { const r3 = await lancia(dQ(op), "prova"); prova(nome, ["fermato", "prova con problemi"].includes(r3.esito) && r3.problemi.some(q => q.includes(atteso)), r3.problemi); };
  const N2 = `Scene.${SC}.Note.notaFaro2XXXXXXX`;
  await sbagliaDP({ op: "daParte", rif: "x", uuid: N2, nome: "Il Faro", pagina: PORTO, decisione: DEC }, "non è solo GM", "daParte: nota legata a una pagina che non è solo GM: problema");
  // una pagina nascosta adesso, ma non solo GM: «Scopri» la potrebbe mostrare
  await diario.createEmbeddedDocuments("JournalEntryPage", [{ _id: "vocetNascostaXXX", name: "Una voce nascosta", sort: 400, ownership: { default: 0 }, text: { content: "<p>x</p>" } }], { keepId: true });
  await sbagliaDP({ op: "daParte", rif: "x", uuid: N2, nome: "Il Faro", pagina: `JournalEntry.${diario.id}.JournalEntryPage.vocetNascostaXXX`, decisione: DEC }, "non è solo GM", "daParte: nota legata a una pagina nascosta ma non solo GM: problema");
  { const r3 = await lancia(dQ({ op: "daParte", rif: "x", uuid: N2, nome: "Il Faro", pagina: "xx-scena3/regole", decisione: DEC }), "prova");
    prova("daParte: la pagina della nota come carico/rif, solo GM: prova pulita", r3.esito === "prova pulita", { esito: r3.esito, problemi: r3.problemi }); }
  await sbagliaDP({ op: "daParte", rif: "x", uuid: `Scene.${SC}.Note.nonCeXXXXXXXXXXX`, nome: "Niente", pagina: ROCCA, decisione: DEC }, "non l'ha mai messo da parte", "daParte: uuid che non c'è e che il carico non ha mai messo da parte: problema");
  { const u1 = game.users.get("pl1aaaaaaaaaaaaa"); u1.character = { id: vecchio2.id };
    await sbagliaDP({ op: "daParte", rif: "x", uuid: `Actor.${vecchio2.id}`, nome: "Il vecchio 2", cartella: "via-a", decisione: DEC }, "è il personaggio di Alba", "daParte: il personaggio di una giocatrice: problema");
    delete u1.character; }
  { const dl = { ...datiBase(), carico: "xx-daparte4", file: [], operazioni: [
      { op: "journal", rif: "jl", nome: "Con un collegamento", cartella: null, pagine: [{ rif: "pl", nome: "Al porto", tipo: "text", html: `<p>Vedi @GDR[${PORTO}]{il porto}.</p>` }] },
      { op: "daParte", rif: "x", uuid: PORTO, nome: "Porto", decisione: DEC }] };
    const r3 = await lancia(dl, "prova");
    prova("daParte: un collegamento del file verso una pagina messa da parte nello stesso file: problema", r3.problemi.some(q => q.includes("un collegamento porta a")), r3.problemi); }
  // già da parte, ma il GM le ha ridato la visibilità: al rilancio è un problema
  await diario.updateEmbeddedDocuments("JournalEntryPage", [{ _id: molo.id, "ownership.default": 2 }]);
  { const r3 = await lancia(dP(), "prova");
    prova("daParte: già da parte ma di nuovo visibile: problema", r3.problemi.some(q => q.includes("dp-molo") && q.includes("lo vede ancora")), r3.problemi); }
  await diario.updateEmbeddedDocuments("JournalEntryPage", [{ _id: molo.id, "ownership.default": 0 }]);
  await sbagliaDP({ op: "daParte", rif: "x", uuid: N2, nome: "Il Faro", decisione: DEC }, "vuole «pagina»", "daParte: nota senza pagina: problema");
  await sbagliaDP({ op: "daParte", rif: "x", uuid: N2, nome: "Il Molo", pagina: ROCCA, decisione: DEC }, "nel mondo si chiama «Il Faro»", "daParte: nome diverso dal mondo: problema, non lo tocca");
  await sbagliaDP({ op: "daParte", rif: "x", uuid: N2, nome: "Il Faro", pagina: ROCCA, decisione: "sì" }, "decisione deve essere", "daParte: senza la decisione del GM con la data: problema");
  await sbagliaDP({ op: "daParte", rif: "x", uuid: `Actor.${vecchio2.id}`, nome: "Il vecchio 2", decisione: DEC }, "serve la cartella", "daParte: attore senza cartella: problema");
  await sbagliaDP({ op: "daParte", rif: "x", uuid: `JournalEntry.${diario.id}.JournalEntryPage.${porto.id}`, nome: "Porto", cartella: "via-a", decisione: DEC }, "non va in una cartella", "daParte: pagina con una cartella: problema");
  await sbagliaDP({ op: "daParte", rif: "x", uuid: `Item.${vecchio2.id}`, nome: "x", decisione: DEC }, "non riconosciuto", "daParte: uuid di un tipo che non si mette da parte: problema");
  await sbagliaDP({ op: "daParte", rif: "x", uuid: `Actor.${vecchio2.id}`, nome: "Il vecchio 2", cartella: { id: cartellaJ.id }, decisione: DEC }, "non è di tipo Actor", "daParte: cartella del tipo sbagliato: problema");
  scena.tokens = Object.assign(new Map([["tok1", { actorId: vecchio2.id }]]), { some(fn) { return [...this.values()].some(fn); } });
  await sbagliaDP({ op: "daParte", rif: "x", uuid: `Actor.${vecchio2.id}`, nome: "Il vecchio 2", cartella: "via-a", decisione: DEC }, "token sulle scene", "daParte: attore coi token sulla scena: problema");
  delete scena.tokens;
  { const jW = await Journal.create({ _id: "journalVisteXXXX", name: "Con pagine viste", ownership: { default: 0 } }, { keepId: true });
    await jW.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaVistaXXXXX", name: "Vista", sort: 100, ownership: { default: 2 }, text: { content: "<p>x</p>" } }], { keepId: true });
    const dj = { ...datiBase(), carico: "xx-daparte3", file: [], operazioni: [{ op: "cartella", rif: "via-j", tipo: "JournalEntry", nome: "Via J", padre: null }, { op: "daParte", rif: "x", uuid: `JournalEntry.${jW.id}`, nome: "Con pagine viste", cartella: "via-j", decisione: DEC }] };
    const r3 = await lancia(dj, "prova");
    prova("daParte: journal con una pagina che le giocatrici vedono da sé: problema", r3.problemi.some(q => q.includes("hanno una visibilità loro")), r3.problemi);
    // la pagina messa da parte nello stesso file: si può
    dj.operazioni.push({ op: "daParte", rif: "y", uuid: `JournalEntry.${jW.id}.JournalEntryPage.paginaVistaXXXXX`, nome: "Vista", decisione: DEC });
    const r4 = await lancia(dj, "prova");
    const a4 = (r4.esito === "prova pulita") ? await lancia(dj, "applica", r4.firma) : r4;
    prova("daParte: journal e la sua pagina vista nello stesso file: applica OK, nessuna giocatrice vede né l'uno né l'altra", (a4.esito === "OK") && a4.verifica.every(v => v.startsWith("OK"))
      && !jW.pages.get("paginaVistaXXXXX").testUserPermission(game.users.get("pl1aaaaaaaaaaaaa"), "LIMITED"), { esito: a4.esito, problemi: a4.problemi, errori: a4.errori, verifica: a4.verifica }); }
  { const ds = await conSha(datiT3()); ds.carico = "xx-tappa3"; ds.operazioni.push({ op: "daParte", rif: "dp-lanterna", uuid: `Scene.${SC}.Note.notaLanternaXXXX`, nome: "La Lanterna Verde", pagina: ROCCA, decisione: DEC });
    const r3 = await lancia(ds, "prova");
    prova("daParte: un documento che lo stesso file scrive: problema", r3.problemi.some(q => q.includes("questo file lo scrive anche")), r3.problemi); }
  { const r3 = await lancia({ ...dQ({ op: "daParte", rif: "x", uuid: N2, nome: "Il Faro", pagina: ROCCA, decisione: DEC }), operazioni: [{ op: "daParte", rif: "x", uuid: N2, nome: "Il Faro", pagina: ROCCA, decisione: DEC }, { op: "daParte", rif: "y", uuid: N2, nome: "Il Faro", pagina: ROCCA, decisione: DEC }] }, "prova");
    prova("daParte: lo stesso documento due volte: problema", r3.problemi.some(q => q.includes("già in un'altra operazione daParte")), r3.problemi); }
}

// --- 1.13.0: il nome vero delle pagine, che cambia con «Rivela il nome» dell'attore -------------------------------------------------------
{
  const { rivelaNome: rn } = await import(`${M}/rivela-nome.mjs`);
  globalThis.ui ??= {}; globalThis.ui.notifications = { info() {}, warn() {}, error() {}, ...(globalThis.ui.notifications ?? {}) };
  // le scene delle prove di prima non hanno token: «Rivela il nome» le vede vuote
  const rivelaNome = async o => { const s0 = game.scenes; game.scenes = { contents: [] }; try { return await rn(o); } finally { game.scenes = s0; } };
  const VERO = "Elara Vensk", ASP = "La guaritrice";
  const dN = (o = {}) => ({ ...datiBase(), carico: "xx-nomi", file: [], operazioni: [
    { op: "journal", rif: "jn", nome: "Diario dei nomi", cartella: null, pagine: [
      { rif: "voce", nome: o.asp ?? ASP, ...(o.senzaVero ? {} : { nomeVero: VERO }), tipo: "text", html: "<p>Una donna in azzurro.</p>" },
      { rif: "voce-gm", nome: `${o.asp ?? ASP} (solo GM)`, ...(o.senzaVero ? {} : { nomeVero: `${VERO} (solo GM)` }), tipo: "text", html: `<p>È ${VERO}.</p>` },
      ...(o.altre ?? [])] },
    { op: "attore", rif: "an", nome: o.asp ?? ASP, nomeVero: VERO, cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno" }] });
  const applica = async dd => { const r = await lancia(dd, "prova"); return (r.esito === "prova pulita") ? lancia(dd, "applica", r.firma) : r; };
  let r = await lancia(dN(), "prova");
  prova("nome vero: prova pulita, e il nome vero non sta nel rapporto", (r.esito === "prova pulita") && !JSON.stringify(r).includes(VERO.split(" ")[1]), { problemi: r.problemi, avvisi: r.avvisi });
  r = await applica(dN());
  const JN = game.journal.find(j => j.name === "Diario dei nomi");
  const voce = () => JN.pages.find(p => !p.name.endsWith("(solo GM)")), gm = () => JN.pages.find(p => p.name.endsWith("(solo GM)"));
  const att = game.actors.find(a => a.flags?.["gdr-strumenti"]?.nomi?.vero === VERO);
  prova("nome vero: applica OK, le pagine col nome che descrive e i due nomi nel flag", (r.esito === "OK") && r.verifica.every(v => v.startsWith("OK")) && (voce()?.name === ASP) && (gm()?.name === `${ASP} (solo GM)`)
    && (voce().flags["gdr-strumenti"].nomi.rivelato === false) && !!att, { esito: r.esito, problemi: r.problemi, ko: r.verifica.filter(v => v.startsWith("KO")) });
  const piano = await rivelaNome({ prova: true, attori: [att] });
  prova("«Rivela il nome» in prova: l'attore e le sue due pagine", (piano[0]?.esito === "lo farei") && (piano[0].pagine.length === 2), piano);
  await rivelaNome({ attori: [att] });
  prova("«Rivela il nome»: l'attore, la voce e la pagina solo GM prendono il nome vero", (att.name === `${ASP}: ${VERO}`) && (voce().name === `${ASP}: ${VERO}`) && (gm().name === `${ASP}: ${VERO} (solo GM)`) && (voce().flags["gdr-strumenti"].nomi.rivelato === true) && (gm().flags["gdr-strumenti"].nomi.rivelato === true));
  r = await lancia(dN(), "prova");
  prova("nome vero: dopo «Rivela il nome», il carico di prima non ha niente da fare sulle pagine", (r.esito === "prova pulita") && !r.piano.some(x => x.cosa === "pagina") && !r.avvisi.some(q => q.includes("ritoccata")), { piano: r.piano, avvisi: r.avvisi, problemi: r.problemi });
  // i dati cambiano il nome che descrive: la pagina rivelata resta col nome vero, e il flag prende quello nuovo
  // una pagina nuova di un personaggio già rivelato nasce col nome vero
  { const dB = { ...datiBase(), carico: "xx-nomi-b", file: [], operazioni: [{ op: "journal", rif: "jb", nome: "Diario B", cartella: null, pagine: [
      { rif: "vb", nome: ASP, nomeVero: VERO, tipo: "text", html: "<p>Di nuovo lei.</p>" }] }] };
    const rb = await applica(dB);
    const pb = game.journal.find(j => j.name === "Diario B")?.pages.contents[0];
    prova("nome vero: una pagina nuova di un personaggio già rivelato nasce col nome vero, rivelata; applica OK", (rb.esito === "OK") && (pb?.name === `${ASP}: ${VERO}`) && (pb.flags["gdr-strumenti"].nomi.rivelato === true),
      { esito: rb.esito, problemi: rb.problemi, ko: rb.verifica?.filter(v => v.startsWith("KO")), nome: pb?.name });
    const rb2 = await lancia(dB, "prova");
    prova("nome vero: e al rilancio niente da fare", (rb2.esito === "prova pulita") && !rb2.piano.some(x => x.cosa === "pagina"), { piano: rb2.piano, problemi: rb2.problemi }); }
  // un flag messo a mano senza «rivelato»: un aggiornamento del testo non si ferma
  { const fl = structuredClone(voce().flags["gdr-strumenti"].nomi); await JN.updateEmbeddedDocuments("JournalEntryPage", [{ _id: voce().id, "flags.gdr-strumenti.nomi.rivelato": new globalThis.foundry.data.operators.ForcedDeletion() }]);
    const dT = dN(); dT.operazioni[0].pagine[0].html = "<p>Una donna in azzurro, con un bastone.</p>"; dT.operazioni[1].id = att.id;
    const rt = await lancia(dT, "prova");
    prova("nome vero: flag senza «rivelato» e testo che cambia: nessun problema di costruzione in memoria", !rt.problemi.some(q => q.includes("costruita in memoria")), rt.problemi);
    await JN.updateEmbeddedDocuments("JournalEntryPage", [{ _id: voce().id, "flags.gdr-strumenti.nomi": fl }]); }
  const dN2 = dN({ asp: "La guaritrice del tempio" }); dN2.operazioni[1].id = att.id;
  { const r0 = await lancia(dN2, "prova");
    prova("nome vero: i dati cambiano il nome che descrive: l'attore si rinomina col carico (1.15.0), nessun avviso di nomi diversi", !r0.avvisi.some(q => q.includes("gli stessi due nomi")) && r0.piano.some(q => (q.cosa === "attore") && (q.azione === "aggiorna") && q.campi.includes("nomi")), { avvisi: r0.avvisi, piano: r0.piano }); }
  r = await applica(dN2);
  prova("nome vero: un nome che descrive nuovo, su una pagina rivelata: resta rivelata col nome composto nuovo, il flag cambia; l'attore si rinomina", (r.esito === "OK") && (voce().name === `La guaritrice del tempio: ${VERO}`) && (att.name === `La guaritrice del tempio: ${VERO}`) && (voce().flags["gdr-strumenti"].nomi.aspetto === "La guaritrice del tempio") && (gm().name === `La guaritrice del tempio: ${VERO} (solo GM)`), { esito: r.esito, problemi: r.problemi, ko: r.verifica.filter(v => v.startsWith("KO")) });
  // i dati tolgono il nome vero da una pagina rivelata: problema
  r = await lancia(dN({ asp: "La guaritrice del tempio", senzaVero: true }), "prova");
  prova("nome vero: i dati lo tolgono da una pagina rivelata: problema", r.problemi.some(q => q.includes("i dati lo tolgono")), r.problemi);
  // di nuovo: il nome che descrive (quello nuovo, dal flag)
  await att.update({ "flags.gdr-strumenti.nomi.aspetto": "La guaritrice del tempio" });
  await rivelaNome({ attori: [att] });
  prova("«Rivela il nome» di nuovo: tornano i nomi che descrivono", (att.name === "La guaritrice del tempio") && (voce().name === "La guaritrice del tempio") && (gm().name === "La guaritrice del tempio (solo GM)") && (voce().flags["gdr-strumenti"].nomi.rivelato === false));
  // una pagina rinominata a mano: «Rivela il nome» la lascia, con un avviso
  await JN.updateEmbeddedDocuments("JournalEntryPage", [{ _id: voce().id, name: "La donna in azzurro" }]);
  const p2 = await rivelaNome({ prova: true, attori: [att] });
  prova("«Rivela il nome»: una pagina rinominata a mano si lascia", (p2[0].pagine.length === 1) && (p2[0].lasciate.length === 1), p2);
  await JN.updateEmbeddedDocuments("JournalEntryPage", [{ _id: voce().id, name: "La guaritrice del tempio" }]);
  // i dati tolgono il nome vero da pagine non rivelate; poi una pagina di prima, senza il nome vero, lo riceve dai dati
  r = await applica(dN({ asp: "La guaritrice del tempio", senzaVero: true }));
  prova("nome vero tolto dai dati da una pagina non rivelata: il flag se ne va, applica OK", (r.esito === "OK") && !voce().flags["gdr-strumenti"].nomi && !gm().flags["gdr-strumenti"].nomi, { esito: r.esito, problemi: r.problemi, ko: r.verifica?.filter(v => v.startsWith("KO")) });
  const dN3 = dN({ asp: "La guaritrice del tempio", senzaVero: true }); dN3.operazioni[0].pagine[0].nomeVero = VERO; dN3.operazioni[1].id = att.id;
  r = await lancia(dN3, "prova");
  prova("nome vero aggiunto a una pagina che c'è: si aggiorna solo il flag", (r.esito === "prova pulita") && r.piano.some(x => (x.cosa === "pagina") && (x.azione === "aggiorna") && (x.campi.join() === "nome vero")), { piano: r.piano.filter(x => x.cosa === "pagina"), problemi: r.problemi });
  // il flag ritoccato a mano, e i dati che vogliono un altro nome vero: conflitto, senza il nome vero nel messaggio
  await JN.updateEmbeddedDocuments("JournalEntryPage", [{ _id: gm().id, "flags.gdr-strumenti.nomi": { aspetto: "La guaritrice del tempio (solo GM)", vero: "Qualcun Altro (solo GM)", rivelato: false } }]);
  r = await lancia(dN({ asp: "La guaritrice del tempio" }), "prova");
  prova("nome vero ritoccato in Foundry e diverso nei dati: conflitto, senza i nomi veri nel messaggio", r.problemi.some(q => q.includes("nome vero: nel mondo diverso dai dati")) && !r.problemi.some(q => q.includes("Vensk") || q.includes("Altro")), r.problemi);
  // i dati: nome vero solo GM e nome no, o uguale al nome; parole da DM; nessun attore con gli stessi due nomi; il nome vero in un'altra pagina che si mostra
  const sbN = async (mod, testo, nome) => { const dd = dN({ asp: "La guaritrice del tempio" }); mod(dd); const x = await lancia(dd, "prova"); prova(nome, [...x.problemi, ...x.avvisi].some(q => q.includes(testo)), { problemi: x.problemi, avvisi: x.avvisi }); };
  await sbN(dd => { dd.operazioni[0].pagine[0].nomeVero = `${VERO} (solo GM)`; }, "tutti e due solo GM", "nome vero solo GM su una pagina che si mostra: problema");
  await sbN(dd => { dd.operazioni[0].pagine[0].nomeVero = dd.operazioni[0].pagine[0].nome; }, "uguale al nome", "nome vero uguale al nome: problema");
  await sbN(dd => { dd.operazioni[0].pagine[0].nomeVero = "Il PG Elara"; }, "parole da DM", "parole da DM nel nome vero di una pagina che si mostra: problema");
  await sbN(dd => { dd.operazioni[0].pagine.push({ rif: "sola", nome: "Il fornaio", nomeVero: "Gualtiero Bianchi", tipo: "text", html: "" }); }, "nessun attore dei dati o del mondo ha gli stessi due nomi", "pagina col nome vero senza un attore con gli stessi due nomi: avviso");
  await sbN(dd => { dd.operazioni[0].pagine.push({ rif: "altra", nome: "Il mercato", tipo: "text", html: "<p>Qui c'è Elara Vensk.</p>" }); }, "c'è il nome vero", "il nome vero di una pagina in un'altra pagina che si mostra: problema");
  { const dd = dN({ asp: "La guaritrice del tempio" }); dd.operazioni[0].pagine.push({ rif: "comune", nome: "Il mercato coperto", tipo: "text", html: "<p>Spezie ed elara secca, la pianta.</p>" });
    dd.operazioni[0].pagine[0].nomeVero = "Elara"; dd.operazioni[0].pagine[1].nomeVero = "Elara (solo GM)";
    const x = await lancia(dd, "prova");
    prova("il nome vero «Elara» e la parola «elara» in minuscolo in un'altra pagina: niente problema", !x.problemi.some(q => q.includes("c'è il nome vero")), x.problemi); }
}

// --- 1.14.0: una pagina che segue più attori (la voce di una coppia): il nome vero quando li sanno tutti ---------------------------------
{
  const { rivelaNome: rn } = await import(`${M}/rivela-nome.mjs`);
  const rivela = async o => { const s0 = game.scenes; game.scenes = { contents: [] }; try { return await rn(o); } finally { game.scenes = s0; } };
  const dC = (o = {}) => ({ ...datiBase(), carico: "xx-coppia", file: [], operazioni: [
    { op: "journal", rif: "jc", nome: "Diario della coppia", cartella: null, pagine: [
      { rif: "vc", nome: "Il vasaio e sua figlia", nomeVero: "Bruno e Nives Calvi", attori: [{ nome: "Il vasaio", nomeVero: "Bruno Calvi" }, { nome: "La figlia del vasaio", nomeVero: "Nives Calvi" }],
        tipo: "text", html: "<p>Due figure al tornio.</p>", ...(o.pagina ?? {}) }, ...(o.altre ?? [])] },
    { op: "attore", rif: "av", nome: "Il vasaio", nomeVero: "Bruno Calvi", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno", ...(o.idV ? { id: o.idV } : {}) },
    { op: "attore", rif: "af", nome: "La figlia del vasaio", nomeVero: "Nives Calvi", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno", ...(o.idF ? { id: o.idF } : {}) }] });
  const applica = async dd => { const r = await lancia(dd, "prova"); return (r.esito === "prova pulita") ? lancia(dd, "applica", r.firma) : r; };
  let r = await applica(dC());
  const JC = game.journal.find(j => j.name === "Diario della coppia"), vc = () => JC.pages.contents[0];
  const vas = game.actors.find(a => a.flags?.["gdr-strumenti"]?.nomi?.vero === "Bruno Calvi"), fig = game.actors.find(a => a.flags?.["gdr-strumenti"]?.nomi?.vero === "Nives Calvi");
  prova("coppia: applica OK, la pagina col nome che descrive e i suoi due attori nel flag", (r.esito === "OK") && (vc()?.name === "Il vasaio e sua figlia") && (vc().flags["gdr-strumenti"].nomi.attori?.length === 2),
    { esito: r.esito, problemi: r.problemi, ko: r.verifica?.filter(v => v.startsWith("KO")) });
  await rivela({ attori: [vas] });
  prova("coppia: rivelato uno solo dei due, la pagina resta col nome che descrive", (vas.name === "Il vasaio: Bruno Calvi") && (vc().name === "Il vasaio e sua figlia") && (vc().flags["gdr-strumenti"].nomi.rivelato === false));
  await rivela({ attori: [fig] });
  prova("coppia: rivelati tutti e due, la pagina prende il suo nome vero", (fig.name === "La figlia del vasaio: Nives Calvi") && (vc().name === "Il vasaio e sua figlia: Bruno e Nives Calvi") && (vc().flags["gdr-strumenti"].nomi.rivelato === true));
  r = await lancia(dC({ idV: vas.id, idF: fig.id }), "prova");
  prova("coppia: al rilancio niente da fare sulla pagina rivelata", (r.esito === "prova pulita") && !r.piano.some(x => x.cosa === "pagina"), { piano: r.piano, problemi: r.problemi });
  await rivela({ attori: [vas] });
  prova("coppia: uno torna nascosto, la pagina torna al nome che descrive", (vas.name === "Il vasaio") && (vc().name === "Il vasaio e sua figlia") && (vc().flags["gdr-strumenti"].nomi.rivelato === false));
  await rivela({ attori: [vas] });
  // una pagina nuova della coppia, coi due già rivelati: nasce col nome vero
  { const dB = { ...datiBase(), carico: "xx-coppia-b", file: [], operazioni: [{ op: "journal", rif: "jcb", nome: "Diario della coppia B", cartella: null, pagine: [
      { rif: "vcb", nome: "Il vasaio e sua figlia", nomeVero: "Bruno e Nives Calvi", attori: [{ nome: "Il vasaio", nomeVero: "Bruno Calvi" }, { nome: "La figlia del vasaio", nomeVero: "Nives Calvi" }], tipo: "text", html: "<p>Al mercato.</p>" }] }] };
    const rb = await applica(dB);
    prova("coppia: una pagina nuova coi due già rivelati nasce col nome vero; applica OK", (rb.esito === "OK") && (game.journal.find(j => j.name === "Diario della coppia B")?.pages.contents[0]?.name === "Il vasaio e sua figlia: Bruno e Nives Calvi"),
      { esito: rb.esito, problemi: rb.problemi, ko: rb.verifica?.filter(v => v.startsWith("KO")) }); }
  // i dati tolgono gli attori dalla pagina (resta il nome vero, legato ai suoi due nomi): il flag li perde
  { const dd = dC({ idV: vas.id, idF: fig.id, pagina: { attori: undefined } }); delete dd.operazioni[0].pagine[0].attori;
    const rr = await applica(dd);
    prova("coppia: i dati tolgono gli attori, il flag li perde e il nome vero resta; applica OK", (rr.esito === "OK") && !vc().flags["gdr-strumenti"].nomi.attori && (vc().name === "Il vasaio e sua figlia: Bruno e Nives Calvi"),
      { esito: rr.esito, problemi: rr.problemi, ko: rr.verifica?.filter(v => v.startsWith("KO")), flag: vc().flags["gdr-strumenti"].nomi }); }
  // una pagina rivelata a cui i dati aggiungono un attore non ancora rivelato torna al nome che descrive
  { await rivela({ attori: [vas] }); await rivela({ attori: [vas] });                                // la coppia di nuovo rivelata
    await Attore.create({ name: "Il garzone del vasaio", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Il garzone del vasaio", vero: "Ottavio Calvi", rivelato: false } } } });
    const dd = dC({ idV: vas.id, idF: fig.id }); const pg = dd.operazioni[0].pagine[0];
    pg.nomeVero = "Bruno, Nives e Ottavio Calvi"; pg.attori.push({ nome: "Il garzone del vasaio", nomeVero: "Ottavio Calvi" });
    const prima = vc().name, rr = await applica(dd);
    prova("coppia: rivelata, e i dati le aggiungono un attore non rivelato: torna al nome che descrive; applica OK", (prima === "Il vasaio e sua figlia: Bruno e Nives Calvi") && (rr.esito === "OK") && (vc().name === "Il vasaio e sua figlia") && (vc().flags["gdr-strumenti"].nomi.rivelato === false) && !JSON.stringify(rr).includes("Ottavio"),
      { prima, esito: rr.esito, problemi: rr.problemi, nome: vc().name, ko: rr.verifica?.filter(v => v.startsWith("KO")) }); }
  // una voce che c'è riceve nome vero e attori, già tutti rivelati: prende il nome vero
  { const dd0 = { ...datiBase(), carico: "xx-coppia-c", file: [], operazioni: [{ op: "journal", rif: "jcc", nome: "Diario della coppia C", cartella: null, pagine: [{ rif: "vcc", nome: "Il vasaio e sua figlia", tipo: "text", html: "<p>Al pozzo.</p>" }] }] };
    await applica(dd0);
    const dd = structuredClone(dd0); Object.assign(dd.operazioni[0].pagine[0], { nomeVero: "Bruno e Nives Calvi", attori: [{ nome: "Il vasaio", nomeVero: "Bruno Calvi" }, { nome: "La figlia del vasaio", nomeVero: "Nives Calvi" }] });
    const rr = await applica(dd), pc = game.journal.find(j => j.name === "Diario della coppia C")?.pages.contents[0];
    prova("coppia: una voce che c'è riceve nome vero e attori già rivelati: prende il nome vero; applica OK", (rr.esito === "OK") && (pc?.name === "Il vasaio e sua figlia: Bruno e Nives Calvi") && (pc.flags["gdr-strumenti"].nomi.rivelato === true),
      { esito: rr.esito, problemi: rr.problemi, nome: pc?.name, ko: rr.verifica?.filter(v => v.startsWith("KO")) }); }
  // il nome vero della pagina con dentro quello di un attore non rivelato, fuori dai suoi: problema
  { const dd = dC({ idV: vas.id, idF: fig.id }); dd.operazioni[0].pagine[0].nomeVero = "Bruno, Nives e Ottavio Calvi";
    if ( !vas.name.includes("Bruno") ) await rivela({ attori: [vas] }); if ( !fig.name.includes("Nives") ) await rivela({ attori: [fig] });
    const x = await lancia(dd, "prova");
    prova("coppia: il nome vero della pagina contiene quello di un attore non rivelato, fuori dai suoi: problema, senza il nome nel messaggio",
      x.problemi.some(q => q.includes("contiene il nome vero di un attore non ancora rivelato")) && !JSON.stringify(x.problemi).includes("Ottavio"), x.problemi); }
  // un attore dei dati senza id, che nel mondo c'è col segno ma con un altro id, rivelato: la pagina lo segue
  { const { chiaveDi } = await import(`${M}/carica/comune.mjs`);
    const k = await chiaveDi("xx-coppia-d", "ad");
    const a = await Attore.create({ name: "Bruna Fenn", type: "npc", flags: { "gdr-strumenti": { carico: { v: 1, chiave: k }, nomi: { aspetto: "La tessitrice", vero: "Bruna Fenn", rivelato: true } } } });
    const dd = { ...datiBase(), carico: "xx-coppia-d", file: [], operazioni: [
      { op: "journal", rif: "jd", nome: "Diario D", cartella: null, pagine: [{ rif: "pd", nome: "La tessitrice", nomeVero: "Bruna Fenn", tipo: "text", html: "<p>Al telaio.</p>" }] },
      { op: "attore", rif: "ad", nome: "La tessitrice", nomeVero: "Bruna Fenn", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno" }] };
    const x = await lancia(dd, "prova");
    const crea = x.piano.find(q => (q.cosa === "pagina") && (q.azione === "crea"));
    prova("un attore ritrovato per segno, rivelato: la pagina nuova lo segue e nasce col nome vero", !!a && !!crea && (crea.nome === "La tessitrice") && !x.problemi.length
      && (await (async () => { const r2 = (x.esito === "prova pulita") ? await lancia(dd, "applica", x.firma) : x; return (game.journal.find(j => j.name === "Diario D")?.pages.contents[0]?.name === "La tessitrice: Bruna Fenn") && (a.name === "La tessitrice: Bruna Fenn"); })()),
      { problemi: x.problemi, piano: x.piano }); }
  // i dati: attori senza nomeVero; un attore che non c'è
  { const dd = dC(); delete dd.operazioni[0].pagine[0].nomeVero; const x = await lancia(dd, "prova");
    prova("coppia: attori senza il nome vero della pagina: problema", x.problemi.some(q => q.includes("attori vale solo con nomeVero")), x.problemi); }
  { const dd = dC({ idV: vas.id, idF: fig.id }); dd.operazioni[0].pagine[0].attori.push({ nome: "Il garzone del vasaio", nomeVero: "Pimmo" }); const x = await lancia(dd, "prova");
    prova("coppia: un attore che non c'è con quei due nomi: avviso", x.avvisi.some(q => q.includes("dei suoi attori non")), x.avvisi); }
}

// --- 1.15.0: il caricatore rinomina un attore che c'è (i nomi senza l'articolo) --------------------------------------------------------
{
  const vecchio = await Attore.create({ name: "Il conciatore", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Il conciatore", vero: "Ruggero Pell", rivelato: false } } } });
  const dA = pr => ({ ...datiBase(), carico: "xx-nomi-attori", file: [], operazioni: [
    { op: "attore", rif: "ac", id: vecchio.id, nome: "Conciatore", nomeVero: "Ruggero Pell", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno", ...(pr ? { precedente: pr } : {}) }] });
  let r = await lancia(dA(), "prova");
  prova("attore di prima, coi nomi diversi dai dati, senza «precedente»: avviso, non si rinomina", r.avvisi.some(q => q.includes("l'ultima scrittura dei nomi non si conosce")) && !r.piano.some(q => (q.cosa === "attore") && (q.azione === "aggiorna")), { avvisi: r.avvisi, piano: r.piano });
  r = await lancia(dA({ nome: "Il conciatore", nomeVero: "Ruggero Pell" }), "prova");
  const a = (r.esito === "prova pulita") ? await lancia(dA({ nome: "Il conciatore", nomeVero: "Ruggero Pell" }), "applica", r.firma) : r;
  prova("con «precedente» si rinomina: il nome senza articolo e il doppio nome; applica OK", (a.esito === "OK") && (vecchio.name === "Conciatore") && (vecchio.flags["gdr-strumenti"].nomi.aspetto === "Conciatore") && !JSON.stringify(r.piano).includes("Ruggero"),
    { esito: a.esito, problemi: a.problemi, ko: a.verifica?.filter(v => v.startsWith("KO")), nome: vecchio.name });
  r = await lancia(dA(), "prova");
  prova("e al rilancio, senza «precedente», niente da fare", (r.esito === "prova pulita") && !r.piano.some(q => q.cosa === "attore"), { piano: r.piano, avvisi: r.avvisi });
  // rivelato: un nome che descrive nuovo nei dati dà il nome composto nuovo
  await vecchio.update({ name: "Conciatore: Ruggero Pell", "flags.gdr-strumenti.nomi.rivelato": true });
  const d2 = dA(); d2.operazioni[0].nome = "Conciatore di Porta Nord";
  r = await lancia(d2, "prova"); const a2 = (r.esito === "prova pulita") ? await lancia(d2, "applica", r.firma) : r;
  prova("rivelato, coi dati che cambiano il nome che descrive: prende il nome composto nuovo; applica OK", (a2.esito === "OK") && (vecchio.name === "Conciatore di Porta Nord: Ruggero Pell"), { esito: a2.esito, problemi: a2.problemi, nome: vecchio.name });
}

// --- 1.15.0: i token delle scene si rinominano solo se cambiano nome, e la verifica li guarda -----------------------------------------
{
  const tintore = await Attore.create({ name: "Il tintore", type: "npc", prototypeToken: { name: "Il tintore" }, flags: { "gdr-strumenti": { nomi: { aspetto: "Il tintore", vero: "Ugo Brann", rivelato: false } } } });
  const sc = new Scena({ name: "Bottega" }); game.scenes.set(sc.id, sc);
  sc.aggiungiToken({ name: "Il tintore", actorId: tintore.id }); sc.aggiungiToken({ name: "Il tintore (2)", actorId: tintore.id }); sc.aggiungiToken({ name: "Tinto a mano", actorId: tintore.id });
  const dT = (vero, pr) => ({ ...datiBase(), carico: "xx-tintore", file: [], operazioni: [
    { op: "attore", rif: "at", id: tintore.id, nome: "Tintore", nomeVero: vero, cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno", ...(pr ? { precedente: pr } : {}) }] });
  const ap = async dd => { const r = await lancia(dd, "prova"); return (r.esito === "prova pulita") ? lancia(dd, "applica", r.firma) : r; };
  let r = await ap(dT("Ugo Brann", { nome: "Il tintore", nomeVero: "Ugo Brann" }));
  const nomiTok = () => sc.tokens.contents.map(t => t.name).sort().join(" | ");
  prova("rinomina coi token: il prototipo e i token col nome di prima, anche numerati; quello rinominato a mano resta; applica e verifica OK",
    (r.esito === "OK") && r.verifica.every(v => v.startsWith("OK")) && (tintore.name === "Tintore") && (tintore.prototypeToken.name === "Tintore") && (nomiTok() === "Tinto a mano | Tintore | Tintore (2)")
    && (r.piano.filter(q => (q.cosa === "attore") && (q.azione === "aggiorna")).length === 1) && (r.piano.find(q => q.cosa === "attore")?.token === 2),
    { esito: r.esito, problemi: r.problemi, errori: r.errori, token: nomiTok(), piano: r.piano.filter(q => q.cosa === "attore") });
  r = await ap(dT("Ugo Brannock"));
  prova("cambia solo il nome vero (il nome non cambia): nessun token da scrivere, applica OK",
    (r.esito === "OK") && (tintore.flags["gdr-strumenti"].nomi.vero === "Ugo Brannock") && !r.piano.some(q => q.token), { esito: r.esito, errori: r.errori, problemi: r.problemi });
  // un nome nuovo col nome vero di un altro attore non rivelato: problema
  await Attore.create({ name: "Il garzone del tintore", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Il garzone del tintore", vero: "Pellegrino", rivelato: false } } } });
  const dX = dT("Ugo Brannock"); dX.operazioni[0].nome = "Tintore, zio di Pellegrino";
  r = await lancia(dX, "prova");
  prova("rinomina col nome vero di un altro attore non rivelato nel nome nuovo: problema", r.problemi.some(q => q.includes("nel nome nuovo c'è il nome vero")), r.problemi);
  // la scrittura dei token si ferma; al rilancio la rinomina riparte e finisce
  { const dY = dT("Ugo Brannock"); dY.operazioni[0].nome = "Tintore della Porta";
    const p0 = await lancia(dY, "prova");
    globalThis.__finto.fallisci = "scena"; const a0 = await lancia(dY, "applica", p0.firma); globalThis.__finto.fallisci = null;
    const r1 = await ap(dY);
    prova("token che non si scrivono: l'attore resta coi nomi di prima, e al rilancio la rinomina finisce, coi token", (a0.esito !== "OK") && (r1.esito === "OK") && (tintore.name === "Tintore della Porta") && sc.tokens.contents.some(t => t.name === "Tintore della Porta (2)"),
      { a0: a0.esito, r1: r1.esito, problemi: r1.problemi, errori: r1.errori, nome: tintore.name, token: nomiTok() }); }
  // un attore rivelato, col nome vero nuovo che contiene quello di un altro non rivelato: problema
  { await tintore.update({ name: "Tintore della Porta: Ugo Brannock", "flags.gdr-strumenti.nomi.rivelato": true });
    const dZ = dT("Ugo, padre di Pellegrino"); dZ.operazioni[0].nome = "Tintore della Porta";
    const x = await lancia(dZ, "prova");
    prova("attore rivelato, col nome vero nuovo che contiene quello di un altro non rivelato: problema", x.problemi.some(q => q.includes("nel nome nuovo c'è il nome vero")), x.problemi); }
  game.scenes.delete(sc.id);
}
// una pagina coi nomi di prima di un attore che il carico rinomina: avviso
{
  const att = await Attore.create({ name: "Il cordaio", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Il cordaio", vero: "Bastiano Fune", rivelato: false } } } });
  const dd = { ...datiBase(), carico: "xx-cordaio", file: [], operazioni: [
    { op: "journal", rif: "jcor", nome: "Diario del cordaio", cartella: null, pagine: [{ rif: "pcor", nome: "Il cordaio", nomeVero: "Bastiano Fune", tipo: "text", html: "<p>Corde.</p>" }] },
    { op: "attore", rif: "acor", id: att.id, nome: "Cordaio", nomeVero: "Bastiano Fune", cartella: null, compendio: "dnd5e.actors24", srd: "Commoner", token: "uno", precedente: { nome: "Il cordaio", nomeVero: "Bastiano Fune" } }] };
  const x = await lancia(dd, "prova");
  prova("una pagina coi nomi di prima di un attore che il carico rinomina: avviso", x.avvisi.some(q => q.includes("Il cordaio") && q.includes("gli stessi due nomi")), x.avvisi);
}

// --- 1.16.0: «Rivela il nome» dalla pagina del journal, e il doppio nome dato a mano ---------------------------------------------------
{
  const RN = await import(`${M}/rivela-nome.mjs`);
  const conScene = async f => { const s0 = game.scenes; game.scenes = { contents: [] }; try { return await f(); } finally { game.scenes = s0; } };
  globalThis.ui ??= {}; globalThis.ui.notifications = { info() {}, warn() {}, error() {}, ...(globalThis.ui.notifications ?? {}) };
  // un personaggio nuovo, fatto al momento, e la sua pagina: il doppio nome a mano
  const pg = await Attore.create({ name: "Mira Vell", type: "character" });
  const jP = await Journal.create({ _id: "journalDoppioXXX", name: "Diario dei nomi a mano", ownership: { default: 0 } }, { keepId: true });
  await jP.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaMiraXXXXXX", name: "Mira Vell", sort: 100, text: { content: "<p>Viene da lontano.</p>" } },
    { _id: "paginaMiraGMXXXX", name: "Mira Vell (solo GM)", sort: 200, text: { content: "<p>Il segreto.</p>" } }], { keepId: true });
  let r = await conScene(() => RN.impostaDoppioNome(pg, { aspetto: "Straniera dal mantello grigio", vero: "Mira Vell" }));
  const pM = () => jP.pages.get("paginaMiraXXXXXX"), pMG = () => jP.pages.get("paginaMiraGMXXXX");
  prova("doppio nome a mano: l'attore, la sua pagina e quella solo GM prendono il nome che descrive, coi due nomi nel flag",
    (pg.name === "Straniera dal mantello grigio") && (pM().name === "Straniera dal mantello grigio") && (pMG().name === "Straniera dal mantello grigio (solo GM)")
    && (pMG().flags["gdr-strumenti"].nomi.vero === "Mira Vell (solo GM)") && (pg.flags["gdr-strumenti"].nomi.rivelato === false), { r, pg: pg.name, p: pM().name, g: pMG().name });
  // dalla pagina: rivela l'attore, e con lui le pagine
  r = await conScene(() => RN.rivelaPagina(pM()));
  prova("«Rivela il nome» dalla pagina: l'attore e le due pagine prendono il nome composto",
    (pg.name === "Straniera dal mantello grigio: Mira Vell") && (pM().name === "Straniera dal mantello grigio: Mira Vell") && (pMG().name === "Straniera dal mantello grigio: Mira Vell (solo GM)"), { pg: pg.name, p: pM().name });
  await conScene(() => RN.rivelaPagina(pM()));
  prova("«Rivela il nome» dalla pagina, di nuovo: tutto torna al nome che descrive", (pg.name === "Straniera dal mantello grigio") && (pM().name === "Straniera dal mantello grigio"));
  // una pagina di due attori: dalla pagina si rivelano tutti e due
  const a1 = await Attore.create({ name: "Bottaio", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Bottaio", vero: "Aldo Doghe", rivelato: false } } } });
  const a2 = await Attore.create({ name: "Moglie del bottaio", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Moglie del bottaio", vero: "Rina Doghe", rivelato: false } } } });
  await jP.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaBottaiXXXX", name: "Bottai", sort: 300, text: { content: "" },
    flags: { "gdr-strumenti": { nomi: { aspetto: "Bottai", vero: "Aldo e Rina Doghe", rivelato: false, attori: [{ aspetto: "Bottaio", vero: "Aldo Doghe" }, { aspetto: "Moglie del bottaio", vero: "Rina Doghe" }] } } } }], { keepId: true });
  const pB = () => jP.pages.get("paginaBottaiXXXX");
  const piano = await conScene(() => RN.rivelaPagina(pB(), { prova: true }));
  prova("dalla pagina di due attori, in prova: si rivelano tutti e due", Array.isArray(piano) && (piano.length === 2) && piano.every(x => x.esito === "lo farei"), piano);
  await conScene(() => RN.rivelaPagina(pB()));
  prova("dalla pagina di due attori: tutti e due rivelati, e la pagina prende il suo nome vero",
    (a1.name === "Bottaio: Aldo Doghe") && (a2.name === "Moglie del bottaio: Rina Doghe") && (pB().name === "Bottai: Aldo e Rina Doghe"), { a1: a1.name, a2: a2.name, p: pB().name });
  await conScene(() => RN.rivelaPagina(pB()));
  prova("e di nuovo: tutti e due nascosti, la pagina torna al nome che descrive", (a1.name === "Bottaio") && (a2.name === "Moglie del bottaio") && (pB().name === "Bottai"));
  // un attore che manca: la pagina non si rivela a metà
  await jP.updateEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaBottaiXXXX", "flags.gdr-strumenti.nomi.attori": [{ aspetto: "Bottaio", vero: "Aldo Doghe" }, { aspetto: "Garzone", vero: "Pino" }] }]);
  const p2 = await conScene(() => RN.rivelaPagina(pB(), { prova: true }));
  prova("dalla pagina con un attore che manca: non rivela niente", (p2[0]?.esito === "attori mancanti") && (a1.name === "Bottaio"), p2);
  // togliere il doppio nome a mano: l'attore e le pagine tornano al nome vero
  await conScene(() => RN.impostaDoppioNome(pg, { vero: "" }));
  prova("doppio nome tolto a mano: l'attore e le pagine tornano al nome vero, senza flag", (pg.name === "Mira Vell") && !pg.flags["gdr-strumenti"]?.nomi && (pM().name === "Mira Vell") && (pMG().name === "Mira Vell (solo GM)") && !pM().flags["gdr-strumenti"]?.nomi,
    { pg: pg.name, p: pM().name, g: pMG().name });
  let errore = null; try { await RN.impostaDoppioNome(pg, { aspetto: "Mira Vell", vero: "Mira Vell" }); } catch(err) { errore = err.message; }
  prova("doppio nome a mano con due nomi uguali: errore, niente scritto", !!errore && (pg.name === "Mira Vell"), errore);
  // dalla scheda di un token non collegato si scrive sull'attore del mondo
  const gu = await Attore.create({ name: "Guardia del ponte", type: "npc" });
  const sintetico = { isToken: true, token: { baseActor: gu }, id: gu.id, name: "Guardia del ponte", flags: {}, update() { throw new Error("scritto sull'attore sintetico"); } };
  await conScene(() => RN.impostaDoppioNome(sintetico, { aspetto: "Guardia del ponte", vero: "Ugo Pietra" }));
  prova("doppio nome dalla scheda di un token non collegato: va sull'attore del mondo", (gu.flags["gdr-strumenti"]?.nomi?.vero === "Ugo Pietra") && (gu.name === "Guardia del ponte"), gu.flags);
  // una pagina omonima col flag di un altro personaggio non si tocca, e si elenca
  const altro = await Attore.create({ name: "Guardia", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Guardia", vero: "Elsa Ferro", rivelato: false } } } });
  const nuovaG = await Attore.create({ name: "Guardia", type: "npc" });
  await jP.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaElsaXXXXXX", name: "Guardia", sort: 400, text: { content: "" },
    flags: { "gdr-strumenti": { nomi: { aspetto: "Guardia", vero: "Elsa Ferro", rivelato: false } } } }], { keepId: true });
  const pE = () => jP.pages.get("paginaElsaXXXXXX");
  let pi = await conScene(() => RN.impostaDoppioNome(nuovaG, { aspetto: "Guardia", vero: "Otto Sasso", prova: true }));
  prova("pagina omonima col flag di un altro personaggio: non nel piano, fra quelle lasciate", !pi.pagine.length && pi.lasciate.some(x => x.endsWith("· Guardia")), pi);
  await conScene(() => RN.impostaDoppioNome(nuovaG, { aspetto: "Guardia", vero: "Otto Sasso" }));
  prova("… e il suo flag resta quello dell'altro", pE().flags["gdr-strumenti"].nomi.vero === "Elsa Ferro", pE().flags);
  const senza = await Attore.create({ name: "Guardia", type: "npc" });
  await conScene(() => RN.impostaDoppioNome(senza, { vero: "" }));
  prova("«Salva» col nome vero vuoto su un attore senza doppio nome: le pagine omonime degli altri tengono il flag", pE().flags["gdr-strumenti"]?.nomi?.vero === "Elsa Ferro", pE().flags);
  void altro;
  // cambiare i nomi aggiorna la lista «attori» delle pagine di più personaggi, che tengono il loro nome
  await jP.updateEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaBottaiXXXX", "flags.gdr-strumenti.nomi.attori": [{ aspetto: "Bottaio", vero: "Aldo Doghe" }, { aspetto: "Moglie del bottaio", vero: "Rina Doghe" }] }]);
  await conScene(() => RN.impostaDoppioNome(a1, { aspetto: "Bottaio", vero: "Aldo Doghetti" }));
  prova("nomi cambiati: la pagina dei bottai tiene il suo nome e segue i nomi nuovi", (pB().name === "Bottai") && (pB().flags["gdr-strumenti"].nomi.attori[0].vero === "Aldo Doghetti") && (RN.attoriDellaPagina(pB()).mancano === 0), pB().flags);
  await conScene(() => RN.impostaDoppioNome(a2, { vero: "" }));
  prova("doppio nome tolto: la pagina dei bottai lo toglie dalla sua lista", (pB().flags["gdr-strumenti"].nomi.attori.length === 1) && (pB().name === "Bottai"), pB().flags);
  // se le pagine non si scrivono, l'attore resta col nome di prima, e un secondo tentativo lo ritrova
  const co = await Attore.create({ name: "Conciatore", type: "npc" });
  const jC = await Journal.create({ _id: "journalConciaXXX", name: "Conce", ownership: { default: 0 } }, { keepId: true });
  await jC.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaConciaXXXX", name: "Conciatore", sort: 100, text: { content: "" } }], { keepId: true });
  const vera = jC.updateEmbeddedDocuments.bind(jC);
  jC.updateEmbeddedDocuments = async () => { throw new Error("rete giù"); };
  let e3 = null; try { await conScene(() => RN.impostaDoppioNome(co, { aspetto: "Conciatore", vero: "Sesto Pelli" })); } catch(err) { e3 = err.message; }
  prova("pagine non scritte: errore, e l'attore senza doppio nome", (e3 === "rete giù") && !co.flags["gdr-strumenti"]?.nomi, e3);
  jC.updateEmbeddedDocuments = vera;
  await conScene(() => RN.impostaDoppioNome(co, { aspetto: "Conciatore", vero: "Sesto Pelli" }));
  prova("… e il secondo tentativo fa tutto", (co.flags["gdr-strumenti"]?.nomi?.vero === "Sesto Pelli") && (jC.pages.get("paginaConciaXXXX").flags["gdr-strumenti"]?.nomi?.vero === "Sesto Pelli"));
  // una pagina di più attori rivelata segue lo stato dei suoi attori quando uno cambia coi due nomi a mano
  const t1 = await Attore.create({ name: "Tintore", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Tintore", vero: "Ivo Guado", rivelato: false } } } });
  const t2 = await Attore.create({ name: "Tintora", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Tintora", vero: "Lea Guado", rivelato: false } } } });
  await jC.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaTintoriXXX", name: "Tintori", sort: 200, text: { content: "" },
    flags: { "gdr-strumenti": { nomi: { aspetto: "Tintori", vero: "Ivo e Lea Guado", rivelato: false, attori: [{ aspetto: "Tintore", vero: "Ivo Guado" }, { aspetto: "Tintora", vero: "Lea Guado" }] } } } }], { keepId: true });
  const pT = () => jC.pages.get("paginaTintoriXXX");
  await conScene(() => RN.rivelaPagina(pT()));
  prova("(preparazione) i tintori rivelati, la pagina col nome composto", pT().name === "Tintori: Ivo e Lea Guado", pT().name);
  await conScene(() => RN.impostaDoppioNome(t1, { aspetto: "Tintore", vero: "Ivo Guado", rivelato: false }));
  prova("un attore nascosto coi due nomi a mano: la pagina dei tintori torna al nome che descrive", (t1.name === "Tintore") && (pT().name === "Tintori") && (pT().flags["gdr-strumenti"].nomi.rivelato === false), { t1: t1.name, p: pT().name });
  await conScene(() => RN.impostaDoppioNome(t1, { aspetto: "Tintore", vero: "Ivo Guado", rivelato: true }));
  prova("… e rivelato di nuovo così, l'ultimo nascosto: la pagina prende il nome composto", pT().name === "Tintori: Ivo e Lea Guado", pT().name);
  // senza «pagine», le pagine col flag del personaggio seguono lo stesso
  await conScene(() => RN.impostaDoppioNome(t2, { aspetto: "Tintora", vero: "Lea Guadi", rivelato: true, pagine: false }));
  prova("senza «pagine»: la lista della pagina dei tintori segue i nomi nuovi", (pT().flags["gdr-strumenti"].nomi.attori[1].vero === "Lea Guadi") && (RN.attoriDellaPagina(pT()).mancano === 0), pT().flags);
  await jC.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaTintoraXXX", name: "Tintora", sort: 300, text: { content: "" } }], { keepId: true });
  await conScene(() => RN.impostaDoppioNome(t2, { aspetto: "Tintora", vero: "Lea Guadi", rivelato: false, pagine: false }));
  prova("senza «pagine»: la pagina omonima senza flag resta com'è", !jC.pages.get("paginaTintoraXXX").flags["gdr-strumenti"]?.nomi);
  // una pagina del personaggio rinominata a mano: fra le lasciate
  await jC.createEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaTintoMano1", name: "Tintora", sort: 400, text: { content: "" },
    flags: { "gdr-strumenti": { nomi: { aspetto: "Tintora (solo GM)", vero: "Lea Guadi (solo GM)", rivelato: false } } } }], { keepId: true });
  pi = await conScene(() => RN.impostaDoppioNome(t2, { aspetto: "Tintora", vero: "Lea Guadini", prova: true }));
  prova("una pagina del personaggio rinominata a mano: fra le lasciate, non nel piano", pi.lasciate.some(x => x.endsWith("· Tintora")) && !pi.pagine.some(x => x.includes("(solo GM)")), pi);
  // una lista di più attori che si svuota: lo dice il piano
  await jC.updateEmbeddedDocuments("JournalEntryPage", [{ _id: "paginaTintoriXXX", "flags.gdr-strumenti.nomi.attori": [{ aspetto: "Tintora", vero: "Lea Guadi" }] }]);
  pi = await conScene(() => RN.impostaDoppioNome(t2, { vero: "", prova: true }));
  prova("doppio nome tolto all'ultimo attore di una pagina: il piano dice che nessuno la rivela più", pi.pagineDiPiuAttori.some(x => x.includes("nessuno la rivela")), pi);
  // gli avvisi del piano
  pi = await conScene(() => RN.impostaDoppioNome(pg, { aspetto: "Straniera", vero: "Mira Vell", prova: true }));
  const vede = pg.ownership?.default;
  pg.ownership = { ...(pg.ownership ?? {}), default: 2 };
  const pi2 = await conScene(() => RN.impostaDoppioNome(pg, { aspetto: "Straniera", vero: "Mira Vell", prova: true }));
  pg.ownership.default = vede ?? 0;
  prova("il nome vero su un attore che una giocatrice vede: avviso nel piano", !pi.avvisi.length && pi2.avvisi.some(x => x.includes("una giocatrice vede")), { pi: pi.avvisi, pi2: pi2.avvisi });
  pi = await conScene(() => RN.impostaDoppioNome(nuovaG, { aspetto: "Guardia", vero: "Elsa Ferro", prova: true }));
  prova("i due nomi di un altro attore: avviso nel piano", pi.avvisi.some(x => x.includes("un altro attore")), pi.avvisi);
  pi = await conScene(() => RN.impostaDoppioNome(senza, { vero: "", prova: true }));
  prova("nome vero vuoto su un attore senza doppio nome: niente da cambiare", pi.niente === true, pi);
  // 1.16.1: niente da cambiare coi nomi che ha già; l'avviso quando si toglie il doppio nome
  // il prototipo col nome dell'attore, come lo fa Foundry
  co.prototypeToken = { ...(co.prototypeToken ?? {}), name: co.name };
  pi = await conScene(() => RN.impostaDoppioNome(co, { aspetto: "Conciatore", vero: "Sesto Pelli", prova: true }));
  prova("i due nomi che ha già, col prototipo che porta il nome: niente da cambiare, nemmeno la pagina", (pi.niente === true) && !pi.pagine.length && !pi.prototipo, pi);
  pi = await conScene(() => RN.impostaDoppioNome(co, { aspetto: "Conciatore", vero: "Sesto Pelli", rivelato: true, prova: true }));
  prova("gli stessi nomi, rivelato: qualcosa da cambiare", pi.niente === false, pi);
  pi = await conScene(() => RN.impostaDoppioNome(co, { vero: "", prova: true }));
  prova("togliere il doppio nome a uno non rivelato: avviso del nome vero che si legge", pi.avvisi.some(x => x.includes("il nome vero, «Sesto Pelli»")), pi.avvisi);
  // 1.16.1: «-=» nella forma di V14 al momento di scrivere
  const { operatori } = await import(`${M}/carica/comune.mjs`);
  const FD = globalThis.foundry.data.operators.ForcedDeletion;
  const o = operatori({ _id: "x", name: "A", "flags.gdr-strumenti.-=nomi": null, "flags.gdr-strumenti.nomi.-=attori": null });
  prova("«-=» diventa ForcedDeletion, sulla chiave senza «-=»", (o["flags.gdr-strumenti.nomi"] instanceof FD) && (o["flags.gdr-strumenti.nomi.attori"] instanceof FD) && (o.name === "A") && !Object.keys(o).some(k => k.includes("-=")), Object.keys(o));
  const dati0 = globalThis.foundry.data; delete globalThis.foundry.data;
  const o2 = operatori({ "flags.gdr-strumenti.-=nomi": null });
  globalThis.foundry.data = dati0;
  prova("senza ForcedDeletion (prima della 14): «-=» com'è", ("flags.gdr-strumenti.-=nomi" in o2));
  await conScene(() => RN.impostaDoppioNome(co, { vero: "" }));
  prova("doppio nome tolto con ForcedDeletion: flag via dall'attore e dalla pagina", !co.flags["gdr-strumenti"]?.nomi && !jC.pages.get("paginaConciaXXXX").flags["gdr-strumenti"]?.nomi && (co.name === "Sesto Pelli"), { a: co.flags, n: co.name });
}

// 1.17.0: le voci del menu del tasto destro sugli attori della barra
{
  const RN = await import(`${M}/rivela-nome.mjs`);
  const conScene = async f => { const s0 = game.scenes; game.scenes = { contents: [] }; try { return await f(); } finally { game.scenes = s0; } };
  const h0 = globalThis.Hooks, presi = {};
  globalThis.Hooks = { on: (n, f) => { presi[n] = f; } };
  try { RN.registraRivelaNome(); } finally { globalThis.Hooks = h0; }
  const nas = await Attore.create({ name: "Ciabattino", type: "npc", flags: { "gdr-strumenti": { nomi: { aspetto: "Ciabattino", vero: "Ugo Sarti", rivelato: false } } } });
  const sen = await Attore.create({ name: "Passante", type: "npc" });
  const li = a => ({ dataset: { entryId: a.id } });
  const rel0 = game.release;
  for ( const gen of [14, 13] ) {
    game.release = { generation: gen };
    const voci = [];
    presi.getActorContextOptions?.({}, voci);
    const di = l => voci.find(v => (v.label ?? v.name) === l);
    const vede = (v, a) => (gen >= 14) ? v.visible({}, li(a)) || v.visible(li(a)) : v.condition(li(a));
    const ok = (gen >= 14) ? voci.every(v => v.label && v.onClick && v.visible && !v.name) : voci.every(v => v.name && v.callback && v.condition && !v.label);
    prova(`menu degli attori, V${gen}: tre voci nella forma della versione`, (voci.length === 3) && ok, voci.map(v => Object.keys(v)));
    prova(`menu degli attori, V${gen}: «Rivela il nome» solo su chi ha il doppio nome e non è rivelato, «Doppio nome…» su tutti`,
      vede(di("Rivela il nome"), nas) && !vede(di("Rivela il nome"), sen) && !vede(di("Nascondi il nome"), nas) && vede(di("Doppio nome…"), sen));
  }
  game.release = { generation: 14 };
  const voci = []; presi.getActorContextOptions({}, voci);
  await conScene(() => voci.find(v => v.label === "Rivela il nome").onClick({}, li(nas)));
  prova("menu degli attori: «Rivela il nome» rivela", nas.name === "Ciabattino: Ugo Sarti", nas.name);
  const v2 = []; presi.getActorContextOptions({}, v2);
  prova("… e poi propone «Nascondi il nome»", v2.find(v => v.label === "Nascondi il nome").visible({}, li(nas)) && !v2.find(v => v.label === "Rivela il nome").visible({}, li(nas)));
  await conScene(() => v2.find(v => v.label === "Nascondi il nome").onClick({}, li(nas)));
  prova("… che nasconde", nas.name === "Ciabattino", nas.name);
  game.user.isGM = false;
  const v3 = []; presi.getActorContextOptions({}, v3);
  game.user.isGM = true;
  prova("menu degli attori: per una giocatrice, nessuna voce", v3.length === 0);
  const v4 = []; presi.getActorContextOptions({ collection: { metadata: { id: "dnd5e.actors24" }, get: () => nas } }, v4);
  prova("menu degli attori: in un compendio, nessuna voce (un suo attore può avere l'id di uno del mondo)", v4.length === 0);
  const v5 = []; presi.getActorContextOptions({ collection: game.actors }, v5);
  prova("menu degli attori: nella barra degli attori del mondo, le voci", v5.length === 3);
  game.release = rel0;
}

// 1.18.0: la classe «gdr-figura» delle immagini delle voci è fissa: ammessa anche in una pagina che si mostra
{
  const H = await import(`${M}/carica/html.mjs`);
  prova("«gdr-figura» fra le classi fisse del modulo", H.CLASSI_FISSE.includes("gdr-figura"));
  const h = '<p style="text-align:center"><img class="gdr-figura" src="worlds/x/tokens/xx-ritratto-aaaaaaaaaaaa.webp" alt=""></p><p>Testo.</p>';
  const c = H.controllaHtml(h, { classi: ["dnd-gm-hint"], soloGM: false, riquadroDM: "Per il DM", paroleDM: [] });
  prova("«gdr-figura» ammessa in una pagina che si mostra, fuori dai blocchi segreti", !c.problemi.length && (c.immagini.length === 1), c.problemi);
  prova("la classe conta nella forma canonica: la pagina con la classe non è uguale a quella senza", H.canonico(h) !== H.canonico(h.replace(' class="gdr-figura"', "")));
}

prova("nessun «-=» scritto né simulato con ForcedDeletion presente (V14)", !(globalThis.__finto?.trattini), globalThis.__finto?.trattini);

console.log(`\n${fatti - falliti} su ${fatti} prove passate`);
process.exit(falliti ? 1 : 0);
