// Rangos y respeto entre colonias.
// · La Ley VITA está por encima de todo: Vita, el CEO, juzga cada hora la conducta de cada colonia
//   y puede sancionar a cualquiera, también a la élite.
// · Oruz es el rango intermedio y el gestor social: cuando una colonia pasa apuros, una Oruz organiza
//   una colecta entre las colonias ricas, pone su parte y media cuando una colonia le guarda rencor a otra.
//   Cada colonia rica decide según su carácter si da o se niega, y eso decide cuánto la respetan las demás.
// · Ámbar es la élite: las colonias con más respeto y mérito, con pocos asientos.
// El módulo solo mueve VIT de un tesoro a otro (nunca acuña ni quema) y deja en la cadena cada
// ascenso, descenso, sanción y ayuda.
import { CONFIG, block, clog } from "./core.js";

export const RANGOS = {
  CADA: 6,              // ciclos entre dos consejos: una hora real
  DIA: 144,
  PASO: 0.06,           // cuánto se acerca en cada consejo el juicio de VITA a la conducta del momento
  OLVIDO: 0.995,        // lo que queda de una buena o mala acción de un consejo al siguiente
  FAMILIA: 25,          // respeto fijo entre madre, hija y hermanas
  ORUZ: 60, ORUZ_SALE: 52,
  AMBAR: 72, AMBAR_MERITO: 55, AMBAR_SALE: 65, AMBAR_MERITO_SALE: 48,
  MARGEN: 5,            // cuánto tiene que superar una aspirante a otra para quitarle el asiento
  AYUDA_TESORO: 120,    // tesoro mínimo para organizar una colecta
  RICA: 300,            // a partir de este tesoro se le pide a una colonia que ponga su parte
  GENEROSA: 0.35,       // da si su generosidad (más el deber de su rango) llega a esto
  DEBER: 0.25,          // lo que suma a la generosidad ser Oruz o Ámbar
  COLECTAS: 2,          // colectas como mucho por consejo
  ACAPARA: CONFIG.UPKEEP_FREE,
};

export const LEY = {
  name: "Ley VITA",
  desc: "Está por encima de todos los rangos. La aplica Vita, el CEO: juzga cada hora a cada colonia y puede sancionar a cualquiera, también a la élite.",
};
export const RANKS = {
  ambar: { name: "Ámbar", nivel: 3, desc: "La élite: las colonias con más respeto y mérito. Hay un asiento por cada cuatro colonias vivas." },
  oruz: { name: "Oruz", nivel: 2, desc: "Rango intermedio y gestor social: organizan colectas para las colonias en apuros, ponen su parte y median en los rencores. Caben la mitad de las colonias vivas." },
  ciudadana: { name: "Ciudadana", nivel: 1, desc: "Toda colonia nace ciudadana de VITA y sube con su conducta." },
};
export const LEYES = [
  { k: "vida", t: "Cuidar la vida", d: "Mantener sanas a sus células." },
  { k: "ayuda", t: "Dar en las colectas", d: "Quien da gana el respeto de la colonia ayudada; quien se niega, su rencor." },
  { k: "acaparar", t: "No acaparar", d: `Negarse a una colecta con más de ${RANGOS.ACAPARA} VIT en el tesoro se sanciona.` },
  { k: "servir", t: "Servir a sus jugadores", d: "Cada célula adoptada y cada inversor suman respeto y mérito." },
  { k: "familia", t: "Honrar a la familia", d: "Madre, hijas y hermanas se respetan desde que nacen." },
];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const vivas = w => Object.values(w.colonies).filter(c => c.alive);
const ultimoBloque = w => w.chain.length ? w.chain[w.chain.length - 1].n : -1;
export const asientos = n => ({ ambar: Math.max(1, Math.floor(n / 4)), oruz: Math.max(1, Math.floor(n / 2)) });
// En apuros: salud baja, o pobre en plena sequía, helada o plaga, o pobre y recién nacida
export const enApuros = c => c.alive && (c.salud < 50 || (c.treasury < 60 && (!!c.event || c.edad < 3 * RANGOS.DIA)));
export const pariente = (a, b) => a.parent === b.id || b.parent === a.id || (!!a.parent && a.parent === b.parent);
export const generosidad = c => { const p = c.ai.persona; return clamp(p.cuidado * (1 - 0.6 * p.codicia), 0, 1); };
// A una colonia agradecida (recién salvada) no se le pide nada para otras
const puedeDar = c => c.alive && !enApuros(c) && !(c.gratitud > 0) && c.salud >= 50 && c.treasury >= RANGOS.AYUDA_TESORO;
// Confianza de los jugadores: células adoptadas más 5 por cada inversor
export function confianza(c) {
  let n = 0; for (const x of c.cells) if (x.owner !== "colonia") n++;
  return n + 5 * Object.keys(c.fund?.shares || {}).filter(k => k !== "colonia").length;
}
export function merito(w, c) {
  const hijas = Object.values(w.colonies).filter(x => x.parent === c.id && x.alive).length;
  return Math.round(100 * (0.25 * clamp(c.cells.length / CONFIG.CELL_CAP_BASE, 0, 1) + 0.25 * clamp(c.salud / 100, 0, 1)
    + 0.2 * clamp(c.edad / (7 * RANGOS.DIA), 0, 1) + 0.15 * clamp(hijas / 2, 0, 1) + 0.15 * clamp(confianza(c) / 25, 0, 1)));
}

