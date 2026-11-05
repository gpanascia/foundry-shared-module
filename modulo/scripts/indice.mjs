/**
 * L'indice dei journal che si richiude.
 *
 * Nell'indice di ogni journal (il JournalEntrySheet di V14 e le sue sottoclassi, come quella di dnd5e: l'hook della classe madre vale
 * per tutte) una freccia su ogni voce seguita da voci di livello più basso: il quartiere richiude luoghi e personaggi, un luogo i suoi
 * personaggi. All'inizio i gruppi sono chiusi; la pagina in vista apre da sola i gruppi che la contengono e il suo, quando la
 * finestra si disegna e quando cambia la pagina attiva, e quei gruppi restano aperti. Lo stato si ricorda per persona e per journal nel browser (localStorage).
 * Con del testo nella ricerca dell'indice, e durante un trascinamento, si vede tutto. Un gruppo non scavalca un'intestazione di
 * categoria. Le giocatrici vedono solo le loro pagine (Foundry non mette le altre nell'indice): niente freccia se sotto non c'è niente.
 * Solo disegno nel browser di chi guarda: niente scritture nel mondo.
 * Regole: README.md, «L'indice dei journal che si richiude».
 */

const CHIAVE = "gdr-strumenti.indice";
export const CLASSI = Object.freeze({ freccia: "gdr-indice-freccia", spazio: "gdr-indice-spazio", barre: "gdr-indice-barre", nascosta: "gdr-indice-nascosta",
  capo: "gdr-indice-capo", membro: "gdr-indice-membro", tutto: "gdr-indice-tutto", rientro: "gdr-indice-rientro" });

/**
 * I colori delle barre: una tinta per ogni gruppo di primo livello, a giro; un gruppo dentro un gruppo ha
 * la stessa tinta, più chiara. Tenui, leggibili sul tema scuro e su quello chiaro.
 */
// Le tinte sono angoli OKLCH; luminosità e croma le decide il foglio di stile, per tema.
// L'ordine alterna tinte lontane anche per chi è daltonico (deuteranopia e protanopia simulate).
// Niente arancio (35–85 gradi): è il colore della pagina in vista e della freccia che la segnala.
export const TINTE = Object.freeze([250, 350, 150, 205, 310, 25, 95]);
export const LARGHEZZA_BARRA = 2, RIENTRO = 16, META_FRECCIA = 12;

/**
 * Il fondo dell'indice è chiaro? Si decide dal colore del testo dei titoli, che il foglio sceglie per il suo fondo (testo chiaro, fondo
 * scuro): il fondo vero può essere un'immagine o una trama, che il colore di fondo non dice.
 * null se non si sa: allora resta la tavolozza scura.
 */
