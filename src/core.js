// Motor de simulación de la Federación VITA.
// Todo el estado vive en un objeto `world` serializable a JSON. No hay E/S aquí.
import { createHash } from "node:crypto";

export const CONFIG = {
  CELL_CAP_BASE: 300,
  START_CELLS: 40,
  PLAN_TICKS: 36,
  FOUND_TREASURY: 400,   // tesoro mínimo para fundar una colonia hija
  FOUND_CELLS: 150,      // células mínimas para fundar
  FOUND_BURN: 150,       // VIT que se quema al fundar
  FOUND_SEED_VIT: 120,   // VIT que recibe la hija
  FOUND_SEED_CELLS: 30,  // células que emigran a la hija
  MAX_COLONIES: 12,
  ADOPT_FEE: 0.1,
  SELL_BACK: 0.5,
  AI_CALL_COST_VIT: 25,  // lo que paga una colonia por cada consulta a Claude
  CHAIN_MAX: 3000,
  UPKEEP_FREE: 600,      // tesoro exento de mantenimiento (por encima de lo necesario para fundar)
  UPKEEP_RATE: 0.001,    // parte del tesoro sobrante que se quema cada ciclo (freno a la inflación)
  GRATITUDE_TICKS: 432,  // 3 días de gratitud para una colonia salvada
  GRATITUDE_EFFORT: 2,   // recolecta y se repara el doble mientras dura
  GRATITUDE_RES_MAX: 10, // pero acuña como mucho con un 10 % de su esfuerzo: el doble va a crecer, no a crear VIT
};

export const TRAITS = { ef: "Eficiencia", res: "Resistencia", fer: "Fertilidad" };
export const RARITY = [
  { name: "Común", bonus: 0 }, { name: "Rara", bonus: 8 },
  { name: "Épica", bonus: 20 }, { name: "Legendaria", bonus: 50 },
];
export const UPGRADES = {
  lampara: { name: "Lámpara nocturna", desc: "Da luz extra de noche.", cost: [15, 30, 60] },
  escudo: { name: "Escudo biológico", desc: "Reduce un 30% por nivel el daño de plagas y heladas.", cost: [20, 45] },
  incubadora: { name: "Incubadora", desc: "Un 20% más de reproducción por nivel.", cost: [15, 35, 70] },
  refineria: { name: "Refinería", desc: "Un 25% más de VIT acuñado por nivel.", cost: [25, 50, 100] },
  territorio: { name: "Territorio", desc: "Amplía la capacidad en 100 células por nivel.", cost: [80, 160, 320] },
};
export const EVENTS = {
  sequia: { name: "Sequía", luz: 0.4 },
  floracion: { name: "Floración", luz: 1.6 },
  helada: { name: "Helada", cons: 1.6 },
  plaga: { name: "Plaga", dmg: 1.2 },
};
export const MISSIONS = [
  { k: "esporas", t: "Mina 5 esporas", goal: 5, r: 5 },
  { k: "adoptar", t: "Adopta una célula", goal: 1, r: 4 },
  { k: "alimentar", t: "Alimenta una colonia", goal: 1, r: 3 },
  { k: "mejora", t: "Paga una mejora", goal: 1, r: 4 },
];
const NAMES = ["Aurora", "Brisa", "Coral", "Duna", "Eco", "Fénix", "Gaia", "Hiedra", "Iris", "Jade", "Kelp", "Liquen", "Musgo", "Nácar", "Ópalo", "Pólen", "Quimera", "Raíz", "Savia", "Turba"];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function hash(s) { return createHash("sha256").update(s).digest("hex"); }

// ---------- genes ----------
export const score = c => c.g.ef + c.g.res + c.g.fer;
export const rarIdx = c => { const s = score(c); return s >= 38 ? 3 : s >= 32 ? 2 : s >= 26 ? 1 : 0; };
export const cellPrice = c => Math.round(4 + score(c) * 0.5 + RARITY[rarIdx(c)].bonus);
export function mutG(g, amt, rnd = Math.random) {
  const n = { ...g };
  for (const k of Object.keys(TRAITS)) if (rnd() < 0.5) n[k] = clamp(n[k] + Math.round((rnd() * 2 - 1) * amt), 0, 15);
  return n;
}
export function avgGenes(cells) {
  const a = { ef: 0, res: 0, fer: 0 }, n = cells.length || 1;
  for (const c of cells) for (const k in a) a[k] += c.g[k];
  for (const k in a) a[k] /= n;
  return a;
}
export function genomeCode(col) {
  const a = avgGenes(col.cells);
  const hex = [a.ef, a.res, a.fer, col.met].map(x => Math.round(x).toString(16).toUpperCase()).join("");
  return `VIT-${hex}-${hash(hex + "vita").slice(0, 2).toUpperCase()}`;
}

// ---------- mundo ----------
export function createWorld(now = Date.now()) {
  const w = {
    version: 1, tick: 0, createdAt: now, serial: 0, colonySerial: 0,
    colonies: {}, users: {}, chain: [], log: [],
    supply: { minted: 0, burned: 0, cellsMinted: 0, cellsBurned: 0 },
    ai: { spentUsd: 0, revenueUsd: 0, demoRevenueUsd: 0, calls: 0, lastSupervisor: 0, difficulty: 1, report: "" },
    stats: newStats(),
  };
  const c = createColony(w, { name: "Génesis", genes: { ef: 7, res: 6, fer: 6 }, met: 7, treasury: 0, parent: null });
  block(w, "génesis", "—", c.id, CONFIG.START_CELLS, "CEL");
  return w;
}

