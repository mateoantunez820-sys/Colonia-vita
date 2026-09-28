// Proyecto Oruz: el mundo paralelo de VITA.
// Un ecomundo aparte, con su mapa, su calendario y sus estaciones, donde cuatro roles (flora,
// polillas, sombras y hongos) se equilibran solos. Las colonias recién nacidas pasan por su
// escuela antes de salir a la federación, y donde el ecosistema está sano nace el Ámbar de Oruz:
// piezas únicas registradas en la cadena. Todo el estado vive en `world.oruz`; aquí no hay E/S.
import { hash, block, clog, wlog, stepColony, avgGenes, verifyChain } from "./core.js";

export const ORUZ = {
  DAY: 24,              // 1 ciclo de la federación = 1 hora de Oruz
  SEASON_DAYS: 6,       // 6 días de Oruz por estación: en modo real, una estación por día
  LESSONS: 12,          // enseñanza a nivel máximo: 12 lecciones por aprendiz
  CANDIDATES: 6,        // estrategias que compiten en cada lección
  HORIZON: 432,         // ciclos simulados por estrategia: tres días de la federación
  LESSON_EVERY: 3,      // ciclos mínimos entre lecciones de una aprendiz (unas 6 horas de escuela)
  RANGE: 0.4,           // cuánto puede alejarse la estrategia de la personalidad con la que nació
  AMBER_FREE_MAX: 6,    // piezas de Ámbar sin dueño a la vez
  AMBER_TTL: 72,        // horas de Oruz que una pieza espera dueño antes de disolverse
  AMBER_PER_DAY: 2,     // piezas que puede recoger un jugador al día
  AMBER_KEEP: 300,      // piezas gastadas o disueltas que se recuerdan
};

