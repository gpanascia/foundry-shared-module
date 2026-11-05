/**
 * I pin delle mappe che si compongono: le note col segno flags.world.wgMappa.punto (i pin dei posti) o flags.world.wgSegnaposto
 * (i segnaposto). I nomi dei flag sono quelli del mondo dove la mappa è nata, e restano per non perdere i dati.
 * - Tondi: Foundry disegna ogni nota dentro un riquadro scuro con un bordo quadrato; per queste note il riquadro non c'è, e il
 *   bordo compare solo con la nota selezionata o sotto il mouse. Le icone sono già tonde.
 * - Per il GM: a colori i pin che le giocatrici vedono (la pagina collegata visibile ad almeno una giocatrice: il posto è
 *   scoperto); scuri gli altri pin e tutti i segnaposto, finché il posto non è scoperto. Le giocatrici vedono le note coi loro
 *   colori.
 * - Pin e segnaposto dello stesso posto stanno nello stesso punto: al GM si vede quello che vedono le giocatrici; il nome del
 *   segnaposto, al GM, dice anche il posto, e il suo doppio clic apre la pagina del posto.
 * - Un pin con l'immagine della voce del posto si ritaglia in tondo, con l'anello.
 * - Al GM un pin con la foto si vede sempre, scuro finché il posto è nascosto, perché la tinta basta a dire lo stato; il suo
 *   segnaposto si vede solo sotto il mouse o selezionato. Un pin con la sola icona del tipo resta dietro il suo segnaposto.
 *   Per le giocatrici non cambia niente.
 * - Una nota messa da parte dal caricatore (flags.gdr-strumenti.daParte, qualunque nota) è legata a una pagina che nessuna
 *   giocatrice vede, e il modulo non la disegna nemmeno per il GM, salvo col livello delle note attivo, in rosso, per trovarla
 *   e cancellarla.
 * Solo disegno, nel browser di chi guarda: non scrive niente nel mondo.
 */
const SCURO = 0x6f685f;
const ROSSO = 0xc0392b;
const daParte = doc => !!doc?.flags?.["gdr-strumenti"]?.daParte;

const nostra = doc => (doc?.getFlag?.("world", "wgMappa")?.punto !== undefined) || !!doc?.getFlag?.("world", "wgSegnaposto");

const laVedono = doc => {
  const dove = doc.page ?? doc.entry;
  return !!dove && game.users.some(u => !u.isGM && dove.testUserPermission(u, "LIMITED"));
};

const punto = doc => doc.getFlag("world", "wgMappa")?.punto ?? doc.getFlag("world", "wgSegnaposto")?.punto;

// un pin con la foto: un'immagine che non è un'icona del tipo (pin-taverna, pin-castello, … pin-*.webp) né un'icona di Foundry
// (icons/…, .svg). Le foto fatte apposta per un pin, già tonde (pin-foto-…), sono foto.
// Il nome conta: una foto di un pin si chiama pin-foto-…, un'icona del tipo pin-<tipo>-…
const conFoto = doc => {
  const s = doc?.texture?.src ?? "";
  return !!s && !s.startsWith("icons/") && !/\.svg$/i.test(s) && !/\/pin-(?!foto-)[^/]+\.webp$/.test(s);
};

function ritocca(note) {
  const ci = note?.controlIcon;
  if ( !ci?.bg ) return;
  if ( daParte(note.document) ) {
    const vista = game.user.isGM && !!canvas.notes?.active;
    note.visible = vista;
    if ( vista ) { ci.visible = true; ci.icon.tint = ROSSO; if ( ci._wgAnello ) ci._wgAnello.tint = ROSSO; }
    return;
  }
  if ( !nostra(note.document) ) return;
  ci.bg.visible = false;
  ci.border.visible = !!(note.controlled || note.hover);
  ci.visible = true;
  tondo(note, ci);
  if ( !game.user.isGM ) return;
  const pin = gemelloDi(note);
  const segnaposto = !!note.document.getFlag("world", "wgSegnaposto");
  if ( segnaposto ) {
    // per il GM il segnaposto dice anche di quale posto è (i segnaposto di un tipo dicono tutti lo stesso, per esempio «un tempio»),
    // ed è sempre scuro: il posto non è scoperto. Se il pin lo vedono, si vede il pin
    if ( pin && note.tooltip ) note.tooltip.text = `${note.document.label} · ${pin.document.label}`;
    ci.icon.tint = SCURO;
    // si vede il pin, e il segnaposto solo sotto il mouse o selezionato, se il pin lo vedono le giocatrici o se ha la foto
    if ( pin && (laVedono(pin.document) || conFoto(pin.document)) ) ci.visible = !!(note.controlled || note.hover);
    return;
  }
  // un pin: a colori se le giocatrici lo vedono (il posto è scoperto), se no scuro. Un pin con la foto si vede comunque, scuro: la
  // tinta dice che il posto è nascosto. Un pin con la sola icona del tipo, se il posto ha un segnaposto, sta dietro di lui
  if ( laVedono(note.document) ) return;
  ci.icon.tint = SCURO;
  if ( ci._wgAnello ) ci._wgAnello.tint = SCURO;
  if ( pin && !conFoto(note.document) ) ci.visible = !!(note.controlled || note.hover);
}

