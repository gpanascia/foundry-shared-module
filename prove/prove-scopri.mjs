/**
 * Prove di «Scopri» (scripts/scopri.mjs), in Node, fuori dal mondo, sul Foundry finto del caricatore:
 * lo stato letto dai tasselli e dalle pagine, il piano delle spunte, i segnaposto, «Applica» con la dissolvenza (anche interrotta),
 * le righe in chat, il pannello coi legami fra le caselle, i livelli con altri nomi, le guardie della riga della macro.
 * Si lanciano dalla cartella prove/, dopo npm install (jsdom): node prove-scopri.mjs
 * Escono con codice 1 se una prova non passa. Non sostituiscono la prova nel mondo (README.md, «Scopri»).
 */
import { createRequire } from "node:module";
import { preparaMondo, Journal, Scena } from "./finto-foundry.mjs";

const jsdom = createRequire(process.env.GDR_NODE_MODULES ? `${process.env.GDR_NODE_MODULES}/` : import.meta.url)("jsdom");
const mondo = preparaMondo({ jsdom });
const finestra = new jsdom.JSDOM("").window;
const { leggiStato, pianoScopri, pianoSegnaposti, sceltaDi, configura, blocchi, scopri, _applica, _pannello, _collega, impagina } = await import("../modulo/scripts/scopri.mjs");

let falliti = 0, fatti = 0;
const prova = (nome, cond, dettaglio) => { fatti++; if ( !cond ) { falliti++; console.log(`KO · ${nome}${dettaglio ? `\n     ${typeof dettaglio === "string" ? dettaglio : JSON.stringify(dettaglio, null, 1).slice(0, 2500)}` : ""}`); } else console.log(`ok · ${nome}`); };

// la chat e gli avvisi del mondo finto
const chat = [], avvisi = [];
globalThis.ChatMessage = { create: async d => { chat.push(d); return d; } };
globalThis.ui = { notifications: { info: m => avvisi.push(["info", m]), warn: m => avvisi.push(["warn", m]), error: m => avvisi.push(["error", m]) } };

// --- il mondo: la mappa con due quartieri, il Diario con le pagine --------------------------------------------------------------
const JID = "DiarioFinto00001";
const sezione = (nome, id, rivelato = false) => `<section class="secret${rivelato ? " revealed" : ""}" id="${id}"><p><strong>${nome}.</strong> testo</p></section>`;
const RIVA = `<p>La riva.</p>${sezione("Visitato", "secret-a1")}${sezione("Conosciuto", "secret-a2")}${sezione("Di casa", "secret-a3")}`;
const BORGO = `<p>Il borgo.</p>${sezione("Visitato", "secret-b1")}`;
let S, J, T, P, N;
function costruisci() {
  game.scenes.clear(); game.journal.clear(); chat.length = 0; avvisi.length = 0;
  J = new Journal({ _id: JID, name: "Diario", ownership: { default: 0 }, pages: [
    { _id: "pgPorto000000001", name: "Il Porto", sort: 100, title: { level: 1 }, text: { content: RIVA }, ownership: { default: 0 } },
    { _id: "pgLocanda0000001", name: "La Locanda Storta", sort: 200, title: { level: 2 }, ownership: { default: 0 } },
    { _id: "pgLocandaGM00001", name: "La Locanda Storta (solo GM)", sort: 250, title: { level: 2 }, ownership: { default: 0 } },
    { _id: "pgPersona0000001", name: "Un personaggio", sort: 260, title: { level: 3 }, ownership: { default: 0 } },
    { _id: "pgBorgo000000001", name: "Borgo Rocca", sort: 300, title: { level: 1 }, text: { content: BORGO }, ownership: { default: 2 } },
    { _id: "pgCorvo000000001", name: "La <Ardito> Corvo", sort: 400, title: { level: 3 }, flags: { world: { wgVoce: true } }, ownership: { default: 2 } }
  ] });
  game.journal.set(J.id, J);
  S = new Scena({ _id: "ScenaMappa000001", name: "Borgomare", flags: { world: { wgMappa: true } } });
  game.scenes.set(S.id, S);
  const tassello = (id, quartiere, nome, livello, ordine, hidden) => [id, { _id: id, hidden, alpha: 1, flags: { world: { wgMappa: { quartiere, nome, livello, ordine } } } }];
  const lista = [tassello("tlPortoSentito01", "il-porto", "Il Porto", "sentito-dire", 1, true), tassello("tlPortoVisitato1", "il-porto", "Il Porto", "visitato", 1, true),
    tassello("tlPortoDiCasa001", "il-porto", "Il Porto", "di-casa", 1, true),
    tassello("tlBorgoSentito01", "borgo-rocca", "Borgo Rocca", "sentito-dire", 2, false), tassello("tlBorgoVisitato1", "borgo-rocca", "Borgo Rocca", "visitato", 2, true)];
  for ( const [, d] of lista ) S.tiles.set(d._id, new (CONFIG.Tile.documentClass)(d, { parent: S }));
  const nota = d => S.notes.set(d._id, new (CONFIG.Note.documentClass)(d, { parent: S }));
  nota({ _id: "ntPinLocanda0001", entryId: JID, pageId: "pgLocanda0000001", text: "Locanda Storta", flags: { world: { wgMappa: { punto: "p1" } } } });
  nota({ _id: "ntSegnaLocanda01", entryId: JID, pageId: "pgLocandaGM00001", text: "Taverna", texture: { tint: "#8a7f70" }, flags: { world: { wgSegnaposto: { punto: "p1", quartiere: "il-porto", nascosta: "pgLocandaGM00001" } } } });
  T = id => S.tiles.get(id); P = id => J.pages.get(id); N = id => S.notes.get(id);
}
costruisci();