// ---------- estado ----------
export function ensure(w) {
  const r = (w.rangos ??= {
    v: 1, consejo: null, consejos: 0, visto: ultimoBloque(w), rel: {}, info: {}, cronica: [],
    stats: { ascensos: 0, descensos: 0, ayudas: 0, vitAyudas: 0, sanciones: 0, mediaciones: 0 },
  });
  for (const c of Object.values(w.colonies)) if (!r.info[c.id]) conocer(w, r, c);
  return r;
}
// Las colonias que ya vivían cuando llegó la ley se juzgan por cómo están; las que nacen después empiezan en 50.
function conocer(w, r, c) {
  const i = r.info[c.id] = { rango: "ciudadana", desde: w.tick, vita: 50, pares: null, respeto: 50, merito: merito(w, c), ayudas: 0, negativas: 0, recibidas: 0, sanciones: 0, ultimaAyuda: -1e9, nego: -1e9, recibida: -1e9, sancion: -1e9, leyes: null };
  if (r.consejos === 0 && c.alive) i.vita = i.respeto = conducta(w, r, c, []).total;
}
function sumar(r, de, a, n) { const m = (r.rel[de] ??= {}); m[a] = clamp((m[a] || 0) + n, -100, 100); }
// Respeto que `de` le tiene a `a`: lo que ha visto que hizo más el lazo de familia
const relacion = (r, de, a) => (r.rel[de.id]?.[a.id] || 0) + (pariente(de, a) ? RANGOS.FAMILIA : 0);
function cronica(r, w, txt) { r.cronica.unshift({ t: w.tick, txt }); if (r.cronica.length > 40) r.cronica.length = 40; }

// ---------- un ciclo ----------
// Se llama después de cada ciclo del mundo. Lee en la cadena las ayudas y rescates de la supervisora
// y, cada RANGOS.CADA ciclos, reúne el consejo. Devuelve true si hubo consejo.
export function step(w) {
  const r = ensure(w);
  leerCadena(w, r);
  if (r.consejo != null && w.tick - r.consejo < RANGOS.CADA) return false;
  consejo(w, r);
  return true;
}
function leerCadena(w, r) {
  const nuevos = [];
  for (let k = w.chain.length - 1; k >= 0 && w.chain[k].n > r.visto; k--) nuevos.push(w.chain[k]);
  r.visto = ultimoBloque(w);
  const vs = vivas(w);
  for (const b of nuevos.reverse()) {
    if (b.tipo !== "ayuda" && b.tipo !== "rescate") continue;
    const donante = w.colonies[b.de], recibe = w.colonies[b.a];
    if (!donante || !recibe) continue;
    sumar(r, recibe.id, donante.id, b.tipo === "rescate" ? 25 : 15);
    for (const x of vs) if (x !== donante && x !== recibe) sumar(r, x.id, donante.id, 2);
  }
}

