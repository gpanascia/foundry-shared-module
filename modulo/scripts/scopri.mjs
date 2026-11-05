/**
 * «Scopri» — la mappa che si compone. Il journal, il titolo e chi parla in chat vengono dalla riga della macro:
 *   game.modules.get("gdr-strumenti").api.scopri({ "journal": "<id del journal>", "titolo": "<città>", "alias": "<città>" })
 *
 * Apre un pannello con lo stato di adesso, letto dal mondo: per ogni quartiere i livelli (Sentito dire, Visitato, Conosciuto,
 * Di casa) e, sotto, i posti che hanno una voce nel journal. Si spunta o si toglie la spunta, poi «Applica»:
 *   - un quartiere a Sentito dire: il suo tassello «sentito» (contorno e nome, appena accennati), la sua pagina a Observer senza
 *     blocchi rivelati; a Visitato: il tassello del quartiere al posto di quello «sentito», e il blocco «Visitato» rivelato;
 *     a Conosciuto: anche quel blocco; a Di casa: anche quel blocco e il tassello delle scorciatoie, se c'è. I livelli si tengono
 *     in fila: spuntarne uno spunta quelli prima, toglierlo toglie quelli dopo;
 *   - un posto: la sua voce a Observer, e col permesso compare il suo pin (Foundry mostra una nota a chi vede la sua pagina).
 *     Spuntare un posto di un quartiere ancora nascosto spunta «Sentito dire» del quartiere;
 *   - togliere una spunta fa il contrario.
 * I tasselli compaiono e scompaiono in dissolvenza, in circa un secondo; una riga in chat dice alle giocatrici cosa si è aggiunto.
 * Le pagine «(solo GM)» non si toccano mai, e i posti sono le voci col segno wgVoce o di secondo livello. Il livello di partenza di
 * un quartiere è il più alto fra quello della sua pagina (i blocchi rivelati) e quello dei suoi tasselli visibili; si cambiano solo i
 * quartieri di cui si cambia una spunta, o quelli da riallineare. I segnaposto dei posti stanno sulla zona Visitata finché la voce del
 * posto non è delle giocatrici, e si riallineano a ogni «Applica». «Scopri» non cambia l'icona dei pin.
 * Mentre «Scopri» lavora, la pagina di un quartiere non va tenuta aperta in modifica: salvandola dopo, si perderebbe il blocco rivelato.
 * Quello che il modulo non sceglie: la scena è quella col segno world.wgMappa; i quartieri sono i tasselli col segno
 * world.wgMappa { quartiere, nome, livello: "sentito-dire" | "visitato" | "di-casa", ordine }; i segnaposto sono le note col segno
 * world.wgSegnaposto { punto, quartiere, nascosta } e i pin le note col segno world.wgMappa { punto }. Li mettono il caricatore o i
 * programmi che preparano la mappa, fuori da questo repository.
 * Con { prova: true, scelta: {...} } non apre il pannello e non scrive: restituisce cosa cambierebbe (le prove fuori dal mondo).
 */
const PASSI = 10, MS = 90;                             // la dissolvenza: dieci passi di trasparenza
const LIVELLI = ["Sentito dire", "Visitato", "Conosciuto", "Di casa"];
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * I nomi dei quattro livelli, dalla riga della macro (opzione livelli) o quelli predefiniti. Dal secondo al quarto sono anche i
 * titoli dei blocchi segreti della pagina del quartiere («<strong>Visitato.</strong>»), che «Scopri» rivela.
 */