// --- lo stato di adesso ---------------------------------------------------------------------------------------------------------
let Q = leggiStato(S, J);
const qs = slug => Q.find(q => q.slug === slug);
prova("stato: i quartieri in ordine, coi livelli dalla pagina e dai tasselli", (Q.map(q => q.slug).join() === "il-porto,borgo-rocca") && (qs("il-porto").livello === 0) && (qs("borgo-rocca").livello === 1), Q.map(q => [q.slug, q.livello]));
prova("stato: i posti sono le voci di secondo livello o col segno wgVoce, non le solo GM né i personaggi",
  (qs("il-porto").posti.map(p => p.id).join() === "pgLocanda0000001") && (qs("borgo-rocca").posti.map(p => p.id).join() === "pgCorvo000000001"));
prova("stato: niente incoerenze in un mondo in ordine", Q.every(q => !q.incoerente.length), Q.map(q => q.incoerente));
prova("stato: i blocchi letti dalla pagina", JSON.stringify(blocchi(RIVA)) === JSON.stringify({ Visitato: { id: "secret-a1", rivelato: false }, Conosciuto: { id: "secret-a2", rivelato: false }, "Di casa": { id: "secret-a3", rivelato: false } }));

// 1.9.0: una voce o un segnaposto messi da parte dal caricatore «Scopri» non li tocca
{ const DP = { "gdr-strumenti": { daParte: { carico: "xx-citta", rif: "x" } } };
  P("pgLocanda0000001").flags = DP; N("ntSegnaLocanda01").flags = { ...N("ntSegnaLocanda01").flags, ...DP };
  const Qd = leggiStato(S, J), spd = pianoSegnaposti(S, J, Qd, { "il-porto": 2 });
  prova("1.9.0: una voce messa da parte non è un posto, e un segnaposto messo da parte non si tocca", !Qd.find(q => q.slug === "il-porto").posti.length && !spd.up.length, { posti: Qd.find(q => q.slug === "il-porto").posti.map(x => x.id), spd });
  costruisci(); Q = leggiStato(S, J); }

// --- il piano ---------------------------------------------------------------------------------------------------------------------
let p = pianoScopri(Q, sceltaDi(Q));
prova("piano: le spunte di adesso non cambiano niente", !p.mostra.length && !p.nascondi.length && !p.pagUp.length && !p.ripara.length && !p.aggiunte.length && !p.tolte.length, p);
p = pianoScopri(Q, { ...sceltaDi(Q), "q.il-porto.1": true, "q.il-porto.2": true });
prova("piano: Visitato mostra il tassello del quartiere, non quello «sentito»", (p.mostra.map(t => t.id).join() === "tlPortoVisitato1") && !p.nascondi.length, p.mostra.map(t => t.id));
const upPorto = p.pagUp.find(u => u._id === "pgPorto000000001");
prova("piano: la pagina a Observer, col solo blocco «Visitato» rivelato", upPorto && (upPorto["ownership.default"] === 2) && blocchi(upPorto["text.content"]).Visitato.rivelato
  && !blocchi(upPorto["text.content"]).Conosciuto.rivelato && !blocchi(upPorto["text.content"])["Di casa"].rivelato, upPorto);
prova("piano: la riga per le giocatrici", p.aggiunte.join() === "Il Porto, visitato", p.aggiunte);
prova("piano: Borgo Rocca non si tocca", !p.pagUp.some(u => u._id === "pgBorgo000000001") && (p.livDopo["borgo-rocca"] === 1));
let sp = pianoSegnaposti(S, J, Q, p.livDopo);
prova("segnaposto: sulla zona Visitata, apre la pagina del quartiere, chiaro", (sp.up.length === 1) && (sp.up[0].pageId === "pgPorto000000001") && (sp.up[0]["texture.tint"] === "#ffffff"), sp);
p = pianoScopri(Q, { ...sceltaDi(Q), "q.il-porto.3": true });
prova("piano: il livello è la spunta più alta (Conosciuto da solo vale Conosciuto)", (p.livDopo["il-porto"] === 3) && p.aggiunte.join() === "Il Porto, conosciuto", p);
p = pianoScopri(Q, { ...sceltaDi(Q), "q.il-porto.1": true });
prova("piano: Sentito dire mostra il tassello «sentito» e apre la pagina senza blocchi", (p.mostra.map(t => t.id).join() === "tlPortoSentito01")
  && (p.pagUp[0]["ownership.default"] === 2) && !("text.content" in p.pagUp[0]) && (p.aggiunte.join() === "Il Porto, ne avete sentito parlare"), p);
sp = pianoSegnaposti(S, J, Q, p.livDopo);
prova("segnaposto: a Sentito dire resta nascosto (niente da cambiare)", !sp.up.length, sp);

// --- Applica ---------------------------------------------------------------------------------------------------------------------
await _applica(S, J, { "q.il-porto.1": true, "q.il-porto.2": true }, { alias: "Borgomare" });
prova("applica Visitato: tassello visibile ad alfa 1, «sentito» nascosto", !T("tlPortoVisitato1").hidden && (T("tlPortoVisitato1").alpha === 1) && T("tlPortoSentito01").hidden);
prova("applica Visitato: pagina a Observer e blocco rivelato", (P("pgPorto000000001").ownership.default === 2) && blocchi(P("pgPorto000000001").text.content).Visitato.rivelato);
prova("applica Visitato: il segnaposto apre la pagina del quartiere", (N("ntSegnaLocanda01").pageId === "pgPorto000000001") && (N("ntSegnaLocanda01").texture.tint === "#ffffff"));
prova("applica Visitato: una riga in chat a tutte, a nome della città", (chat.length === 1) && !chat[0].whisper && (chat[0].speaker.alias === "Borgomare") && chat[0].content.includes("Il Porto, visitato"), chat);
Q = leggiStato(S, J);
prova("applica Visitato: riletto, il quartiere è a Visitato, senza incoerenze", (qs("il-porto").livello === 2) && !qs("il-porto").incoerente.length, qs("il-porto").incoerente);