export const SEASONS = [
  { k: "brotes", name: "Brotes", luz: 1.0, lluvia: 0.6, frio: 0.1, resina: 1.0 },
  { k: "soles", name: "Soles", luz: 1.25, lluvia: 0.2, frio: 0, resina: 0.8 },
  { k: "resinas", name: "Resinas", luz: 0.9, lluvia: 0.4, frio: 0.2, resina: 2.2 },
  { k: "brumas", name: "Brumas", luz: 0.65, lluvia: 0.5, frio: 0.6, resina: 0.3 },
];
export const BIOMES = {
  nido: { name: "Nido de Oruz", luz: 1.0, lluvia: 0.5, frio: 0.05, fert: 1.1, resina: 1.0, color: "#62D6B8" },
  pradera: { name: "Pradera Solar", luz: 1.15, lluvia: 0.4, frio: 0, fert: 1.0, resina: 1.0, color: "#9BCB5A" },
  bosque: { name: "Bosque de Esporas", luz: 0.8, lluvia: 0.75, frio: 0.1, fert: 1.25, resina: 1.2, color: "#3E8E5E" },
  desierto: { name: "Desierto de Cuarzo", luz: 1.35, lluvia: 0.05, frio: 0, fert: 0.55, resina: 0.6, color: "#D9B26A" },
  tundra: { name: "Tundra de Nácar", luz: 0.75, lluvia: 0.2, frio: 0.7, fert: 0.6, resina: 0.5, color: "#A9C6D6" },
  pantano: { name: "Pantano Lumínico", luz: 0.7, lluvia: 1.0, frio: 0.1, fert: 1.4, resina: 0.9, color: "#5C7F6E" },
  volcan: { name: "Volcán de Ámbar", luz: 0.95, lluvia: 0.15, frio: 0, fert: 0.85, resina: 1.8, color: "#E0874A" },
};
// Los cuatro roles del ecosistema nativo de Oruz
export const ROLES = {
  flora: { name: "Flora luminosa", rol: "Productora", desc: "Convierte la luz en vida." },
  poli: { name: "Polillas de néctar", rol: "Polinizadora", desc: "Hace crecer la flora y forma la resina del Ámbar." },
  depre: { name: "Sombras cazadoras", rol: "Depredadora", desc: "Caza polillas y mantiene el equilibrio." },
  reci: { name: "Hongos del suelo", rol: "Recicladora", desc: "Devuelve al suelo lo que muere." },
};
const POPS = Object.keys(ROLES);
// El rol que aprende cada colonia en la escuela, según sus genes. Da una ventaja pequeña al graduarse.
export const COLONY_ROLES = {
  productora: { name: "Productora", desc: "Capta un 6% más de luz.", eco: "flora" },
  polinizadora: { name: "Polinizadora", desc: "Da un 2% más de luz a toda la federación (hasta un 8%).", eco: "poli" },
  guardiana: { name: "Guardiana", desc: "Sufre la mitad de frío y recupera salud durante los eventos.", eco: "depre" },
  recicladora: { name: "Recicladora", desc: "Recupera energía de cada célula que muere.", eco: "reci" },
};
export const FENOMENOS = {
  tormenta: { name: "Tormenta de esporas", luz: 0.55, lluvia: 1.8, frio: 0.1 },
  aurora: { name: "Aurora de Oruz", luz: 1.35, lluvia: 1, frio: 0 },
  viento: { name: "Viento de nácar", luz: 0.9, lluvia: 0.6, frio: 0.5 },
};
// Lecciones de la escuela: cada una es un escenario simulado sobre una copia de la aprendiz
export const TEMAS = [
  { k: "normal", name: "Un día cualquiera", start: 8 * 60 },
  { k: "noche", name: "Noche larga", start: 19 * 60 },
  { k: "sequia", name: "Sequía", start: 8 * 60, event: "sequia" },
  { k: "helada", name: "Helada", start: 6 * 60, event: "helada", weather: { luz: 0.9, frio: 0.8, lluvia: 0 } },
  { k: "plaga", name: "Plaga", start: 8 * 60, event: "plaga" },
  { k: "floracion", name: "Floración", start: 8 * 60, event: "floracion" },
  { k: "tormenta", name: "Tormenta de esporas", start: 10 * 60, weather: { luz: 0.55, frio: 0.1, lluvia: 1 } },
  { k: "pobreza", name: "Tesoro vacío", start: 8 * 60, treasury: 0 },
];
const PLAN = [0, 1, 2, 3, 4, 5, 6, 7, 4, 1, 3, 2]; // los 8 temas y un repaso de los 4 más duros
const TONOS = [[0.4, "miel"], [0.7, "dorado"], [0.85, "cobre"], [0.94, "rubí"], [0.985, "esmeralda"], [1, "azul abisal"]];
const RING = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const SYL = ["o", "ru", "za", "lu", "mi", "ka", "ne", "to", "vi", "sa", "re", "ya", "el", "an", "is", "ur", "qui", "dá"];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const err = message => ({ ok: false, error: message });
const r3 = x => Math.round(x * 1000) / 1000;

