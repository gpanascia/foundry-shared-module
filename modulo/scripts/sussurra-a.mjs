/**
 * Sussurra a… — messaggio privato a uno o più utenti, senza scrivere /w
 * ---------------------------------------------------------------------
 * Nel mondo la macro è una riga che chiama il modulo (README.md, «Le macro dei mondi»).
 * Generica: funziona in qualunque mondo.
 *
 * Apre una finestra con gli utenti (pallino pieno = collegato adesso, vuoto = no) e il testo.
 * Invio manda, Maiusc+Invio va a capo, Esc chiude senza mandare. Senza destinatari o senza testo
 * la finestra resta aperta, con quello che hai scritto, e dice cosa manca.
 * La casella «tutti i giocatori» spunta o toglie tutti i giocatori insieme.
 * Ripropone gli ultimi destinatari scelti (salvati nel browser di chi usa la macro).
 *
 * Link. Se trascini nel testo una pagina di journal,
 * dall'elenco a sinistra della finestra del journal, o un altro documento, dove lasci il mouse compare
 * @UUID[…]{nome}, che nel messaggio diventa un link; un titolo della pagina porta a quella sezione.
 * Si può anche scrivere o incollare a mano. Prima di mandare, per ogni link a una pagina di journal
 * del mondo controlla se i giocatori destinatari la possono aprire: serve almeno Osservatore sulla
 * pagina, e basta anche se il journal è a None. Se qualcuno non può, chiede:
 *   - «Dai il permesso e manda»: Osservatore a chi manca, solo su quella pagina, poi il messaggio;
 *   - «Manda senza permesso»: il messaggio parte, e a chi non ha il permesso il link non si apre;
 *   - «Torna al messaggio» (anche Invio o Esc): riapre la finestra con il testo e i destinatari.
 * Gli altri link (journal interi, attori, oggetti, pagine dei compendi) partono come sono.
 *
 * Il messaggio è lo stesso di un /w: parla l'utente e non il token selezionato, suona la notifica,
 * lo vedono solo chi scrive e i destinatari (gli altri GM no). Il testo va in chiaro:
 * niente formattazione, e i caratteri come < e & restano come sono.
 *
 * Prova senza scrivere niente, dalla console (F12):
 *   await game.macros.getName("Sussurra a…").execute({ prova: true })
 * I titoli delle finestre cominciano con «PROVA»: fa tutto, ma non cambia permessi, non manda il
 * messaggio e non ricorda i destinatari; restituisce cosa avrebbe fatto.
 */