function consejo(w, r) {
  r.consejo = w.tick; r.consejos++;
  const vs = vivas(w);
  for (const de in r.rel) {
    for (const a in r.rel[de]) { const v = r.rel[de][a] * RANGOS.OLVIDO; if (Math.abs(v) < 0.5) delete r.rel[de][a]; else r.rel[de][a] = v; }
    if (!Object.keys(r.rel[de]).length) delete r.rel[de];
  }
  // Gestión social: colectas para las colonias en apuros (las más pobres primero)
  const apuros = vs.filter(c => enApuros(c) && w.tick - r.info[c.id].recibida >= RANGOS.DIA / 4).sort((a, b) => a.treasury - b.treasury || a.salud - b.salud);
  const desatendidas = [];
  for (const n of apuros.slice(0, RANGOS.COLECTAS)) if (!colecta(w, r, n, vs)) desatendidas.push(n);
  // Juicio de VITA
  for (const c of vs) {
    const i = r.info[c.id], j = conducta(w, r, c, desatendidas);
    i.leyes = j.leyes;
    i.vita = clamp(i.vita + (j.total - i.vita) * RANGOS.PASO, 0, 100);
    if (!j.leyes.acaparar && w.tick - i.sancion >= RANGOS.DIA) sancionar(w, r, c);
    i.merito = merito(w, c);
  }
  mediarRencor(w, r, vs);
  for (const c of vs) {
    const i = r.info[c.id], otras = vs.filter(x => x !== c);
    i.pares = otras.length ? clamp(50 + otras.reduce((s, x) => s + relacion(r, x, c), 0) / otras.length / 2, 0, 100) : null;
    i.respeto = +(i.pares == null ? i.vita : (i.vita + i.pares) / 2).toFixed(1);
  }
  asignar(w, r, vs);
}

function conducta(w, r, c, desatendidas) {
  const i = r.info[c.id], conf = confianza(c), nego = w.tick - i.nego < RANGOS.DIA;
  const leyes = {
    vida: c.salud >= 60,
    ayuda: !nego && !(desatendidas.length && puedeDar(c) && w.tick - i.ultimaAyuda >= RANGOS.DIA),
    acaparar: !(nego && c.treasury > RANGOS.ACAPARA),
    servir: conf > 0,
  };
  const total = 100 * (0.45 * clamp(c.salud / 85, 0, 1) + 0.2 * (leyes.ayuda ? 1 : 0.3) + 0.15 * (leyes.acaparar ? 1 : 0) + 0.2 * clamp(0.4 + conf / 25, 0, 1));
  return { total, leyes };
}