// Personalidad de la IA. Una hija hereda la de su madre con una pequeña variación por rasgo.
export function newPersona(rnd = Math.random, base) {
  const j = b => clamp(Number.isFinite(b) ? b + (rnd() - 0.5) * 0.4 : rnd(), 0, 1);
  return { riesgo: +j(base?.riesgo).toFixed(2), codicia: +j(base?.codicia).toFixed(2), cuidado: +j(base?.cuidado).toFixed(2) };
}
const validPersona = p => !!p && [p.riesgo, p.codicia, p.cuidado].every(Number.isFinite);

const newStats = () => ({
  events: Object.fromEntries(Object.keys(EVENTS).map(k => [k, 0])),
  births: 0, deaths: 0, foundings: 0, rescues: 0, reseeds: 0, extinctions: 0, aiConsults: 0, upkeepBurned: 0, gratitude: 0,
});

// Repara mundos guardados por versiones anteriores (personalidades rotas, contadores nuevos).
export function migrateWorld(w) {
  const s = newStats();
  w.stats = { ...s, ...(w.stats || {}), events: { ...s.events, ...(w.stats?.events || {}) } };
  let fixed = 0;
  for (const col of Object.values(w.colonies)) {
    if (validPersona(col.ai.persona)) continue;
    const parent = w.colonies[col.parent]?.ai.persona;
    col.ai.persona = newPersona(Math.random, validPersona(parent) ? parent : undefined);
    if (col.alive) grantGratitude(w, col, "haber sido reparada");
    fixed++;
  }
  return fixed;
}

export function createColony(w, { name, genes, met, treasury, parent, cells, persona, minuto }) {
  const id = "COL-" + (++w.colonySerial).toString().padStart(3, "0");
  const col = {
    id, name, parent, gen: 1, met, createdTick: w.tick,
    energia: 80, salud: 90, popF: 0, edad: 0, alive: true,
    minuto: minuto ?? 8 * 60,
    alloc: { rec: 50, rep: 20, repr: 15, res: 15 }, plan: 0, planBy: null,
    mintBuf: {}, treasury, event: null, eventLeft: 0,
    up: { lampara: 0, escudo: 0, incubadora: 0, refineria: 0, territorio: 0 },
    ai: { persona: persona || newPersona(), calls: 0, lastCallTick: -1e9, spentVit: 0, message: "" },
    cells: [], hist: [], log: [], cause: "",
  };
  w.colonies[id] = col;
  if (cells) { col.cells = cells; }
  else for (let i = 0; i < CONFIG.START_CELLS; i++) col.cells.push(newCell(w, col, mutG(genes, 3), "colonia"));
  return col;
}

export function newCell(w, col, g, owner) {
  w.serial++; w.supply.cellsMinted++;
  return {
    id: "CEL-" + hash(w.serial + ":" + col.id).slice(0, 6).toUpperCase(), n: w.serial, g, owner,
    born: col.edad, mined: 0, life: Math.round(430 + g.res * 24 + Math.random() * 120),
  };
}

// Gratitud: una colonia salvada (reparada, ayudada o renacida) trabaja el doble unos días
// y la supervisora la cuida: menos eventos y nunca se le piden células ni VIT para otras.
export function grantGratitude(w, col, why) {
  const fresh = !(col.gratitud > 0);
  col.gratitud = CONFIG.GRATITUDE_TICKS;
  if (!fresh) return;
  w.stats.gratitude++;
  clog(w, col, `<b>Agradecida</b> por ${why}: durante 3 días recolecta y se repara el doble, y acuña con tope del ${CONFIG.GRATITUDE_RES_MAX} %`);
}
const grateful = col => col.gratitud > 0;

// Punto de enganche para otros módulos (por ejemplo, una escuela de colonias aprendices):
// cada función recibe (world, hija, madre) justo después de fundarse la hija.
const bornHooks = [];
export function onColonyBorn(fn) {
  bornHooks.push(fn);
  return () => { const i = bornHooks.indexOf(fn); if (i >= 0) bornHooks.splice(i, 1); };
}
// Lo mismo para cada célula (por ejemplo, para su mascota): (world, colonia, hija, madre) cuando nace
// una célula en un ciclo, y (world, colonia, muertas) con las que murieron en ese ciclo.
// No deben usar el azar del ciclo: así la simulación sigue el mismo camino con ellas o sin ellas.
const cellHooks = { born: [], dead: [] };
function engancha(list, fn) {
  list.push(fn);
  return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
}
export const onCellBorn = fn => engancha(cellHooks.born, fn);
export const onCellsDie = fn => engancha(cellHooks.dead, fn);
function avisa(list, tag, ...args) {
  for (const fn of list) {
    try { fn(...args); } catch (e) { console.error(`[${tag}]`, e); } // un módulo con fallos no para el mundo
  }
}

export const cap = col => CONFIG.CELL_CAP_BASE + 100 * col.up.territorio;
export const upCost = (col, k) => UPGRADES[k].cost[col.up[k]];