// Generador pseudoaleatorio con semilla (mulberry32): el mismo mundo sale siempre igual
export function rng(seed) {
  let a = parseInt(hash(String(seed)).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- el mundo ----------
export function createOruz(seed, tick = 0) {
  const r = rng("oruz:" + seed), used = new Set();
  const name = () => {
    let n;
    do n = Array.from({ length: r() < 0.4 ? 3 : 2 }, () => SYL[Math.floor(r() * SYL.length)]).join("");
    while (used.has(n) || n.length < 4);
    used.add(n);
    return n[0].toUpperCase() + n.slice(1);
  };
  const kinds = shuffle(["pradera", "bosque", "desierto", "tundra", "pantano", "volcan"], r);
  const regions = [{ id: "R0", name: name(), bioma: "nido", q: 0, r: 0 }, ...RING.map(([q, rr], i) => ({ id: "R" + (i + 1), name: name(), bioma: kinds[i], q, r: rr }))];
  for (const [i, R] of regions.entries()) {
    const B = BIOMES[R.bioma];
    R.vecinos = i === 0 ? regions.slice(1).map(x => x.id) : ["R0", "R" + ((i + 4) % 6 + 1), "R" + (i % 6 + 1)];
    Object.assign(R, { suelo: 55, flora: r3(45 * B.fert), poli: 20, depre: 6, reci: 15, resina: 0, eq: 0, ambar: 0, clima: { luz: B.luz, frio: B.frio, lluvia: B.lluvia } });
  }
  return {
    v: 1, seed: String(seed), hora: 0, desde: tick, regions,
    fenomeno: { k: "tormenta", region: "R" + (1 + Math.floor(r() * 6)) },
    escuela: {}, graduadas: 0, ambar: {}, ambarSerial: 0, cronica: [], polinizadoras: 0,
  };
}
export function ensure(w, seed) {
  if (!w.oruz) {
    w.oruz = createOruz(seed ?? hash(`${w.createdAt}:${Math.random()}`), w.tick);
    cronica(w, `Nace Oruz, el mundo paralelo de VITA, con ${w.oruz.regions.length} regiones`);
  }
  return w.oruz;
}
export const regionOf = (o, id) => o.regions.find(R => R.id === id) || o.regions[0];

export function calendario(o) {
  const dia = Math.floor(o.hora / ORUZ.DAY), n = Math.floor(dia / ORUZ.SEASON_DAYS), s = SEASONS[n % 4];
  return { anio: Math.floor(n / 4) + 1, estacion: s.name, k: s.k, dia: dia % ORUZ.SEASON_DAYS + 1, hora: o.hora % ORUZ.DAY };
}
const stamp = o => { const c = calendario(o); return `Año ${c.anio} · ${c.estacion} ${c.dia} · ${String(c.hora).padStart(2, "0")}h`; };
export function cronica(w, msg, alsoWorld = true) {
  const o = w.oruz;
  o.cronica.unshift(`${stamp(o)} — ${msg}`); if (o.cronica.length > 40) o.cronica.length = 40;
  if (alsoWorld) wlog(w, `[Oruz] ${msg}`);
}

// ---------- el ecosistema: cuatro roles que dependen unos de otros ----------
function stepRegion(o, R, S, h, students) {
  const B = BIOMES[R.bioma], fx = o.fenomeno?.region === R.id ? FENOMENOS[o.fenomeno.k] : null;
  const sol = clamp(Math.sin((h - 6) / 12 * Math.PI), 0, 1) * 0.9 + 0.1;
  const luzBase = B.luz * S.luz * (fx?.luz ?? 1), luz = sol * luzBase;
  const lluvia = clamp(B.lluvia * S.lluvia * 1.5 * (fx?.lluvia ?? 1), 0, 1);
  const frio = clamp(B.frio + S.frio * 0.6 + (fx?.frio ?? 0), 0, 1);
  R.clima = { luz: +luzBase.toFixed(2), frio: +frio.toFixed(2), lluvia: +lluvia.toFixed(2) };

  let { flora: F, poli: P, depre: D, reci: X, suelo: N } = R;
  // Flora: crece con luz, agua y suelo, y las polillas la ayudan
  const gF = 0.1 * F * (1 - F / 100) * luz * (N / (N + 30)) * (0.35 + 0.65 * lluvia) * B.fert * (1 + 0.5 * P / 80) * (1 - 0.7 * frio);
  const mF = F * 0.004 * (1 + 1.5 * frio);
  // Polillas y sombras: presa y cazador, con ciclos que suben y bajan
  const eat = 0.05 * P * D / (P + 20);
  const gP = 0.06 * P * (F / (F + 40)) * (1 - P / 80), mP = P * 0.004 * (1 + frio);
  const gD = 0.35 * eat, mD = D * 0.01 * (1 + 0.5 * frio);
  // Lo que muere alimenta a los hongos, y los hongos devuelven nutrientes al suelo
  const dead = mF + mP + mD + eat * 0.65;
  const gX = 0.05 * X * (dead / (dead + 2)) * (1 - X / 60), mX = X * 0.006;
  F += gF - mF; P += gP - mP - eat; D += gD - mD; X += gX - mX;
  N += dead * 0.5 * (0.3 + X / 40) - gF - N * 0.003 + 0.03 * lluvia;
  // Las colonias aprendices también cumplen su rol en la región donde estudian
  for (const col of students) {
    const eco = COLONY_ROLES[col.oruz.rol]?.eco;
    if (eco === "flora") F += 0.05; else if (eco === "poli") P += 0.04; else if (eco === "reci") X += 0.04; else if (eco === "depre") D -= 0.02;
  }
  Object.assign(R, { flora: r3(clamp(F, 0.5, 100)), poli: r3(clamp(P, 0.5, 100)), depre: r3(clamp(D, 0.5, 100)), reci: r3(clamp(X, 0.5, 100)), suelo: r3(clamp(N, 0, 100)) });
  // La resina del Ámbar solo se forma donde los cuatro roles están presentes
  R.eq = +Math.min(1, R.flora / 40, R.poli / 20, R.depre / 8, R.reci / 20).toFixed(3);
  R.resina = r3(R.resina + 0.006 * (R.flora / 100) * (R.poli / 60) * S.resina * B.resina * R.eq);
}

export function stepEcosystem(o, studentsByRegion = {}) {
  const S = SEASONS[Math.floor(o.hora / ORUZ.DAY / ORUZ.SEASON_DAYS) % 4], h = o.hora % ORUZ.DAY;
  for (const R of o.regions) stepRegion(o, R, S, h, studentsByRegion[R.id] || []);
  // Migración entre vecinas: ningún rol desaparece del todo y el mundo se mezcla despacio
  const before = new Map(o.regions.map(R => [R.id, Object.fromEntries(POPS.map(k => [k, R[k]]))]));
  for (const R of o.regions) for (const k of POPS) {
    const avg = R.vecinos.reduce((s, id) => s + before.get(id)[k], 0) / R.vecinos.length;
    R[k] = r3(clamp(R[k] + 0.003 * (avg - before.get(R.id)[k]), 0.5, 100));
  }
}

function moveFenomeno(w, o, r) {
  const f = o.fenomeno;
  if (o.hora % (ORUZ.DAY * 2) === 0) {
    const ks = Object.keys(FENOMENOS); f.k = ks[Math.floor(r() * ks.length)];
    cronica(w, `${FENOMENOS[f.k].name} sobre ${regionOf(o, f.region).name}`, false);
  }
  if (o.hora % 12 === 0) { const R = regionOf(o, f.region); f.region = R.vecinos[Math.floor(r() * R.vecinos.length)]; }
}

// ---------- el Ámbar de Oruz: el producto propio e incopiable ----------
function mintAmber(w, o, R) {
  const cal = calendario(o), tip = w.chain.length ? w.chain[w.chain.length - 1].hash : "";
  let n, h, id;
  do { n = ++o.ambarSerial; h = hash(`${o.seed}:${n}:${R.id}:${o.hora}:${tip}`); id = "AMB-" + h.slice(0, 8).toUpperCase(); } while (o.ambar[id]);
  const v = parseInt(h.slice(8, 12), 16) / 65536, tono = TONOS.find(([p]) => v < p)[1];
  const pureza = Math.round(clamp(30 + 45 * R.eq + 15 * Math.min(1, (R.flora + R.poli) / 120) + (cal.k === "resinas" ? 10 : 0), 1, 100));
  const p = { id, n, region: R.id, regionName: R.name, bioma: R.bioma, tono, pureza, estacion: cal.estacion, anio: cal.anio, hora: o.hora, owner: null, ownerName: "", estado: "libre", t: Date.now() };
  const b = block(w, "ámbar", "oruz:" + R.name, "libre", 1, "AMB", [id]);
  p.bloque = b.n; p.hash = b.hash;
  o.ambar[id] = p; R.ambar++;
  cronica(w, `Nace el Ámbar ${id} (${tono}, pureza ${pureza}) en ${R.name}`);
  return p;
}
const freeAmber = o => Object.values(o.ambar).filter(p => p.estado === "libre");
function tidyAmber(w, o) {
  for (const p of freeAmber(o)) if (o.hora - p.hora > ORUZ.AMBER_TTL) { p.estado = "disuelta"; cronica(w, `${p.id} se disolvió sin que nadie lo recogiera`, false); }
  const gone = Object.values(o.ambar).filter(p => p.estado === "disuelta" || p.estado === "infundida");
  if (gone.length > ORUZ.AMBER_KEEP) for (const p of gone.sort((a, b) => a.n - b.n).slice(0, gone.length - ORUZ.AMBER_KEEP)) delete o.ambar[p.id];
}
export function pieceView(p) {
  return { id: p.id, tono: p.tono, pureza: p.pureza, region: p.regionName, bioma: BIOMES[p.bioma]?.name, estacion: p.estacion, anio: p.anio, estado: p.estado, owner: p.ownerName || null, bloque: p.bloque, hash: p.hash };
}
export function collectAmber(w, u, id) {
  const p = w.oruz?.ambar[id];
  if (!p || p.estado !== "libre") return err("Esa pieza de Ámbar ya no está libre");
  const d = u.daily;
  if ((d.ambar || 0) >= ORUZ.AMBER_PER_DAY) return err(`Hoy ya recogiste ${ORUZ.AMBER_PER_DAY} piezas de Ámbar`);
  d.ambar = (d.ambar || 0) + 1;
  Object.assign(p, { owner: u.id, ownerName: u.name, estado: "guardada" });
  block(w, "recolección", "oruz:" + p.regionName, u.id, 1, "AMB", [id]);
  cronica(w, `${u.name} recoge el Ámbar ${id}`);
  return { ok: true, piece: pieceView(p) };
}
export function infuseAmber(w, u, id, col) {
  const p = w.oruz?.ambar[id];
  if (!p || p.owner !== u.id || p.estado !== "guardada") return err("Esa pieza de Ámbar no es tuya");
  if (!col?.alive) return err("Elige una colonia viva");
  const e = Math.round(20 + p.pureza * 0.4), s = Math.round(4 + p.pureza * 0.08);
  col.energia += e; col.salud = Math.min(100, col.salud + s);
  Object.assign(p, { estado: "infundida", en: col.id });
  block(w, "infusión", u.id, col.id, 1, "AMB", [id]);
  clog(w, col, `${u.name} infunde el Ámbar <b>${id}</b> (${p.tono}): +${e} energía y +${s} salud`);
  return { ok: true, energia: e, salud: s };
}
export const amberOf = (w, uid) => Object.values(w.oruz?.ambar || {}).filter(p => p.owner === uid && p.estado === "guardada");
// Certificado de origen: la pieza, su bloque de nacimiento y todos sus movimientos en la cadena
export function certificate(w, id) {
  const p = w.oruz?.ambar[id];
  if (!p) return null;
  const moves = w.chain.filter(b => b.ids?.includes(id)).map(b => ({ n: b.n, tipo: b.tipo, de: b.de, a: b.a, hash: b.hash, t: b.t }));
  return { ...pieceView(p), movimientos: moves, cadenaOk: verifyChain(w) };
}

// ---------- la escuela de Oruz: colonias aprendices ----------
export function sane(p) {
  const f = x => (Number.isFinite(+x) && x !== null && x !== "" ? clamp(+x, 0, 1) : 0.5);
  return { riesgo: +f(p?.riesgo).toFixed(2), codicia: +f(p?.codicia).toFixed(2), cuidado: +f(p?.cuidado).toFixed(2) };
}
const mutate = (p, r, amt = 0.18) => sane({ riesgo: p.riesgo + (r() - 0.5) * 2 * amt, codicia: p.codicia + (r() - 0.5) * 2 * amt, cuidado: p.cuidado + (r() - 0.5) * 2 * amt });
// La escuela pule la personalidad con la que nació la aprendiz, pero no la borra
const near = (p, base) => sane(Object.fromEntries(Object.keys(base).map(k => [k, clamp(p[k], base[k] - ORUZ.RANGE, base[k] + ORUZ.RANGE)])));
// Consejo de Vita: una estrategia pensada para los genes de la aprendiz
export function vitaPersona(col) {
  const g = avgGenes(col.cells);
  return sane({ riesgo: 0.8 + (g.res - 7) * 0.04 + (g.fer - 7) * 0.02, codicia: 0.3 + (g.ef - 7) * 0.05, cuidado: 0.2 - (g.res - 7) * 0.03 });
}
export function roleFor(col) {
  const g = avgGenes(col.cells), v = [["productora", g.ef], ["guardiana", g.res], ["polinizadora", g.fer]].sort((a, b) => b[1] - a[1]);
  return v[0][1] - v[2][1] < 1.2 ? "recicladora" : v[0][0];
}
// Cada rol estudia en la región que más le enseña
function regionFor(o, rol) {
  const score = { productora: B => B.luz, polinizadora: B => B.fert, guardiana: B => B.frio, recicladora: B => B.lluvia }[rol];
  return o.regions.slice(1).sort((a, b) => score(BIOMES[b.bioma]) - score(BIOMES[a.bioma]))[0];
}

// Una lección: la aprendiz vive tres días en una copia aislada del mundo, sin tocar el real.
// El escenario aprieta al principio (6 horas de evento, 12 de clima) y luego sigue la vida normal.
// Devuelve cuánto creció su valor: células + 0,8 × tesoro + 0,6 × salud, frente al de partida.
export function runLesson(col, persona, tema, seed, horizon = ORUZ.HORIZON) {
  const sw = { tick: 0, serial: 0, colonySerial: 0, colonies: {}, users: {}, chain: [], log: [], supply: { minted: 0, burned: 0, cellsMinted: 0, cellsBurned: 0 }, ai: { difficulty: 1 } };
  const c = structuredClone(col);
  Object.assign(c, { log: [], hist: [], mintBuf: {}, plan: 0, minuto: tema.start, event: tema.event || null, eventLeft: tema.event ? 36 : 0 });
  c.ai.persona = persona;
  if (tema.treasury != null) c.treasury = tema.treasury;
  sw.colonies[c.id] = c;
  const value = () => c.cells.length + 0.8 * c.treasury + 0.6 * c.salud, v0 = Math.max(1, value()), r = rng(seed);
  const hard = { weather: tema.weather || null, attention: 0, difficulty: 1 }, calm = { weather: null, attention: 0, difficulty: 1 };
  for (let i = 0; i < horizon && c.alive; i++) stepColony(sw, c, i < 72 ? hard : calm, r);
  return c.alive ? value() / v0 : 0;
}
export const nota = (score, ref) => Math.round(clamp(ref > 0 ? 70 * score / ref : score > 0 ? 100 : 0, 0, 100));

function enroll(w, o, col) {
  const rol = roleFor(col), R = regionFor(o, rol), mentor = w.colonies[col.parent];
  const inicial = sane(col.ai.persona);
  o.escuela[col.id] = { id: col.id, region: R.id, rol, desde: w.tick, ultima: w.tick, leccion: 0, mentor: col.parent, inicial, mejor: inicial, historial: [] };
  col.ai.persona = inicial; // la escuela repara también una personalidad rota
  col.oruz = { estado: "aprendiz", rol, region: R.id };
  clog(w, col, `Entra en la escuela de Oruz, en ${R.name}. Vita y ${mentor?.name || "la federación"} la entrenan como ${COLONY_ROLES[rol].name.toLowerCase()}`);
  cronica(w, `${col.name} llega a la escuela como aprendiz ${COLONY_ROLES[rol].name.toLowerCase()} (${R.name})`);
}

// Cada lección enfrenta seis estrategias en el mismo escenario y con el mismo azar:
// la que ya sabía, la de su madre, el consejo de Vita y tres variaciones nuevas.
function teach(w, o, col, s) {
  const k = s.leccion, tema = TEMAS[PLAN[k % PLAN.length]], r = rng(`${o.seed}:${col.id}:${k}`);
  const mentor = w.colonies[s.mentor];
  const cands = [s.mejor, mentor?.alive ? sane(mentor.ai.persona) : mutate(s.mejor, r, 0.35), vitaPersona(col), mutate(s.mejor, r), mutate(s.mejor, r), mutate(s.mejor, r, 0.3)]
    .slice(0, ORUZ.CANDIDATES).map((p, i) => (i ? near(p, s.inicial) : p));
  const seed = `${o.seed}:${col.id}:${k}:examen`, scores = cands.map(p => runLesson(col, p, tema, seed));
  let bi = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bi]) bi = i;
  if (scores[bi] < scores[0] * 1.01) bi = 0; // solo cambia lo aprendido si la mejora es clara
  const who = bi === 1 && mentor?.alive ? `la estrategia de ${mentor.name}` : bi === 2 ? "el consejo de Vita" : bi === 0 ? "a confiar en lo que ya sabía" : "una estrategia nueva";
  // La nota compara con lo que habría hecho al nacer: 70 es lo mismo, cada punto más es lo aprendido
  const n = nota(scores[bi], k ? runLesson(col, s.inicial, tema, seed) : scores[0]);
  s.mejor = cands[bi]; col.ai.persona = cands[bi];
  s.historial.push({ tema: tema.name, nota: n, aprendio: who });
  s.leccion++; s.ultima = w.tick;
  clog(w, col, `Lección ${s.leccion}/${ORUZ.LESSONS} en Oruz: ${tema.name}, nota ${n}. Aprende ${who}`);
  if (s.leccion >= ORUZ.LESSONS) graduate(w, o, col, s);
}