chat.length = 0;
await _applica(S, J, { "p.pgLocanda0000001": true });
prova("applica posto: la voce a Observer", P("pgLocanda0000001").ownership.default === 2);
prova("applica posto: il segnaposto torna nascosto, sulla pagina solo GM, scuro", (N("ntSegnaLocanda01").pageId === "pgLocandaGM00001") && (N("ntSegnaLocanda01").texture.tint === "#8a7f70"));
prova("applica posto: la riga in chat col nome del posto", chat.length === 1 && chat[0].content.includes("La Locanda Storta"), chat);
prova("applica posto: i tasselli non si toccano", !T("tlPortoVisitato1").hidden && T("tlPortoSentito01").hidden && T("tlPortoDiCasa001").hidden);

chat.length = 0;
await _applica(S, J, { "q.il-porto.3": true, "q.il-porto.4": true });
const bS = blocchi(P("pgPorto000000001").text.content);
prova("applica Di casa: tutti i blocchi rivelati, il tassello delle scorciatoie visibile", bS.Visitato.rivelato && bS.Conosciuto.rivelato && bS["Di casa"].rivelato && !T("tlPortoDiCasa001").hidden && !T("tlPortoVisitato1").hidden);
prova("applica Di casa: il resto della pagina com'era", P("pgPorto000000001").text.content.startsWith("<p>La riva.</p>") && (P("pgPorto000000001").text.content.match(/secret revealed/g).length === 3));

chat.length = 0;
const tutto = Object.fromEntries(Object.keys(sceltaDi(leggiStato(S, J))).filter(k => k.includes("il-porto") || k.includes("Locanda")).map(k => [k, false]));
await _applica(S, J, tutto);
prova("applica nascosto: tasselli nascosti ad alfa 1, pagina a None, blocchi chiusi", ["tlPortoSentito01", "tlPortoVisitato1", "tlPortoDiCasa001"].every(id => T(id).hidden && (T(id).alpha === 1))
  && (P("pgPorto000000001").ownership.default === 0) && (P("pgPorto000000001").text.content === RIVA) && (P("pgLocanda0000001").ownership.default === 0));
prova("applica nascosto: la riga «Nascosto di nuovo» sussurrata solo al GM", (chat.length === 1) && (chat[0].whisper?.join() === game.user.id) && chat[0].content.includes("da Di casa a nascosto"), chat);
prova("applica nascosto: il segnaposto resta sulla pagina solo GM", N("ntSegnaLocanda01").pageId === "pgLocandaGM00001");

avvisi.length = 0; chat.length = 0;
await _applica(S, J, {});
prova("applica senza cambi: «niente da cambiare», niente in chat", (avvisi.at(-1)?.[1] === "«Scopri»: niente da cambiare.") && !chat.length, avvisi);

// --- incoerenze e «riallinea» ---------------------------------------------------------------------------------------------------
costruisci();
T("tlPortoVisitato1").hidden = false; T("tlPortoVisitato1").alpha = 0.4;          // una dissolvenza rimasta a metà
Q = leggiStato(S, J);
prova("incoerenze: tasselli e pagina che non tornano col livello letto", (qs("il-porto").livello === 2)
  && ["tassello visitato a metà dissolvenza", "pagina a None", "blocco «Visitato» chiuso"].every(x => qs("il-porto").incoerente.includes(x)), qs("il-porto").incoerente);
p = pianoScopri(Q, sceltaDi(Q));
prova("incoerenze: senza «riallinea» non si tocca niente", !p.pagUp.length && !p.ripara.length && !p.mostra.length, p);
await _applica(S, J, { "r.il-porto": true });
Q = leggiStato(S, J);
prova("riallinea: tassello ad alfa 1, pagina e blocco al livello", (T("tlPortoVisitato1").alpha === 1) && (qs("il-porto").livello === 2) && !qs("il-porto").incoerente.length, qs("il-porto").incoerente);

// --- segnaposto senza la sua pagina solo GM ---------------------------------------------------------------------------------------
costruisci();
N("ntSegnaLocanda01").flags.world.wgSegnaposto.nascosta = "pgLocanda0000001";     // la voce delle giocatrici, non la solo GM
Q = leggiStato(S, J);
sp = pianoSegnaposti(S, J, Q, { "il-porto": 2 });
prova("segnaposto senza pagina solo GM: un avviso, e lasciato com'è", !sp.up.length && (sp.avvisi.length === 1) && sp.avvisi[0].includes("Taverna"), sp);

// --- la dissolvenza interrotta ----------------------------------------------------------------------------------------------------
costruisci();
{
  const vero = S.updateEmbeddedDocuments.bind(S); let chiamate = 0;
  S.updateEmbeddedDocuments = async (t, l) => { if ( (t === "Tile") && (++chiamate === 3) ) throw new Error("caduta finta"); return vero(t, l); };
  let errore = null;
  try { await _applica(S, J, { "q.il-porto.2": true }); } catch(err) { errore = err; }
  prova("dissolvenza interrotta: l'errore risale", errore?.message === "caduta finta");
  prova("dissolvenza interrotta: tasselli allo stato finale, pagina e segnaposto aggiornati comunque", !T("tlPortoVisitato1").hidden && (T("tlPortoVisitato1").alpha === 1)
    && (P("pgPorto000000001").ownership.default === 2) && (N("ntSegnaLocanda01").pageId === "pgPorto000000001"));
}

// --- i nomi in chat si scappano -------------------------------------------------------------------------------------------------
costruisci();
await _applica(S, J, { "p.pgCorvo000000001": false });
prova("i nomi dei posti in chat sono scappati (sussurro al GM)", chat.at(-1)?.content.includes("La &lt;Ardito&gt; Corvo") && !chat.at(-1).content.includes("<Ardito>"), chat.at(-1));

