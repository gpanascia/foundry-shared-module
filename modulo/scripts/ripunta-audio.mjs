// i valori dei documenti negli avvisi, che Foundry mostra come HTML, passano sempre dall'escape
const escAvviso = v => { const t = String(v ?? ""); return foundry.utils.escapeHTML?.(t) ?? t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); };

/**
 * Ripunta le tracce audio caricate nella persistent storage di un modulo
 * (tipicamente DFreds Droppables) verso la cartella audio del mondo corrente.
 *
 * Si usa da un utente con ruolo Gamemaster; con { prova: true } dice cosa farebbe e si ferma prima di scrivere.
 * Generica: ricava il mondo da game.world.id, funziona su qualunque campagna.
 *
 * NON copia i file. Vanno messi prima in worlds/<mondo>/assets/audio/ —
 *   la funzione si rifiuta di partire se anche uno solo manca.
 * NON cancella nulla: le copie dentro i moduli restano dove sono.
 */
export async function ripuntaAudio(scope = {}) {
  const PROVA = scope?.prova === true;
  if (!game.user.isGM) return ui.notifications.error("Serve un utente con ruolo Gamemaster.");

  const DEST = `worlds/${game.world.id}/assets/audio/`;
  const SORGENTE = /^modules\/[^/]+\/storage\//;   // persistent storage di qualunque modulo

  // 1 — Cosa c'è da ripuntare
  const piano = [];
  for (const pl of game.playlists) {
    for (const s of pl.sounds) {
      if (!s.path || !SORGENTE.test(s.path)) continue;
      piano.push({
        plId: pl.id, plName: pl.name, id: s.id, name: s.name,
        da: s.path, a: DEST + s.path.split("/").pop()
      });
    }
  }
  if (!piano.length) { ui.notifications.info("Nessuna traccia da ripuntare."); return PROVA ? { piano } : undefined; }

  // 2 — Pre-flight: i file devono già esistere a destinazione.
  // Ripuntare verso un file assente non dà errore: dà silenzio a metà sessione.
  const mancanti = [];
  for (const p of piano) {
    if (!(await fetch("/" + p.a, { method: "HEAD" })).ok) {
      mancanti.push(decodeURIComponent(p.a.split("/").pop()));
    }
  }
  if (mancanti.length) {
    ui.notifications.error(escAvviso(`Copia prima questi file in ${DEST} — mancano: ${mancanti.join(" · ")}`));
    console.warn("[ripunta-audio] file mancanti a destinazione:", mancanti);
    return PROVA ? { piano, mancanti } : undefined;
  }
  if (PROVA) {
    ui.notifications.info(escAvviso(`Prova: ripunterei ${piano.length} tracce verso ${DEST}. Niente cambiato.`));
    return { piano, mancanti };
  }

  // 3 — Ferma la riproduzione: aggiornare una traccia che suona la fa ripartire
  for (const pl of game.playlists) if (pl.playing) await pl.stopAll();

  // 4 — Applica, raggruppando per playlist
  let n = 0;
  const erroriClient = [];
  for (const pl of game.playlists) {
    const updates = piano.filter(p => p.plId === pl.id).map(p => ({ _id: p.id, path: p.a }));
    if (!updates.length) continue;
    try {
      await pl.updateEmbeddedDocuments("PlaylistSound", updates);
      n += updates.length;
    } catch (e) {
      // Il server ha già scritto: certi errori arrivano dall'hook client _onUpdate,
      // dopo la conferma. Tipico se il contesto audio del browser non è sbloccato:
      // "You may not call PlaylistSound#_createSound until after game audio is unlocked".
      // Non è un fallimento della scrittura — lo dice la verifica §5.
      erroriClient.push(`${pl.name}: ${e.message}`);
      n += updates.length;
    }
  }

  // 5 — Verifica indipendente: ogni traccia risponde davvero dal server?
  let ok = 0, ko = [];
  for (const pl of game.playlists) for (const s of pl.sounds) {
    if (!s.path?.startsWith(DEST)) continue;
    if ((await fetch("/" + s.path, { method: "HEAD" })).ok) ok++; else ko.push(s.name);
  }

  ui.notifications.info(escAvviso(`Ripuntate ${n} tracce · verificate servite dal server: ${ok}`));
  if (ko.length) ui.notifications.error(escAvviso(`NON servite: ${ko.join(" · ")}`));
  if (erroriClient.length) console.warn("[ripunta-audio] errori client (scrittura comunque avvenuta):", erroriClient);
  console.log("[ripunta-audio] percorsi originali, per un eventuale rollback:", piano);
}
