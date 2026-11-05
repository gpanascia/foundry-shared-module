/**
 * Il tiro privato delle Roll Table «privata»: una tabella col segno del modulo flags.gdr-strumenti.privata si tira
 * sempre come «Tiro privato del GM», anche se chi la tira ha lasciato in chat il tiro a vista. Serve alle tabelle che nel testo
 * per il GM hanno quello che le giocatrici non devono leggere. Il segno lo mette il caricatore alle tabelle che i dati dicono
 * private (docs/caricatore.md, «Le Roll Table»).
 *
 * Solo il messaggio del tiro, nel client di chi tira, prima che parta: se non è già sussurrato (privato, cieco, a sé), diventa un
 * sussurro ai GM, come fa Foundry col tiro privato. Non scrive niente nel mondo e non tocca le tabelle senza il segno. Come nel tiro
 * privato di Foundry, con Dice So Nice le giocatrici possono vedere i dadi 3D senza valori. Non lo coprono le tabelle tirate da un
 * compendio, le tabelle annidate (il messaggio porta l'id di quella esterna) e i moduli che scrivono il proprio messaggio.
 */
const MODULO = "gdr-strumenti";

/** L'id della tabella da cui viene un messaggio di chat (il flag core.RollTable che Foundry mette ai messaggi delle estrazioni). */
// Foundry scrive la chiave col punto («core.RollTable») dentro flags: la si cerca espansa e così com'è, nel messaggio e nei dati
export const tabellaDi = (msg, data) => msg?.getFlag?.("core", "RollTable") ?? foundry.utils.getProperty(data ?? {}, "flags.core.RollTable")
  ?? data?.flags?.["core.RollTable"] ?? msg?._source?.flags?.["core.RollTable"] ?? msg?._source?.flags?.core?.RollTable ?? null;
const privataDi = tid => game.tables?.get(tid)?.flags?.[MODULO]?.privata === true;

/** Il messaggio da rendere privato: i GM come destinatari, se il messaggio viene da una tabella privata e non è già sussurrato. */
export function rendiPrivato(msg, data, options) {
  const tid = tabellaDi(msg, data);
  if ( !tid ) return false;
  if ( !privataDi(tid) ) return false;
  if ( (msg.whisper ?? []).length ) return false;
  // V14: ChatMessage#_preCreate applica il modo della chat (options.messageMode) prima dell'aggancio,
  // quindi un tiro a vista arriva qui senza destinatari. Il modo «gm» di V14 (applyMode), il vecchio «gmroll» prima della V14; se no,
  // a mano: sussurro ai GM, non cieco, come fa il tiro privato
  if ( typeof msg.applyMode === "function" ) { msg.applyMode("gm"); if ( options ) options.messageMode = "gm"; }
  else if ( typeof msg.applyRollMode === "function" ) msg.applyRollMode(globalThis.CONST?.DICE_ROLL_MODES?.PRIVATE ?? "gmroll");
  if ( !(msg.whisper ?? []).length ) msg.updateSource({ whisper: game.users.filter(u => u.isGM).map(u => u.id), blind: false });
  return true;
}

/** Registra l'aggancio: si chiama all'avvio del modulo (main.mjs, init). */
export function registraTiroPrivato() {
  // un errore sul messaggio di una tabella privata non lo lascia andare a vista: si ferma, e il GM lo sa
  Hooks.on("preCreateChatMessage", (msg, data, options) => {
    try { rendiPrivato(msg, data, options); }
    catch(err) {
      console.error("gdr-strumenti, tiro privato:", err);
      // si ferma solo il messaggio di una tabella privata: un errore non blocca le altre tabelle
      let privata = false;
      try { privata = privataDi(tabellaDi(msg, data)); } catch(e) { privata = false; }
      if ( privata ) { ui.notifications?.error("Tiro privato: il messaggio della tabella non è partito (errore in console)."); return false; }
    }
  });
}