// --- livelli con altri nomi ----------------------------------------------------------------------------------------------------------
for ( const [nome, l] of [["tre nomi", ["a", "b", "c"]], ["un nome ripetuto", ["a", "b", "b", "c"]], ["un < nel nome", ["a", "b<", "c", "d"]], ["un nome vuoto", ["a", " ", "c", "d"]]] ) {
  let ok = false; try { configura(l); } catch { ok = true; }
  prova(`livelli: ${nome}, rifiutato`, ok);
}
{
  costruisci();
  const c = configura(["Voce", "Visto", "Noto (bene)", "Casa"]);
  P("pgPorto000000001").text.content = `${sezione("Visto", "secret-c1")}${sezione("Noto (bene)", "secret-c2")}${sezione("Casa", "secret-c3")}`;
  await _applica(S, J, { "q.il-porto.3": true }, { c });
  const b = c.blocchi(P("pgPorto000000001").text.content);
  prova("livelli con altri nomi: i blocchi coi loro titoli, anche con le parentesi", b.Visto.rivelato && b["Noto (bene)"].rivelato && !b.Casa.rivelato, b);
  prova("livelli con altri nomi: la riga in chat col nome", chat.at(-1)?.content.includes("Il Porto, noto (bene)"), chat.at(-1));
}

// --- casi limite della 1.8.0 ------------------------------------------------------------------------------------------------------
costruisci();
await _applica(S, J, { "q.il-porto.2": true });                               // il segnaposto ora si vede sulla zona Visitata
let rp = await scopri({ journal: JID, prova: true, scelta: { "p.pgLocanda0000001": true } });
prova("prova: aprendo la voce, il segnaposto torna nascosto anche nella prova, come con «Applica»",
  (rp.segnaposti.length === 1) && (rp.segnaposti[0].pageId === "pgLocandaGM00001") && (rp.segnaposti[0]["texture.tint"] === "#8a7f70"), rp.segnaposti);
await _applica(S, J, { "p.pgLocanda0000001": true });
rp = await scopri({ journal: JID, prova: true, scelta: { "p.pgLocanda0000001": false } });
prova("prova: chiudendo la voce, il segnaposto torna visibile anche nella prova", (rp.segnaposti.length === 1) && (rp.segnaposti[0].pageId === "pgPorto000000001"), rp.segnaposti);
P("pgLocanda0000001").ownership.pl1aaaaaaaaaaaaa = 2;                           // una giocatrice la vede per conto suo
rp = await scopri({ journal: JID, prova: true, scelta: { "p.pgLocanda0000001": false } });
prova("prova: il permesso di una giocatrice sulla voce conta, come in Foundry", !rp.segnaposti.length, rp.segnaposti);
{ let ok = false; try { configura(["a", "constructor", "c", "d"]); } catch { ok = true; } prova("livelli: un nome di ogni oggetto, rifiutato", ok); }
game.user.isGM = false;
{ let e = null; try { await _applica(S, J, {}); } catch(err) { e = err; } prova("«Applica»: una giocatrice non scrive", /del GM/.test(e?.message ?? ""), e?.message); }
game.user.isGM = true;
{
  costruisci();
  for ( const t of S.tiles ) if ( t.flags.world.wgMappa.quartiere === "il-porto" ) t.flags.world.wgMappa.quartiere = 'il"porto';
  const Qv = leggiStato(S, J), el = finestra.document.createElement("div");
  el.innerHTML = _pannello(Qv, configura()); _collega(el);
  const i3 = [...el.querySelectorAll("input[data-q]")].find(i => (i.dataset.q === 'il"porto') && (i.dataset.n === "3"));
  i3.checked = true; i3.dispatchEvent(new finestra.Event("change"));
  const lv = [...el.querySelectorAll("input[data-q]")].filter(i => i.dataset.q === 'il"porto');
  prova("pannello: uno slug con le virgolette non rompe i legami", (lv.length === 4) && lv[0].checked && lv[1].checked && !lv[3].checked);
}

// --- il pannello ------------------------------------------------------------------------------------------------------------------
costruisci();
Q = leggiStato(S, J);
const corpo = finestra.document.createElement("div");
corpo.innerHTML = _pannello(Q, configura());
_collega(corpo);
const casella = n => corpo.querySelector(`input[name="${n}"]`);
const cambia = (n, v) => { const i = casella(n); i.checked = v; i.dispatchEvent(new finestra.Event("change")); };
prova("pannello: una casella per livello e per posto, spuntate come adesso", casella("q.borgo-rocca.1").checked && !casella("q.borgo-rocca.2").checked && casella("p.pgCorvo000000001").checked && !casella("p.pgLocanda0000001").checked);
prova("pannello: Di casa disattivato dove non c'è né il tassello né il blocco", casella("q.borgo-rocca.4").disabled && !casella("q.il-porto.4").disabled);
cambia("q.il-porto.3", true);
prova("pannello: spuntare Conosciuto spunta i livelli prima", casella("q.il-porto.1").checked && casella("q.il-porto.2").checked && !casella("q.il-porto.4").checked);
cambia("q.il-porto.2", false);
prova("pannello: togliere Visitato toglie quelli dopo, non quelli prima", casella("q.il-porto.1").checked && !casella("q.il-porto.3").checked);
cambia("q.borgo-rocca.1", false);
prova("pannello: un quartiere che torna nascosto si porta via i suoi posti", !casella("p.pgCorvo000000001").checked);
cambia("q.il-porto.1", false); cambia("p.pgLocanda0000001", true);
prova("pannello: spuntare un posto di un quartiere nascosto spunta «Sentito dire»", casella("q.il-porto.1").checked && !casella("q.il-porto.2").checked);
prova("pannello: i nomi dei posti scappati", corpo.innerHTML.includes("La &lt;Ardito&gt; Corvo"));