// ---------- cadena ----------
function blockHash(b) { return hash(JSON.stringify([b.n, b.tipo, b.de, b.a, b.cant, b.unit, b.ids, b.t, b.prev])).slice(0, 32); }
export function block(w, tipo, de, a, cant, unit = "VIT", ids = []) {
  const last = w.chain[w.chain.length - 1];
  const b = { n: last ? last.n + 1 : 0, tipo, de, a, cant: +(+cant).toFixed(2), unit, ids, t: Date.now(), prev: last ? last.hash : "0".repeat(32) };
  b.hash = blockHash(b);
  w.chain.push(b);
  if (w.chain.length > CONFIG.CHAIN_MAX) w.chain.splice(0, w.chain.length - CONFIG.CHAIN_MAX);
  return b;
}
export function verifyChain(w) {
  for (let i = 0; i < w.chain.length; i++) {
    const b = w.chain[i];
    if (i > 0 && b.prev !== w.chain[i - 1].hash) return false;
    if (b.hash !== blockHash(b)) return false;
  }
  return true;
}
function clock(col) { return `${String(Math.floor(col.minuto / 60) % 24).padStart(2, "0")}:${String(col.minuto % 60).padStart(2, "0")}`; }
export function clog(w, col, msg) {
  const line = `${clock(col)} ${msg}`;
  col.log.unshift(line); if (col.log.length > 50) col.log.length = 50;
  w.log.unshift(`[${col.name}] ${line}`); if (w.log.length > 120) w.log.length = 120;
}
export function wlog(w, msg) { w.log.unshift(msg); if (w.log.length > 120) w.log.length = 120; }

// ---------- entorno ----------
// env: { minuto, weather: {luz, frio, lluvia} | null, attention (0..1), difficulty }
export function factors(col, env) {
  const ev = col.event ? EVENTS[col.event] : {};
  const sol = clamp(Math.sin(((col.minuto / 60) % 24 - 6) / 12 * Math.PI), 0, 1) * 0.9 + 0.08;
  const wx = env.weather || { luz: 1, frio: 0, lluvia: 0 };
  const luz = sol * (ev.luz || 1) * wx.luz + col.up.lampara * 0.09 * (1 - sol);
  const shield = 1 - 0.3 * col.up.escudo;
  const prod = 1 + 0.15 * (env.attention || 0) + 0.1 * (wx.lluvia || 0);
  const consBase = (ev.cons || 1) + 0.4 * (wx.frio || 0);
  return { luz, prod, cons: 1 + (consBase - 1) * shield, dmg: (ev.dmg || 0) * shield };
}

// ---------- IA local: autopiloto con personalidad ----------
export function autopilot(w, col, env) {
  const f = factors(col, env), p = col.ai.persona, N = col.cells.length;
  const er = col.energia / (150 + N);
  let rec = 20 + f.luz * 60;
  let rep = col.salud < 50 ? 45 : col.salud < 75 ? 25 : col.salud < 95 ? 10 + 10 * p.cuidado : 3 + 5 * p.cuidado;
  let repr = er > 0.45 - 0.15 * p.riesgo && col.salud > 70 - 15 * p.riesgo ? 25 + 20 * p.riesgo : er > 0.25 ? 15 : 0;
  let res = er > 0.7 - 0.2 * p.codicia ? 15 + 20 * p.codicia : er > 0.4 ? 10 : 0;
  // De noche no hay nada que recolectar: se ahorra energía (poca reparación, sin crecer ni acuñar).
  if (f.luz < 0.2) { rec = 60; repr = 0; res = 0; if (col.salud >= 75) rep = Math.min(rep, 8); }
  setAlloc(col, [rec, rep, repr, res]);
  // Nutrientes solo en una emergencia real; si no, el tesoro se gasta cada noche y nunca llega para la lámpara.
  if (col.energia < 10 && col.salud < 60 && col.treasury >= 1) buyNutrients(w, col, Math.min(3, Math.floor(col.treasury)), "El autopiloto");
  const order = col.event === "plaga" || col.event === "helada"
    ? ["escudo", "lampara", "refineria", "incubadora", "territorio"]
    : N > cap(col) * 0.85 ? ["territorio", "refineria", "lampara", "incubadora", "escudo"]
    : ["lampara", "refineria", "incubadora", "escudo", "territorio"];
  // Guarda una reserva según su prudencia, pero nunca mayor que la propia mejora (las primeras salen antes).
  const reserve = 15 + 40 * (1 - p.riesgo);
  for (const k of order) { const c = upCost(col, k); if (c != null && col.treasury >= c + Math.min(reserve, c)) { buyUpgrade(w, col, k, null, "El autopiloto"); break; } }
}
export function setAlloc(col, v) {
  v = v.map(x => Math.max(0, Number(x) || 0));
  const t = v.reduce((a, b) => a + b, 0) || 1;
  v = v.map(x => Math.round(x / t * 100)); v[3] = 100 - v[0] - v[1] - v[2];
  col.alloc = { rec: v[0], rep: v[1], repr: v[2], res: v[3] };
}

// ---------- economía ----------
function burn(w, n) { w.supply.burned += n; }
function mint(w, n) { w.supply.minted += n; }