function sfondoChiaro(toc, win) {
  if ( typeof win?.getComputedStyle !== "function" ) return null;
  const el = toc.querySelector(".page-title") ?? toc;
  const m = String(win.getComputedStyle(el).color ?? "").match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  if ( !m ) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(x => { const c = Number(x) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.2;
}

const oggetto = v => !!v && (typeof v === "object") && !Array.isArray(v);
/** Lo stato salvato nel browser, intero; {} se manca o non si legge. */
function leggiTutto(store) {
  try { const s = JSON.parse(store?.getItem(CHIAVE) ?? "{}"); return oggetto(s) ? s : {}; } catch { return {}; }
}
/** I gruppi aperti a mano da un utente in un journal. */
export function leggiAperti(utente, journal, store = globalThis.localStorage) {
  const a = leggiTutto(store)?.[utente]?.[journal];
  return new Set(Array.isArray(a) ? a.filter(x => typeof x === "string") : []);
}
/** Salva i gruppi aperti; se il browser non salva, pazienza: l'indice funziona lo stesso, chiuso alla prossima apertura. */
export function scriviAperti(utente, journal, aperti, store = globalThis.localStorage) {
  try {
    const s = leggiTutto(store);
    const u = oggetto(s[utente]) ? s[utente] : {};
    if ( aperti.size ) u[journal] = [...aperti]; else delete u[journal];
    if ( Object.keys(u).length ) s[utente] = u; else delete s[utente];
    store.setItem(CHIAVE, JSON.stringify(s));
  } catch { /* il browser non salva */ }
}

/**
 * Le voci dell'indice, in ordine: { el, id, livello } per una pagina, null per un'intestazione (una categoria), che chiude i gruppi.
 * I titoli dentro una pagina (li con data-anchor, o dentro la voce di una pagina) non sono voci.
 */
export function voci(toc, app) {
  const out = [];
  for ( const li of toc.querySelectorAll("li") ) {
    const id = li.dataset?.pageId;
    if ( id ) {
      // una pagina dentro un'altra voce di pagina non c'è nell'indice di V14; se capitasse, non la si tocca
      if ( li.parentElement?.closest("li[data-page-id]") ) continue;
      const doc = app?.entry?.pages?.get?.(id) ?? app?.document?.pages?.get?.(id);
      let livello = Number(doc?.title?.level);
      if ( !Number.isInteger(livello) ) livello = Number(li.className.match(/\blevel(\d+)\b/)?.[1]);
      out.push({ el: li, id, livello: Number.isInteger(livello) && (livello > 0) ? livello : 1 });
      continue;
    }
    if ( (li.dataset?.anchor !== undefined) || li.closest("li[data-page-id]") ) continue;
    out.push(null);
  }
  return out;
}

/**
 * I gruppi, dall'elenco delle voci ({ id, livello } o null): capi (id → discendenti) e antenati (id → i capi sopra, dal più esterno).
 * Una voce appartiene alla voce precedente di livello più alto (numero più piccolo); un'intestazione chiude tutti i gruppi.
 */
export function gruppi(lista) {
  const discendenti = new Map(), antenati = new Map();
  let pila = [];
  for ( const v of lista ) {
    if ( !v ) { pila = []; continue; }
    while ( pila.length && (pila.at(-1).livello >= v.livello) ) pila.pop();
    antenati.set(v.id, pila.map(p => p.id));
    for ( const p of pila ) discendenti.get(p.id).push(v.id);
    discendenti.set(v.id, []);
    pila.push(v);
  }
  return { capi: new Map([...discendenti].filter(([, d]) => d.length)), antenati };
}

/** Le pagine in vista: le voci attive dell'indice; se nessuna lo è, la pagina della finestra. */
function attivi(toc, app) {
  const s = new Set([...toc.querySelectorAll("li[data-page-id].active")].map(li => li.dataset.pageId));
  if ( !s.size && app?.pageId ) s.add(app.pageId);
  return s;
}
const stessi = (a, b) => (a.size === b.size) && [...a].every(x => b.has(x));

/** Si vede tutto: con del testo nella ricerca dell'indice, o durante un trascinamento. */
function aggiornaTutto(radice, toc) {
  const cerca = radice.querySelector("search input");
  toc.classList.toggle(CLASSI.tutto, !!cerca?.value?.trim() || !!toc.__gdrTrascina);
}

/**
 * Disegna i gruppi nell'indice di una finestra di journal. Si rifà a ogni render, e quando cambia la pagina attiva.
 * opzioni: { store, utente } per le prove (di base localStorage e game.user.id).
 */
export function applicaIndice(app, element, opzioni = {}) {
  const radice = element ?? app?.element;
  const toc = radice?.querySelector?.(".toc");
  const journal = app?.document?.uuid ?? app?.entry?.uuid;
  if ( !toc || !journal ) return;
  const store = opzioni.store ?? globalThis.localStorage;
  const utente = opzioni.utente ?? globalThis.game?.user?.id ?? "-";
  // lo stato della finestra vive sull'elemento della finestra, fra un render e l'altro: le pagine in vista, i gruppi aperti da soli
  // (che restano aperti: l'indice non si richiude mentre si scorre), quelli richiusi a mano, quelli aperti a mano
  const st = radice.__gdrIndice ??= { attivi: null, auto: new Set(), richiusi: new Set(), aperti: new Map() };
  const doc = toc.ownerDocument, win = doc.defaultView ?? globalThis;
  // il fuoco su una freccia, per ridarlo alla freccia nuova dello stesso gruppo
  const fuoco = doc.activeElement?.classList?.contains(CLASSI.freccia) && toc.contains(doc.activeElement) ? doc.activeElement.dataset.gdrGruppo : null;

  // via quello che c'era: frecce e classi del giro di prima
  for ( const b of toc.querySelectorAll(`.${CLASSI.freccia}, .${CLASSI.spazio}, .${CLASSI.barre}`) ) b.remove();
  for ( const li of toc.querySelectorAll(`.${CLASSI.nascosta}, .${CLASSI.capo}, .${CLASSI.membro}`) ) li.classList.remove(CLASSI.nascosta, CLASSI.capo, CLASSI.membro);
  for ( const tit of toc.querySelectorAll("[data-gdr-titolo]") ) { tit.removeAttribute("title"); delete tit.dataset.gdrTitolo; }
  for ( const ol of toc.querySelectorAll("[data-gdr-spostato]") ) { ol.style.marginLeft = ol.dataset.gdrSpostato; delete ol.dataset.gdrSpostato; }

  const lista = voci(toc, app);
  const { capi, antenati } = gruppi(lista.map(v => v && { id: v.id, livello: v.livello }));
  // la pagina in vista apre da sola i gruppi che la contengono e il suo, anche quelli richiusi a mano; i gruppi aperti prima restano
  // aperti (in modalità multipla le pagine in vista cambiano a ogni scorrimento)
  const ora = attivi(toc, app);
  const cambiate = !st.attivi || !stessi(ora, st.attivi);
  if ( cambiate ) {
    st.attivi = ora;
    for ( const id of [...ora].flatMap(id => [...(antenati.get(id) ?? []), ...(capi.has(id) ? [id] : [])]) ) { st.auto.add(id); st.richiusi.delete(id); }
  }
  // i gruppi aperti a mano: letti dal browser alla prima apertura della finestra, poi tenuti qui (anche se il browser non salva)
  const chiave = `${utente}|${journal}`;
  if ( !st.aperti.has(chiave) ) st.aperti.set(chiave, leggiAperti(utente, journal, store));
  const aperti = st.aperti.get(chiave);
  const aperto = id => aperti.has(id) || (st.auto.has(id) && !st.richiusi.has(id));

  // la tinta di ogni gruppo: i gruppi più esterni a giro sulla tavolozza, quelli dentro con la tinta del loro gruppo più esterno
  const tinta = new Map();
  let giro = 0;
  for ( const v of lista ) {
    if ( !v || !capi.has(v.id) ) continue;
    const sopra = antenati.get(v.id) ?? [];
    tinta.set(v.id, sopra.length ? tinta.get(sopra[0]) : TINTE[giro++ % TINTE.length]);
  }
  // l'ultima voce visibile di ogni gruppo (il capo, se il gruppo è chiuso o tutto nascosto): lì finisce la sua linea
  const visibile = id => (antenati.get(id) ?? []).every(aperto);
  const ultimaVisibile = new Map([...capi].map(([id, disc]) => [id, [id, ...disc].filter(visibile).at(-1) ?? id]));
  // la pagina in vista dentro un gruppo chiuso: la freccia del capo lo dice
  const dentroChiuso = id => !aperto(id) && [...st.attivi].some(a => (capi.get(id) ?? []).includes(a));
  // il nome della voce, per la freccia letta dagli screen reader
  const nomeDi = v => app?.entry?.pages?.get?.(v.id)?.name ?? app?.document?.pages?.get?.(v.id)?.name ?? (v.el.querySelector(".page-title") ?? v.el).textContent.trim().slice(0, 80);
  // la riga della voce: il primo figlio che non è l'elenco dei titoli (nel foglio di dnd5e, numero, titolo e condivisione in riga)
  // un contenitore con almeno due elementi (numero, titolo…); se no la voce stessa, così la freccia non finisce dentro un titolo o un
  // link
  const rigaDi = li => { const r = [...li.children].find(c => !c.matches(`ol, ul, .${CLASSI.barre}`)); return (r && !r.matches("a, button") && (r.children.length >= 2)) ? r : li; };
  // la freccia (o lo spazio) va fra il numero e il titolo: prima dell'elemento della riga che contiene il titolo; il rientro del
  // livello passa dal titolo alla freccia (in dnd5e il rientro è un text-indent sul titolo, e il numero sta fermo)
  const metti = (li, el) => {
    const riga = rigaDi(li), tit = riga.querySelector(".page-title");
    const prima = tit ? [...riga.children].find(c => c === tit || c.contains(tit)) : null;
    if ( prima ) riga.insertBefore(el, prima); else riga.prepend(el);
  };
  const livello = new Map(lista.filter(Boolean).map(v => [v.id, v.livello]));
  // il nome intero sul titolo, se Foundry non ne ha già messo uno: con la freccia il titolo perde 24 px, e un titolo lungo si tronca
  // proprio su «(solo GM)»
  const titoloIntero = v => { const tit = v.el.querySelector(".page-title"); if ( tit && !tit.hasAttribute("title") ) { tit.title = nomeDi(v); tit.dataset.gdrTitolo = ""; } };
  toc.classList.toggle(CLASSI.rientro, capi.size > 0);

  for ( const v of lista ) {
    if ( !v ) continue;
    // le linee guida: per ogni gruppo aperto che contiene la voce, una linea verticale sotto la freccia del suo capo; sul capo aperto,
    // la linea parte da sotto la freccia. Finisce sull'ultima voce visibile del gruppo. La x viene dal livello del capo: la freccia di un
    // capo di livello L sta a (L − 1) × RIENTRO dall'inizio dello spazio delle frecce (--gdr-base, misurata sotto)
    const catena = [...(antenati.get(v.id) ?? []), ...((capi.has(v.id) && aperto(v.id)) ? [v.id] : [])];
    if ( catena.length && visibile(v.id) ) {
      // la voce è il riferimento delle linee (position: relative) prima di misurare la riga: misurata prima, la riga darebbe la
      // distanza da un antenato, e le linee uscirebbero dall'indice
      v.el.classList.add(CLASSI.membro);
      const s = doc.createElement("span");
      s.className = CLASSI.barre;
      s.setAttribute("aria-hidden", "true");
      catena.forEach((id, i) => {
        const b = doc.createElement("span");
        b.style.left = `calc(var(--gdr-base, 62px) + ${(livello.get(id) - 1) * RIENTRO + META_FRECCIA - LARGHEZZA_BARRA / 2}px)`;
        b.style.width = `${LARGHEZZA_BARRA}px`;
        b.style.setProperty("--gdr-h", String(tinta.get(id)));
        b.dataset.gdrGruppo = id;
        b.dataset.gdrProf = String(Math.min(i, 1));
        if ( id === v.id ) b.dataset.gdrInizio = "";
        if ( ultimaVisibile.get(id) === v.id ) b.dataset.gdrFine = "";
        s.append(b);
      });
      v.el.prepend(s);
    }
    if ( capi.has(v.id) ) {
      const ap = aperto(v.id);
      const b = doc.createElement("button");
      b.type = "button";
      b.className = CLASSI.freccia;
      b.dataset.gdrGruppo = v.id;
      b.setAttribute("aria-expanded", String(ap));
      const quante = capi.get(v.id).length;
      b.setAttribute("aria-label", `${ap ? "Chiudi" : "Apri"} ${nomeDi(v)} (${quante} ${quante === 1 ? "pagina" : "pagine"})`);
      b.title = b.getAttribute("aria-label");
      if ( dentroChiuso(v.id) ) b.classList.add("gdr-indice-dentro");
      b.innerHTML = `<i class="fa-solid ${ap ? "fa-caret-down" : "fa-caret-right"}" inert></i>`;
      // un clic apre e chiude, e non arriva alla voce (che aprirebbe la pagina)
      b.addEventListener("click", ev => {
        ev.preventDefault(); ev.stopPropagation();
        // nel browser si cambia solo questo gruppo, sopra quello che c'è adesso: un'altra finestra dello stesso journal non si perde
        const salvati = leggiAperti(utente, journal, store);
        if ( aperto(v.id) ) { aperti.delete(v.id); salvati.delete(v.id); if ( st.auto.has(v.id) ) st.richiusi.add(v.id); }
        else { aperti.add(v.id); salvati.add(v.id); st.richiusi.delete(v.id); }
        scriviAperti(utente, journal, salvati, store);
        b.focus?.();
        applicaIndice(app, radice, opzioni);
      });
      for ( const t of ["pointerdown", "mousedown", "dblclick"] ) b.addEventListener(t, ev => ev.stopPropagation());
      v.el.classList.add(CLASSI.capo);
      b.style.marginLeft = `${(v.livello - 1) * RIENTRO}px`;
      metti(v.el, b);
      if ( fuoco === v.id ) b.focus?.();
      titoloIntero(v);
    } else if ( capi.size ) {
      // uno spazio grande come la freccia, col rientro del livello, così i titoli dello stesso livello restano in colonna
      const sp = doc.createElement("span");
      sp.className = CLASSI.spazio;
      sp.setAttribute("aria-hidden", "true");
      sp.style.marginLeft = `${(v.livello - 1) * RIENTRO}px`;
      metti(v.el, sp);
      titoloIntero(v);
    }
    if ( !(antenati.get(v.id) ?? []).every(aperto) ) v.el.classList.add(CLASSI.nascosta);
  }
  // i titoli della pagina aperti nell'indice (l'elenco dentro la voce): spostati sotto il titolo della voce, così il loro testo parte
  // dopo le linee guida (se no le linee passano sopra la prima lettera)
  const elenchi = !capi.size ? [] : [...toc.querySelectorAll(`li[data-page-id]:not(.${CLASSI.nascosta})`)].map(li => {
    const ol = li.querySelector(":scope > ol, :scope > ul"), tit = rigaDi(li).querySelector(".page-title");
    if ( !ol || !tit || !(ol.offsetWidth > 0) || !(li.offsetWidth > 0) ) return null;
    const k = (li.getBoundingClientRect().width / li.offsetWidth) || 1;
    const sposta = (tit.getBoundingClientRect().left - ol.getBoundingClientRect().left) / k;
    return (sposta > 0) ? { ol, sposta, prima: ol.style.marginLeft, margine: parseFloat(win.getComputedStyle?.(ol)?.marginLeft) || 0 } : null;
  }).filter(Boolean);
  // l'elenco spostato si stringe (foglio di stile: larghezza automatica), e un titolo che non ci sta intero lo mostra al passaggio del
  // mouse, come le voci
  for ( const e of elenchi ) {
    e.ol.dataset.gdrSpostato = e.prima; e.ol.style.marginLeft = `${Math.round(e.margine + e.sposta)}px`;
    for ( const li of e.ol.querySelectorAll(":scope > li") ) {
      const t = li.firstElementChild ?? li, testo = t.textContent?.trim();
      if ( testo && !t.hasAttribute("title") ) { t.title = testo; t.dataset.gdrTitolo = ""; }
    }
  }
  // inizio e fine delle linee misurati sulla riga, non sulla voce, che contiene anche i titoli della pagina: dopo il disegno, con
  // frecce e spazi già nella riga; prima tutte le letture, poi tutte le scritture.
  // Senza misure (niente layout, voce nascosta) restano quelli del foglio di stile, a metà della voce
  const daMisurare = [...toc.querySelectorAll(`li.${CLASSI.membro}:not(.${CLASSI.nascosta})`)].map(li => {
    const riga = rigaDi(li), linee = [...li.querySelectorAll(`:scope > .${CLASSI.barre} > span:is([data-gdr-inizio], [data-gdr-fine])`)];
    if ( !linee.length || (riga === li) || !(riga.offsetHeight > 0) || !(li.offsetHeight > 0) ) return null;
    const rv = li.getBoundingClientRect(), rr = riga.getBoundingClientRect(), k = (rv.height / li.offsetHeight) || 1;
    return { linee, alta: li.offsetHeight, centro: (rr.top - rv.top + rr.height / 2) / k };
  }).filter(m => m && (m.centro > 0) && (m.centro < m.alta));
  for ( const m of daMisurare ) for ( const b of m.linee ) {
    if ( b.dataset.gdrInizio !== undefined ) b.style.top = `${Math.round(m.centro + 7)}px`;
    if ( b.dataset.gdrFine !== undefined ) b.style.bottom = `${Math.round(m.alta - m.centro - 1)}px`;
  }
  // l'inizio dello spazio delle frecce, dal bordo della voce, misurato sulla prima voce disegnata (in dnd5e 62 px, dopo il numero); e
  // il fondo dell'indice: in dnd5e resta scuro anche col tema chiaro, quindi la tavolozza si sceglie dal fondo vero, non dal tema
  const primo = toc.querySelector(`li:not(.${CLASSI.nascosta}) :is(.${CLASSI.freccia}, .${CLASSI.spazio})`);
  const li0 = primo?.closest("li");
  if ( primo && li0 && primo.getBoundingClientRect ) {
    // i rettangoli sono in pixel dello schermo, dopo la scala della finestra e lo zoom; il calc è in px CSS
    const scala = (li0.offsetWidth > 0) ? li0.getBoundingClientRect().width / li0.offsetWidth : 1;
    const x = (primo.getBoundingClientRect().left - li0.getBoundingClientRect().left) / (scala || 1) - (parseFloat(primo.style.marginLeft) || 0);
    if ( primo.getBoundingClientRect().width > 0 ) toc.style.setProperty("--gdr-base", `${Math.round(x)}px`);
  }
  const chiaro = sfondoChiaro(toc, win);
  if ( chiaro !== null ) toc.toggleAttribute("data-gdr-chiaro", chiaro);
  // la voce in vista, ora che il suo gruppo è aperto: Foundry l'ha fatta scorrere quando era ancora chiusa
  if ( cambiate ) {
    const li = toc.querySelector(`li[data-page-id].active:not(.${CLASSI.nascosta})`) ?? (app?.pageId ? toc.querySelector(`li[data-page-id="${app.pageId}"]:not(.${CLASSI.nascosta})`) : null);
    try { li?.scrollIntoView?.({ block: "nearest" }); } catch { /* niente */ }
  }

  // la pagina in vista che cambia (pin, link, «Scopri», avanti e indietro, lo scorrimento in modalità multipla): si ridisegna
  const MO = win.MutationObserver ?? globalThis.MutationObserver;
  if ( !toc.__gdrOsserva && (typeof MO === "function") ) {
    toc.__gdrOsserva = new MO(mutazioni => {
      const cambiata = mutazioni.some(m => m.target?.matches?.("li[data-page-id]") && (/\bactive\b/.test(m.oldValue ?? "") !== m.target.classList.contains("active")));
      if ( cambiata ) applicaIndice(app, radice, opzioni);
    });
    toc.__gdrOsserva.observe(toc, { subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  }
  // l'indice disegnato mentre non si vedeva (richiuso, finestra a icona): niente misure; quando torna visibile si ridisegna, solo al
  // passaggio da larghezza zero, così il ridisegno non si richiama da sé
  const RO = win.ResizeObserver ?? globalThis.ResizeObserver;
  if ( !toc.__gdrMisura && (typeof RO === "function") ) {
    toc.__gdrLargo = toc.offsetWidth > 0;
    toc.__gdrMisura = new RO(() => {
      const largo = toc.offsetWidth > 0, prima = toc.__gdrLargo;
      toc.__gdrLargo = largo;
      if ( largo && !prima ) applicaIndice(app, radice, opzioni);
    });
    toc.__gdrMisura.observe(toc);
  }
  // ricerca e trascinamento: tutto aperto. Al dragstart la classe cambia dopo, non subito: spostare la voce trascinata mentre il
  // trascinamento parte lo può annullare in Chrome
  const cerca = radice.querySelector("search input");
  if ( cerca && !cerca.__gdrIndice ) { cerca.__gdrIndice = true; cerca.addEventListener("input", () => aggiornaTutto(radice, radice.querySelector(".toc") ?? toc)); }
  if ( !toc.__gdrTrascinaAscolta ) {
    toc.__gdrTrascinaAscolta = true;
    // l'indice che si apre o si richiude sposta la voce trascinata: si compensa lo scorrimento, così resta dov'era sotto il cursore
    // (senza, la voce trascinata può finire fuori dalla parte visibile)
    // l'elemento che scorre: il primo, dall'indice in su, con overflow-y auto o scroll; scelto al dragstart e riusato
    const scorrevole = () => { for ( let e = toc; e && (e.nodeType === 1); e = e.parentElement ) { const o = win.getComputedStyle?.(e)?.overflowY; if ( (o === "auto") || (o === "scroll") ) return e; } return toc; };
    const fermo = (li, fn, scorre) => {
      const prima = li?.isConnected ? li.getBoundingClientRect().top : null;
      fn();
      if ( prima === null || !li.isConnected || !scorre ) return;
      scorre.scrollTop += li.getBoundingClientRect().top - prima;
    };
    toc.addEventListener("dragstart", ev => {
      toc.__gdrTrascina = true;
      const li = ev.target?.closest?.("li[data-page-id]") ?? null;
      toc.__gdrTrascinata = li; toc.__gdrScorre = scorrevole();
      win.setTimeout(() => fermo(li, () => aggiornaTutto(radice, toc), toc.__gdrScorre), 0);
    });
    const fine = () => { toc.__gdrTrascina = false; const li = toc.__gdrTrascinata, sc = toc.__gdrScorre; toc.__gdrTrascinata = null; fermo(li, () => aggiornaTutto(radice, toc), sc); };
    toc.addEventListener("dragend", fine);
    toc.addEventListener("drop", fine);
  }
  aggiornaTutto(radice, toc);
}

/** L'hook, una volta, all'avvio del modulo: tutte le finestre di journal di tutti i mondi. */
export function registraIndice() {
  Hooks.on("renderJournalEntrySheet", (app, element) => {
    try { applicaIndice(app, element instanceof HTMLElement ? element : app?.element); }
    catch (err) { console.warn("gdr-strumenti | indice dei journal:", err); }
  });
}