// --- la riga della macro, col pannello finto ------------------------------------------------------------------------------------
costruisci();
let dialogo = null;
globalThis.foundry.applications.api = { DialogV2: class {
  constructor(o) { this.o = o; dialogo = this; this.element = finestra.document.createElement("div"); this.element.innerHTML = `<section class="window-content">${o.content}</section>`; this.chiuso = false; }
  async render() { return this; }
  setPosition(pos) { this.position = { ...(this.position ?? {}), ...pos }; return this.position; }
  async detachWindow() { await this._staccaFinto?.(); return this; }   // come Foundry: torna dopo aver spostato il pannello
  close() { this.chiuso = true; }
} };
avvisi.length = 0;
await scopri({ journal: "corto" });
prova("macro: senza l'id del journal, un errore e niente pannello", (avvisi.at(-1)?.[0] === "error") && !dialogo, avvisi);
await scopri({ journal: JID, livelli: ["a", "b"] });
prova("macro: livelli sbagliati, un errore e niente pannello", (avvisi.at(-1)?.[0] === "error") && avvisi.at(-1)[1].includes("livelli") && !dialogo, avvisi);
await scopri({ journal: "Altro00000000001" });
prova("macro: un journal che non c'è, un errore", (avvisi.at(-1)?.[0] === "error") && avvisi.at(-1)[1].includes("journal") && !dialogo, avvisi);
game.user.isGM = false; avvisi.length = 0;
await scopri({ journal: JID });
prova("macro: una giocatrice non la usa", (avvisi.at(-1)?.[0] === "warn") && !dialogo);
game.user.isGM = true;
const r = await scopri({ journal: JID, prova: true, scelta: { "q.il-porto.2": true } });
prova("macro, prova: cosa cambierebbe, senza scrivere", (r.mostra.join() === "tlPortoVisitato1") && (r.aggiunte.join() === "Il Porto, visitato") && (r.segnaposti.length === 1)
  && T("tlPortoVisitato1").hidden && (P("pgPorto000000001").ownership.default === 0), r);
await scopri({ journal: JID, titolo: "Borgomare" });
prova("macro: il pannello col titolo della riga", dialogo?.o.window.title === "Scopri — Borgomare");
prova("macro: il pannello con la classe «gdr-scopri», a cui il foglio di stile lega le regole da staccato", !!dialogo?.o.classes?.includes("gdr-scopri"), dialogo?.o.classes);
const corpoD = dialogo.element.querySelector(".gdr-scopri-corpo");
corpoD.querySelector(".gdr-scopri-lista").scrollTop = 140; // a metà della lista
dialogo.element.querySelector(".window-content").scrollTop = 30;
corpoD.querySelector('input[name="q.il-porto.2"]').checked = true;
corpoD.querySelector('input[name="q.il-porto.2"]').dispatchEvent(new finestra.Event("change"));
chat.length = 0;
// il pannello nel mondo: il documento della pagina è quello del pannello (staccato, la finestra torna in cima: prove della 1.16.1 sotto)
const docPrima = globalThis.document; globalThis.document = finestra.document;
let esito;
try { esito = await dialogo.o.buttons.find(b => b.action === "applica").callback(null, null, dialogo); }
finally { if ( docPrima === undefined ) delete globalThis.document; else globalThis.document = docPrima; }
prova("macro: «Applica» dal pannello cambia il mondo, parla a nome della città e rilegge", (esito === "applica") && !T("tlPortoVisitato1").hidden && (chat[0]?.speaker.alias === "Borgomare")
  && corpoD.querySelector('input[name="q.il-porto.2"]').checked && !dialogo.chiuso, chat);