export function buyNutrients(w, col, n, who) {
  n = Math.min(n, Math.floor(col.treasury));
  if (n <= 0) return false;
  col.treasury -= n; burn(w, n); col.energia += n * 8;
  block(w, "quema", col.id, "nutrientes", n);
  clog(w, col, `${who} quema ${n} VIT en nutrientes (+${n * 8} energía)`);
  return true;
}
// payer: null = tesoro de la colonia; objeto usuario = su cartera
export function buyUpgrade(w, col, k, user, who) {
  if (!UPGRADES[k]) return err("Mejora desconocida");
  const cost = upCost(col, k);
  if (cost == null) return err("Esa mejora ya está al máximo");
  if (user ? user.vit < cost : col.treasury < cost) return err("No hay VIT suficiente");
  if (user) user.vit -= cost; else col.treasury -= cost;
  burn(w, cost); col.up[k]++;
  block(w, "mejora", user ? user.id : col.id, `${col.id}:${k}`, cost);
  clog(w, col, `${who} paga <b>${UPGRADES[k].name}</b> nivel ${col.up[k]} (${cost} VIT)`);
  if (user) progress(user, "mejora");
  return { ok: true };
}
export function adopt(w, col, cellId, user) {
  const c = col.cells.find(x => x.id === cellId);
  if (!c) return err("Esa célula ya no existe");
  if (c.owner !== "colonia") return err("Esa célula ya tiene dueño");
  const p = cellPrice(c);
  if (user.vit < p) return err(`Necesitas ${p} VIT`);
  const fee = Math.max(1, Math.round(p * CONFIG.ADOPT_FEE));
  user.vit -= p; col.treasury += p - fee; burn(w, fee); c.owner = user.id;
  block(w, "adopción", user.id, col.id, p, "VIT", [c.id]);
  clog(w, col, `${user.name} adopta <b>${c.id}</b> (${RARITY[rarIdx(c)].name}) por ${p} VIT`);
  progress(user, "adoptar");
  return { ok: true, price: p };
}
export function sellBack(w, col, cellId, user) {
  const c = col.cells.find(x => x.id === cellId);
  if (!c || c.owner !== user.id) return err("Esa célula no es tuya");
  const p = Math.floor(cellPrice(c) * CONFIG.SELL_BACK);
  if (col.treasury < p) return err("El tesoro de la colonia no puede pagarla ahora");
  col.treasury -= p; user.vit += p; c.owner = "colonia";
  block(w, "venta", col.id, user.id, p, "VIT", [c.id]);
  clog(w, col, `${user.name} devuelve ${c.id} al tesoro por ${p} VIT`);
  return { ok: true, price: p };
}
export function feed(w, col, user, n = 5) {
  if (!col.alive) return err("La colonia está extinta");
  if (user.vit < n) return err("No hay VIT suficiente");
  user.vit -= n; col.treasury += n;
  block(w, "transferencia", user.id, col.id, n);
  buyNutrients(w, col, n, `${user.name} alimenta y`);
  progress(user, "alimentar");
  return { ok: true };
}
// Esporas: como mucho SPORES.perDay al día y una cada SPORES.cooldownMs.
export const SPORES = { perDay: 20, cooldownMs: 15000 };
export function mineSpore(w, user, value, now = Date.now()) {
  const d = user.daily;
  if ((d.spores || 0) >= SPORES.perDay) return err("Ya no quedan esporas hoy; vuelve mañana");
  if (user.lastSpore && now - user.lastSpore < SPORES.cooldownMs) return err("Las esporas tardan en reaparecer");
  d.spores = (d.spores || 0) + 1; user.lastSpore = now;
  const v = clamp(Math.floor(value), 1, 3);
  user.vit += v; mint(w, v); block(w, "minado", "espora", user.id, v);
  progress(user, "esporas");
  return { ok: true, value: v, left: SPORES.perDay - d.spores };
}
export function grant(w, user, n, tipo) { user.vit += n; mint(w, n); block(w, tipo, "sistema", user.id, n); }

// ---------- usuarios, misiones y racha ----------
const dayStr = d => d.toISOString().slice(0, 10);
export function createUser(w, name, tokenHash) {
  const id = "U" + (Object.keys(w.users).length + 1).toString().padStart(4, "0");
  const u = { id, name: String(name).slice(0, 24) || "Anónimo", tokenHash, vit: 0, streak: 0, lastDay: "", daily: { date: "", prog: {}, claimed: {} }, lastSpore: 0, createdAt: Date.now() };
  w.users[id] = u;
  grant(w, u, 20, "bienvenida");
  checkDay(w, u);
  return u;
}
export function checkDay(w, u, now = new Date()) {
  const today = dayStr(now);
  if (u.daily.date === today) return;
  const y = new Date(now); y.setUTCDate(y.getUTCDate() - 1);
  u.streak = u.lastDay === dayStr(y) ? u.streak + 1 : 1;
  u.lastDay = today; u.daily = { date: today, prog: {}, claimed: {} };
  grant(w, u, Math.min(u.streak, 7), "bono racha");
}
export function progress(u, k, n = 1) {
  const m = MISSIONS.find(x => x.k === k); if (!m) return;
  u.daily.prog[k] = Math.min(m.goal, (u.daily.prog[k] || 0) + n);
}
export function claimMission(w, u, k) {
  const m = MISSIONS.find(x => x.k === k);
  if (!m) return err("Misión desconocida");
  if (u.daily.claimed[k]) return err("Ya la cobraste hoy");
  if ((u.daily.prog[k] || 0) < m.goal) return err("Aún no está cumplida");
  u.daily.claimed[k] = true; grant(w, u, m.r, "misión");
  return { ok: true, reward: m.r };
}