// un pin con un'immagine qualunque (quella della voce del posto, messa da «Scopri»), non un'icona già tonda pin-*.webp: si
// ritaglia in tondo, coprendo il cerchio senza deformarla, con l'anello d'inchiostro dei segnaposto
function tondo(note, ci) {
  const tondaGia = /\/pin-[^/]+\.webp$/.test(note.document.texture.src ?? "");
  if ( tondaGia ) {
    if ( ci._wgMaschera ) { ci.icon.mask = null; ci._wgMaschera.destroy(); ci._wgAnello.destroy(); ci._wgMaschera = ci._wgAnello = null; }
    return;
  }
  // l'icona di Foundry si ridisegna da sé (a misura quadrata) e carica l'immagine dopo: si ripassa un attimo dopo
  const applica = () => {
    const tex = ci.icon?.texture;
    if ( ci.destroyed || !tex?.valid || (tex === PIXI.Texture.EMPTY) ) return false;
    const S = ci.size, r = S / 2, k = S / Math.min(tex.width, tex.height);
    ci.icon.width = tex.width * k; ci.icon.height = tex.height * k;
    ci.icon.position.set((S - ci.icon.width) / 2, (S - ci.icon.height) / 2);
    if ( !ci._wgMaschera ) {
      ci._wgMaschera = ci.addChild(new PIXI.Graphics());
      ci._wgAnello = ci.addChild(new PIXI.Graphics());
    }
    ci._wgMaschera.clear().beginFill(0xffffff).drawCircle(r, r, r - 2).endFill();
    ci.icon.mask = ci._wgMaschera;
    ci._wgAnello.clear().lineStyle({ width: Math.max(2, S / 14), color: 0x402c1a }).drawCircle(r, r, r - S / 28);
    ci._wgAnello.tint = ci.icon.tint;
    return true;
  };
  applica();
  for ( const ms of [60, 300, 1000] ) setTimeout(applica, ms);
}

const gemelloDi = note => canvas.notes?.placeables.find(n => (n !== note) && nostra(n.document) && !daParte(n.document) && (punto(n.document) === punto(note.document)));

// il doppio clic del GM su un segnaposto apre la pagina del suo posto (la voce, o la pagina solo GM), non quella del segnaposto
function apri(note, options) {
  if ( !game.user.isGM || !note.document.getFlag("world", "wgSegnaposto") ) return true;
  const pg = gemelloDi(note)?.document.page;
  if ( !pg ) return true;
  pg.parent.sheet.render(true, { mode: foundry.applications.sheets.journal.JournalEntrySheet.VIEW_MODES.SINGLE, pageId: pg.id });
  return false;
}

// per le prove fuori dal mondo
export { ritocca as _ritocca, conFoto as _conFoto, daParte as _daParte };

export function registraPinMappa() {
  Hooks.on("drawNote", ritocca);
  Hooks.on("refreshNote", ritocca);
  Hooks.on("activateNote", apri);
  // un permesso che cambia (una voce mostrata da «Scopri», o a mano) cambia chi vede le note: si ridisegnano
  const ridisegna = () => {
    if ( !canvas?.ready ) return;
    for ( const n of canvas.notes?.placeables ?? [] ) if ( nostra(n.document) || daParte(n.document) ) n.renderFlags.set({ refreshState: true });
  };
  Hooks.on("updateJournalEntryPage", ridisegna);
  Hooks.on("updateJournalEntry", ridisegna);
  Hooks.on("updateNote", ridisegna);
  Hooks.on("createNote", ridisegna);                       // un pin o un segnaposto che nasce o sparisce cambia il gemello
  Hooks.on("deleteNote", ridisegna);
  // al primo disegno i gemelli possono non esserci ancora: a scena pronta si ripassano tutte
  Hooks.on("canvasReady", ridisegna);
  // una nota messa da parte si vede, al GM, solo col livello delle note attivo
  Hooks.on("activateNotesLayer", ridisegna);
  Hooks.on("deactivateNotesLayer", ridisegna);
}