prova("macro: dopo «Applica» la lista e la finestra restano dov'erano, non tornano in cima", (corpoD.querySelector(".gdr-scopri-lista").scrollTop === 140) && (dialogo.element.querySelector(".window-content").scrollTop === 30), corpoD.querySelector(".gdr-scopri-lista").scrollTop);
// «Applica» col pannello staccato (un documento che non è quello della pagina): la lista resta dov'era, la finestra torna in cima, la classe c'è
{
  const docPrima = globalThis.document;
  try {
    globalThis.document = new jsdom.JSDOM("").window.document;
    corpoD.querySelector(".gdr-scopri-lista").scrollTop = 90;
    dialogo.element.querySelector(".window-content").scrollTop = 40;
    await dialogo.o.buttons.find(b => b.action === "applica").callback(null, null, dialogo);
    prova("macro staccata: dopo «Applica» la lista resta dov'era, la finestra in cima, il pannello a colonna",
      (corpoD.querySelector(".gdr-scopri-lista").scrollTop === 90) && (dialogo.element.querySelector(".window-content").scrollTop === 0) && dialogo.element.classList.contains("gdr-staccata"),
      [corpoD.querySelector(".gdr-scopri-lista").scrollTop, dialogo.element.querySelector(".window-content").scrollTop, dialogo.element.className]);
  } finally { if ( docPrima === undefined ) delete globalThis.document; else globalThis.document = docPrima; }
}
// 1.16.2: riattaccato, il pannello torna dove era nel mondo, anche se Foundry gli rimette la posizione di quando era staccato, prima o dopo
// lo spostamento dell'elemento
{
  const docPrima = globalThis.document;
  try {
    globalThis.document = finestra.document;
    const altrove = new jsdom.JSDOM("").window.document;
    dialogo._staccaFinto = async () => {
      dialogo.setPosition({ top: 0, left: 0 });        // Foundry, prima di spostare l'elemento
      altrove.body.appendChild(altrove.adoptNode(dialogo.element));
      dialogo._onDetach(finestra.document, altrove);
      dialogo.setPosition({ top: 5, left: 5 });        // nella finestra staccata
    };
    const giro = async () => {
      await dialogo.detachWindow();
      finestra.document.body.appendChild(finestra.document.adoptNode(dialogo.element));
      dialogo.setPosition({ top: 0, left: 0 });        // Foundry, riattaccando, prima di _onAttach
      dialogo._onAttach(altrove, finestra.document);
    };
    dialogo.setPosition({ top: 71, left: 300, width: 560 });
    await giro();
    prova("macro: riattaccato, il pannello torna alla posizione che aveva nel mondo", (dialogo.position.top === 71) && (dialogo.position.left === 300), dialogo.position);
    dialogo.setPosition({ top: 120 });
    await giro();
    prova("macro: spostato nel mondo dopo il riattacco, e staccato di nuovo: torna alla posizione nuova", (dialogo.position.top === 120) && (dialogo.position.left === 300), dialogo.position);
    // Foundry che, dopo _onAttach, rimette la posizione di quando era staccato: il secondo tentativo, al fotogramma dopo, rimette quella
    // del mondo
    const coda = [], raf0 = finestra.requestAnimationFrame;
    finestra.requestAnimationFrame = f => { coda.push(f); return coda.length; };
    try {
      await dialogo.detachWindow();
      finestra.document.body.appendChild(finestra.document.adoptNode(dialogo.element));
      dialogo._onAttach(altrove, finestra.document);
      dialogo.setPosition({ top: 0, left: 0, width: 900 });
      coda.splice(0).forEach(f => f());
    } finally { finestra.requestAnimationFrame = raf0; }
    prova("macro: Foundry rimette la posizione staccata dopo _onAttach: al fotogramma dopo torna quella del mondo", (dialogo.position.top === 120) && (dialogo.position.left === 300) && (dialogo.position.width === 560), dialogo.position);
    // un distacco che non riesce (una finestra del browser bloccata): il pannello resta nel mondo, e la posizione si segue ancora
    const stacca0 = Object.getPrototypeOf(Object.getPrototypeOf(dialogo)).detachWindow;
    Object.getPrototypeOf(Object.getPrototypeOf(dialogo)).detachWindow = async () => { throw new Error("finestra bloccata"); };
    let e = null; try { await dialogo.detachWindow(); } catch(err) { e = err.message; }
    Object.getPrototypeOf(Object.getPrototypeOf(dialogo)).detachWindow = stacca0;
    dialogo.setPosition({ top: 200, left: 40 });
    prova("macro: distacco fallito, il pannello non resta segnato come staccato e la posizione si segue", (e === "finestra bloccata") && !dialogo._gdrStaccata && (dialogo._gdrPosizione.top === 200), { e, s: dialogo._gdrStaccata, p: dialogo._gdrPosizione });
  } finally { if ( docPrima === undefined ) delete globalThis.document; else globalThis.document = docPrima; }
}
dialogo.o.buttons.find(b => b.action === "chiudi").callback(null, null, dialogo);
prova("macro: «Chiudi» chiude", dialogo.chiuso);

