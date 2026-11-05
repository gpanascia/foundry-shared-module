/**
 * Luci: «Copia stile luce» e l'interruttore di una sorgente di Light Sources.
 */
const ID = "gdr-strumenti";
// i valori dei documenti negli avvisi, che Foundry mostra come HTML, passano sempre dall'escape
const escAvviso = v => { const t = String(v ?? ""); return foundry.utils.escapeHTML?.(t) ?? t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); };

/**
 * Copia stile luce. Con UNA luce selezionata ne copia lo stile (configurazione, muri, visione);
 * con più luci selezionate applica loro lo stile copiato. Lo stile resta a chi usa la macro, nel mondo in cui
 * l'ha copiato; uno stile copiato con la macro di prima del modulo (flag world «kk-stile-luce») vale finché non se ne copia uno nuovo.
 * Con { prova: true } dice cosa farebbe e non scrive niente.
 */
export async function copiaStileLuce(scope = {}) {
  const PROVA = scope?.prova === true;
  const sel = canvas.lighting?.controlled ?? [];
  if (!sel.length) return ui.notifications.warn("Seleziona almeno una luce (controlli delle luci, l'icona della lampadina a sinistra).");
  if (sel.length === 1) {
    const d = sel[0].document;
    const stile = { config: d.config.toObject(), walls: d.walls, vision: d.vision };
    if (PROVA) return { esito: "prova: copierei lo stile di questa luce", stile };
    await game.user.setFlag(ID, "stileLuce", stile);
    return ui.notifications.info("Stile copiato dalla luce selezionata. Ora seleziona le altre ed esegui di nuovo.");
  }
  const stile = game.user.getFlag(ID, "stileLuce") ?? game.user.getFlag("world", "kk-stile-luce");
  if (!stile) return ui.notifications.warn("Prima copia uno stile: esegui la macro con UNA sola luce selezionata.");
  const upd = sel.map(l => ({ _id: l.id, ...foundry.utils.deepClone(stile) }));
  if (PROVA) return { esito: `prova: applicherei lo stile a ${upd.length} luci`, upd };
  await canvas.scene.updateEmbeddedDocuments("AmbientLight", upd);
  return ui.notifications.info(escAvviso(`Stile applicato a ${upd.length} luci.`));
}

/**
 * Accende o spegne sul token selezionato una sorgente di luce registrata nel modulo Light Sources
 * (per esempio «Spada corta elfica»): se è quella accesa la spegne, altrimenti accende quella.
 * Serve Light Sources attivo nel mondo; usa le sue funzioni interne, come la macro da cui viene.
 * Con { prova: true } dice cosa farebbe e non accende né spegne niente.
 */
export async function alternaSorgenteLuce(nome, scope = {}) {
  if (!nome) return ui.notifications.warn("Manca il nome della sorgente di luce.");
  if (!game.modules.get("light-sources")?.active) return ui.notifications.warn("Serve il modulo Light Sources attivo in questo mondo.");
  const tok = canvas.tokens?.controlled[0];
  if (!tok?.actor) return ui.notifications.warn("Seleziona un token.");
  const LM = await import("/modules/light-sources/scripts/light-manager.js");
  const H = await import("/modules/light-sources/scripts/helpers.js");
  const sorgente = H.getSources().find(s => s.name === nome);
  if (!sorgente) return ui.notifications.warn(escAvviso(`«${nome}» non è registrata in Light Sources.`));
  const spegni = LM.getActiveLight(tok.actor)?.sourceId === sorgente.id;
  if (scope?.prova === true) return { esito: `prova: ${spegni ? "spegnerei" : "accenderei"} «${nome}» su ${tok.name}` };
  if (spegni) await LM.deactivateLight(tok.actor);
  else await LM.activateLight(tok.actor, sorgente, sorgente.patterns[0]);
}
