/**
 * GDR · Strumenti comuni — punto d'ingresso del modulo.
 * Mette le funzioni in game.modules.get("gdr-strumenti").api; le macro dei mondi le chiamano con una riga.
 * Le macro dei mondi e l'installazione: README.md del repository.
 */
import { sussurraA } from "./sussurra-a.mjs";
import { ripuntaAudio } from "./ripunta-audio.mjs";
import { copiaStileLuce, alternaSorgenteLuce } from "./luci.mjs";
import { sincronizzaOggetti } from "./sincronizza-oggetti.mjs";
import { rivelaNome, rivelaPagina, impostaDoppioNome, registraRivelaNome } from "./rivela-nome.mjs";
import { registraPinMappa } from "./pin-mappa.mjs";
import { registraTiroPrivato } from "./tiro-privato.mjs";
import { carica } from "./carica.mjs";
import { scopri } from "./scopri.mjs";
import { registraImpostazioni } from "./carica/comune.mjs";
import { registraIndice } from "./indice.mjs";

Hooks.once("init", () => {
  const modulo = game.modules.get("gdr-strumenti");
  // versione del codice che gira davvero (module.version viene dal manifest letto all'apertura del mondo)
  if (modulo) modulo.api = Object.freeze({ versione: "1.19.0", sussurraA, ripuntaAudio, copiaStileLuce, alternaSorgenteLuce, sincronizzaOggetti, rivelaNome, rivelaPagina, impostaDoppioNome, carica, scopri });
  registraImpostazioni();
  registraRivelaNome();
  registraPinMappa();
  registraTiroPrivato();
  registraIndice();
});
