/**
 * Il caricatore: la conversione in metri degli attori nuovi, prima di crearli, in un mondo che usa le unità metriche
 * (l'impostazione di dnd5e «Usa Unità Metriche di Lunghezza»). Fa quello che faceva una macro di conversione a parte, che voleva
 * il mondo senza nessun altro connesso.
 *
 * Le regole e le funzioni vengono da quella macro, che vive fuori da questo repository (con la sua mappa dei campi di dnd5e),
 * copiate per gli attori, i loro oggetti ed effetti e il token prototipo (le unità vuote si leggono in piedi, come nei compendi).
 * Il segno flags.world.metric è lo stesso della macro: una sua seconda passata salta gli attori convertiti qui. Se la macro
 * cambia, si cambia anche qui (e il contrario).
 */
const DATA = "2026-10-05";   // la versione delle regole della macro

const MARK = "metric";
const r2 = v => Math.round(v * 100) / 100;
const ft = v => Math.round(v * 30) / 100;
const LEN = { ft: ["m", ft], mi: ["km", v => r2(v * 1.5)] };
const TRAVEL = { mph: ["kph", v => r2(v * 1.5)] };
const WEIGHT = { lb: ["kg", v => v / 2], tn: ["Mg", v => v] };
const VOLUME = { cubicFoot: ["liter", v => Math.round(v * 283.17) / 10] };
const UNITS = { ft: "m", mi: "km", lb: "kg", tn: "Mg", mph: "kph", cubicFoot: "liter" };
const NUM = /^\s*[+-]?\d+(?:\.\d+)?\s*$/;
const REF = /^\s*@[\w.\-]+\s*$/;
const REF_OK = /^\s*@(attributes\.(movement|senses)\.|scale\.)/;
// Formule che dipendono solo dal livello dell'oggetto (l'area di un incantesimo che cresce con lo slot):
// si moltiplicano intere per 3/10.
const LEVEL_ONLY = /^[\d\s.+\-*/()]*(@item\.level[\d\s.+\-*/()]*)+$/;
const IT_FLAG = "flags.dnd5e-it-translation.converted";

let log = { modifiche: [], aMano: [], saltati: [] };
const marked = d => !!foundry.utils.getProperty(d, `flags.world.${MARK}`);
const mark = d => foundry.utils.setProperty(d, `flags.world.${MARK}`, { v: 1, data: new Date().toISOString().slice(0, 10), versione: DATA });
// Unità effettive di un gruppo con l'unità vuota: in SOLO i documenti vengono dai compendi, in piedi;
// altrimenti vale il dato preparato, che a impostazioni spente dice «ft».
const effective = (raw) => raw ?? "ft";

function conv(v, f, path) {
  if ( (v === null) || (v === undefined) || (v === "") ) return v;
  if ( typeof v === "number" ) {
    const n = f(v);
    if ( n === v ) return v;
    log.modifiche.push(`${path}: ${v} → ${n}`);
    return n;
  }
  if ( (typeof v === "string") && NUM.test(v) ) {
    const x = Number(v), n = f(x);
    if ( n === x ) return v;
    log.modifiche.push(`${path}: ${v} → ${n}`);
    return String(n);
  }
  if ( (typeof v === "string") && REF.test(v) ) {
    if ( !REF_OK.test(v) ) log.aMano.push(`${path}: riferimento «${v}» lasciato com'è`);
    return v;
  }
  if ( (typeof v === "string") && LEVEL_ONLY.test(v) && (f === ft) ) {
    const n = `(${v}) * 3 / 10`;
    log.modifiche.push(`${path}: ${v} → ${n}`);
    return n;
  }
  log.aMano.push(`${path}: formula «${v}»`);
  return v;
}

function group(o, keys, table, path, { integer=false, units }={}) {
  if ( !o || (typeof o !== "object") ) return;
  const map = table[units ?? o.units];
  if ( !map ) return;
  for ( const k of keys ) {
    if ( !(k in o) ) continue;
    o[k] = conv(o[k], map[1], `${path}.${k}`);
    if ( integer && (typeof o[k] === "number") && !Number.isInteger(o[k]) ) log.aMano.push(`${path}.${k} = ${o[k]}: il campo vuole un intero, Foundry lo arrotonda`);
  }
  o.units = map[0];
}

function movement(m, eff, path) {
  if ( !m ) return;
  const map = LEN[eff];
  if ( !map ) { if ( (m.units == null) && eff ) m.units = eff; return; }
  for ( const k of Object.keys(m.speeds ?? {}) ) {
    if ( k !== "jump" ) m.speeds[k] = conv(m.speeds[k], map[1], `${path}.speeds.${k}`);
  }
  if ( "bonus" in m ) m.bonus = conv(m.bonus, map[1], `${path}.bonus`);
  m.units = map[0];
}