export async function sussurraA(scope = {}) {
  const PROVA = scope?.prova === true;
  const TITOLO = PROVA ? "PROVA · Sussurra a… (non scrive niente)" : "Sussurra a…";
  const CHIAVE = "sussurraA.ultimi";
  const esc = foundry.utils.escapeHTML;
  const { DialogV2 } = foundry.applications.api;
  const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  // esce con un avviso; in prova restituisce anche il motivo
  const ferma = (testo, tipo = "warn", opzioni = {}) => {
    ui.notifications[tipo](testo, opzioni);
    return PROVA ? { esito: testo } : undefined;
  };

  let ultimi = [];
  try { ultimi = JSON.parse(localStorage.getItem(CHIAVE) ?? "[]"); } catch { ultimi = []; }
  if (!Array.isArray(ultimi)) ultimi = [];

  const altri = game.users.filter(u => !u.isSelf);
  if (!altri.length) return ferma("Non c'è nessun altro utente a cui scrivere.");
  const ordina = (a, b) => (b.active - a.active) || a.name.localeCompare(b.name);
  const giocatori = altri.filter(u => !u.isGM).sort(ordina);
  const gm = altri.filter(u => u.isGM).sort(ordina);

  const riga = (u, scelti) => {
    const pg = u.character && u.character.name !== u.name ? ` <span style="opacity:.7">(${esc(u.character.name)})</span>` : "";
    const colore = u.color?.css ?? "inherit";
    return `<label style="display:flex;align-items:center;gap:6px;margin:2px 0">
      <input type="checkbox" name="u-${u.id}"${scelti.includes(u.id) ? " checked" : ""}>
      <span style="color:${colore}" title="${u.active ? "collegato" : "non collegato"}">${u.active ? "●" : "○"}</span>
      ${esc(u.name)}${pg}</label>`;
  };
  const tutti = giocatori.length > 1
    ? `<label style="display:flex;align-items:center;gap:6px;margin-top:6px"><input type="checkbox" data-tutti> <em>tutti i giocatori</em></label>`
    : "";
  const contenuto = (scelti, testo) => `
    <div style="display:flex;gap:16px;align-items:flex-start">
      <fieldset style="flex:1"><legend>Giocatori</legend>${giocatori.map(u => riga(u, scelti)).join("") || "<p>nessuno</p>"}${tutti}</fieldset>
      ${gm.length ? `<fieldset style="flex:1"><legend>GM</legend>${gm.map(u => riga(u, scelti)).join("")}</fieldset>` : ""}
    </div>
    <textarea name="testo" rows="4" style="width:100%;margin-top:8px" autofocus
      placeholder="Messaggio privato (Invio manda, Maiusc+Invio va a capo; trascina qui una pagina per il link)">${esc(testo)}</textarea>`;

  // una pagina (o un altro documento) lasciata cadere nel testo diventa @UUID[…]{nome}
  const collegaAlRilascio = campo => campo.addEventListener("drop", ev => {
    const TE = foundry.applications.ux.TextEditor?.implementation;
    const dati = TE?.getDragEventData(ev);
    if (!dati?.type) return;                       // testo qualunque o file: fa il browser, come prima
    ev.preventDefault();
    ev.stopPropagation();
    // dove si lascia il mouse; se il browser non lo sa, dove c'è il cursore. La selezione resta com'è.
    const punto = document.caretPositionFromPoint?.(ev.clientX, ev.clientY);
    const pos = punto?.offsetNode === campo ? punto.offset : (campo.selectionEnd ?? campo.value.length);
    (async () => {
      // il nome va in chiaro: il messaggio lo scappa già tutto, e il nome scappato due volte si vedrebbe
      const doc = dati.uuid ? await foundry.utils.fromUuid(dati.uuid) : null;
      const ancora = dati.anchor?.slug && dati.anchor?.name ? String(dati.anchor.name).trim() : null;
      const nome = (ancora || doc?.name || "").replace(/[{}]/g, "");
      return TE.getContentLink(dati, nome ? { label: nome } : {});
    })().then(link => {
      if (!link) return ui.notifications.warn("Questo non si può collegare.");
      const i = Math.min(pos, campo.value.length);
      const prima = campo.value.slice(0, i);
      const dopo = campo.value.slice(i);
      const sx = prima && !/[\s(«"'[]$/.test(prima) ? " " : "";
      const dx = dopo && !/^[\s.,;:!?)»"'\]]/.test(dopo) ? " " : "";
      campo.setRangeText(sx + link + dx, i, i, "end");
      campo.focus();
    }).catch(err => {
      console.error(err);
      ui.notifications.error("Non riesco a creare il link.");
    });
  });

  // le pagine di journal del mondo collegate nel testo, una volta sola ciascuna
  const pagineCollegate = testo => {
    const pagine = new Map();
    for (const m of testo.matchAll(/@UUID\[([^#\]]+)(?:#[^\]]+)?\]/g)) {
      let doc = null;
      try { doc = foundry.utils.fromUuidSync(m[1]); } catch { doc = null; }
      if (doc?.documentName === "JournalEntryPage" && !doc.pack && !pagine.has(doc.uuid)) pagine.set(doc.uuid, doc);
    }
    return [...pagine.values()];
  };

  let scelti = ultimi;
  let bozza = "";
  while (true) {
    const dati = await DialogV2.input({
      window: { title: TITOLO, icon: "fa-solid fa-user-secret" },
      position: { width: 460 },
      content: contenuto(scelti, bozza),
      ok: { label: "Invia", icon: "fa-solid fa-paper-plane" },
      render: (_event, dialog) => {
        const el = dialog.element;
        const testo = el.querySelector("textarea[name=testo]");
        if (testo) {
          testo.focus();
          testo.setSelectionRange(testo.value.length, testo.value.length);
          collegaAlRilascio(testo);
          testo.addEventListener("keydown", ev => {
            if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
            ev.preventDefault();
            el.querySelector('button[data-action="ok"]')?.click();
          });
        }
        // senza destinatari o senza testo non parte niente e la finestra resta aperta
        el.querySelector('button[data-action="ok"]')?.addEventListener("click", ev => {
          const n = el.querySelectorAll('input[name^="u-"]:checked').length;
          const vuoto = !testo?.value.trim();
          if (n && !vuoto) return;
          ev.preventDefault();
          ev.stopImmediatePropagation();
          ui.notifications.warn(n ? "Scrivi il messaggio." : "Scegli almeno un destinatario.");
        });
        el.querySelector("input[data-tutti]")?.addEventListener("change", ev => {
          for (const u of giocatori) {
            const casella = el.querySelector(`input[name="u-${u.id}"]`);
            if (casella) casella.checked = ev.currentTarget.checked;
          }
        });
      }
    });
    if (!dati) return PROVA ? { esito: "finestra chiusa, niente mandato" } : undefined;

    const ids = altri.filter(u => dati[`u-${u.id}`]).map(u => u.id);
    const grezzo = String(dati.testo ?? "");
    const testo = grezzo.trim();
    if (!ids.length) return ferma("Scegli almeno un destinatario: il messaggio non è partito.");
    if (!testo) return ferma("Il messaggio è vuoto: non è partito niente.");
    if (ids.some(id => !game.users.get(id)?.isGM) && !game.user.can("MESSAGE_WHISPER")) {
      return ferma("Il tuo ruolo non può sussurrare ai giocatori.", "error");
    }

    // chi fra i giocatori destinatari non può aprire le pagine collegate (i GM vedono tutto)
    const destinatari = ids.map(id => game.users.get(id)).filter(u => u && !u.isGM && !u.isBanned);
    const mancano = pagineCollegate(testo)
      .map(pagina => ({ pagina, utenti: destinatari.filter(u => !pagina.testUserPermission(u, "OBSERVER")) }))
      .filter(x => x.utenti.length);
    const permessi = [];
    if (mancano.length) {
      const puoi = game.user.isGM;
      const elenco = mancano.map(({ pagina, utenti }) =>
        `<li>«${esc(pagina.name)}» (journal «${esc(pagina.parent?.name ?? "?")}»): ${utenti.map(u => esc(u.name)).join(", ")}</li>`).join("");
      const scelta = await DialogV2.wait({
        window: { title: TITOLO, icon: "fa-solid fa-eye" },
        position: { width: 460 },
        content: `<p>Il link si apre solo a chi ha almeno Osservatore sulla pagina. Al momento non ce l'hanno:</p><ul>${elenco}</ul>
          ${puoi
            ? "<p>Con il permesso vedono subito tutto ciò che nella pagina non sta in un blocco segreto.</p>"
            : "<p>Solo un GM può dare il permesso.</p>"}`,
        buttons: [
          ...(puoi ? [{ action: "dai", label: "Dai il permesso e manda", icon: "fa-solid fa-eye" }] : []),
          { action: "senza", label: "Manda senza permesso", icon: "fa-solid fa-paper-plane" },
          { action: "torna", label: "Torna al messaggio", icon: "fa-solid fa-pen", default: true }
        ],
        rejectClose: false
      });
      if (scelta !== "dai" && scelta !== "senza") {       // «Torna al messaggio», Invio o finestra chiusa
        scelti = ids;
        bozza = grezzo;
        continue;
      }
      if (scelta === "dai") {
        const fatte = [];
        let errore = null;
        for (const { pagina, utenti } of mancano) {
          permessi.push({ pagina: pagina.name, uuid: pagina.uuid, a: utenti.map(u => u.name) });
          if (PROVA) continue;
          const prima = { ...pagina.ownership };
          try {
            await pagina.update(Object.fromEntries(utenti.map(u => [`ownership.${u.id}`, OBSERVER])));
          } catch (err) {
            console.error(err);
            errore = `Non riesco a dare il permesso su «${pagina.name}».`;
            break;
          }
          const toccati = new Set(utenti.map(u => u.id));
          const dopo = pagina.ownership;
          const altriCambiati = Object.keys({ ...prima, ...dopo }).some(k => !toccati.has(k) && prima[k] !== dopo[k]);
          if (altriCambiati || utenti.some(u => !pagina.testUserPermission(u, "OBSERVER"))) {
            errore = `I permessi di «${pagina.name}» non sono come previsti: controlla la visibilità della pagina.`;
            break;
          }
          fatte.push(pagina.name);
        }
        if (errore) {
          const gia = fatte.length ? ` Osservatore però è già stato dato su ${fatte.map(n => `«${n}»`).join(", ")}.` : "";
          ui.notifications.error(esc(`${errore} Il messaggio non è partito.${gia}`), { permanent: true });
          scelti = ids;
          bozza = grezzo;
          continue;
        }
      }
    }

    const messaggio = {
      content: esc(testo).replace(/\n/g, "<br>"),
      whisper: ids,
      sound: CONFIG.sounds.notification
    };
    if (PROVA) {
      return {
        esito: "prova: nessun permesso cambiato, nessun messaggio mandato",
        destinatari: ids.map(id => game.users.get(id)?.name),
        permessiCheDarebbe: permessi,
        senzaPermesso: mancano.length && !permessi.length
          ? mancano.map(({ pagina, utenti }) => ({ pagina: pagina.name, utenti: utenti.map(u => u.name) }))
          : [],
        messaggio
      };
    }
    try { localStorage.setItem(CHIAVE, JSON.stringify(ids)); } catch { /* il browser non salva: pazienza */ }
    try {
      await ChatMessage.implementation.create(messaggio);
    } catch (err) {
      console.error(err);
      return ferma(`Il messaggio non è partito${permessi.length ? ", ma i permessi sono già stati dati" : ""}.`, "error", { permanent: true });
    }
    for (const p of permessi) ui.notifications.info(esc(`Osservatore su «${p.pagina}» a ${p.a.join(", ")}.`));
    return;
  }
}