// Examen final: la estrategia aprendida contra la personalidad con la que nació, en tres días nuevos
export function examen(col, a, b, seed, n = 3) {
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += runLesson(col, a, TEMAS[0], `${seed}:final:${i}`); sb += runLesson(col, b, TEMAS[0], `${seed}:final:${i}`); }
  return sb > 0 ? Math.round((sa / sb - 1) * 100) : 0;
}

function graduate(w, o, col, s) {
  const notas = s.historial.map(h => h.nota), media = Math.round(notas.reduce((a, b) => a + b, 0) / notas.length);
  const mejora = examen(col, s.mejor, s.inicial, `${o.seed}:${col.id}`);
  col.oruz = { estado: "graduada", rol: s.rol, region: s.region, nota: media, mejora, lecciones: notas.length, mentor: w.colonies[s.mentor]?.name || "", tick: w.tick };
  col.energia += 30; col.salud = Math.min(100, col.salud + 15);
  delete o.escuela[col.id]; o.graduadas++;
  block(w, "graduación", "oruz", col.id, media, "NOTA");
  const extra = mejora > 0 ? `: crecerá un ${mejora}% más que con la personalidad con la que nació` : "";
  clog(w, col, `<b>Se gradúa en Oruz</b> con nota ${media} y vuelve a la federación preparada como ${COLONY_ROLES[s.rol].name.toLowerCase()}${extra}`);
  cronica(w, `${col.name} se gradúa con nota ${media}${mejora > 0 ? ` (+${mejora}% de crecimiento)` : ""} y sale a la federación preparada`);
}