// --- i pin della mappa al GM (pin-mappa.mjs, dalla 1.8.3) -------------------------------------------------------------------------
{
  const { _ritocca, _conFoto } = await import("../modulo/scripts/pin-mappa.mjs");
  const SCURO = 0x6f685f;
  costruisci();
  const voce = P("pgLocanda0000001");
  const doc = (flags, src, page) => ({ flags, texture: { src }, page, label: "x", getFlag: (sc, k) => flags[sc]?.[k] });
  const piazza = d => ({ document: d, controlled: false, hover: false, tooltip: { text: "" },
    controlIcon: { bg: { visible: true }, border: { visible: false }, icon: { tint: 0xffffff }, size: 40, visible: true } });
  const coppia = src => {
    const pin = piazza(doc({ world: { wgMappa: { punto: "p1" } } }, src, voce));
    const seg = piazza(doc({ world: { wgSegnaposto: { punto: "p1", quartiere: "il-porto", nascosta: "pgLocandaGM00001" } } }, "worlds/x/icone/pin-taverna-e88a0bd3.webp", P("pgLocandaGM00001")));
    globalThis.canvas = { notes: { placeables: [pin, seg] } };
    _ritocca(pin); _ritocca(seg);
    return { pin: pin.controlIcon, seg: seg.controlIcon };
  };
  prova("pin: le foto si riconoscono, le icone del tipo no", _conFoto({ texture: { src: "worlds/mondo-prova/handout/xx-locanda-esterno.webp" } })
    && _conFoto({ texture: { src: "worlds/mondo-prova/icone/pin-foto-gallo-rosso-be6a51f8.webp" } }) && !_conFoto({ texture: { src: "worlds/mondo-prova/icone/pin-taverna-e88a0bd3.webp" } }));
  prova("pin: le icone del tipo e di Foundry non sono foto", ["pin-punto-ebb3e46f", "pin-castello-3a0d8ec3", "pin-bottega-459c6aad", "pin-tempio-9d6c8f5e"].every(x => !_conFoto({ texture: { src: `worlds/mondo-prova/icone/${x}.webp` } }))
    && !_conFoto({ texture: { src: "icons/svg/book.svg" } }) && _conFoto({ texture: { src: "worlds/mondo-prova/icone/pin-foto-taverna-cieca-141beff1.webp" } }));
  let c = coppia("icons/svg/book.svg");
  prova("pin con l'icona di Foundry, posto nascosto: come un'icona del tipo, dietro il segnaposto", !c.pin.visible && c.seg.visible);
  c = coppia("worlds/mondo-prova/handout/xx-locanda-esterno.webp");
  prova("pin con la foto, posto nascosto: al GM il pin si vede, scuro, e il segnaposto no", c.pin.visible && (c.pin.icon.tint === SCURO) && !c.seg.visible, { pin: c.pin.visible, seg: c.seg.visible });
  { const pin = piazza(doc({ world: { wgMappa: { punto: "p1" } } }, "worlds/mondo-prova/handout/xx-locanda-esterno.webp", voce));
    const seg = piazza(doc({ world: { wgSegnaposto: { punto: "p1" } } }, "worlds/x/icone/pin-taverna-e88a0bd3.webp", P("pgLocandaGM00001")));
    seg.hover = true; globalThis.canvas = { notes: { placeables: [pin, seg] } }; _ritocca(seg);
    prova("pin con la foto: il suo segnaposto sotto il mouse si vede", seg.controlIcon.visible); }
  c = coppia("worlds/mondo-prova/icone/pin-foto-gallo-rosso-be6a51f8.webp");
  prova("pin con la foto fatta apposta (pin-foto-…), posto nascosto: come una foto", c.pin.visible && !c.seg.visible);
  c = coppia("worlds/mondo-prova/icone/pin-taverna-e88a0bd3.webp");
  prova("pin con la sola icona del tipo, posto nascosto: come prima, si vede il segnaposto scuro", !c.pin.visible && c.seg.visible && (c.seg.icon.tint === SCURO));
  voce.ownership.default = 2;
  c = coppia("worlds/mondo-prova/handout/xx-locanda-esterno.webp");
  prova("pin con la foto, posto scoperto: a colori, il segnaposto solo sotto il mouse", c.pin.visible && (c.pin.icon.tint === 0xffffff) && !c.seg.visible);
  voce.ownership.default = 0;
  game.user.isGM = false;
  c = coppia("worlds/mondo-prova/handout/xx-locanda-esterno.webp");
  prova("pin, per una giocatrice: niente tinte, niente cambiato", (c.pin.icon.tint === 0xffffff) && (c.seg.icon.tint === 0xffffff) && c.pin.visible && c.seg.visible);
  game.user.isGM = true;
  // 1.9.0: una nota messa da parte dal caricatore non si disegna, salvo per il GM col livello delle note attivo, in rosso
  { const { _daParte } = await import("../modulo/scripts/pin-mappa.mjs");
    const n = piazza(doc({ world: { wgMappa: { punto: "p9" } }, "gdr-strumenti": { daParte: { carico: "xx-citta", rif: "x" } } }, "worlds/x/icone/pin-faro.webp", P("pgLocandaGM00001")));
    n.visible = true;
    globalThis.canvas = { notes: { placeables: [n], active: false } }; _ritocca(n);
    prova("nota messa da parte: il GM non la vede, col livello delle note spento", _daParte(n.document) && (n.visible === false));
    globalThis.canvas.notes.active = true; _ritocca(n);
    prova("nota messa da parte: il GM la vede in rosso col livello delle note attivo", (n.visible === true) && (n.controlIcon.icon.tint === 0xc0392b));
    game.user.isGM = false; _ritocca(n);
    prova("nota messa da parte: una giocatrice non la vede mai", n.visible === false);
    game.user.isGM = true;
    // il segnaposto di un posto non prende per gemello una nota messa da parte nello stesso punto
    const seg = piazza(doc({ world: { wgSegnaposto: { punto: "p9" } } }, "worlds/x/icone/pin-taverna-e88a0bd3.webp", P("pgLocandaGM00001")));
    globalThis.canvas = { notes: { placeables: [n, seg], active: false } }; _ritocca(seg);
    prova("nota messa da parte: non è il gemello del segnaposto", seg.controlIcon.visible && (seg.tooltip.text === "")); }
  delete globalThis.canvas;
}

// 1.18.0: un quartiere con l'immagine in testa al blocco «Visitato»: il blocco si trova
{
  const h = '<p>La riva.</p><section class="secret" id="secret-0a1"><p style="text-align: center"><img class="gdr-figura" src="worlds/x/handout/q.webp" alt=""></p><p><strong>Visitato.</strong> testo</p></section>'
    + '<section class="secret revealed" id="secret-0a2"><p><strong>Conosciuto.</strong> testo</p></section>';
  const b = blocchi(h);
  prova("quartiere con l'immagine in testa al blocco «Visitato»: «Scopri» trova il blocco", (b.Visitato?.id === "secret-0a1") && !b.Visitato.rivelato && (b.Conosciuto?.id === "secret-0a2") && b.Conosciuto.rivelato, b);
  const h2 = h.replace('<p style="text-align: center"><img', '<p style="text-align: center">testo <img');
  prova("… ma non un paragrafo con del testo prima del titolo", !blocchi(h2).Visitato, blocchi(h2));
  // 1.18.1: un salvataggio nell'editor di Foundry toglie il paragrafo intorno all'immagine
  const h3 = h.replace(/<p style="text-align: center">(<img[^>]*>)<\/p>/, "$1");
  prova("… e l'immagine senza il paragrafo, dopo un salvataggio nell'editor: il blocco si trova", (h3 !== h) && (blocchi(h3).Visitato?.id === "secret-0a1"), h3);
  const h4 = h3.replace(/(<img[^>]*>)/, "$1$1");
  prova("… anche con due immagini senza paragrafo", (h4 !== h3) && (blocchi(h4).Visitato?.id === "secret-0a1"), h4);
}

