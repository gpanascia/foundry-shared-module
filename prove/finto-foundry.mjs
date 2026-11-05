/**
 * Un Foundry finto, per provare il caricatore e «Scopri» in Node, fuori dal mondo: solo quello che il caricatore usa (utenti, cartelle,
 * journal e pagine, permessi, file serviti dal server, caricamento del rapporto), coi comportamenti di Foundry che contano per lui:
 * il GM che crea diventa proprietario, il server riscrive «text-align: center» in «text-align:center», keepId tiene gli id,
 * _stats.modifiedTime cambia a ogni scrittura. Non sostituisce la prova a vuoto nel mondo: scova errori di battitura e di logica.
 */
let orologio = 1000;
const tick = () => ++orologio;
const LIV = { INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };
const clona = x => JSON.parse(JSON.stringify(x));

export class Collezione extends Map {
  get contents() { return [...this.values()]; }
  filter(fn) { return this.contents.filter(fn); }
  find(fn) { return this.contents.find(fn); }
  some(fn) { return this.contents.some(fn); }
  map(fn) { return this.contents.map(fn); }
  getName(n) { return this.contents.find(x => x.name === n); }
  get size() { return super.size; }
  [Symbol.iterator]() { return this.values(); }
}

const ID = () => Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");
const riscriviServer = html => String(html ?? "").replace(/text-align: center/g, "text-align:center");

function permesso(doc, user, livello) {
  if ( user.isGM ) return true;
  const L = (typeof livello === "string") ? LIV[livello] : livello;
  let l = doc.ownership?.[user.id] ?? doc.ownership?.default;
  if ( ((l === undefined) || (l < 0)) && doc.parent ) l = doc.parent.ownership?.[user.id] ?? doc.parent.ownership?.default;
  return (l ?? 0) >= L;
}

// come V14: `foundry.data.operators.ForcedDeletion` toglie la chiave (al posto di «-=»)
class ForcedDeletion {}
function espandi(o) {
  const out = {};
  for ( const [k, v] of Object.entries(o) ) {
    const parti = k.split(".");
    let t = out;
    parti.slice(0, -1).forEach(p => { t[p] ??= {}; t = t[p]; });
    t[parti.at(-1)] = (v && (typeof v === "object") && !Array.isArray(v) && !(v instanceof ForcedDeletion)) ? espandi(v) : v;
  }
  return out;
}
function fondi(a, b) {
  for ( const [k, v] of Object.entries(b) ) {
    // come Foundry: «-=chiave» toglie la chiave; con ForcedDeletion presente (V14) si conta, perché il modulo non
    // deve più usarlo
    if ( k.startsWith("-=") ) { if ( globalThis.foundry?.data?.operators && globalThis.__finto ) globalThis.__finto.trattini = (globalThis.__finto.trattini ?? 0) + 1; delete a[k.slice(2)]; continue; }
    if ( v instanceof ForcedDeletion ) { delete a[k]; continue; } // e la forma di V14
    if ( v && (typeof v === "object") && !Array.isArray(v) && a[k] && (typeof a[k] === "object") ) fondi(a[k], v);
    else a[k] = clona(v);
  }
  return a;
}