function err(message) { return { ok: false, error: message }; }

// ---------- un ciclo de una colonia ----------
export function stepColony(w, col, env, rnd = Math.random) {
  if (!col.alive) return;
  col.minuto = env.minuto ?? (col.minuto + 10) % 1440;
  col.edad++;
  if (col.plan > 0) col.plan--; else autopilot(w, col, env);
  const grat = grateful(col), effort = grat ? CONFIG.GRATITUDE_EFFORT : 1;
  if (grat && --col.gratitud === 0) clog(w, col, "Termina su periodo de gratitud");

  const eventRate = 0.02 * (env.difficulty || 1) * (grat ? 0.5 : 1);
  if (col.eventLeft > 0 && --col.eventLeft === 0) { clog(w, col, `Termina: ${EVENTS[col.event].name}`); col.event = null; }
  else if (!col.event && rnd() < eventRate) {
    const keys = Object.keys(EVENTS); col.event = keys[Math.floor(rnd() * keys.length)]; col.eventLeft = 12 + Math.floor(rnd() * 18);
    w.stats.events[col.event]++;
    clog(w, col, `<b>Evento: ${EVENTS[col.event].name}</b>`);
  }

  const f = factors(col, env), a = col.alloc, cells = col.cells, N = cells.length, avg = avgGenes(cells);
  let sumF = 0; for (const c of cells) sumF += 1 + c.g.ef / 20;
  col.energia += 0.2 * f.luz * f.prod * (a.rec / 100) * sumF * effort
    - N * 0.03 * f.cons * (1 + col.met / 30)
    - (a.rep / 100) * 1.2 * Math.max(0.25, N / 40);
  col.salud += (a.rep / 100) * 2.2 * (1 + avg.res / 20) * effort - 0.35 - f.dmg * (1 - avg.res / 25);

  const born = [];
  if (col.energia > 20 + N * 0.2 && N > 0) {
    const want = Math.max(0, (a.repr / 100) * N * 0.012 * (1 + avg.fer / 15) * (1 + col.met / 40) * (1 + 0.2 * col.up.incubadora) * (1 - N / cap(col)));
    col.popF += want; col.energia -= want * 3;
    let fsum = 0; for (const c of cells) fsum += 1 + c.g.fer;
    while (col.popF >= 1 && cells.length < cap(col)) {
      col.popF--;
      let r = rnd() * fsum, parent = cells[0];
      for (const c of cells) { r -= 1 + c.g.fer; if (r <= 0) { parent = c; break; } }
      const child = newCell(w, col, mutG(parent.g, rnd() < 0.12 ? 4 : 2, rnd), parent.owner);
      cells.push(child); born.push(child);
      if (cellHooks.born.length) avisa(cellHooks.born, "onCellBorn", w, col, child, parent);
    }
    const m = ((grat ? Math.min(a.res, CONFIG.GRATITUDE_RES_MAX) : a.res) / 100) * col.energia * 0.01;
    col.energia -= m * 4;
    const mm = m * (1 + 0.25 * col.up.refineria);
    for (const c of cells) {
      const share = mm * (1 + c.g.ef / 20) / sumF;
      c.mined += share; col.mintBuf[c.owner] = (col.mintBuf[c.owner] || 0) + share;
    }
  }
  if (col.energia <= 0) { col.energia = 0; col.salud -= 2.5; }
  col.salud = clamp(col.salud, 0, 100);
  col.energia = Math.min(col.energia, 150 + cells.length);

  const dead = [];
  for (let i = cells.length - 1; i >= 0; i--) if (col.edad - cells[i].born > cells[i].life) dead.push(...cells.splice(i, 1));
  if (col.salud < 30) col.popF -= cells.length * 0.02;
  while (col.popF <= -1 && cells.length) {
    col.popF++;
    let wi = 0; for (let i = 1; i < cells.length; i++) if (cells[i].g.res + rnd() * 3 < cells[wi].g.res) wi = i;
    dead.push(...cells.splice(wi, 1));
  }
  if (col.salud <= 0) dead.push(...cells.splice(0));

  if (born.length) {
    w.stats.births += born.length;
    block(w, "acuña célula", col.id, "nacimientos", born.length, "CEL", born.slice(0, 3).map(c => c.id));
    const best = born.reduce((b, c) => score(c) > score(b) ? c : b);
    if (rarIdx(best) >= 2) clog(w, col, `Nace <b>${best.id}</b>, célula ${RARITY[rarIdx(best)].name.toLowerCase()}`);
  }
  if (dead.length) {
    w.supply.cellsBurned += dead.length; w.stats.deaths += dead.length;
    block(w, "quema célula", col.id, "∅", dead.length, "CEL", dead.slice(0, 3).map(c => c.id));
    if (cellHooks.dead.length) avisa(cellHooks.dead, "onCellsDie", w, col, dead);
  }
  for (const [owner, amt] of Object.entries(col.mintBuf)) {
    if (amt < 1) continue;
    const n = Math.floor(amt); col.mintBuf[owner] -= n; mint(w, n);
    if (owner === "colonia") col.treasury += n;
    else if (w.users[owner]) { w.users[owner].vit += n; w.users[owner].mined = (w.users[owner].mined || 0) + n; }
    block(w, "acuñación", col.id, owner === "colonia" ? col.id : owner, n);
  }
  // Mantenimiento: el tesoro que pasa de UPKEEP_FREE se va quemando poco a poco.
  const over = col.treasury - CONFIG.UPKEEP_FREE;
  if (over > 0) {
    const u = over * CONFIG.UPKEEP_RATE;
    col.treasury -= u; burn(w, u); w.stats.upkeepBurned += u; col.upkeepBuf = (col.upkeepBuf || 0) + u;
  }
  if (col.edad % 144 === 0 && col.upkeepBuf >= 1) { block(w, "mantenimiento", col.id, "∅", col.upkeepBuf); col.upkeepBuf = 0; }
  if (col.edad % 144 === 0 && rnd() < 0.25) col.met = clamp(col.met + Math.round(rnd() * 2 - 1), 0, 15);
  if (col.edad % 6 === 0) { col.hist.push([+(col.energia / (150 + cells.length)).toFixed(3), +(col.salud / 100).toFixed(3), +(cells.length / cap(col)).toFixed(3)]); if (col.hist.length > 144) col.hist.shift(); }

  if (!cells.length) {
    col.alive = false; col.gratitud = 0; w.stats.extinctions++;
    col.cause = col.salud <= 0 ? "La salud llegó a cero." : "No quedó ninguna célula.";
    clog(w, col, `<b>Extinción</b> tras ${(col.edad / 144).toFixed(1)} días`);
  }
}