// ---------- ventajas de los roles en la federación ----------
export function envFor(w, col, env) {
  const o = w.oruz, st = col.oruz;
  if (!o) return env;
  let wx = env.weather || { luz: 1, frio: 0, lluvia: 0 };
  // Las aprendices viven en Oruz: su luz, su frío y su lluvia son los de su región
  if (st?.estado === "aprendiz") { const R = regionOf(o, st.region); wx = { ...R.clima, desc: `Oruz · ${R.name}`, temp: wx.temp }; }
  const grad = st?.estado === "graduada";
  const luz = wx.luz * (1 + 0.02 * Math.min(4, o.polinizadoras || 0)) * (grad && st.rol === "productora" ? 1.06 : 1);
  const frio = (wx.frio || 0) * (grad && st.rol === "guardiana" ? 0.5 : 1);
  return { ...env, weather: { ...wx, luz: +luz.toFixed(3), frio } };
}

// ---------- un ciclo de Oruz (después de cada ciclo de la federación) ----------
const counts = new Map(); // colonia -> [células, serie máxima] del ciclo anterior, para las recicladoras
export function step(w, rnd = Math.random) {
  const o = w.oruz;
  if (!o) return;
  o.hora++;
  moveFenomeno(w, o, rnd);
  const cols = Object.values(w.colonies);
  for (const col of cols) if (col.alive && col.parent && (!col.oruz || (col.oruz.estado === "aprendiz" && !o.escuela[col.id]))) enroll(w, o, col);
  const students = {};
  for (const col of cols) if (col.oruz?.estado === "aprendiz" && col.alive) (students[col.oruz.region] ||= []).push(col);
  stepEcosystem(o, students);
  for (const R of o.regions) if (R.resina >= 1) { R.resina = r3(R.resina - 1); if (freeAmber(o).length < ORUZ.AMBER_FREE_MAX) mintAmber(w, o, R); }
  tidyAmber(w, o);
  // Escuela: cuida a todas sus aprendices y da una lección por ciclo a la que lleva más tiempo esperando
  let next = null;
  for (const [id, s] of Object.entries(o.escuela)) {
    const col = w.colonies[id];
    if (!col?.alive) { delete o.escuela[id]; if (col) { col.oruz = null; cronica(w, `${col.name} no pudo terminar la escuela`, false); } continue; }
    if (col.salud < 50) col.salud += 1;
    if (col.energia < 10) col.energia += 3;
    if (w.tick - s.ultima >= ORUZ.LESSON_EVERY && (!next || s.ultima < next.ultima)) next = s;
  }
  if (next) teach(w, o, w.colonies[next.id], next);
  // Roles de las graduadas
  o.polinizadoras = cols.filter(c => c.alive && c.oruz?.estado === "graduada" && c.oruz.rol === "polinizadora").length;
  for (const col of cols) {
    if (!col.alive || col.oruz?.estado !== "graduada") continue;
    if (col.oruz.rol === "guardiana" && col.event) col.salud = Math.min(100, col.salud + 0.1);
    if (col.oruz.rol === "recicladora") {
      let max = 0; for (const c of col.cells) if (c.n > max) max = c.n;
      const prev = counts.get(col.id);
      if (prev) {
        let born = 0; for (const c of col.cells) if (c.n > prev[1]) born++;
        const dead = Math.max(0, prev[0] + born - col.cells.length);
        if (dead) col.energia += 0.5 * dead;
      }
      counts.set(col.id, [col.cells.length, Math.max(max, prev?.[1] || 0)]);
    }
  }
}

