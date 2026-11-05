/**
 * Sincronizza oggetti (catalogo → copie sulle schede), una sola per tutti i mondi
 * -------------------------------------------------------------------------------
 * Nata dall'unione di due macro di mondi diversi: quello che cambia da un mondo all'altro sta nelle opzioni, scritte nella
 * macro di una riga del mondo (README.md, «Le macro dei mondi»).
 *
 * Foundry non lega le copie sulle schede all'oggetto da cui vengono: se cambi un oggetto del catalogo, le schede
 * restano com'erano. Questa funzione porta la DEFINIZIONE dell'oggetto del catalogo (nome, immagine, descrizione,
 * attività, usi massimi, proprietà, prezzo, peso, rarità, sintonia, effetti attivi…) su ogni copia con lo stesso
 * nome e tipo, e CONSERVA lo STATO del personaggio (quantità, equipaggiato, sintonizzato, identificato, contenitore,
 * usi spesi, preparazione degli incantesimi, livelli di classe, advancement, effetti accesi o spenti). Classe,
 * sottoclasse, specie e background: solo la descrizione. Si saltano, e l'anteprima lo dice, le copie con un
 * incantamento messo da un'altra fonte, quelle col collegamento illeggibile e quelle collegate a un oggetto diverso
 * da quello del loro nome; si saltano in silenzio gli incantesimi generati da un'attività «Lancia».
 *
 * Una copia con il flag `<prefisso>NoSync` viene saltata. Al primo allineamento ogni copia riceve
 * `<prefisso>TemplateUuid`, così un nome cambiato nel catalogo non rompe l'abbinamento; un oggetto non
 * identificato si abbina per nome vero (mai quello da non identificato). Le note scritte nella descrizione di una copia non marcata vengono
 * sovrascritte. Se due oggetti del catalogo hanno lo stesso nome e tipo, quel nome abbina solo col collegamento
 * salvato, e l'anteprima lo dice. Se le copie sono più aggiornate del catalogo, «Applica» le riporta indietro:
 * prima si guarda l'anteprima.
 *
 * Opzioni:
 *   prefisso        nome dei flag (world.<prefisso>NoSync, world.<prefisso>TemplateUuid); si tiene quello già usato
 *                   nel mondo, così i collegamenti fatti restano validi. Obbligatorio.
 *   cartelle        nomi delle cartelle Oggetti del catalogo (con le sottocartelle); se manca, tutti gli oggetti del mondo.
 *   compendi        id dei compendi da aggiungere al catalogo; a parità di nome e tipo vince il compendio. Quelli che
 *                   non ci sono si saltano, e l'anteprima lo dice.
 *   cartelleAttori  nomi delle cartelle Attori delle schede da allineare (con le sottocartelle); se manca, tutti gli attori.
 *   sottocartelle   false: solo la cartella esatta. Predefinito true.
 *   titolo          titolo della finestra.
 *   prova           true: mostra l'anteprima e restituisce il piano, senza scrivere niente.
 */
const STRUTTURALI = new Set(["class", "subclass", "race", "background"]);
// stato del personaggio da conservare (percorsi dentro system)
const TIENI = ["quantity", "equipped", "attuned", "identified", "container", "uses.spent", "uses.value", "prepared", "method", "sourceClass", "sourceItem", "proficient", "levels", "hd", "hp.value", "advancement"];

// il system da scrivere sulla copia: definizione dal catalogo, stato dalla copia (classe, specie, background: solo la descrizione)
const sistemaDa = (src, cur, tipo) => {
  const U = foundry.utils;
  if (STRUTTURALI.has(tipo)) {
    const system = U.deepClone(cur.system);
    system.description = U.deepClone(src.system.description);
    return system;
  }
  const system = U.deepClone(src.system);
  for (const p of TIENI) { const v = U.getProperty(cur.system, p); if (v !== undefined) U.setProperty(system, p, v); }
  // usi spesi a livello di singola attività (stessi id fra catalogo e copia)
  for (const [aid, act] of Object.entries(system.activities ?? {})) { const spent = cur.system.activities?.[aid]?.uses?.spent; if (act.uses && spent !== undefined) act.uses.spent = spent; }
  return system;
};
// un incantamento messo sulla copia da un'altra fonte (Arma magica, Patto della lama…): «Applica» lo cancellerebbe
const incantata = it => it.effects.some(e => e.isAppliedEnchantment === true
  || (e.isAppliedEnchantment === undefined && e.type === "enchantment" && !!e.origin && e.origin !== it.uuid));