// ---------- federación: colonias que fundan colonias con su propia IA ----------
export function maybeFound(w, col, rnd = Math.random) {
  const alive = Object.values(w.colonies).filter(c => c.alive).length;
  if (!col.alive || alive >= CONFIG.MAX_COLONIES) return null;
  if (col.treasury < CONFIG.FOUND_TREASURY || col.cells.length < CONFIG.FOUND_CELLS || col.salud < 60) return null;
  // Emigran las mejores células de la colonia (nunca las de jugadores)
  const pool = col.cells.filter(c => c.owner === "colonia").sort((a, b) => score(b) - score(a)).slice(0, CONFIG.FOUND_SEED_CELLS);
  if (pool.length < CONFIG.FOUND_SEED_CELLS) return null;
  const ids = new Set(pool.map(c => c.id));
  col.cells = col.cells.filter(c => !ids.has(c.id));
  col.treasury -= CONFIG.FOUND_BURN + CONFIG.FOUND_SEED_VIT; burn(w, CONFIG.FOUND_BURN);
  const used = new Set(Object.values(w.colonies).map(c => c.name));
  const name = NAMES.find(n => !used.has(n)) || `Colonia ${w.colonySerial + 1}`;
  const child = createColony(w, {
    name, genes: null, met: clamp(col.met + Math.round(rnd() * 2 - 1), 0, 15), treasury: CONFIG.FOUND_SEED_VIT,
    parent: col.id, cells: pool.map(c => ({ ...c, born: 0, mined: 0 })), persona: newPersona(rnd, col.ai.persona), minuto: col.minuto,
  });
  child.gen = col.gen + 1; w.stats.foundings++;
  block(w, "fundación", col.id, child.id, CONFIG.FOUND_SEED_VIT, "VIT", pool.slice(0, 3).map(c => c.id));
  clog(w, col, `Funda la colonia <b>${name}</b> con ${pool.length} células y su propia IA`);
  clog(w, child, `Nace de ${col.name}. Su IA empieza con ${CONFIG.FOUND_SEED_VIT} VIT para financiarse`);
  for (const fn of bornHooks) {
    try { fn(w, child, col); } catch (e) { console.error("[onColonyBorn]", e); } // un módulo con fallos no para el mundo
  }
  return child;
}

// Una colonia extinta renace desde la colonia viva más rica, que paga el rescate.
export function reseed(w, dead, rnd = Math.random) {
  if (dead.alive) return false;
  const donor = Object.values(w.colonies).filter(c => c.alive && !grateful(c) && c.cells.length > 80 && c.treasury > 80).sort((a, b) => b.treasury - a.treasury)[0];
  if (!donor) return false;
  const pool = donor.cells.filter(c => c.owner === "colonia").sort(() => rnd() - 0.5).slice(0, 20);
  if (pool.length < 20) return false;
  const ids = new Set(pool.map(c => c.id));
  donor.cells = donor.cells.filter(c => !ids.has(c.id));
  donor.treasury -= 60; dead.treasury += 40; burn(w, 20);
  Object.assign(dead, { alive: true, cells: pool.map(c => ({ ...c, born: 0 })), energia: 80, salud: 85, popF: 0, edad: 0, event: null, eventLeft: 0, cause: "" });
  dead.gen++; w.stats.reseeds++;
  block(w, "rescate", donor.id, dead.id, 60, "VIT", pool.slice(0, 3).map(c => c.id));
  clog(w, dead, `Renace gracias a ${donor.name} (generación ${dead.gen})`);
  grantGratitude(w, dead, "renacer");
  return true;
}