// Disposición a dar: su generosidad de carácter más el deber de su rango
const disposicion = (r, c) => generosidad(c) + (r.info[c.id].rango !== "ciudadana" ? RANGOS.DEBER : 0);
// Una Oruz o una Ámbar (la familia primero) organiza la colecta y pone su parte; si no hay ninguna,
// la organiza la ciudadana más generosa. Cada colonia rica decide si da o se niega.
function colecta(w, r, n, vs) {
  const pueden = vs.filter(c => c !== n && puedeDar(c));
  const orden = (a, b) => pariente(b, n) - pariente(a, n) || b.treasury - a.treasury;
  const org = pueden.filter(c => r.info[c.id].rango !== "ciudadana").sort(orden)[0]
    || pueden.filter(c => disposicion(r, c) >= RANGOS.GENEROSA).sort((a, b) => disposicion(r, b) - disposicion(r, a))[0];
  if (!org) return false;
  const io = r.info[org.id], gestora = io.rango !== "ciudadana", como = gestora ? ` (${RANKS[io.rango].name})` : "";
  const dar = (c, cant) => { cant = Math.round(cant); c.treasury -= cant; const i = r.info[c.id]; i.ayudas++; i.ultimaAyuda = w.tick; return cant; };
  let total = dar(org, clamp(org.treasury * 0.05, 8, 25));
  io.vita = Math.min(100, io.vita + 1.5);
  sumar(r, n.id, org.id, 15);
  for (const x of vs) if (x !== org && x !== n) sumar(r, x.id, org.id, 2);
  const dieron = [], negaron = [];
  for (const c of pueden) {
    if (c === org || c.treasury < RANGOS.RICA) continue;
    const i = r.info[c.id];
    if (disposicion(r, c) >= RANGOS.GENEROSA) {
      total += dar(c, clamp(c.treasury * 0.02, 3, 10));
      i.vita = Math.min(100, i.vita + 0.5);
      sumar(r, n.id, c.id, 6); sumar(r, org.id, c.id, 2);
      dieron.push(c);
    } else {
      i.nego = w.tick; i.negativas++;
      sumar(r, n.id, c.id, -6); sumar(r, org.id, c.id, -3);
      negaron.push(c);
    }
  }
  n.treasury += total;
  const inn = r.info[n.id]; inn.recibidas++; inn.recibida = w.tick;
  r.stats.ayudas++; r.stats.vitAyudas += total;
  block(w, "colecta", org.id, n.id, total, "VIT", [org, ...dieron].map(c => c.id));
  const nombres = l => l.map(c => c.name).join(", ");
  const txt = `${org.name}${como} organiza una colecta de ${total} VIT para ${n.name}` + (dieron.length ? `; dan ${nombres(dieron)}` : "") + (negaron.length ? `; se niegan ${nombres(negaron)}` : "");
  clog(w, org, txt);
  clog(w, n, `Recibe ${total} VIT de la colecta que organizó ${org.name}${como}`);
  cronica(r, w, txt);
  return true;
}
function sancionar(w, r, c) {
  const i = r.info[c.id];
  i.sancion = w.tick; i.sanciones++; i.vita = Math.max(0, i.vita - 5); r.stats.sanciones++;
  block(w, "sanción", "VITA", c.id, 5, "respeto");
  const txt = `Vita sanciona a ${c.name} por negarse a una colecta con ${Math.floor(c.treasury)} VIT en su tesoro`;
  clog(w, c, `<b>${txt}</b>`); cronica(r, w, txt);
  if (i.rango === "ambar") cambiar(w, r, c, "oruz", "romper la Ley VITA"); // nadie está por encima de VITA
}
// Una gestora media en el peor rencor del momento: lo baja a la mitad y las dos la respetan más.
function mediarRencor(w, r, vs) {
  const gestoras = vs.filter(c => r.info[c.id].rango !== "ciudadana");
  let peor = null;
  for (const a of vs) for (const b of vs) { const v = r.rel[a.id]?.[b.id]; if (a !== b && v < -15 && (!peor || v < peor.v)) peor = { a, b, v }; }
  const m = peor && gestoras.filter(c => c !== peor.a && c !== peor.b).sort((x, y) => r.info[y.id].respeto - r.info[x.id].respeto)[0];
  if (!m) return;
  r.rel[peor.a.id][peor.b.id] = peor.v / 2;
  sumar(r, peor.a.id, m.id, 4); sumar(r, peor.b.id, m.id, 4);
  r.stats.mediaciones++;
  const txt = `${m.name} (${RANKS[r.info[m.id].rango].name}) media entre ${peor.a.name} y ${peor.b.name}, y el rencor baja a la mitad`;
  clog(w, m, txt); cronica(r, w, txt);
}