export class Pagina {
  constructor(dati, { parent } = {}) {
    Object.assign(this, { _id: dati._id ?? ID(), name: dati.name, type: dati.type ?? "text", sort: dati.sort ?? 0, title: { show: true, level: 1, ...(dati.title ?? {}) },
      text: dati.text ? { ...dati.text } : { format: 1, content: "" }, src: dati.src ?? null, image: dati.image ?? {}, ownership: clona(dati.ownership ?? { default: -1 }),
      flags: clona(dati.flags ?? {}), category: dati.category ?? null, _stats: { modifiedTime: tick() } });
    this.parent = parent ?? null;
  }
  get id() { return this._id; }
  get documentName() { return "JournalEntryPage"; }
  get uuid() { return `JournalEntry.${this.parent?.id}.JournalEntryPage.${this.id}`; }
  testUserPermission(u, l) { return permesso(this, u, l); }
  getFlag(s, k) { return this.flags?.[s]?.[k]; }
  toObject() { const { parent, ...r } = this; return clona(r); }
  clone(dati = {}) { const o = fondi(this.toObject(), clona(dati)); return new Pagina(o, { parent: this.parent }); }
  static slugifyHeading(t) { return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['"]/g, "").replace(/[\s-]+/g, "-").slice(0, 64); }
}

export class Journal {
  constructor(dati) {
    Object.assign(this, { _id: dati._id ?? ID(), name: dati.name, ownership: clona(dati.ownership ?? { default: 0 }), flags: clona(dati.flags ?? {}), _stats: { modifiedTime: tick() } });
    this._folder = dati.folder ?? null;
    this.pages = new Collezione();
    for ( const p of (dati.pages ?? []) ) { const x = new Pagina(p, { parent: this }); this.pages.set(x.id, x); }
  }
  get id() { return this._id; }
  get documentName() { return "JournalEntry"; }
  get uuid() { return `JournalEntry.${this.id}`; }
  get folder() { return this._folder ? globalThis.game.folders.get(this._folder) : null; }
  testUserPermission(u, l) { return permesso(this, u, l); }
  // un journal messo da parte (cartella, visibilità, flag)
  async update(u) { const prima = JSON.stringify([this.name, this._folder, this.ownership, this.flags]); const { _id, ...r } = u; const e = espandi(r); if ( "folder" in e ) { this._folder = e.folder; delete e.folder; } fondi(this, e);
    if ( JSON.stringify([this.name, this._folder, this.ownership, this.flags]) === prima ) return undefined; this._stats.modifiedTime = tick(); return this; }
  static async create(dati, { keepId } = {}) {
    if ( globalThis.__finto.fallisci === "journal" ) throw new Error("errore finto del server");
    const d = clona(dati); if ( !keepId ) delete d._id;
    const j = new Journal(d);
    j.ownership[globalThis.game.user.id] = 3;
    globalThis.game.journal.set(j.id, j);
    return j;
  }
  async createEmbeddedDocuments(tipo, lista, { keepId } = {}) {
    if ( globalThis.__finto.fallisci === "pagine" ) throw new Error("errore finto del server");
    const creati = lista.map(d0 => {
      const d = clona(d0); if ( !keepId ) delete d._id;
      if ( d.text ) d.text.content = riscriviServer(d.text.content);
      const p = new Pagina(d, { parent: this });
      p.ownership[globalThis.game.user.id] = 3;
      this.pages.set(p.id, p);
      return p;
    });
    // per le prove: qualcosa che succede nel mondo subito dopo una creazione (il GM che ritocca una pagina da un altro browser)
    const dopo = globalThis.__finto.dopoCrea; globalThis.__finto.dopoCrea = null;
    if ( dopo ) await dopo();
    return creati;
  }
  async updateEmbeddedDocuments(tipo, lista) {
    return lista.map(u => {
      const p = this.pages.get(u._id);
      const { _id, ...resto } = u;
      const e = espandi(resto);
      if ( e.text?.content !== undefined ) e.text.content = riscriviServer(e.text.content);
      fondi(p, e);
      p._stats.modifiedTime = tick();
      return p;
    });
  }
}

export class Cartella {
  constructor(d) { Object.assign(this, { _id: d._id ?? ID(), name: d.name, type: d.type, flags: clona(d.flags ?? {}), _stats: { modifiedTime: tick() } }); this._folder = d.folder ?? null; }
  get id() { return this._id; }
  get folder() { return this._folder ? globalThis.game.folders.get(this._folder) : null; }
  static async create(dati, { keepId } = {}) {
    const d = clona(dati); if ( !keepId ) delete d._id;
    const f = new Cartella(d); globalThis.game.folders.set(f.id, f); return f;
  }
}

// --- tappa 2: Roll Table, attori, compendi (il minimo: nomi, voci, oggetti, flag, immagini; i numeri di dnd5e no) -------------------
const get = (o, k) => k.split(".").reduce((x, p) => x?.[p], o);
const set = (o, k, v) => { const p = k.split("."); let t = o; p.slice(0, -1).forEach(q => { t[q] ??= {}; t = t[q]; }); t[p.at(-1)] = v; };

export class Voce {
  constructor(d, parent) { Object.assign(this, { _id: d._id ?? ID(), type: d.type ?? "text", name: d.name ?? "", description: d.description ?? "", range: [...(d.range ?? [1, 1])], weight: d.weight ?? 1, drawn: !!d.drawn }); this.parent = parent; }
  get id() { return this._id; }
  toObject() { const { parent, ...r } = this; return clona(r); }
}
export class Tabella {
  constructor(d) {
    Object.assign(this, { _id: d._id ?? ID(), name: d.name, formula: d.formula ?? "", description: d.description ?? "", replacement: d.replacement ?? true, displayRoll: d.displayRoll ?? true,
      ownership: clona(d.ownership ?? { default: 0 }), flags: clona(d.flags ?? {}), _stats: { modifiedTime: tick() } });
    this._folder = d.folder ?? null;
    this.results = new Collezione();
    for ( const r of (d.results ?? []) ) { const v = new Voce(r, this); this.results.set(v.id, v); }
  }
  get id() { return this._id; }
  get folder() { return this._folder ? globalThis.game.folders.get(this._folder) : null; }
  testUserPermission(u, l) { return permesso(this, u, l); }
  toObject() { return { ...clona({ ...this, results: undefined, _folder: undefined }), folder: this._folder, results: this.results.map(r => r.toObject()) }; }
  static async create(d, { keepId } = {}) { const x = clona(d); if ( !keepId ) delete x._id; const t = new Tabella(x); t.ownership[globalThis.game.user.id] = 3; globalThis.game.tables.set(t.id, t); return t; }
  // come Foundry: un aggiornamento senza cambiamenti non restituisce niente
  async update(u) { const prima = JSON.stringify(this.toObject()); const { _id, ...r } = u; const e = espandi(r); if ( "folder" in e ) { this._folder = e.folder; delete e.folder; } fondi(this, e);
    if ( JSON.stringify(this.toObject()) === prima ) return undefined; this._stats.modifiedTime = tick(); return this; }
  async updateEmbeddedDocuments(tipo, lista) { if ( globalThis.__finto.fallisci === "voci" ) throw new Error("errore finto del server"); const out = lista.map(u => { const v = this.results.get(u._id); const prima = JSON.stringify(v.toObject()); const { _id, ...r } = u; Object.assign(v, clona(r));
    return (JSON.stringify(v.toObject()) === prima) ? null : v; }).filter(Boolean); return out; }
  async createEmbeddedDocuments(tipo, lista) { const out = lista.map(d => { const v = new Voce(clona(d), this); this.results.set(v.id, v); return v; }); this._stats.modifiedTime = tick(); return out; }
}
export class Attore {
  constructor(d) {
    Object.assign(this, { _id: d._id ?? ID(), name: d.name, type: d.type ?? "npc", img: d.img ?? "icons/svg/mystery-man.svg", system: clona(d.system ?? {}), ownership: clona(d.ownership ?? { default: 0 }),
      flags: clona(d.flags ?? {}), prototypeToken: clona(d.prototypeToken ?? {}), _stats: { ...(clona(d._stats ?? {})), modifiedTime: tick() } });
    this._folder = d.folder ?? null;
    this._source = { system: clona(d.system ?? {}) };
    this._items = clona(d.items ?? []);
  }
  get id() { return this._id; }
  get uuid() { return `Actor.${this.id}`; }
  get folder() { return this._folder ? globalThis.game.folders.get(this._folder) : null; }
  get items() { const c = new Collezione(); for ( const i of this._items ) c.set(i._id, { ...i, id: i._id }); return c; }
  testUserPermission(u, l) { return permesso(this, u, l); }
  toObject() { return { ...clona({ ...this, _items: undefined, _source: undefined, _folder: undefined }), folder: this._folder, items: clona(this._items) }; }
  static async create(d, { keepId } = {}) { if ( globalThis.__finto.fallisci === "attore" ) throw new Error("errore finto del server"); const x = clona(d); if ( !keepId ) delete x._id; const a = new Attore(x); a.ownership[globalThis.game.user.id] = 3; globalThis.game.actors.set(a.id, a); return a; }
  async update(u) { const prima = JSON.stringify(this.toObject()); const { _id, ...r } = u; const e = espandi(r); if ( "folder" in e ) { this._folder = e.folder; delete e.folder; } fondi(this, e); if ( JSON.stringify(this.toObject()) === prima ) return undefined; this._stats.modifiedTime = tick(); return this; }
}
// --- tappa 3: le scene con note, tasselli e disegni, e le macro --------------------------------------------------------------------------
// i campi di Foundry con i loro valori di default (V14); «__finto.scarta» toglie un campo, come uno che Foundry non tiene
const DIFETTI = {
  Note: () => ({ entryId: null, pageId: null, x: 0, y: 0, sort: 0, levels: [], texture: { src: null, tint: "#ffffff" }, iconSize: 40, text: "", fontSize: 32, textAnchor: 1, flags: {} }),
  Tile: () => ({ x: 0, y: 0, width: 0, height: 0, sort: 0, levels: [], texture: { src: null, tint: "#ffffff" }, hidden: false, alpha: 1, locked: false, flags: {} }),
  Drawing: () => ({ x: 0, y: 0, sort: 0, levels: [], shape: { type: "r", width: 0, height: 0, radius: null, points: [] }, text: "", fontSize: 48, textColor: "#ffffff",
    fillType: 0, fillColor: "#ffffff", fillAlpha: 0.5, strokeWidth: 8, strokeColor: "#ffffff", strokeAlpha: 1, hidden: false, locked: false, flags: {} })
};
class Elemento {
  constructor(tipo, d = {}, { parent } = {}) {
    const x = clona(d); delete x._id;
    Object.assign(this, fondi(DIFETTI[tipo](), x), { _id: d._id ?? ID() });
    if ( globalThis.__finto?.scarta ) delete this[globalThis.__finto.scarta];
    Object.defineProperty(this, "documentName", { value: tipo, enumerable: false });
    Object.defineProperty(this, "parent", { value: parent ?? null, enumerable: false, writable: true });
  }
  get id() { return this._id; }
  getFlag(s, k) { return this.flags?.[s]?.[k]; }
  toObject() { return clona({ ...this }); }
  clone(u = {}) { return new this.constructor(fondi(this.toObject(), clona(u)), { parent: this.parent }); }
}
export class Nota extends Elemento { constructor(d, o) { super("Note", d, o); } }
export class Tassello extends Elemento { constructor(d, o) { super("Tile", d, o); } }
export class Disegno extends Elemento { constructor(d, o) { super("Drawing", d, o); } }
const CLASSE = { Note: Nota, Tile: Tassello, Drawing: Disegno };
export class Scena {
  constructor(d) {
    Object.assign(this, { _id: d._id ?? ID(), name: d.name, flags: clona(d.flags ?? {}) });
    this.levels = new Collezione((d.livelli ?? ["defaultLevel0000"]).map(l => [l, { id: l }]));
    this.notes = new Collezione(); this.tiles = new Collezione(); this.drawings = new Collezione();
    this.tokens = new Collezione(); // i token, per la rinomina degli attori
  }
  get id() { return this._id; }
  getFlag(s, k) { return this.flags?.[s]?.[k]; }
  getEmbeddedCollection(t) { return { Note: this.notes, Tile: this.tiles, Drawing: this.drawings, Token: this.tokens }[t]; }
  aggiungiToken(d) { const t = { _id: d._id ?? ID(), name: d.name, actorId: d.actorId, get id() { return this._id; }, toObject() { return clona({ _id: this._id, name: this.name, actorId: this.actorId }); } }; this.tokens.set(t._id, t); return t; }
  async createEmbeddedDocuments(t, lista, { keepId } = {}) {
    if ( globalThis.__finto.fallisci === "scena" ) throw new Error("errore finto del server");
    const c = this.getEmbeddedCollection(t);
    return lista.map(d0 => { const d = clona(d0); if ( !keepId ) delete d._id; const e = new CLASSE[t](d, { parent: this }); c.set(e.id, e); return e; });
  }
  async updateEmbeddedDocuments(t, lista) {
    if ( globalThis.__finto.fallisci === "scena" ) throw new Error("errore finto del server");
    const c = this.getEmbeddedCollection(t);
    return lista.map(u => { const e = c.get(u._id); const prima = JSON.stringify(e.toObject()); const { _id, ...r } = u; fondi(e, espandi(r)); return (JSON.stringify(e.toObject()) === prima) ? null : e; }).filter(Boolean);
  }
}
export class Macro {
  constructor(d) {
    Object.assign(this, { _id: d._id ?? ID(), name: d.name, type: d.type ?? "script", command: String(d.command ?? "").replace(/\n$/, ""), img: d.img ?? "icons/svg/dice-target.svg",
      ownership: clona(d.ownership ?? { default: 0 }), flags: clona(d.flags ?? {}), _stats: { modifiedTime: tick() } });
    this._folder = d.folder ?? null;
  }
  get id() { return this._id; }
  get uuid() { return `Macro.${this.id}`; }
  get folder() { return this._folder ? globalThis.game.folders.get(this._folder) : null; }
  testUserPermission(u, l) { return permesso(this, u, l); }
  toObject() { return { ...clona({ ...this, _folder: undefined }), folder: this._folder }; }
  static async create(d, { keepId } = {}) { if ( globalThis.__finto.fallisci === "macro" ) throw new Error("errore finto del server"); const x = clona(d); if ( !keepId ) delete x._id; const m = new Macro(x); m.ownership[globalThis.game.user.id] = 3; globalThis.game.macros.set(m.id, m); return m; }
  async update(u) { const prima = JSON.stringify(this.toObject()); const { _id, ...r } = u; const e = espandi(r); if ( "folder" in e ) { this._folder = e.folder; delete e.folder; } fondi(this, e); if ( JSON.stringify(this.toObject()) === prima ) return undefined; this._stats.modifiedTime = tick(); return this; }
}

/** Un compendio finto: documenti di dati, con l'indice (nome, system.source). */
export class Compendio {
  constructor(collection, documentName, docs) { Object.assign(this, { collection, documentName, metadata: { packageName: collection.split(".")[0], label: collection } }); this.docs = new Map(docs.map(d => [d._id, d])); }
  async getIndex({ fields = [] } = {}) { return new Collezione([...this.docs.values()].map(d => { const e = { _id: d._id, name: d.name }; for ( const f of fields ) set(e, f, clona(get(d, f))); return [d._id, e]; })); }
  async getDocument(id) { const d = this.docs.get(id); return d ? { ...clona(d), uuid: `Compendium.${this.collection}.${id}`, toObject: () => clona(d) } : null; }
}
const daCompendio = doc => { const o = doc.toObject(); delete o._id; o._stats = { ...(o._stats ?? {}), compendiumSource: doc.uuid }; return o; };

/** Prepara il mondo finto nei globali; restituisce gli strumenti per manipolarlo. */
export function preparaMondo({ jsdom }) {
  const file = new Map();                                              // percorso → Uint8Array
  globalThis.__finto = { file, fallisci: null };
  globalThis.DOMParser = new jsdom.JSDOM("").window.DOMParser;
  const utenti = new Collezione();
  const U = (id, name, role) => { const u = { id, name, role, isGM: role >= 3, active: false }; utenti.set(id, u); return u; };
  const lancia = U("gm2bbbbbbbbbbbbb", "Lucia", 4); lancia.active = true;
  U("gm1aaaaaaaaaaaaa", "Gamemaster", 4);
  U("as1ddddddddddddd", "Marco", 3);
  U("gm3ccccccccccccc", "Nadia", 4);                            // un GM fuori dagli ammessi
  U("pl1aaaaaaaaaaaaa", "Alba", 1);
  U("pl2bbbbbbbbbbbbb", "Bruna", 1);
  globalThis.CONST = { USER_ROLES: { PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 }, DOCUMENT_OWNERSHIP_LEVELS: LIV, JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 },
    TOKEN_DISPOSITIONS: { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 }, TABLE_RESULT_TYPES: { TEXT: "text", DOCUMENT: "document" }, DEFAULT_TOKEN: "icons/svg/mystery-man.svg",
    TEXT_ANCHOR_POINTS: { CENTER: 0, BOTTOM: 1, TOP: 2, LEFT: 3, RIGHT: 4 }, DRAWING_TYPES: { RECTANGLE: "r", ELLIPSE: "e", TEXT: "t", POLYGON: "p", FREEHAND: "f" }, DRAWING_FILL_TYPES: { NONE: 0, SOLID: 1, PATTERN: 2 } };
  globalThis.game = { user: lancia, users: utenti, world: { id: "mondo-finto" }, version: "14.369", system: { id: "dnd5e", version: "6.0.6" },
    folders: new Collezione(), journal: new Collezione(), actors: Object.assign(new Collezione(), { fromCompendium: daCompendio }), items: Object.assign(new Collezione(), { fromCompendium: daCompendio }),
    tables: new Collezione(), macros: new Collezione(), scenes: new Collezione(), packs: new Collezione(), modules: new Collezione(),
    // le impostazioni di mondo: register, get, set (con una copia, come il server)
    settings: (() => { const reg = new Map(), val = new Map(); return {
      register: (m, k, cfg) => { reg.set(`${m}.${k}`, cfg); if ( !val.has(`${m}.${k}`) ) val.set(`${m}.${k}`, clona(cfg.default)); },
      get: (m, k) => { if ( !reg.has(`${m}.${k}`) ) throw new Error(`impostazione ${m}.${k} non registrata`); return clona(val.get(`${m}.${k}`)); },
      set: async (m, k, v) => { if ( globalThis.__finto.fallisci === "impostazioni" ) throw new Error("errore finto del server"); val.set(`${m}.${k}`, clona(v)); return clona(v); },
      _val: val }; })() };
  globalThis.CONFIG = { Folder: { documentClass: Cartella }, JournalEntry: { documentClass: Journal }, JournalEntryPage: { documentClass: Pagina }, RollTable: { documentClass: Tabella }, Actor: { documentClass: Attore },
    Note: { documentClass: Nota }, Tile: { documentClass: Tassello }, Drawing: { documentClass: Disegno }, Macro: { documentClass: Macro },
    DND5E: { actorSizes: { tiny: { token: 0.5 }, sm: {}, med: {}, lg: { token: 2 }, huge: { token: 3 }, grg: { token: 4 } } } };
  globalThis.foundry = {
    data: { operators: { ForcedDeletion } },
    utils: {
      expandObject: espandi,
      escapeHTML: x => String(x).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]),
      getProperty: get,
      setProperty: (o, k, v) => { set(o, k, v); return true; },
      deepClone: clona,
      randomID: (n = 16) => ID().slice(0, n),
      mergeObject: (a, b, { inplace = true } = {}) => fondi(inplace ? a : clona(a), b),
      fromUuid: async u => {
        const p = u.split(".");
        if ( p[0] === "JournalEntry" ) { const j = game.journal.get(p[1]); return (p.length > 2) ? (j?.pages.get(p[3]) ?? null) : (j ?? null); }
        const c = { Actor: game.actors, Item: game.items, RollTable: game.tables, Macro: game.macros }[p[0]];
        return c?.get(p[1]) ?? null;
      }
    },
    applications: { apps: { FilePicker: { implementation: { upload: async (src, cartella, f) => {
      const percorso = `${cartella}/${f.name}`;
      file.set(percorso, new Uint8Array(await f.arrayBuffer()));
      return { path: percorso };
    } } } } }
  };
  globalThis.fetch = async url => {
    const percorso = decodeURIComponent(String(url).replace(/^\//, "").replace(/\?.*$/, ""));
    const b = file.get(percorso);
    return { ok: !!b, status: b ? 200 : 404, arrayBuffer: async () => b.slice().buffer, text: async () => new TextDecoder().decode(b) };
  };
  return { file, lancia, utenti };
}