// 1.16.1: la finestra staccata, con lo spazio in più sotto i pulsanti e i pulsanti fuori vista con la finestra scorsa. Staccata:
// la classe «gdr-staccata», e il foglio di stile fa il resto. jsdom non impagina: qui si guardano la classe e gli stili in linea;
// l'impaginazione col foglio va provata in un browser vero
{
  const finto = doc => {
    const el = doc.createElement("dialog");
    el.className = "application dialog gdr-scopri";
    el.style.cssText = "left: 300px; top: 120px; height: 740px; width: 560px";
    el.innerHTML = '<header class="window-header"></header><form class="window-content"><div class="dialog-content"><div class="gdr-scopri-corpo"><p>testo</p>'
      + '<div class="gdr-scopri-lista" style="max-height:65vh;overflow-y:auto"></div></div></div><footer class="form-footer"></footer></form>';
    doc.body.appendChild(el);
    return { element: el, l: el.querySelector(".gdr-scopri-lista") };
  };
  const doc0 = globalThis.document;
  try {
    const casa = new jsdom.JSDOM("").window;
    globalThis.document = casa.document;
    const nel = finto(casa.document);
    impagina(nel);
    prova("pannello nel mondo: senza la classe, e gli stili di Foundry com'erano", !nel.element.classList.contains("gdr-staccata") && (nel.element.style.top === "120px") && (nel.element.style.height === "740px"), nel.element.style.cssText);
    const altra = new jsdom.JSDOM("").window;
    const st = finto(altra.document);
    const wc = st.element.querySelector(".window-content");
    wc.scrollTop = 200;
    impagina(st);
    prova("staccato: la classe «gdr-staccata», senza misure scritte sul pannello", st.element.classList.contains("gdr-staccata") && !st.element.style.getPropertyValue("--gdr-sopra"), st.element.className);
    prova("… la posizione e la misura di Foundry non si toccano", (st.element.style.left === "300px") && (st.element.style.height === "740px") && (st.l.style.maxHeight === "65vh"), st.element.style.cssText);
    prova("… la finestra torna in cima", wc.scrollTop === 0, wc.scrollTop);
    prova("… gli antenati del pannello nella finestra staccata segnati, per il foglio", altra.document.body.classList.contains("gdr-scopri-antenato") && altra.document.documentElement.classList.contains("gdr-scopri-antenato"));
    // il foglio di stile ha le regole della classe, fuori dalla finestra ridotta a icona
    const css = (await import("node:fs")).readFileSync(new URL("../modulo/styles/gdr-strumenti.css", import.meta.url), "utf8");
    prova("il foglio di stile: le regole di «gdr-staccata», tranne a finestra ridotta", css.includes(".gdr-scopri.gdr-staccata:not(.minimized) .gdr-scopri-lista") && css.includes("max-height: none !important") && css.includes("position: fixed !important") && css.includes(".gdr-scopri-antenato {") && css.includes(":not(p):has(> img.gdr-figura) > img.gdr-figura.gdr-figura { display: block;") && css.includes("p:has(> img.gdr-figura) > img.gdr-figura.gdr-figura { display: inline-block;") && !/\.gdr-staccata(?!:not\(\.minimized\))/.test(css));
    // riattaccato: il pannello torna nel documento della pagina
    const rientrato = casa.document.adoptNode(st.element); casa.document.body.appendChild(rientrato);
    impagina({ element: rientrato });
    prova("riattaccato: niente classe né distanza, Foundry decide posizione e misura", !rientrato.classList.contains("gdr-staccata") && !rientrato.style.getPropertyValue("--gdr-sopra") && (rientrato.style.left === "300px"), rientrato.style.cssText);
  } finally {
    if ( doc0 === undefined ) delete globalThis.document; else globalThis.document = doc0;
  }
}

// 1.18.0: lo stato lasciato dalla 1.17, un quartiere con l'immagine a Visitato sulla mappa col blocco «Visitato» chiuso (la 1.17 non lo
// trovava): incoerente, niente si scrive da solo; con «riallinea» si apre il blocco, con l'immagine al suo posto
{
  const IMG = '<p style="text-align: center"><img class="gdr-figura" src="worlds/x/handout/q.webp" alt=""></p>';
  game.scenes.clear(); game.journal.clear();
  const H = `<p>Il porto.</p><section class="secret" id="secret-0a1">${IMG}<p><strong>Visitato.</strong> t</p></section><section class="secret" id="secret-0a2"><p><strong>Conosciuto.</strong> t</p></section>`;
  const J = new Journal({ _id: "DiarioFinto00001", name: "Diario", ownership: { default: 0 }, pages: [
    { _id: "pgPorto000000001", name: "Porto", sort: 100, title: { level: 1 }, text: { content: H }, ownership: { default: 2 } } ] });
  game.journal.set(J.id, J);
  const S = new Scena({ _id: "ScenaMappa000001", name: "W", flags: { world: { wgMappa: true } } }); game.scenes.set(S.id, S);
  const t = (id, liv, hidden) => S.tiles.set(id, new (CONFIG.Tile.documentClass)({ _id: id, hidden, alpha: 1, flags: { world: { wgMappa: { quartiere: "porto", nome: "Porto", livello: liv, ordine: 1 } } } }, { parent: S }));
  t("tlS", "sentito-dire", true); t("tlV", "visitato", false);
  const Q = leggiStato(S, J);
  prova("stato della 1.17, quartiere con l'immagine a Visitato e blocco chiuso: segnato incoerente", (Q[0].livello === 2) && (Q[0].incoerente.length > 0), Q[0]);
  const p0 = pianoScopri(Q, sceltaDi(Q));
  prova("… senza «riallinea», «Applica» non scrive pagine", !p0.pagUp.length, p0.pagUp);
  const p1 = pianoScopri(Q, { ...sceltaDi(Q), "r.porto": true });
  const testo = JSON.stringify(p1.pagUp);
  prova("… con «riallinea», si apre il blocco «Visitato», con l'immagine al suo posto", testo.includes('secret revealed\\" id=\\"secret-0a1') && testo.includes("gdr-figura") && !testo.includes('secret revealed\\" id=\\"secret-0a2'), testo.slice(0, 400));
}

console.log(`\n${fatti - falliti}/${fatti} prove passate`);
if ( falliti ) process.exit(1);