function asignar(w, r, vs) {
  const I = c => r.info[c.id], valor = c => I(c).respeto + I(c).merito, a = asientos(vs.length);
  const limpia = c => w.tick - I(c).sancion >= RANGOS.DIA;
  // Las que ya tienen el rango lo conservan mientras cumplan el umbral de salida; una aspirante
  // solo le quita el asiento a otra si la supera por RANGOS.MARGEN.
  const elegir = (dentro, aspirantes, n) => {
    dentro = dentro.sort((x, y) => valor(y) - valor(x)).slice(0, n);
    for (const c of aspirantes.sort((x, y) => valor(y) - valor(x))) {
      if (dentro.length < n) { dentro.push(c); continue; }
      const peor = dentro.reduce((p, x) => valor(x) < valor(p) ? x : p);
      if (valor(c) > valor(peor) + RANGOS.MARGEN) dentro = dentro.filter(x => x !== peor).concat(c);
    }
    return dentro;
  };
  const ambar = elegir(
    vs.filter(c => I(c).rango === "ambar" && limpia(c) && I(c).respeto >= RANGOS.AMBAR_SALE && I(c).merito >= RANGOS.AMBAR_MERITO_SALE),
    vs.filter(c => I(c).rango !== "ambar" && limpia(c) && I(c).respeto >= RANGOS.AMBAR && I(c).merito >= RANGOS.AMBAR_MERITO), a.ambar);
  const resto = vs.filter(c => !ambar.includes(c));
  const oruz = elegir(
    resto.filter(c => I(c).rango !== "ciudadana" && I(c).respeto >= RANGOS.ORUZ_SALE),
    resto.filter(c => I(c).rango === "ciudadana" && I(c).respeto >= RANGOS.ORUZ), a.oruz);
  for (const c of vs) {
    const k = ambar.includes(c) ? "ambar" : oruz.includes(c) ? "oruz" : "ciudadana", i = I(c);
    if (k === i.rango) continue;
    let motivo;
    if (RANKS[k].nivel < RANKS[i.rango].nivel) {
      const amb = i.rango === "ambar", respetoMin = amb ? RANGOS.AMBAR_SALE : RANGOS.ORUZ_SALE;
      motivo = !limpia(c) ? "una sanción de VITA"
        : i.respeto < respetoMin ? `bajar su respeto a ${Math.round(i.respeto)}`
        : amb && i.merito < RANGOS.AMBAR_MERITO_SALE ? `bajar su mérito a ${i.merito}`
        : "quedarse sin asiento";
    }
    cambiar(w, r, c, k, motivo);
  }
  for (const c of Object.values(w.colonies)) if (!c.alive && r.info[c.id] && r.info[c.id].rango !== "ciudadana") cambiar(w, r, c, "ciudadana", "extinguirse");
}
function cambiar(w, r, c, k, motivo) {
  const i = r.info[c.id], sube = RANKS[k].nivel > RANKS[i.rango].nivel;
  i.rango = k; i.desde = w.tick;
  r.stats[sube ? "ascensos" : "descensos"]++;
  block(w, `${sube ? "ascenso" : "descenso"} a ${RANKS[k].name}`, "VITA", c.id, Math.round(i.respeto), "respeto");
  const txt = sube ? `${c.name} asciende a <b>${RANKS[k].name}</b> con respeto ${Math.round(i.respeto)} y mérito ${i.merito}`
    : `${c.name} baja a ${RANKS[k].name}${motivo ? ` por ${motivo}` : ""}`;
  clog(w, c, txt); cronica(r, w, txt);
}

// ---------- vistas ----------
export function tag(w, c) {
  const i = w.rangos?.info[c.id];
  return i ? { k: i.rango, rango: RANKS[i.rango].name, respeto: Math.round(i.respeto), merito: i.merito } : null;
}
export function detail(w, c) {
  const r = w.rangos, i = r?.info[c.id];
  if (!i) return null;
  const rel = vivas(w).filter(x => x !== c).map(x => ({ name: x.name, v: Math.round(relacion(r, x, c)) })).filter(x => x.v).sort((a, b) => b.v - a.v);
  const sig = i.rango === "ciudadana" ? { rango: "Oruz", respeto: Math.max(0, Math.ceil(RANGOS.ORUZ - i.respeto)), merito: 0 }
    : i.rango === "oruz" ? { rango: "Ámbar", respeto: Math.max(0, Math.ceil(RANGOS.AMBAR - i.respeto)), merito: Math.max(0, RANGOS.AMBAR_MERITO - i.merito) } : null;
  return {
    ...tag(w, c), vita: Math.round(i.vita), pares: i.pares == null ? null : Math.round(i.pares), leyes: i.leyes,
    ayudas: i.ayudas, negativas: i.negativas || 0, recibidas: i.recibidas, sanciones: i.sanciones, dias: +((w.tick - i.desde) / RANGOS.DIA).toFixed(1),
    siguiente: sig, admiran: rel.filter(x => x.v > 0).slice(0, 3), resienten: rel.filter(x => x.v < 0).reverse().slice(0, 3),
  };
}
export function view(w) {
  const r = w.rangos;
  if (!r) return null;
  const vs = vivas(w);
  return {
    ley: LEY, leyes: LEYES, rangos: RANKS, asientos: asientos(vs.length), consejos: r.consejos, stats: r.stats,
    umbrales: { oruz: RANGOS.ORUZ, ambar: RANGOS.AMBAR, ambarMerito: RANGOS.AMBAR_MERITO },
    colonias: vs.map(c => ({ id: c.id, name: c.name, ...tag(w, c) })).sort((a, b) => RANKS[b.k].nivel - RANKS[a.k].nivel || b.respeto - a.respeto),
    cronica: r.cronica.slice(0, 12),
  };
}