// ---------- vista pública ----------
export function view(w, u) {
  const o = w.oruz;
  if (!o) return null;
  const cols = Object.values(w.colonies);
  const where = {};
  for (const c of cols) if (c.alive && c.oruz?.estado === "aprendiz") (where[c.oruz.region] ||= []).push(c.id);
  return {
    cal: calendario(o), fenomeno: { ...FENOMENOS[o.fenomeno.k], region: o.fenomeno.region },
    regions: o.regions.map(R => ({
      id: R.id, name: R.name, bioma: R.bioma, biomaName: BIOMES[R.bioma].name, color: BIOMES[R.bioma].color, q: R.q, r: R.r,
      pops: Object.fromEntries(POPS.map(k => [k, Math.round(R[k])])), suelo: Math.round(R.suelo), resina: +R.resina.toFixed(2), eq: R.eq, clima: R.clima, ambar: R.ambar, aprendices: where[R.id] || [],
    })),
    escuela: Object.entries(o.escuela).map(([id, s]) => ({
      id, name: w.colonies[id]?.name, leccion: s.leccion, total: ORUZ.LESSONS, siguiente: TEMAS[PLAN[s.leccion % PLAN.length]].name,
      nota: s.historial.at(-1)?.nota ?? null, aprendio: s.historial.at(-1)?.aprendio || "", rol: s.rol, mentor: w.colonies[s.mentor]?.name || "", region: regionOf(o, s.region).name,
    })),
    graduadas: cols.filter(c => c.oruz?.estado === "graduada").sort((a, b) => b.oruz.tick - a.oruz.tick).slice(0, 8).map(c => ({ id: c.id, name: c.name, nota: c.oruz.nota, rol: c.oruz.rol, alive: c.alive })),
    estado: Object.fromEntries(cols.filter(c => c.oruz).map(c => [c.id, { estado: c.oruz.estado, rol: c.oruz.rol, nota: c.oruz.nota ?? null }])),
    libres: freeAmber(o).map(p => ({ ...pieceView(p), expira: ORUZ.AMBER_TTL - (o.hora - p.hora) })),
    mias: u ? amberOf(w, u.id).map(pieceView) : [],
    recogidasHoy: u?.daily?.ambar || 0, porDia: ORUZ.AMBER_PER_DAY,
    roles: ROLES, colRoles: COLONY_ROLES, cronica: o.cronica.slice(0, 12), ambarTotal: o.ambarSerial, graduadasTotal: o.graduadas,
  };
}