// una cartella o una delle sue cartelle madri è fra quelle scelte
const dentro = (cartella, ids, sotto = true) => { for (let f = cartella; f; f = sotto ? f.folder : null) if (ids.has(f.id)) return true; return false; };

export async function sincronizzaOggetti(scope = {}) {
  const U = foundry.utils;
  const esc = U.escapeHTML;
  const PROVA = scope?.prova === true;
  const titolo = String(scope?.titolo ?? "Sincronizza oggetti");
  const prefisso = scope?.prefisso;
  const SOTTO = scope?.sottocartelle !== false;
  const ferma = (testo, tipo = "warn") => { ui.notifications[tipo](esc(testo)); return PROVA ? { esito: testo } : undefined; };
  if (!game.user.isGM) return ferma("Serve un utente con ruolo Gamemaster.", "error");
  if (typeof prefisso !== "string" || !/^[a-z][a-zA-Z0-9]*$/.test(prefisso)) return ferma("Opzione «prefisso» mancante o non valida (es. «xx»).", "error");
  const FLAG_NO = `${prefisso}NoSync`;
  const FLAG_T = `${prefisso}TemplateUuid`;
  const elenchi = {};
  for (const nome of ["cartelle", "compendi", "cartelleAttori"]) {
    const v = scope?.[nome];
    if (v === undefined) continue;
    if (!Array.isArray(v) || !v.length || v.some(x => typeof x !== "string" || !x)) return ferma(`Opzione «${nome}»: serve un elenco di nomi, es. ["Catalogo · Oggetti"].`, "error");
    elenchi[nome] = [...new Set(v)];
  }
  const note = [];

  // catalogo: oggetti del mondo (tutti, o quelli delle cartelle scelte) più i compendi scelti
  let cartelleIds = null;
  if (elenchi.cartelle) {
    const trovate = game.folders.filter(f => f.type === "Item" && elenchi.cartelle.includes(f.name));
    const mancanti = elenchi.cartelle.filter(n => !trovate.some(f => f.name === n));
    if (!trovate.length) return ferma(`Cartella Oggetti non trovata: ${elenchi.cartelle.join(", ")}.`, "error");
    if (mancanti.length) note.push(`Cartelle Oggetti non trovate, saltate: ${mancanti.join(", ")}.`);
    cartelleIds = new Set(trovate.map(f => f.id));
  }
  const compendi = [];
  for (const id of elenchi.compendi ?? []) {
    const pack = game.packs.get(id);
    if (!pack) { note.push(`Compendio «${id}» non trovato, saltato.`); continue; }
    if (pack.documentName !== "Item") { note.push(`Il compendio «${id}» non contiene oggetti, saltato.`); continue; }
    compendi.push(pack);
  }
  const packIds = new Set(compendi.map(p => p.collection));
  const packDocs = (await Promise.all(compendi.map(p => p.getDocuments()))).flat();
  const delMondo = game.items.filter(i => !cartelleIds || dentro(i.folder, cartelleIds, SOTTO));
  const templates = [...delMondo, ...packDocs];
  if (!templates.length) return ferma("Nessun oggetto nel catalogo.", "error");
  const isTemplate = t => !!t && t.documentName === "Item" && !t.parent
    && (t.pack ? packIds.has(t.pack) : (!cartelleIds || dentro(t.folder, cartelleIds, SOTTO)));

  // chiavi per tipo e nome vero (mai quello da non identificato); un nome doppio non abbina per nome
  const byKey = new Map(), dup = new Set();
  for (const t of templates) for (const n of [t._source?.name].filter(Boolean)) {
    const k = `${t.type}|${n}`, prev = byKey.get(k);
    if (!prev || prev === t) { byKey.set(k, t); continue; }
    if (t.pack && !prev.pack) { byKey.set(k, t); dup.delete(k); continue; } // a parità di nome e tipo vince il compendio
    if (!t.pack && prev.pack) continue;
    dup.add(k);
  }
  for (const k of dup) byKey.delete(k);

  // schede: tutti gli attori, o quelli delle cartelle scelte
  let attori = game.actors.contents;
  if (elenchi.cartelleAttori) {
    const trovate = game.folders.filter(f => f.type === "Actor" && elenchi.cartelleAttori.includes(f.name));
    const mancanti = elenchi.cartelleAttori.filter(n => !trovate.some(f => f.name === n));
    if (!trovate.length) return ferma(`Cartella Attori non trovata: ${elenchi.cartelleAttori.join(", ")}.`, "error");
    if (mancanti.length) note.push(`Cartelle Attori non trovate, saltate: ${mancanti.join(", ")}.`);
    const ids = new Set(trovate.map(f => f.id));
    attori = attori.filter(a => dentro(a.folder, ids, SOTTO));
  }

  // firma degli effetti dai dati sorgente (toObject): i campi derivati (_stats, _id) differiscono sempre fra copie,
  // e in Foundry 14 anche l'_id di ogni riga di changes (sia in changes sia in system.changes): si tolgono.
  // «disabled» non entra: acceso o spento è stato del personaggio, e «Applica» lo conserva
  const noIds = arr => Array.isArray(arr) ? arr.map(({ _id, ...rest }) => rest) : arr;
  const effSig = doc => doc.effects.map(e => { const o = e.toObject(); const sys = o.system && typeof o.system === "object" ? { ...o.system, changes: noIds(o.system.changes) } : o.system; return JSON.stringify({ n: o.name, c: noIds(o.changes), t: o.transfer, d: o.duration, s: o.statuses, img: o.img, sys, desc: o.description, tint: o.tint, em: o.flags?.effectmacro ?? null }); }).sort();
  const vuoto = v => v === undefined || v === null || v === "";

  const plan = [];
  for (const a of attori) for (const it of a.items) {
    if (it.getFlag("world", FLAG_NO)) continue;
    if (it.getFlag("dnd5e", "cachedFor")) continue;   // incantesimo generato da un'attività «Lancia»: lo gestisce dnd5e
    let t = null;
    const fl = it.getFlag("world", FLAG_T);
    if (fl) { try { t = await fromUuid(fl); } catch { note.push(`Collegamento illeggibile su «${it._source.name}» di ${a.name}: saltata.`); continue; } }
    if (!isTemplate(t) || t.type !== it.type) t = null;
    const perNome = byKey.get(`${it.type}|${it._source.name}`) ?? null;
    if (t && perNome && perNome !== t) { note.push(`«${it._source.name}» di ${a.name}: collegata a «${t._source.name}», ma il nome è di un altro oggetto del catalogo; saltata.`); continue; }
    const via = t ? "collegamento" : "nome";
    t ??= perNome;
    if (!t) continue;

    if (incantata(it)) { note.push(`«${it._source.name}» di ${a.name}: ha un incantamento messo da un'altra fonte; saltata.`); continue; }

    const src = t.toObject();
    const cur = it.toObject();
    const system = sistemaDa(src, cur, it.type);
    const data = { name: src.name, img: src.img, system };
    const d1 = U.flattenObject(U.diffObject(cur.system, system));
    const d2 = U.flattenObject(U.diffObject(system, cur.system));
    // un campo vuoto da una parte e assente dall'altra non è una differenza
    const keys = [...new Set([...Object.keys(d1), ...Object.keys(d2)])].filter(k => !(vuoto(U.getProperty(cur.system, k)) && vuoto(U.getProperty(system, k)))).map(k => "system." + k);
    if (cur.name !== data.name) keys.push("name");
    if (cur.img !== data.img) keys.push("img");
    const effChanged = !STRUTTURALI.has(it.type) && JSON.stringify(effSig(it)) !== JSON.stringify(effSig(t));
    if (effChanged) keys.push("effects");
    const needsFlag = fl !== t.uuid;
    if (keys.length || needsFlag) plan.push({ a, it, t, data, keys, effChanged, needsFlag, via, fl });
  }

  const rows = plan.filter(p => p.keys.length);
  const soloCollegare = plan.length - rows.length;
  const tabella = rows.length
    ? `<p>${rows.length} copie da aggiornare${soloCollegare ? ` (+${soloCollegare} solo da collegare al catalogo)` : ""}:</p><table style="font-size:12px"><tr><th>Scheda</th><th>Oggetto</th><th>Campi</th></tr>` +
      rows.map(p => `<tr><td>${esc(p.a.name)}</td><td>${esc(p.it.name)}</td><td>${esc(p.keys.slice(0, 6).join(", "))}${p.keys.length > 6 ? ` …(+${p.keys.length - 6})` : ""}</td></tr>`).join("") + `</table>`
    : `<p>Tutte le copie sono allineate al catalogo${soloCollegare ? ` (${soloCollegare} da collegare al catalogo)` : ""}.</p>`;
  const avvisi = [
    ...note,
    ...(dup.size ? [`Nomi doppi nel catalogo, abbinati solo col collegamento salvato: ${[...dup].map(k => k.split("|").slice(1).join("|")).join(", ")}.`] : [])
  ].map(n => `<p>${esc(n)}</p>`).join("");

  const riepilogo = () => ({
    daAggiornare: rows.map(p => ({ scheda: p.a.name, oggetto: p.it._source.name, copia: p.it.uuid, catalogo: p.t.uuid, via: p.via, collegamentoPrima: p.fl ?? null, campi: p.keys })),
    soloDaCollegare: plan.filter(p => !p.keys.length).map(p => ({ scheda: p.a.name, oggetto: p.it._source.name, copia: p.it.uuid, catalogo: p.t.uuid, collegamentoPrima: p.fl ?? null })),
    doppi: [...dup],
    note
  });
  if (PROVA) {
    await foundry.applications.api.DialogV2.prompt({
      window: { title: `PROVA · ${titolo} — anteprima (non scrive niente)` },
      content: avvisi + tabella,
      ok: { label: "Chiudi" }, rejectClose: false
    });
    return { esito: "prova: niente scritto", ...riepilogo() };
  }

  const applica = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${titolo} — anteprima` },
    content: avvisi + tabella,
    yes: { label: plan.length ? "Applica" : "Ok" }, no: { label: "Annulla" }, rejectClose: false
  });
  if (!applica || !plan.length) return;

  let n = 0, collegate = 0;
  const errori = [];
  for (const p of plan) {
    try {
    if (p.keys.length) {
      // system completo → recursive:false sostituisce SOLO le chiavi passate (name, img, system, flags); _stats resta.
      // I flag si passano interi, col collegamento dentro: dnd5e aggiunge flags.dnd5e.riders a ogni aggiornamento, e con
      // recursive:false quel flags parziale sostituirebbe tutti i flag della copia, collegamento compreso (Foundry 14, dnd5e 6.0.3)
      // lo stato si rilegge adesso: usi o quantità cambiati mentre l'anteprima era aperta non tornano indietro
      const ora = p.it.toObject();
      const src = p.t.toObject();
      const flags = U.mergeObject(ora.flags ?? {}, { world: { [FLAG_T]: p.t.uuid } }, { inplace: false });
      await p.it.update({ name: src.name, img: src.img, system: sistemaDa(src, ora, p.it.type), flags }, { recursive: false, diff: false });
      if (p.effChanged) {
        // conserva lo stato «disattivato» impostato dal giocatore su effetti omonimi (letto PRIMA di cancellare)
        const wasDisabled = new Map(p.it.effects.map(e => [e.name, e.disabled]));
        await p.it.deleteEmbeddedDocuments("ActiveEffect", p.it.effects.map(e => e.id));
        const effs = p.t.effects.map(e => { const o = e.toObject(); delete o._id; if (wasDisabled.has(o.name)) o.disabled = wasDisabled.get(o.name); return o; });
        if (effs.length) await p.it.createEmbeddedDocuments("ActiveEffect", effs);
      }
      n++;
    } else if (p.needsFlag) { await p.it.setFlag("world", FLAG_T, p.t.uuid); collegate++; } // solo da collegare
    } catch (err) {
      console.error(err);
      errori.push(`${p.a.name} · ${p.it._source.name}: ${err.message}`);
    }
  }
  const erroriHtml = errori.length ? `<p>Non riuscite (${errori.length}):</p><ul>${errori.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : "";
  if (errori.length) ui.notifications.error(esc(`${titolo}: ${errori.length} copie non aggiornate, elenco nel messaggio in chat.`), { permanent: true });
  ui.notifications.info(esc(`${titolo}: ${n} copie aggiornate, ${collegate} collegate.`));
  await ChatMessage.implementation.create({
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<p><strong>${esc(titolo)}</strong>: ${n} copie aggiornate, ${collegate} collegate.</p>${erroriHtml}${rows.length ? tabella : ""}`
  });
}