function senses(s, eff, path) {
  if ( !s ) return;
  const map = LEN[eff];
  if ( !map ) { if ( (s.units == null) && eff ) s.units = eff; return; }
  for ( const [k, v] of Object.entries(s.ranges ?? {}) ) {
    if ( (typeof v !== "number") || !v ) continue;
    s.ranges[k] = conv(v, map[1], `${path}.ranges.${k}`);
    if ( !Number.isInteger(s.ranges[k]) ) log.aMano.push(`${path}.ranges.${k} = ${s.ranges[k]}: il campo vuole un intero, Foundry lo arrotonda`);
  }
  s.units = map[0];
}

function template(t, path) {
  if ( !t ) return;
  const map = LEN[t.units];
  if ( !map ) return;
  let dims = {};
  try { dims = dnd5e.dataModels.shared.TargetField.templateDimensions(t.type) ?? {}; } catch(err) { dims = {}; }
  for ( const k of ["size", "width", "height"] ) {
    if ( (k !== "size") && dims[k] && !t[k] && (t.units === "ft") ) {
      t[k] = "1.5";
      log.modifiche.push(`${path}.${k}: vuoto (5 ft) → 1.5`);
    }
    else t[k] = conv(t[k], map[1], `${path}.${k}`);
  }
  t.units = map[0];
}

function travel(tr, path) {
  if ( !tr ) return;
  const map = TRAVEL[tr.units ?? "mph"];
  if ( !map ) return;
  for ( const k of ["paces", "speeds"] ) {
    for ( const [p, v] of Object.entries(tr[k] ?? {}) ) tr[k][p] = conv(v, map[1], `${path}.${k}.${p}`);
  }
  tr.units = map[0];
}

const LEN_KEYS = [
  /^system\.attributes\.movement\.(speeds\.)?(walk|burrow|climb|fly|swim|bonus|speed)$/,
  /^system\.attributes\.senses\.(ranges\.)?(darkvision|blindsight|tremorsense|truesight)$/,
  /^system\.traits\.languages\.communication\.[^.]+\.value$/,
  /^system\.range\.(value|long|reach)$/,
  /^system\.target\.template\.(size|width|height)$/,
  /activities.*\.(range\.value|target\.template\.(size|width|height)|teleport\.value)$/,
  /^token\.(sight\.range|light\.(dim|bright)|detectionModes\..*\.range)$/
];
const WEIGHT_KEYS = [/^system\.(weight\.value|capacity\.weight\.value)$/];
const MANUAL_KEYS = /^system\.(speed\.value|capacity\.volume\.value|attributes\.travel\.)/;
const SENSE_KEY = /^system\.attributes\.senses\./;

function effect(ef, path) {
  if ( !ef ) return;
  if ( marked(ef) ) return;
  const changes = ef.system?.changes ?? ef.changes;
  for ( const c of (Array.isArray(changes) ? changes : []) ) {
    const key = c.key ?? "";
    const type = String(c.type ?? c.mode ?? "");
    if ( /\.units$/.test(key) ) {
      const m = UNITS[c.value];
      if ( m ) { log.modifiche.push(`${path} «${ef.name}» ${key}: ${c.value} → ${m}`); c.value = m; }
      continue;
    }
    if ( /encumbrance\.bonuses/.test(key) ) log.aMano.push(`${path} «${ef.name}»: ${key} = ${c.value} (già letto in kg)`);
    if ( MANUAL_KEYS.test(key) ) log.aMano.push(`${path} «${ef.name}»: ${key} = ${c.value}`);
    const isLen = LEN_KEYS.some(r => r.test(key));
    const isWeight = WEIGHT_KEYS.some(r => r.test(key));
    if ( !isLen && !isWeight ) continue;
    if ( type.startsWith("dnd5e.") || ["multiply", "1"].includes(type) ) continue;
    if ( ["custom", "0"].includes(type) ) { log.aMano.push(`${path} «${ef.name}»: ${key} = ${c.value} (custom)`); continue; }
    c.value = conv(c.value, isLen ? ft : (v => v / 2), `${path} «${ef.name}» ${key}`);
    if ( isLen && SENSE_KEY.test(key) && !Number.isInteger(Number(c.value)) ) log.aMano.push(`${path} «${ef.name}» ${key} = ${c.value}: i sensi vogliono interi`);
  }
  mark(ef);
}

function token(t, path, { elevation=false }={}) {
  if ( !t ) return;
  if ( t.sight?.range ) t.sight.range = conv(t.sight.range, ft, `${path} vista`);
  for ( const k of ["dim", "bright"] ) if ( t.light?.[k] ) t.light[k] = conv(t.light[k], ft, `${path} luce.${k}`);
  const dm = t.detectionModes;
  if ( Array.isArray(dm) ) dm.forEach((m, i) => { if ( m?.range ) m.range = conv(m.range, ft, `${path} rilevamento.${m.id ?? i}`); });
  else if ( dm && (typeof dm === "object") ) {
    for ( const [id, m] of Object.entries(dm) ) if ( m?.range ) m.range = conv(m.range, ft, `${path} rilevamento.${id}`);
  }
  if ( elevation && t.elevation ) t.elevation = conv(t.elevation, ft, `${path} quota`);
}