export function configura(livelli = LIVELLI) {
  const nomi = Array.isArray(livelli) && (livelli.length === 4) ? livelli.map(x => (typeof x === "string") ? x.trim() : "") : [];
  if ( (nomi.length !== 4) || nomi.some(x => !x || (x.length > 40) || /[<>&"]/.test(x) || (x in Object.prototype)) || (new Set(nomi).size !== 4) ) {
    throw new Error("i livelli sono quattro nomi diversi, di al massimo 40 caratteri, senza < > & \" e non nomi riservati come constructor o toString");
  }
  const BLOCCO = { [nomi[1]]: 2, [nomi[2]]: 3, [nomi[3]]: 4 };
  // fra l'apertura del blocco e il suo titolo può stare l'immagine del quartiere, in un paragrafo suo (in testa al blocco «Visitato»),
  // o le sole immagini, se un salvataggio nell'editor ha tolto il paragrafo: senza, «Scopri» non troverebbe il blocco «Visitato» dei
  // quartieri con l'immagine
  const RE = new RegExp(`<section class="secret( revealed)?" id="(secret-[0-9a-f]+)">(?:<p[^>]*>(?:<img[^>]*>\\s*)+<\\/p>|(?:<img[^>]*>\\s*)+)?<p><strong>(${nomi.slice(1).map(escRe).join("|")})\\.<\\/strong>`, "g");
  const blocchi = h => Object.fromEntries([...(h ?? "").matchAll(RE)].map(m => [m[3], { id: m[2], rivelato: !!m[1] }]));
  return { LIVELLI: nomi, BLOCCO, blocchi };
}
const BASE = configura();
export const blocchi = BASE.blocchi;
const visibile = t => t && !t.hidden;
// una pagina messa da parte dal caricatore conta come solo GM: «Scopri» non la mostra mai
const daParte = d => !!d?.flags?.["gdr-strumenti"]?.daParte;
const soloGM = p => p.name.endsWith("(solo GM)") || daParte(p);
const esc = s => foundry.utils.escapeHTML(String(s));

/** Lo stato di adesso, letto dal mondo: i quartieri dai tasselli col segno wgMappa, le loro pagine e i posti dal journal. */
export function leggiStato(S, J, c = BASE) {
  const { BLOCCO, blocchi } = c;
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const quartieri = new Map();
  for ( const t of S.tiles ) {
    const f = t.getFlag("world", "wgMappa"); if ( !f?.quartiere ) continue;
    if ( !quartieri.has(f.quartiere) ) quartieri.set(f.quartiere, { slug: f.quartiere, nome: f.nome, ordine: f.ordine, tile: {}, posti: [] });
    const q = quartieri.get(f.quartiere); q.tile[f.livello] = t; q.ordine = Math.min(q.ordine, f.ordine);
  }
  const pagine = J.pages.contents.slice().sort((a, b) => a.sort - b.sort);
  let corrente = null;
  for ( const p of pagine ) {
    const liv = p.title?.level ?? 1;
    if ( liv === 1 ) corrente = [...quartieri.values()].find(q => q.nome === p.name) ?? null;
    if ( corrente && (liv === 1) ) corrente.pagina = p;
    // un posto: la voce col segno wgVoce o una pagina di secondo livello sotto il quartiere che non è solo GM (i personaggi stanno al terzo)
    else if ( corrente && (p.getFlag("world", "wgVoce") || (liv === 2)) && !soloGM(p) ) corrente.posti.push(p);
  }
  const livelloDi = q => {
    let n = 0;
    if ( q.pagina ) {
      const b = blocchi(q.pagina.text.content);
      if ( q.pagina.ownership.default >= L.OBSERVER ) n = 1;
      for ( const [k, v] of Object.entries(BLOCCO) ) if ( b[k]?.rivelato ) n = Math.max(n, v);
    }
    if ( visibile(q.tile["sentito-dire"]) ) n = Math.max(n, 1);
    if ( visibile(q.tile["visitato"]) ) n = Math.max(n, 2);
    if ( visibile(q.tile["di-casa"]) ) n = Math.max(n, 4);
    return n;
  };
  const Q = [...quartieri.values()].sort((a, b) => a.ordine - b.ordine);
  // quello che non torna col livello letto: si segna nel pannello, e si sistema solo con «riallinea»
  const incoerenze = q => {
    const n = q.livello, out = [];
    const t = (k, si) => { const x = q.tile[k]; if ( !x ) return; if ( x.hidden === si ) out.push(`tassello ${k} ${x.hidden ? "nascosto" : "visibile"}`);
      else if ( !x.hidden && (x.alpha !== 1) ) out.push(`tassello ${k} a metà dissolvenza`); };
    t("sentito-dire", n === 1); t("visitato", n >= 2); t("di-casa", n >= 4);
    if ( q.pagina ) {
      if ( (q.pagina.ownership.default >= L.OBSERVER) !== (n >= 1) ) out.push("pagina " + (n >= 1 ? "a None" : "visibile"));
      for ( const [k, v] of Object.entries(blocchi(q.pagina.text.content)) ) if ( v.rivelato !== (n >= BLOCCO[k]) ) out.push(`blocco «${k}» ${v.rivelato ? "rivelato" : "chiuso"}`);
    }
    return out;
  };
  for ( const q of Q ) { q.livello = livelloDi(q); q.incoerente = incoerenze(q); }
  return Q;
}

/** Cosa cambia con le spunte date: tasselli da mostrare e nascondere, pagine, righe per la chat, i livelli dopo. */
export function pianoScopri(Q, scelta, c = BASE) {
  const { LIVELLI, BLOCCO, blocchi } = c;
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const aggiunte = [], tolte = [], mostra = [], nascondi = [], pagUp = [], ripara = [], livDopo = {};
  const vuole = (t, si) => { if ( !t ) return; if ( si && t.hidden ) mostra.push(t); if ( !si && !t.hidden ) nascondi.push(t); };
  // il livello da tasselli visibili, per i quartieri che non si toccano
  const livTasselli = q => !visibile(q.tile["visitato"]) ? (visibile(q.tile["sentito-dire"]) ? 1 : 0) : (visibile(q.tile["di-casa"]) ? 4 : 2);
  for ( const q of Q ) {
    let n = 0; for ( let k = 1; k <= 4; k++ ) if ( scelta[`q.${q.slug}.${k}`] ) n = k;
    livDopo[q.slug] = ((n !== q.livello) || scelta[`r.${q.slug}`]) ? n : livTasselli(q);
    // si tocca un quartiere solo se cambia il suo livello o se si chiede di riallinearlo
    const tocca = (n !== q.livello) || scelta[`r.${q.slug}`];
    if ( tocca ) {
      for ( const t of Object.values(q.tile) ) if ( !t.hidden && (t.alpha !== 1) ) ripara.push(t);
      vuole(q.tile["sentito-dire"], n === 1);
      vuole(q.tile["visitato"], n >= 2);
      vuole(q.tile["di-casa"], n >= 4);
      if ( q.pagina ) {
        const up = { _id: q.pagina.id };
        const def = n >= 1 ? L.OBSERVER : L.NONE;
        if ( q.pagina.ownership.default !== def ) up["ownership.default"] = def;
        let h = q.pagina.text.content ?? "";
        for ( const [k, v] of Object.entries(blocchi(h)) ) {
          const si = n >= BLOCCO[k];
          if ( si !== v.rivelato ) h = h.replace(`<section class="secret${v.rivelato ? " revealed" : ""}" id="${v.id}">`, `<section class="secret${si ? " revealed" : ""}" id="${v.id}">`);
        }
        if ( h !== q.pagina.text.content ) up["text.content"] = h;
        if ( Object.keys(up).length > 1 ) pagUp.push(up);
      }
    }
    if ( n > q.livello ) aggiunte.push(n === 1 ? `${q.nome}, ne avete sentito parlare` : `${q.nome}, ${LIVELLI[n - 1].toLowerCase()}`);
    if ( n < q.livello ) tolte.push(`${q.nome}: da ${LIVELLI[q.livello - 1]} a ${n ? LIVELLI[n - 1] : "nascosto"}`);
    for ( const p of q.posti ) {
      const si = !!scelta[`p.${p.id}`], era = p.ownership.default >= L.OBSERVER;
      if ( si === era ) continue;
      pagUp.push({ _id: p.id, "ownership.default": si ? L.OBSERVER : L.NONE });
      (si ? aggiunte : tolte).push(p.name);
    }
  }
  return { aggiunte, tolte, mostra, nascondi, ripara, pagUp, livDopo };
}

/**
 * I segnaposto: visibili sulla zona Visitata finché la voce del posto non è delle giocatrici. Visibile, la nota
 * apre la pagina del quartiere; nascosta, la pagina solo GM del posto (segno wgSegnaposto.nascosta), con la tinta scura. Gli
 * aggiornamenti delle note, e gli avvisi per i segnaposto senza la loro pagina solo GM. Si calcolano dopo le pagine.
 */
export function pianoSegnaposti(S, J, Q, livDopo, dopo = new Map()) {
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  // nella prova le pagine non sono ancora scritte: per quelle che «Applica» cambierebbe, il permesso di default che avrebbero dopo
  // (dopo: id della pagina → default). Come in Foundry: il permesso della giocatrice sulla pagina, se c'è; INHERIT porta al journal
  const vede = (pg, u) => {
    if ( !dopo.has(pg.id) ) return pg.testUserPermission(u, "LIMITED");
    const lv = pg.ownership?.[u.id];
    if ( lv === L.INHERIT ) return pg.parent?.testUserPermission(u, "LIMITED") ?? false;
    return ((lv === undefined) ? dopo.get(pg.id) : lv) >= L.LIMITED;
  };
  const up = [], avvisi = [];
  for ( const n of S.notes ) {
    const f = n.getFlag("world", "wgSegnaposto"); if ( !f?.nascosta || daParte(n) ) continue;
    // la pagina nascosta deve esserci ed essere solo GM: senza, la nota ricadrebbe sul journal, che vedono tutte
    const pn = J.pages.get(f.nascosta);
    if ( !pn || !soloGM(pn) ) { avvisi.push(`il segnaposto «${n.text}» (punto ${f.punto}) non ha la sua pagina solo GM: lasciato com'è`); continue; }
    const pin = S.notes.find(x => (x.getFlag("world", "wgMappa")?.punto === f.punto) && !daParte(x));
    const pg = pin?.pageId ? J.pages.get(pin.pageId) : null;
    // la voce si vede, e con lei il pin, se una giocatrice la vede almeno a LIMITED, come fa Foundry
    const voce = !!pg && !soloGM(pg) && game.users.some(u => !u.isGM && vede(pg, u));
    const mostra = ((livDopo[f.quartiere] ?? 0) >= 2) && !voce;
    // visibile, apre la pagina del quartiere, o il journal se la zona non ne ha una
    const qp = Q.find(q => q.slug === f.quartiere)?.pagina?.id ?? null;
    const vuole = mostra ? qp : f.nascosta, tinta = mostra ? "#ffffff" : "#8a7f70";     // scuro, nascosto: lo vede solo il GM
    if ( ((n.pageId ?? null) !== vuole) || (n.texture.tint?.css ?? String(n.texture.tint)) !== tinta ) up.push({ _id: n.id, pageId: vuole, "texture.tint": tinta });
  }
  return { up, avvisi };
}

/** «Applica»: la dissolvenza, le pagine (e coi permessi i pin), i segnaposto, le righe in chat. */
async function applica(S, J, Q, scelta, opz) {
  if ( !game.user.isGM ) throw new Error("«Scopri» è del GM");
  const p = pianoScopri(Q, scelta, opz.c);
  const allineaSegnaposti = async () => {
    const { up, avvisi } = pianoSegnaposti(S, J, Q, p.livDopo);
    for ( const a of avvisi ) ui.notifications.warn(esc(`«Scopri»: ${a}`));
    if ( up.length ) await S.updateEmbeddedDocuments("Note", up);
    return up.length;
  };
  if ( !p.pagUp.length && !p.mostra.length && !p.nascondi.length && !p.ripara.length ) {
    const k = await allineaSegnaposti();
    ui.notifications.info(k ? `«Scopri»: ${k} segnaposto riallineati.` : "«Scopri»: niente da cambiare.");
    return;
  }
  // se la dissolvenza si interrompe, nel finally ogni tassello va al suo stato finale ad alfa 1, e poi le pagine
  const aspetta = ms => new Promise(r => setTimeout(r, ms));
  try {
    if ( p.mostra.length || p.nascondi.length ) {
      if ( p.mostra.length ) await S.updateEmbeddedDocuments("Tile", p.mostra.map(t => ({ _id: t.id, hidden: false, alpha: 0 })));
      for ( let i = 1; i < PASSI; i++ ) {
        await aspetta(opz.ms ?? MS);
        const a = Math.round((i / PASSI) * 100) / 100;
        await S.updateEmbeddedDocuments("Tile", [...p.mostra.map(t => ({ _id: t.id, alpha: a })), ...p.nascondi.map(t => ({ _id: t.id, alpha: 1 - a }))]);
      }
      await aspetta(opz.ms ?? MS);
    }
  } finally {
    // visibile ad alfa 1; nascosto ad alfa 1, che il GM vede a metà trasparenza e le giocatrici non vedono
    const fine = [...p.mostra.map(t => ({ _id: t.id, hidden: false, alpha: 1 })), ...p.nascondi.map(t => ({ _id: t.id, hidden: true, alpha: 1 })),
      ...p.ripara.filter(t => !p.mostra.includes(t) && !p.nascondi.includes(t)).map(t => ({ _id: t.id, alpha: 1 }))];
    if ( fine.length ) await S.updateEmbeddedDocuments("Tile", fine);
    try { if ( p.pagUp.length ) await J.updateEmbeddedDocuments("JournalEntryPage", p.pagUp); }
    finally { await allineaSegnaposti(); }                  // anche se le pagine falliscono
  }
  if ( p.aggiunte.length ) await ChatMessage.create({ speaker: { alias: opz.alias }, content: `<p><strong>Sulla mappa e nel Diario</strong>: ${p.aggiunte.map(esc).join("; ")}.</p>` });
  if ( p.tolte.length ) await ChatMessage.create({ speaker: { alias: "Scopri" }, whisper: [game.user.id], content: `<p><strong>Nascosto di nuovo</strong>: ${p.tolte.map(esc).join("; ")}.</p>` });
}

// --- il pannello --------------------------------------------------------------------------------------------------------------------
const LAB = 'style="display:inline-flex;align-items:center;gap:.25em;width:auto;flex:0 0 auto;margin:0 .9em .15em 0;white-space:nowrap"';
function pannello(Q, c) {
  const { LIVELLI, blocchi } = c;
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const righe = Q.map(q => {
    const caselle = LIVELLI.map((nome, i) => {
      const n = i + 1;
      const senza = (n >= 3 && !q.pagina) || (n === 4 && !q.tile["di-casa"] && !blocchi(q.pagina?.text.content)[LIVELLI[3]]);
      return `<label ${LAB}><input type="checkbox" name="q.${esc(q.slug)}.${n}" data-q="${esc(q.slug)}" data-n="${n}"
        ${q.livello >= n ? "checked" : ""} ${senza ? "disabled" : ""}> ${nome}</label>`;
    }).join("");
    const posti = q.posti.length ? `<div style="display:grid;grid-template-columns:1fr 1fr;margin:.2em 0 0 1em;border-top:1px dashed #8886;padding-top:.2em">${q.posti.map(p => `<label ${LAB}><input type="checkbox" name="p.${p.id}" data-posto-di="${esc(q.slug)}"
        ${p.ownership.default >= L.OBSERVER ? "checked" : ""}> ${esc(p.name)}</label>`).join("")}</div>` : "";
    const nota = q.pagina ? "" : ` <span style="opacity:.6">(nel Diario non ha ancora una pagina)</span>`;
    const riall = q.incoerente.length ? `<label style="display:block;color:#a33"><input type="checkbox" name="r.${esc(q.slug)}"> riallinea al livello spuntato
        (adesso: ${esc(q.incoerente.join(", "))})</label>` : "";
    return `<fieldset style="margin:0 0 .4em;padding:.2em .6em .4em"><legend><strong>${esc(q.nome)}</strong>${nota}</legend><div style="display:flex;flex-wrap:wrap">${caselle}</div>${riall}${posti}</fieldset>`;
  }).join("");
  // gli stili stanno sugli elementi: Foundry toglie i <style> dal contenuto dei dialoghi
  return `<p style="margin-top:0">Lo stato di adesso. Spunta quello che le giocatrici devono vedere, togli la spunta a quello da nascondere.</p>
  <div class="gdr-scopri-lista" style="max-height:65vh;overflow-y:auto">${righe}</div>`;
}

// i legami fra le caselle: i livelli in fila, il quartiere che si porta via i suoi posti, il posto che porta «Sentito dire»
function collega(el) {
  const sel = x => (globalThis.CSS?.escape ?? (y => y.replace(/["\\]/g, "\\$&")))(x);
  el.querySelectorAll("input[data-q]").forEach(i => i.addEventListener("change", () => {
    const n = Number(i.dataset.n);
    el.querySelectorAll(`input[data-q="${sel(i.dataset.q)}"]`).forEach(j => {
      if ( j.disabled ) return;
      const m = Number(j.dataset.n);
      if ( i.checked && (m < n) ) j.checked = true;
      if ( !i.checked && (m > n) ) j.checked = false;
    });
    if ( !i.checked && (n === 1) ) el.querySelectorAll(`input[data-posto-di="${sel(i.dataset.q)}"]`).forEach(j => { j.checked = false; });
  }));
  el.querySelectorAll("input[data-posto-di]").forEach(i => i.addEventListener("change", () => {
    const lv = [...el.querySelectorAll(`input[data-q="${sel(i.dataset.postoDi)}"]`)];
    if ( i.checked && !lv.some(j => j.checked) && lv[0] ) lv[0].checked = true;
  }));
}

/** Le spunte dello stato di adesso, come le mostra il pannello quando si apre: la base su cui la prova mette le sue. */
export function sceltaDi(Q) {
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS, out = {};
  for ( const q of Q ) {
    for ( let n = 1; n <= 4; n++ ) out[`q.${q.slug}.${n}`] = q.livello >= n;
    for ( const p of q.posti ) out[`p.${p.id}`] = p.ownership.default >= L.OBSERVER;
  }
  return out;
}

/**
 * «Scopri». opzioni, dalla riga della macro: journal (l'id del journal coi quartieri e i posti, obbligatorio), titolo (nel titolo
 * del pannello), alias (chi parla in chat alle giocatrici; se manca, il titolo), livelli (i nomi dei quattro livelli; se mancano,
 * quelli predefiniti). Per le prove: prova e scelta (senza pannello e senza scrivere: restituisce cosa cambierebbe con le spunte di
 * adesso più quelle di scelta, per esempio { "q.porto.2": true }).
 */
export async function scopri(opzioni = {}) {
  const o = (opzioni && (typeof opzioni === "object") && !Array.isArray(opzioni)) ? opzioni : {};
  if ( !game.user.isGM ) return ui.notifications.warn("«Scopri» è del GM.");
  if ( !/^[A-Za-z0-9]{16}$/.test(o.journal ?? "") ) return ui.notifications.error("«Scopri»: nella macro manca l'id del journal (journal).");
  let c;
  try { c = (o.livelli === undefined) ? BASE : configura(o.livelli); }
  catch(err) { return ui.notifications.error(esc(`«Scopri», nella macro: ${err.message}.`)); }
  const titolo = String(o.titolo ?? "la mappa").slice(0, 80), alias = String(o.alias ?? o.titolo ?? "Scopri").slice(0, 80);
  const S = game.scenes.find(s => s.getFlag("world", "wgMappa"));
  const J = game.journal.get(o.journal);
  if ( !S || !J ) return ui.notifications.error(esc(`«Scopri»: ${!S ? "la scena della mappa (segno wgMappa)" : "il journal della macro"} non c'è.`));
  if ( o.prova ) {
    const Q = leggiStato(S, J, c);
    const p = pianoScopri(Q, { ...sceltaDi(Q), ...(o.scelta ?? {}) }, c);
    const dopo = new Map(p.pagUp.filter(u => "ownership.default" in u).map(u => [u._id, u["ownership.default"]]));
    const s = pianoSegnaposti(S, J, Q, p.livDopo, dopo);
    return { quartieri: Q.map(q => ({ slug: q.slug, nome: q.nome, livello: q.livello, incoerente: q.incoerente, posti: q.posti.map(x => x.name) })),
      mostra: p.mostra.map(t => t.id), nascondi: p.nascondi.map(t => t.id), ripara: p.ripara.map(t => t.id), pagine: p.pagUp,
      aggiunte: p.aggiunte, tolte: p.tolte, segnaposti: s.up, avvisi: s.avvisi };
  }
  // il pannello resta aperto dopo «Applica» e si aggiorna; si chiude con «Chiudi» o con la croce
  let Q = leggiStato(S, J, c);
  const leggiScelta = el => Object.fromEntries([...el.querySelectorAll("input[type=checkbox]")].map(i => [i.name, i.checked]));
  // staccata in una finestra sua (V14, «Detach»): impagina, sotto
  // Se il distacco ridisegna la finestra, il contenuto tornerebbe quello dell'apertura, senza i legami fra le caselle: ogni disegno
  // che trova il pannello senza il segno «collegato» lo rifà con lo stato di adesso
  class FinestraScopri extends foundry.applications.api.DialogV2 {
    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const corpo = this.element?.querySelector(".gdr-scopri-corpo");
      if ( corpo && !corpo.dataset.gdrCollegato ) {
        if ( this._gdrDisegnato ) corpo.innerHTML = pannello(Q, c);
        collega(corpo); corpo.dataset.gdrCollegato = "1";
      }
      this._gdrDisegnato = true;
      impagina(this);
    }
    // e un'altra volta dopo il primo disegno della finestra nuova, se il suo stile sposta il pannello
    _onDetach(from, to) { super._onDetach?.(from, to); this._gdrStaccata = true; impagina(this); to?.defaultView?.requestAnimationFrame?.(() => impagina(this)); }
    // la posizione nel mondo: riattaccato, Foundry gli lascerebbe quella di quando era staccato, in cima; si tiene a ogni spostamento
    // nel mondo e si rimette al riattacco
    setPosition(pos) {
      const r = super.setPosition(pos);
      // solo nel mondo, e non mentre si riattacca (Foundry può rimettere la posizione di quando era staccato prima di _onAttach)
      if ( !this._gdrStaccata && (this.element?.ownerDocument === globalThis.document) ) {
        const { top, left, width, height } = this.position ?? {};
        if ( Number.isFinite(top) && Number.isFinite(left) ) this._gdrPosizione = { top, left, width, height };
      }
      return r;
    }
    // la posizione si fissa anche prima di staccare, nel metodo pubblico: se Foundry rimettesse la posizione prima di spostare l'elemento,
    // la guardia di setPosition non basterebbe
    // anche larghezza e altezza, che la finestra staccata potrebbe lasciare nella posizione
    async detachWindow(o) {
      const { top, left, width, height } = this.position ?? {};
      if ( !this._gdrStaccata && Number.isFinite(top) && Number.isFinite(left) ) this._gdrPosizione = { top, left, width, height };
      this._gdrStaccata = true;
      try { return await super.detachWindow(o); }
      finally {
        // se il distacco non è riuscito (una finestra bloccata), il pannello è ancora nel mondo
        if ( this.element?.ownerDocument === globalThis.document ) this._gdrStaccata = false;
      }
    }
    _onAttach(from, to) {
      super._onAttach?.(from, to); impagina(this);
      this._gdrStaccata = false;
      // la posizione del mondo fissata adesso: se Foundry rimettesse dopo _onAttach quella di quando era staccato, setPosition la
      // registrerebbe, e il secondo tentativo la rileggerebbe
      const salvata = this._gdrPosizione;
      const rimetti = () => { if ( salvata ) { try { this.setPosition(Object.fromEntries(Object.entries(salvata).filter(([, v]) => (v !== undefined) && (v !== null)))); } catch(err) { console.warn("gdr-strumenti, «Scopri» riattaccato:", err); } } };
      // subito, e un'altra volta al fotogramma dopo, se Foundry rimettesse la sua posizione dopo _onAttach
      rimetti(); to?.defaultView?.requestAnimationFrame?.(rimetti);
    }
  }
  const d = await new FinestraScopri({
    window: { title: `Scopri — ${titolo}` }, classes: ["gdr-scopri"], position: { width: 560 }, form: { closeOnSubmit: false },
    content: `<div class="gdr-scopri-corpo">${pannello(Q, c)}</div>`,
    buttons: [
      { action: "applica", label: "Applica", icon: "fa-solid fa-map", default: true, callback: async (event, button, dialog) => {
        const corpo = dialog.element.querySelector(".gdr-scopri-corpo");
        try { await applica(S, J, Q, leggiScelta(corpo), { alias, c }); }
        catch(err) { ui.notifications.error(esc(`«Scopri»: ${err.message}`)); console.error(err); }
        // il pannello si rifà con lo stato nuovo, e resta al punto dove era invece di tornare in cima: la posizione della lista e della
        // finestra si legge prima e si rimette dopo
        const finestra = corpo.closest(".window-content");
        const y = corpo.querySelector(".gdr-scopri-lista")?.scrollTop ?? 0, yf = finestra?.scrollTop ?? 0;
        Q = leggiStato(S, J, c); corpo.innerHTML = pannello(Q, c); collega(corpo);
        const lista = corpo.querySelector(".gdr-scopri-lista");
        impagina(dialog);
        if ( lista ) lista.scrollTop = y;
        // staccata si scorre solo la lista: la finestra resta in cima, coi pulsanti in vista
        if ( finestra && (dialog.element.ownerDocument === globalThis.document) ) finestra.scrollTop = yf;
        return "applica";
      } },
      { action: "chiudi", label: "Chiudi", icon: "fa-solid fa-xmark", callback: (event, button, dialog) => { dialog.close(); return "chiudi"; } }
    ]
  }).render({ force: true });
  // senza _onRender (le prove, o una versione che non lo chiama): i legami si mettono qui
  const corpo = d.element?.querySelector(".gdr-scopri-corpo");
  if ( corpo && !corpo.dataset.gdrCollegato ) { collega(corpo); corpo.dataset.gdrCollegato = "1"; }
}

/**
 * Il pannello staccato in una finestra sua. Staccato, il pannello porta la classe «gdr-staccata» e il foglio di stile del modulo
 * lo fa una colonna ancorata ai bordi della finestra: la lista prende lo spazio che resta e scorre lei, i pulsanti stanno in fondo
 * (styles/gdr-strumenti.css, «Scopri staccato»). Le regole sono nel foglio, non sugli elementi: la posizione e la misura che Foundry
 * scrive sul pannello restano sue, e al riattacco basta togliere la classe. Nel mondo, la classe si toglie.
 */
export function impagina(app) {
  const el = app?.element, doc = el?.ownerDocument;
  if ( !el?.classList ) return;
  const staccata = !!doc && (doc !== globalThis.document);
  // gli antenati del pannello nella finestra staccata portano «gdr-scopri-antenato»: il foglio toglie loro le trasformazioni che legherebbero
  // il pannello al loro contenitore (una classe e non :has(), che costerebbe su ogni elemento di ogni pagina)
  const antenati = on => { for ( let n = el.parentElement; n; n = n.parentElement ) n.classList?.toggle("gdr-scopri-antenato", on); };
  if ( !staccata ) { el.classList.remove("gdr-staccata"); el.style.removeProperty("--gdr-sopra"); antenati(false); return; }
  antenati(true);
  // la finestra e la sua pagina tornano in cima: si scorre solo la lista
  if ( doc.scrollingElement ) doc.scrollingElement.scrollTop = 0;
  for ( let n = el.querySelector(".gdr-scopri-lista")?.parentElement; n && (n !== el.parentElement); n = n.parentElement ) n.scrollTop = 0;
  // il foglio di stile ancora il pannello ai bordi della finestra (position: fixed): niente misure
  el.classList.add("gdr-staccata");
}

// per le prove fuori dal mondo: «Applica» senza pannello, con la dissolvenza senza attese; scelta come nella prova
export async function _applica(S, J, scelta, opz = {}) {
  const c = opz.c ?? BASE, Q = leggiStato(S, J, c);
  return applica(S, J, Q, { ...sceltaDi(Q), ...scelta }, { alias: "prova", ms: 0, ...opz, c });
}

// per le prove: il pannello e i legami fra le caselle
export { pannello as _pannello, collega as _collega };