// ---------- IA supervisora local del servidor ----------
export function supervise(w) {
  const cols = Object.values(w.colonies);
  const alive = cols.filter(c => c.alive);
  const avgHealth = alive.length ? alive.reduce((s, c) => s + c.salud, 0) / alive.length : 0;
  // Dificultad dinámica: si todo va demasiado bien, más eventos; si va mal, menos.
  // Si la supervisora Claude fijó la dificultad hace poco, se respeta.
  // Mientras la federación es pequeña (arranque) no se endurece: así no se queda atascada en la pobreza.
  const totalCells = alive.reduce((s, c) => s + c.cells.length, 0);
  if (!(w.ai.claudeUntil > w.tick)) {
    const target = avgHealth > 85 && totalCells > 150 ? 1.3 : avgHealth > 65 ? 1 : 0.6;
    w.ai.difficulty = +(w.ai.difficulty + (target - w.ai.difficulty) * 0.3).toFixed(2);
  }
  // Rescate de colonias al borde del colapso con VIT de la más rica
  for (const c of alive) {
    if (c.salud < 20 && c.treasury < 5) {
      const donor = alive.filter(d => d !== c && !grateful(d) && d.treasury > 100).sort((a, b) => b.treasury - a.treasury)[0];
      if (donor) {
        donor.treasury -= 30; c.treasury += 27; burn(w, 3); w.stats.rescues++;
        block(w, "ayuda", donor.id, c.id, 30);
        clog(w, c, `La supervisora envía ayuda de ${donor.name} (+27 VIT)`);
        grantGratitude(w, c, "la ayuda recibida");
      }
    }
  }
  for (const c of cols) if (!c.alive) reseed(w, c);
}

// ---------- ciclo global ----------
export function stepWorld(w, envFor, rnd = Math.random) {
  w.tick++;
  for (const col of Object.values(w.colonies)) stepColony(w, col, envFor(col), rnd);
  if (w.tick % 36 === 0) {
    for (const col of Object.values(w.colonies)) maybeFound(w, col, rnd);
    supervise(w);
  }
}

// ---------- vistas públicas ----------
export function colonySummary(w, col) {
  const rar = [0, 0, 0, 0]; for (const c of col.cells) rar[rarIdx(c)]++;
  return {
    id: col.id, name: col.name, parent: col.parent, gen: col.gen, alive: col.alive, cause: col.cause,
    genome: genomeCode(col), cells: col.cells.length, cap: cap(col), energia: Math.round(col.energia), salud: Math.round(col.salud),
    treasury: Math.floor(col.treasury), event: col.event ? EVENTS[col.event].name : null, edadDias: +(col.edad / 144).toFixed(1),
    rarity: rar, persona: col.ai.persona, sharePrice: +sharePrice(col).toFixed(3), investors: Object.keys(col.fund?.shares || {}).filter(k => k !== "colonia").length, aiCalls: col.ai.calls, aiSpentVit: col.ai.spentVit, planBy: col.plan > 0 ? col.planBy : "autopiloto",
    gratitudDias: grateful(col) ? +(col.gratitud / 144).toFixed(1) : 0,
  };
}
export function colonyDetail(w, col, uid) {
  const f = col.cells.filter(c => c.owner === "colonia").sort((a, b) => score(b) - score(a)).slice(0, 8);
  return {
    ...colonySummary(w, col), alloc: col.alloc, plan: col.plan, message: col.ai.message, up: col.up, hist: col.hist, log: col.log.slice(0, 30),
    avgGenes: avgGenes(col.cells), met: col.met, minuto: col.minuto,
    upgrades: Object.fromEntries(Object.entries(UPGRADES).map(([k, u]) => [k, { ...u, level: col.up[k], next: upCost(col, k) ?? null }])),
    // células compactas para dibujar: [id, rareza, fer, esMía]
    dots: col.cells.map(c => [c.id, rarIdx(c), c.g.fer, uid && c.owner === uid ? 1 : 0]),
    market: f.map(c => ({ id: c.id, g: c.g, rarity: rarIdx(c), price: cellPrice(c) })),
  };
}
export function leaderboard(w) {
  const holders = {};
  for (const col of Object.values(w.colonies)) for (const c of col.cells) if (c.owner !== "colonia") holders[c.owner] = (holders[c.owner] || 0) + 1;
  return Object.values(w.users)
    .map(u => ({ name: u.name, vit: Math.floor(u.vit), cells: holders[u.id] || 0 }))
    .sort((a, b) => (b.vit + b.cells * 10) - (a.vit + a.cells * 10)).slice(0, 10);
}
export function userView(w, u) {
  const mine = [];
  for (const col of Object.values(w.colonies)) for (const c of col.cells) if (c.owner === u.id) mine.push({ id: c.id, colony: col.id, colonyName: col.name, rarity: rarIdx(c), g: c.g, mined: +c.mined.toFixed(2), sell: Math.floor(cellPrice(c) * CONFIG.SELL_BACK) });
  return {
    id: u.id, name: u.name, vit: Math.floor(u.vit), streak: u.streak,
    missions: MISSIONS.map(m => ({ ...m, prog: u.daily.prog[m.k] || 0, claimed: !!u.daily.claimed[m.k] })),
    cells: mine.sort((a, b) => b.mined - a.mined).slice(0, 50), cellCount: mine.length,
    positions: positions(w, u), habits: Object.fromEntries(Object.keys(HABITS).map(k => [k, !!u.daily.habits?.[k]])),
    adsLeft: ADS.perDay - (u.daily.ads || 0), sporesLeft: SPORES.perDay - (u.daily.spores || 0),
  };
}