function item(src, path) {
  if ( !src ) return src;
  if ( marked(src) ) return src;
  if ( foundry.utils.getProperty(src, IT_FLAG) ) { log.aMano.push(`${path}: toccato dal modulo italiano, non convertito`); return src; }
  const s = src.system ?? {};
  if ( (s.weight?.units === "kg") && s.weight.value ) log.aMano.push(`${path}: peso già in kg (${s.weight.value}), lasciato com'è`);
  group(s.weight, ["value"], WEIGHT, `${path} peso`);
  if ( s.capacity ) {
    group(s.capacity.weight, ["value"], WEIGHT, `${path} capacità`);
    group(s.capacity.volume, ["value"], VOLUME, `${path} volume`);
    const wu = s.weight?.units, cu = s.capacity.weight?.units;
    if ( s.capacity.weight?.value && wu && cu && (wu !== cu) ) log.aMano.push(`${path}: peso in ${wu} e capacità in ${cu}`);
  }
  if ( s.range ) group(s.range, src.type === "weapon" ? ["value", "long", "reach"] : ["value"], LEN, `${path} gittata`);
  if ( s.speed && (typeof s.speed === "object") ) group(s.speed, ["value"], LEN, `${path} velocità`, { integer: true });
  if ( s.target?.template ) template(s.target.template, `${path} area`);
  for ( const [id, a] of Object.entries(s.activities ?? {}) ) {
    const ap = `${path} › ${a.name || a.type || id}`;
    if ( a.range ) group(a.range, ["value"], LEN, `${ap} gittata`);
    if ( a.target?.template ) template(a.target.template, `${ap} area`);
    if ( a.teleport ) group(a.teleport, ["value"], LEN, `${ap} teletrasporto`);
  }
  if ( src.type === "race" ) {
    movement(s.movement, effective(s.movement?.units), `${path} movimento`);
    senses(s.senses, effective(s.senses?.units), `${path} sensi`);
  }
  const adv = s.advancement ? (Array.isArray(s.advancement) ? s.advancement : Object.values(s.advancement)) : [];
  for ( const a of adv ) {
    if ( (a.type !== "ScaleValue") || (a.configuration?.type !== "distance") ) continue;
    const map = LEN[a.configuration.distance?.units || "ft"];
    if ( !map ) continue;
    for ( const [lvl, sc] of Object.entries(a.configuration.scale ?? {}) ) {
      if ( sc && (typeof sc.value === "number") ) sc.value = conv(sc.value, map[1], `${path} scala «${a.title || a._id}» liv. ${lvl}`);
    }
    a.configuration.distance ??= {};
    a.configuration.distance.units = map[0];
  }
  for ( const ef of src.effects ?? [] ) effect(ef, path);
  mark(src);
  return src;
}

function actor(src, path) {
  if ( marked(src) ) { log.saltati.push(`${path}: già convertito`); return null; }
  if ( foundry.utils.getProperty(src, IT_FLAG) ) { log.aMano.push(`${path}: toccato dal modulo italiano, non convertito`); return null; }
  const a = src.system?.attributes ?? {};
  movement(a.movement, effective(a.movement?.units), `${path} movimento`);
  senses(a.senses, effective(a.senses?.units), `${path} sensi`);
  for ( const [k, c] of Object.entries(src.system?.traits?.languages?.communication ?? {}) ) group(c, ["value"], LEN, `${path} ${k}`);
  travel(a.travel, `${path} viaggio`);
  if ( src.type === "vehicle" ) {
    group(src.system.traits?.weight, ["value"], WEIGHT, `${path} peso`);
    group(a.capacity?.cargo, ["value"], WEIGHT, `${path} carico`);
    group(src.system.traits?.keel, ["value"], LEN, `${path} chiglia`);
    group(src.system.traits?.beam, ["value"], LEN, `${path} baglio`);
  }
  token(src.prototypeToken, `${path} token prototipo`);
  for ( const it of src.items ?? [] ) item(it, `${path} › ${it.name}`);
  for ( const ef of src.effects ?? [] ) effect(ef, path);
  mark(src);
  return src;
}

/**
 * Converte in metri i dati di un attore in memoria (toObject di un attore costruito, con oggetti, effetti e token prototipo), sul
 * posto. @returns { modifiche, aMano, saltati }: i campi cambiati, quelli da guardare a mano, l'attore già convertito
 */
export function attoreInMetri(src, nome) {
  log = { modifiche: [], aMano: [], saltati: [] };
  actor(src, nome);
  return log;
}