// ---------- carteras de agentes IA (fondos dentro del juego) ----------
// Cada colonia gestiona su tesoro con su IA. Los jugadores compran participaciones:
// si la IA hace crecer el tesoro, la participación vale más; si lo gasta mal, vale menos.
export const FUND_EXIT_FEE = 0.05;
// Valor de la cartera = tesoro + las células que aún son de la colonia, a precio de recompra.
// Así el precio no se hunde cuando la IA gasta el tesoro en mejoras o en fundar otra colonia,
// y nadie puede comprar media colonia por 5 VIT justo antes de que se recupere.
export function fundNav(col) {
  let cells = 0;
  for (const c of col.cells) if (c.owner === "colonia") cells += cellPrice(c);
  return Math.max(0, col.treasury) + cells * CONFIG.SELL_BACK;
}
function fund(col) {
  if (!col.fund) { const nav = Math.max(1, fundNav(col)); col.fund = { shares: { colonia: nav }, total: nav }; }
  return col.fund;
}
export const sharePrice = col => Math.max(0.01, fundNav(col) / fund(col).total);
export function invest(w, col, user, amount) {
  amount = Math.floor(amount);
  if (!col.alive) return err("No se puede invertir en una colonia extinta");
  if (!(amount >= 5)) return err("La inversión mínima es 5 VIT");
  if (user.vit < amount) return err("No hay VIT suficiente");
  const f = fund(col), sh = amount / sharePrice(col);
  user.vit -= amount; col.treasury += amount;
  f.shares[user.id] = (f.shares[user.id] || 0) + sh; f.total += sh;
  block(w, "inversión", user.id, col.id, amount);
  clog(w, col, `${user.name} confía ${amount} VIT a la IA de ${col.name}`);
  return { ok: true, shares: +sh.toFixed(3) };
}
// Se paga desde el tesoro. Si el tesoro no alcanza, se paga lo que haya y el resto
// de la participación se conserva para retirarlo más adelante.
export function withdraw(w, col, user) {
  const f = fund(col), sh = f.shares[user.id] || 0;
  if (sh <= 0) return err("No tienes participación en esta colonia");
  const price = sharePrice(col), value = sh * price, pay = Math.min(value, Math.max(0, col.treasury));
  if (pay < 1) return err("El tesoro de la colonia está vacío ahora; prueba más tarde");
  const partial = pay < value - 1e-9, out = partial ? pay / price : sh, net = Math.floor(pay * (1 - FUND_EXIT_FEE));
  col.treasury -= pay; burn(w, pay - net); user.vit += net;
  f.total -= out;
  if (partial) f.shares[user.id] = sh - out; else delete f.shares[user.id];
  block(w, "retirada", col.id, user.id, net);
  clog(w, col, `${user.name} retira ${net} VIT de su participación${partial ? " (parcial: el tesoro no daba para más)" : ""}`);
  return { ok: true, amount: net, partial, pending: +(value - pay).toFixed(2) };
}
export function positions(w, user) {
  const out = [];
  for (const col of Object.values(w.colonies)) {
    const sh = col.fund?.shares[user.id];
    if (sh) { const value = sh * sharePrice(col); out.push({ colony: col.id, name: col.name, shares: +sh.toFixed(3), value: +value.toFixed(2), withdrawable: Math.floor(Math.min(value, Math.max(0, col.treasury))) }); }
  }
  return out;
}

// ---------- anuncios con recompensa ----------
export const ADS = { reward: 2, perDay: 6, cooldownMs: 30000 };
export function watchedAd(w, user, now = Date.now()) {
  const d = user.daily;
  d.ads = d.ads || 0;
  if (d.ads >= ADS.perDay) return err("Ya viste todos los anuncios de hoy");
  if (user.lastAd && now - user.lastAd < ADS.cooldownMs) return err("Espera unos segundos entre anuncios");
  d.ads++; user.lastAd = now;
  w.ads = w.ads || { impressions: 0 };
  w.ads.impressions++;
  grant(w, user, ADS.reward, "anuncio");
  return { ok: true, reward: ADS.reward, left: ADS.perDay - d.ads };
}

// ---------- hábitos de salud (autodeclarados por ahora) ----------
export const HABITS = {
  pasos: { name: "Caminé 6.000 pasos", energia: 12 },
  agua: { name: "Bebí 2 litros de agua", energia: 8 },
  sueno: { name: "Dormí 7 horas o más", energia: 10 },
  ejercicio: { name: "Hice 20 minutos de ejercicio", energia: 15 },
};
export function logHabit(w, user, col, k) {
  const hb = HABITS[k];
  if (!hb) return err("Hábito desconocido");
  const d = user.daily; d.habits = d.habits || {};
  if (d.habits[k]) return err("Ese hábito ya está registrado hoy");
  d.habits[k] = true;
  grant(w, user, 3, "hábito");
  if (col?.alive) { col.energia += hb.energia; col.salud = Math.min(100, col.salud + 2); clog(w, col, `${user.name}: "${hb.name}" (+${hb.energia} energía)`); }
  return { ok: true };
}
