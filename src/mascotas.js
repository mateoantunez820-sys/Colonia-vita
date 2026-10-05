// Las mascotas de VITA: cada ser vivo de las colonias tiene la suya.
// · Cada célula nace con su mascota: la cría de la mascota de su madre, o una que la esperaba en el refugio.
//   Ninguna célula tiene dos y ninguna mascota se queda sola.
// · El lazo entre las dos es lo que lo mueve todo. Crece cada ciclo que viven juntas, más deprisa si se
//   entienden (cada especie se lleva mejor con un tipo de célula), si la colonia está sana y si sus mascotas
//   viven en armonía. Cada nivel de lazo alarga la vida de la célula. Un lazo nunca se pierde.
// · Cuatro especies que se necesitan: luciérnagas que alumbran de noche, abejas que ayudan a nacer, erizos que
//   curan durante las plagas, heladas y sequías, y caracoles que devuelven la energía de cada célula que se va.
//   La armonía (que las cuatro vivan en número parecido) multiplica lo que dan. La luz y el reciclaje llegan
//   cuando a la colonia le falta energía: salvan a las que se apagan sin inflar el VIT de las que van bien.
// · Cuando una célula se va, su mascota espera: en el hogar de su jugador, a la próxima célula de su familia,
//   o en el refugio de la colonia, a una recién nacida. Si espera demasiado se va a vivir libre a Oruz.
// · Los jugadores las miman, les dan premios y les ponen nombre; sus hábitos y su cría también las alegran.
// · Si se apagan todas las colonias, las mascotas que esperan despiertan a una generación nueva con los genes
//   de las células que acompañaron.
// Funciones puras sobre `world`, como core.js: aquí no hay E/S, y el azar sale de huellas, no del ciclo.
import { hash, block, clog, wlog, cap, newCell, mutG, grantGratitude, onCellBorn, onCellsDie } from "./core.js";
import { rng } from "./ecomundo.js";
import { anotar, limpiarNombre } from "./cria.js";

export const MASCOTAS = {
  LAZO: 0.25,        // lo que crece un lazo en un ciclo con afinidad, armonía y salud al máximo
  TECHO: 105,        // cuanto más fuerte es un lazo, más despacio crece
  NACE: 5,           // lazo con el que nace una pareja (10 si la madre y su mascota eran inseparables)
  ADOPTA: 0.5,       // parte de las recién nacidas de la colonia que adopta a una mascota del refugio
  MUTA: 0.1,         // parte de las crías que nace de otra especie: casi siempre la que más falta en la colonia
  REFUGIO: 12,       // mascotas esperando a la vez en el refugio de una colonia
  HOGAR: 6,          // mascotas esperando a la vez en el hogar de un jugador
  ESPERA: 432,       // ciclos (3 días) que espera una mascota en el refugio antes de irse a vivir libre a Oruz
  LUZ: 0.08,         // energía por luciérnaga en cada ciclo sin sol (por la fuerza de su lazo)
  APURO: 0.25,       // la luz y el reciclaje dan todo con la colonia sin energía, y nada si tiene más de esta parte del tope
  POLEN: 0.0006,     // nacimientos que suma cada abeja por ciclo mientras haya sitio
  GUARDIA: 0.003,    // salud por erizo en cada ciclo de plaga, helada o sequía
  CICLO: 1,          // energía que devuelve cada célula que se va, con una colonia bien servida de caracoles
  MIMOS: 6,          // lazo que suma la ronda de mimos del día a cada mascota del jugador
  PREMIO: 10, PREMIO_VIT: 1, PREMIOS: 3, // un premio: +10 de lazo por 1 VIT que se quema, hasta 3 al día
  HABITO: 1.5,       // lazo que suma cada hábito de «Salud real» a todas las mascotas del jugador
  CRIA: 3,           // lazo que suma la visita de su cría a las mascotas del jugador en su colonia hogar
  RENACE: 36,        // ciclos con todas las colonias apagadas antes de que las mascotas despierten a una
  RENACE_CELULAS: 20,
  CRONICA: 14, LISTA: 12,
};
// Niveles del lazo entre una célula y su mascota. `vida`: ciclos que la célula vive de más al llegar.
// `nameM`: cuando la mascota es un erizo o un caracol (la célula y él son «amigos», no «amigas»).
export const NIVELES = [
  { k: "conocidas", name: "Recién conocidas", nameM: "Recién conocidos", desde: 0, vida: 0 },
  { k: "amigas", name: "Amigas", nameM: "Amigos", desde: 20, vida: 3 },
  { k: "companeras", name: "Compañeras", nameM: "Compañeros", desde: 45, vida: 6 },
  { k: "inseparables", name: "Inseparables", desde: 70, vida: 9 },
  { k: "almas", name: "Almas gemelas", desde: 90, vida: 12 },
];
const ALMAS = NIVELES.length - 1;
// gen: el gen de la célula con la que mejor se entiende (los caracoles, con las equilibradas)
export const ESPECIES = {
  luz: { name: "Luciérnagas", una: "luciérnaga", la: "la", rol: "Alumbran de noche", desc: "Dan energía a la colonia cuando se queda a oscuras y sin energía.", gen: "ef", amiga: "las células eficientes", color: "#F5E663" },
  polen: { name: "Abejas de polen", una: "abeja", la: "la", rol: "Ayudan a nacer", desc: "Hacen que nazcan más células mientras queda sitio y energía.", gen: "fer", amiga: "las células fértiles", color: "#FFB067" },
  guardia: { name: "Erizos guardianes", una: "erizo", la: "el", rol: "Protegen", desc: "Curan a la colonia durante las plagas, las heladas y las sequías.", gen: "res", amiga: "las células resistentes", color: "#F08BB0" },
  ciclo: { name: "Caracoles del ciclo", una: "caracol", la: "el", rol: "Reciclan", desc: "Devuelven a la colonia la energía de cada célula que se va, cuando más falta le hace.", gen: null, amiga: "las células equilibradas", color: "#C9A27E" },
};
export const CLAVES = Object.keys(ESPECIES);
const MALOS = ["plaga", "helada", "sequia"];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = x => Math.round(x * 100) / 100;
const err = message => ({ ok: false, error: message });
const vivas = w => Object.values(w.colonies).filter(c => c.alive);
const hora = col => `${String(Math.floor(col.minuto / 60) % 24).padStart(2, "0")}:${String(col.minuto % 60).padStart(2, "0")}`;
// El azar de las mascotas sale de huellas: la misma célula recibe siempre la misma mascota y no se gasta el azar del ciclo
const huella = (...p) => hash(p.join(":"));
const dado = (h, i) => parseInt(h.slice(i * 8, i * 8 + 8), 16) / 4294967296;
export const nivelDe = v => { let i = 0; while (i < ALMAS && v >= NIVELES[i + 1].desde) i++; return i; };
const nuevasStats = () => ({ nacidas: 0, adopciones: 0, reencuentros: 0, despedidas: 0, libres: 0, almas: 0, mimos: 0, premios: 0, vitQuemado: 0, renacimientos: 0, luz: 0, polen: 0, guardia: 0, ciclo: 0 });

// ---------- nombres ----------
const SIL = ["lu", "mi", "pi", "to", "ki", "bo", "li", "nu", "fi", "ro", "ta", "chu", "pe", "sa", "mo", "ni", "ru", "zu", "ga", "ña", "co", "de", "ji", "le", "pa", "ti", "yo", "be"];
const FEOS = ["pito", "pija", "pijo", "chupa", "moco", "bolu", "pichu", "puto", "puta", "culo", "caca", "pene", "teta", "pedo", "cago", "coño", "mierda", "tonto"];
export function nombreDe(s) {
  for (let i = 0; i + 2 < s.length / 2; i += 3) {
    const b = k => parseInt(s.slice(2 * (i + k), 2 * (i + k) + 2), 16);
    const a = SIL[b(0) % SIL.length], c = SIL[b(1) % SIL.length], e = b(2) % 4 === 0 ? SIL[(b(2) >> 2) % SIL.length] : "";
    const n = a + c + (e !== c ? e : "");
    if (a !== c && !FEOS.some(f => n.includes(f))) return n[0].toUpperCase() + n.slice(1);
  }
  return "Lumi";
}
export const nombre = m => m.n || nombreDe(m.s);
// «la luciérnaga Lumi», «el erizo Pipo»; al empezar una frase, «El erizo Pipo»; tras «a», «al erizo Pipo»
export const quien = m => `${ESPECIES[m.e].la} ${ESPECIES[m.e].una} ${nombre(m)}`;
const Quien = m => { const q = quien(m); return q[0].toUpperCase() + q.slice(1); };
const aQuien = m => `a ${quien(m)}`.replace(/^a el /, "al ");
// El nombre del nivel concuerda con la mascota: «amigas» con una abeja, «amigos» con un caracol
export const nivelNombre = (i, e) => (ESPECIES[e]?.la === "el" && NIVELES[i].nameM) || NIVELES[i].name;

// ---------- afinidad y armonía ----------
// Cada especie se entiende mejor con un tipo de célula: de 0,6 (les cuesta) a 1,4 (se entienden de maravilla)
export function afinidad(c, e) {
  const g = c.g, s = (g.ef + g.res + g.fer) || 1, k = ESPECIES[e].gen;
  if (k) return clamp(1 + 2.5 * (g[k] / s - 1 / 3), 0.6, 1.4);
  const lejos = Math.max(Math.abs(g.ef / s - 1 / 3), Math.abs(g.res / s - 1 / 3), Math.abs(g.fer / s - 1 / 3));
  return clamp(1.3 - 4 * lejos, 0.6, 1.4);
}
// Armonía: 1 si las cuatro especies viven en el mismo número, 0 si solo hay una (equidad de Pielou)
export function armonia(n) {
  const N = CLAVES.reduce((s, k) => s + (n[k] || 0), 0);
  if (!N) return 0;
  let h = 0;
  for (const k of CLAVES) { const p = (n[k] || 0) / N; if (p > 0) h -= p * Math.log(p); }
  return h / Math.log(CLAVES.length);
}
// La especie que más falta en la colonia (si no hay datos, una al azar)
function escasa(w, col, h) {
  const n = w.mascotas.info[col.id]?.n;
  if (!n) return CLAVES[Math.floor(dado(h, 2) * CLAVES.length)];
  return [...CLAVES].sort((a, b) => (n[a] || 0) - (n[b] || 0) || dado(huella(h, a), 0) - dado(huella(h, b), 0))[0];
}
// Para una célula sin madre con mascota: cualquier especie, más probable cuanto mejor se entienden
function porAfinidad(c, h) {
  const p = CLAVES.map(e => afinidad(c, e) ** 2), t = p.reduce((a, b) => a + b, 0);
  let x = dado(h, 3) * t;
  for (let i = 0; i < CLAVES.length; i++) { x -= p[i]; if (x <= 0) return CLAVES[i]; }
  return CLAVES[CLAVES.length - 1];
}

// ---------- el mundo de las mascotas ----------
export function ensure(w) {
  if (!w.mascotas) {
    w.mascotas = { v: 1, seed: hash(`mascotas:${w.createdAt}`).slice(0, 16), refugio: {}, cronica: {}, info: {}, muertes: {}, apagada: null, stats: nuevasStats() };
    let n = 0;
    for (const col of vivas(w)) for (const c of col.cells) if (!c.m) { asignar(w, col, c, null); n++; }
    if (n) wlog(w, `Llegan las mascotas de VITA: cada una de las ${n} células de la federación recibe la suya`);
  }
  const M = w.mascotas;
  M.stats = { ...nuevasStats(), ...(M.stats || {}) };
  for (const k of ["refugio", "cronica", "info", "muertes"]) M[k] ||= {};
  return M;
}
export function cronica(w, col, txt, enBitacora = false) {
  const l = (w.mascotas.cronica[col.id] ||= []);
  l.unshift({ t: w.tick, h: hora(col), txt });
  if (l.length > MASCOTAS.CRONICA) l.length = MASCOTAS.CRONICA;
  if (enBitacora) clog(w, col, txt);
}
// Una mascota que ya quiso a otra célula sabe querer: empieza con más lazo cuantas más acompañó
const adoptada = (w, o) => ({ s: o.s, e: o.e, v: Math.min(25, 5 * (o.k || 1)), d: w.tick, k: (o.k || 1) + 1, ...(o.n ? { n: o.n } : {}) });

// Toda célula que aparece recibe su mascota: la familia primero, luego el refugio, si no una cría nueva
function asignar(w, col, c, madre) {
  const M = w.mascotas, st = M.stats, h = huella(M.seed, c.id, c.n);
  const u = c.owner !== "colonia" ? w.users[c.owner] : null;
  if (u?.mascotasHogar?.length) {
    const o = u.mascotasHogar.shift();
    c.m = adoptada(w, o); st.reencuentros++;
    cronica(w, col, `${Quien(o)}, que esperaba en el hogar de ${u.name}, ya tiene compañera: ${c.id}, de su misma familia`);
    return c.m;
  }
  const ref = M.refugio[col.id];
  if (ref?.length && dado(h, 0) < MASCOTAS.ADOPTA) {
    const o = ref.shift();
    c.m = adoptada(w, o); st.adopciones++;
    cronica(w, col, `${c.id} acaba de nacer y adopta ${aQuien(o)}, que la esperaba en el refugio`);
    return c.m;
  }
  let e = madre?.m?.e;
  if (!e) e = porAfinidad(c, h);
  else if (dado(h, 1) < MASCOTAS.MUTA) e = escasa(w, col, h);
  c.m = { s: h.slice(40, 48), e, v: MASCOTAS.NACE * (madre?.m && nivelDe(madre.m.v) >= 3 ? 2 : 1), d: w.tick, k: 1 };
  st.nacidas++;
  return c.m;
}
// Una mascota que se va a vivir libre a Oruz
function liberar(w, o, col) {
  const M = w.mascotas;
  M.stats.libres++;
  if (col && (o.n || o.k >= 3)) cronica(w, col, `${Quien(o)} esperó a una compañera nueva y al final se fue a vivir libre a Oruz`);
}
// Las células que murieron en un ciclo: sus mascotas esperan en el hogar de su jugador o en el refugio
function despedir(w, col, muertas) {
  const M = w.mascotas;
  M.muertes[col.id] = (M.muertes[col.id] || 0) + muertas.length;
  for (const c of muertas) {
    const m = c.m;
    if (!m) continue;
    const o = { s: m.s, e: m.e, k: m.k, v: m.v, t: w.tick, c: c.id, g: [c.g.ef, c.g.res, c.g.fer], col: col.id, ...(m.n ? { n: m.n } : {}) };
    if (nivelDe(m.v) === ALMAS) { M.stats.despedidas++; cronica(w, col, `${c.id} se fue. ${Quien(m)}, su alma gemela, la acompañó hasta el final`); }
    const u = c.owner !== "colonia" ? w.users[c.owner] : null;
    const fila = u ? (u.mascotasHogar ||= []) : (M.refugio[col.id] ||= []), max = u ? MASCOTAS.HOGAR : MASCOTAS.REFUGIO;
    fila.push(o);
    while (fila.length > max) liberar(w, fila.shift(), col);
  }
}
onCellBorn((w, col, hija, madre) => { if (w.mascotas) asignar(w, col, hija, madre); });
onCellsDie((w, col, muertas) => { if (w.mascotas) despedir(w, col, muertas); });

// Sube el lazo de una pareja; al cambiar de nivel la célula vive más. Devuelve el nivel nuevo si subió.
function crecer(w, col, c, x) {
  const m = c.m, antes = nivelDe(m.v);
  m.v = r2(Math.min(100, m.v + x));
  const ahora = nivelDe(m.v);
  if (ahora <= antes) return 0;
  for (let i = antes + 1; i <= ahora; i++) c.life += NIVELES[i].vida;
  if (ahora === ALMAS) {
    w.mascotas.stats.almas++;
    const u = c.owner !== "colonia" ? w.users[c.owner] : null;
    cronica(w, col, `${Quien(m)} y ${u ? `${c.id}, la célula de ${u.name},` : c.id} ya son almas gemelas`, !!u);
  }
  return ahora;
}

// ---------- un ciclo de las mascotas (después de cada ciclo de la federación) ----------
// Un fallo aquí nunca para el mundo: el ciclo de la federación ya pasó.
export function step(w) {
  try { ciclo(w); } catch (e) { console.error("[mascotas]", e); }
}
function ciclo(w) {
  const M = w.mascotas;
  if (!M) return;
  const st = M.stats;
  for (const col of Object.values(w.colonies)) {
    if (!col.alive) { delete M.info[col.id]; M.muertes[col.id] = 0; continue; }
    const cells = col.cells, N = cells.length;
    for (const c of cells) if (!c.m) asignar(w, col, c, null); // las que llegaron sin mascota (premios, legados, copias)
    const n = { luz: 0, polen: 0, guardia: 0, ciclo: 0 }, f = { luz: 0, polen: 0, guardia: 0, ciclo: 0 };
    for (const c of cells) { n[c.m.e]++; f[c.m.e] += 0.25 + 0.75 * c.m.v / 100; }
    const H = armonia(n);
    // Los lazos crecen más deprisa en una colonia sana y en armonía
    const base = MASCOTAS.LAZO * (0.4 + 0.6 * H) * (0.4 + 0.6 * clamp(col.salud / 90, 0, 1));
    for (const c of cells) if (c.m.v < 100) crecer(w, col, c, base * afinidad(c, c.m.e) * (1 - c.m.v / MASCOTAS.TECHO));
    // Lo que dan a su colonia, multiplicado por la armonía
    const mult = 0.5 + 0.5 * H, ef = { luz: 0, polen: 0, guardia: 0, ciclo: 0 };
    const sol = clamp(Math.sin(((col.minuto / 60) % 24 - 6) / 12 * Math.PI), 0, 1), tope = 150 + N;
    const falta = clamp(1 - col.energia / (MASCOTAS.APURO * tope), 0, 1);
    if (sol < 1) ef.luz = f.luz * MASCOTAS.LUZ * (1 - sol) * mult * falta;
    if (N && N < cap(col) && col.energia > 20 + N * 0.2) {
      ef.polen = f.polen * MASCOTAS.POLEN * mult * (1 - N / cap(col));
      col.popF += ef.polen; col.energia -= ef.polen * 3; // nacer cuesta la misma energía que en core
    }
    if (MALOS.includes(col.event)) { ef.guardia = f.guardia * MASCOTAS.GUARDIA * mult; col.salud = Math.min(100, col.salud + ef.guardia); }
    const muertes = M.muertes[col.id] || 0; M.muertes[col.id] = 0;
    if (muertes && N) ef.ciclo = muertes * MASCOTAS.CICLO * Math.min(1, 4 * f.ciclo / N) * mult * falta;
    if (ef.luz + ef.ciclo > 0 && col.energia < tope) col.energia = Math.min(tope, col.energia + ef.luz + ef.ciclo);
    for (const k of CLAVES) st[k] += ef[k];
    // Lo que dio cada especie en el último día (144 ciclos), para que se vea qué hace cada una
    const I = M.info[col.id], dia = I?.dia && w.tick - I.dia.desde < 144 ? I.dia : { desde: w.tick - (w.tick % 144), luz: 0, polen: 0, guardia: 0, ciclo: 0 };
    for (const k of CLAVES) dia[k] += ef[k];
    M.info[col.id] = { n, dia, ayer: dia === I?.dia ? I.ayer : I?.dia || null };
  }
  // Las que esperan demasiado en el refugio se van a vivir libres a Oruz
  for (const [id, ref] of Object.entries(M.refugio)) while (ref.length && w.tick - ref[0].t > MASCOTAS.ESPERA) liberar(w, ref.shift(), w.colonies[id]);
  despertar(w);
}

// Si se apagan todas las colonias, nadie puede donar células para que renazcan. Entonces, al cabo de unas horas,
// las mascotas que esperan en el refugio despiertan a una generación nueva con los genes de las que acompañaron.
// Si no queda ninguna esperando, vuelven algunas de las que viven libres en Oruz.
function despertar(w) {
  const M = w.mascotas, cols = Object.values(w.colonies);
  if (!cols.length || cols.some(c => c.alive)) { M.apagada = null; return; }
  M.apagada ||= { desde: w.tick };
  if (w.tick - M.apagada.desde < MASCOTAS.RENACE) return;
  const col = cols.sort((a, b) => (M.refugio[b.id]?.length || 0) - (M.refugio[a.id]?.length || 0) || a.id.localeCompare(b.id))[0];
  const ref = M.refugio[col.id] || [], r = rng(`${M.seed}:renace:${w.tick}`), cells = [];
  col.edad = 0; // las células nuevas nacen con la colonia
  for (let i = 0; i < MASCOTAS.RENACE_CELULAS; i++) {
    const o = ref[i], g = o ? { ef: o.g[0], res: o.g[1], fer: o.g[2] } : { ef: 7, res: 6, fer: 6 };
    const c = newCell(w, col, mutG(g, o ? 1 : 3, r), "colonia");
    if (o) c.m = adoptada(w, o); else asignar(w, col, c, null);
    cells.push(c);
  }
  const despiertan = Math.min(ref.length, cells.length);
  M.refugio[col.id] = ref.slice(despiertan);
  Object.assign(col, { alive: true, cells, energia: 80, salud: 85, popF: 0, event: null, eventLeft: 0, cause: "" });
  col.gen++; M.stats.renacimientos++; M.apagada = null;
  w.stats.reseeds++;
  block(w, "renace", "mascotas", col.id, cells.length, "CEL", cells.slice(0, 3).map(c => c.id));
  const quienes = despiertan ? `${despiertan} mascota${despiertan === 1 ? "" : "s"} del refugio` : "mascotas libres de Oruz";
  const txt = `${quienes} despiertan a ${cells.length} células${despiertan ? " con los genes de las que acompañaron" : ""}`;
  cronica(w, col, `Renace gracias a sus mascotas: ${txt}`);
  clog(w, col, `<b>Renace gracias a sus mascotas</b>: ${txt}`);
  wlog(w, `Todas las colonias se habían apagado. ${col.name} renace gracias a sus mascotas`);
  grantGratitude(w, col, "renacer gracias a sus mascotas");
  return col;
}

// ---------- los jugadores y sus mascotas ----------
function deJugador(w, uid) {
  const out = [];
  for (const col of vivas(w)) for (const c of col.cells) if (c.owner === uid && c.m) out.push({ col, c });
  return out;
}
function buscar(w, id) {
  for (const col of vivas(w)) { const c = col.cells.find(x => x.id === id); if (c) return { col, c }; }
  return null;
}
const hoyDe = u => ((u.daily ||= { date: "", prog: {}, claimed: {} }).mascotas ||= { mimos: false, premios: 0 });

// La ronda de mimos del día: todas las mascotas del jugador a la vez
export function mimos(w, u) {
  if (!w.mascotas) return err("Las mascotas todavía no llegaron a este mundo");
  const hoy = hoyDe(u);
  if (hoy.mimos) return err("Ya les diste su ronda de mimos hoy; mañana más");
  const mias = deJugador(w, u.id);
  if (!mias.length) return err("Todavía no tienes mascotas: adopta una célula y su mascota también será tuya");
  hoy.mimos = true; w.mascotas.stats.mimos++;
  let suben = 0;
  for (const { col, c } of mias) if (crecer(w, col, c, MASCOTAS.MIMOS)) suben++;
  return { ok: true, n: mias.length, suben };
}
// b.op: premio (b.cell) · nombre (b.cell, b.nombre)
export function action(w, u, b = {}) {
  const M = w.mascotas;
  if (!M) return err("Las mascotas todavía no llegaron a este mundo");
  const op = String(b.op || ""), x = buscar(w, String(b.cell || ""));
  if (!x || x.c.owner !== u.id || !x.c.m) return err("Esa mascota no es tuya");
  const { col, c } = x, m = c.m;
  if (op === "premio") {
    const hoy = hoyDe(u);
    if (hoy.premios >= MASCOTAS.PREMIOS) return err(`Hoy ya diste ${MASCOTAS.PREMIOS} premios; mañana más`);
    if (m.v >= 100) return err(`${nombre(m)} y ${c.id} ya no pueden quererse más`);
    if (u.vit < MASCOTAS.PREMIO_VIT) return err(`Necesitas ${MASCOTAS.PREMIO_VIT} VIT`);
    u.vit -= MASCOTAS.PREMIO_VIT; w.supply.burned += MASCOTAS.PREMIO_VIT;
    M.stats.premios++; M.stats.vitQuemado += MASCOTAS.PREMIO_VIT; hoy.premios++;
    block(w, "quema", u.id, "premio de mascota", MASCOTAS.PREMIO_VIT, "VIT", [c.id]);
    const sube = crecer(w, col, c, MASCOTAS.PREMIO);
    return { ok: true, nombre: nombre(m), lazo: Math.round(m.v), nivel: nivelNombre(nivelDe(m.v), m.e), sube: sube ? nivelNombre(sube, m.e) : null, quedan: MASCOTAS.PREMIOS - hoy.premios };
  }
  if (op === "nombre") {
    const n = limpiarNombre(b.nombre);
    if (n.length < 2) return err("El nombre necesita al menos 2 letras");
    if (n !== nombre(m)) { const antes = nombre(m); m.n = n; cronica(w, col, `${u.name} le pone nombre a la mascota de ${c.id}: ${antes} ahora se llama ${n}`); }
    return { ok: true, nombre: n };
  }
  return err("Tu mascota no entiende eso");
}
// Cada hábito de «Salud real» también alegra a sus mascotas. Un fallo aquí nunca estropea el hábito.
export function habito(w, u) {
  try {
    if (!w.mascotas) return null;
    let n = 0, suben = 0;
    for (const { col, c } of deJugador(w, u.id)) { n++; if (crecer(w, col, c, MASCOTAS.HABITO)) suben++; }
    return n ? { n, suben } : null;
  } catch (e) { console.error("[mascotas]", e.message); return null; }
}
// La cría del jugador y las mascotas: al visitar su hogar juega con ellas, y de excursión conoce a alguna
export function conCria(w, u, b, r) {
  try {
    if (!w.mascotas || !r?.ok || !u.cria?.etapa) return null;
    const ahora = Date.now();
    if (b.op === "saludar" && r.visita) {
      const col = w.colonies[u.cria.hogar];
      if (!col?.alive) return null;
      const mias = col.cells.filter(c => c.owner === u.id && c.m);
      if (!mias.length) return null;
      for (const c of mias) crecer(w, col, c, MASCOTAS.CRIA);
      const nombres = mias.slice(0, 3).map(c => nombre(c.m));
      anotar(u.cria, ahora, `En ${col.name} jugué con ${mias.length === 1 ? nombres[0] : `${nombres.join(", ")}${mias.length > 3 ? ` y ${mias.length - 3} más` : ""}`}, ${mias.length === 1 ? "la mascota de tu célula" : "las mascotas de tus células"}.`);
      return { jugo: mias.length, colonia: col.name };
    }
    if (r.relato) {
      const col = vivas(w).find(c => c.name === r.relato.colonia);
      if (!col?.cells.length) return null;
      // Conoce a la pareja más unida de la colonia
      const c = col.cells.reduce((a, x) => (!a || (x.m?.v || 0) > (a.m?.v || 0) ? x : a), null);
      if (!c?.m) return null;
      const dias = Math.floor((w.tick - c.m.d) / 144), mia = c.owner === u.id;
      const nivel = nivelNombre(nivelDe(c.m.v), c.m.e);
      anotar(u.cria, ahora, `En ${col.name} conocí ${aQuien(c.m)}, ${mia ? "la mascota de tu célula" : "la mascota de"} ${c.id}: son ${nivel.toLowerCase()}${dias ? ` desde hace ${dias === 1 ? "un día" : `${dias} días`}` : ""}.`);
      return { conocio: { nombre: nombre(c.m), especie: c.m.e, celula: c.id, nivel } };
    }
    return null;
  } catch (e) { console.error("[mascotas]", e.message); return null; }
}

// ---------- copia firmada de la cuenta ----------
// Lo que guarda de la mascota de cada célula del jugador, y cómo vuelve
export const guardar = (w, c) => (c.m ? [c.m.e, c.m.s, r2(c.m.v), c.m.k, Math.max(0, w.tick - c.m.d), c.m.n || ""] : null);
export function restaurar(w, c, x) {
  if (!Array.isArray(x) || !CLAVES.includes(x[0])) return false;
  const s = String(x[1] || "").replace(/[^0-9a-f]/g, "").slice(0, 8), n = limpiarNombre(x[5]);
  c.m = { s: s.length === 8 ? s : huella("restaurada", c.id).slice(0, 8), e: x[0], v: clamp(+x[2] || 0, 0, 100), d: w.tick - clamp(Math.floor(+x[4] || 0), 0, 1e6), k: clamp(Math.floor(+x[3] || 1), 1, 1e4), ...(n.length >= 2 ? { n } : {}) };
  return true;
}
// Las que esperaban en el hogar del jugador vuelven con él y empiezan a esperar de nuevo en este mundo
export function restaurarHogar(w, u) {
  const l = Array.isArray(u.mascotasHogar) ? u.mascotasHogar : [];
  u.mascotasHogar = l.filter(o => o && CLAVES.includes(o.e) && typeof o.s === "string").slice(-MASCOTAS.HOGAR)
    .map(o => ({ ...o, t: w.tick, k: clamp(Math.floor(+o.k || 1), 1, 1e4), g: Array.isArray(o.g) ? o.g.slice(0, 3).map(x => clamp(+x || 0, 0, 15)) : [7, 6, 6] }));
  if (!u.mascotasHogar.length) delete u.mascotasHogar;
}

// ---------- vistas ----------
const vistaPareja = (w, col, c) => {
  const m = c.m, i = nivelDe(m.v), sig = NIVELES[i + 1];
  return {
    cell: c.id, col: col.id, colName: col.name, e: m.e, nombre: nombre(m), s: m.s, lazo: Math.floor(m.v), nivel: i, nivelName: nivelNombre(i, m.e),
    siguiente: sig ? { name: nivelNombre(i + 1, m.e), desde: sig.desde } : null, dias: Math.floor((w.tick - m.d) / 144), k: m.k, afinidad: +afinidad(c, m.e).toFixed(2),
  };
};
const vistaEspera = (w, o, propia) => ({ nombre: nombre(o), e: o.e, s: o.s, k: o.k, de: o.c, horas: Math.max(0, Math.floor((w.tick - o.t) / 6)), ...(propia ? {} : { quedan: Math.max(0, Math.ceil((MASCOTAS.ESPERA - (w.tick - o.t)) / 6)) }) });
// Va dentro de /api/world: el resumen de la federación y las mascotas del jugador
export function view(w, u) {
  try { return vista(w, u); } catch (e) { console.error("[mascotas]", e.message); return null; }
}
// Las parejas de una colonia contadas en el momento: por especie, la suma de sus lazos y las almas gemelas
function censo(col) {
  const n = { luz: 0, polen: 0, guardia: 0, ciclo: 0 }, lazo = { luz: 0, polen: 0, guardia: 0, ciclo: 0 };
  let almas = 0, total = 0;
  for (const c of col.cells) if (c.m && n[c.m.e] != null) { n[c.m.e]++; lazo[c.m.e] += c.m.v; total++; if (c.m.v >= NIVELES[ALMAS].desde) almas++; }
  return { n, lazo, almas, total, H: armonia(n) };
}
function vista(w, u) {
  const M = w.mascotas;
  if (!M) return null;
  const n = { luz: 0, polen: 0, guardia: 0, ciclo: 0 };
  let total = 0, almas = 0, H = 0;
  for (const col of vivas(w)) {
    const x = censo(col);
    for (const k of CLAVES) n[k] += x.n[k];
    total += x.total; almas += x.almas; H += x.H * x.total;
  }
  let mias = null;
  if (u) {
    const lista = deJugador(w, u.id).map(({ col, c }) => vistaPareja(w, col, c)).sort((a, b) => b.lazo - a.lazo || a.cell.localeCompare(b.cell));
    const hoy = u.daily?.mascotas || { mimos: false, premios: 0 }, porNivel = NIVELES.map(() => 0);
    for (const p of lista) porNivel[p.nivel]++;
    mias = {
      n: lista.length, porNivel, lista: lista.slice(0, MASCOTAS.LISTA), hogar: (u.mascotasHogar || []).map(o => vistaEspera(w, o, true)),
      mimos: !!hoy.mimos, premios: Math.max(0, MASCOTAS.PREMIOS - (hoy.premios || 0)), premioVit: MASCOTAS.PREMIO_VIT, premioLazo: MASCOTAS.PREMIO, mimosLazo: MASCOTAS.MIMOS,
    };
  }
  return {
    total, porEspecie: n, armonia: total ? +(H / total).toFixed(3) : 0, almas, enRefugio: Object.values(M.refugio).reduce((s, r) => s + r.length, 0),
    libres: M.stats.libres, nacidas: M.stats.nacidas, adopciones: M.stats.adopciones + M.stats.reencuentros, renacimientos: M.stats.renacimientos,
    especies: ESPECIES, niveles: NIVELES.map(x => ({ k: x.k, name: x.name, desde: x.desde })), mias,
  };
}
// Va dentro de /api/colony/:id: el ecosistema de mascotas de esa colonia
export function colonia(w, col, uid) {
  try { return detalle(w, col, uid); } catch (e) { console.error("[mascotas]", e.message); return null; }
}
function detalle(w, col, uid) {
  const M = w.mascotas;
  if (!M) return null;
  const I = M.info[col.id], x = censo(col), suma = CLAVES.reduce((s, k) => s + x.lazo[k], 0);
  const top = col.cells.filter(c => c.m).sort((a, b) => b.m.v - a.m.v || a.n - b.n).slice(0, 3).map(c => vistaPareja(w, col, c));
  const dia = I?.ayer || I?.dia || null; // lo que dio cada especie el último día completo (o lo que va de hoy)
  return {
    armonia: +x.H.toFixed(3), lazo: x.total ? +(suma / x.total).toFixed(1) : 0, almas: x.almas, total: x.total,
    especies: CLAVES.map(k => ({ k, n: x.n[k], lazo: x.n[k] ? Math.round(x.lazo[k] / x.n[k]) : 0, dia: dia ? +dia[k].toFixed(dia[k] < 10 ? 2 : 0) : 0 })),
    diaCompleto: !!I?.ayer, top, refugio: (M.refugio[col.id] || []).map(o => vistaEspera(w, o, false)), cronica: (M.cronica[col.id] || []).slice(0, MASCOTAS.CRONICA),
    mias: uid ? col.cells.filter(c => c.owner === uid && c.m).map(c => vistaPareja(w, col, c)).sort((a, b) => b.lazo - a.lazo).slice(0, MASCOTAS.LISTA) : [],
    // Para dibujar a cada mascota junto a su célula: [especie, nivel], en el mismo orden que los puntos de las células
    puntos: col.cells.map(c => (c.m ? [CLAVES.indexOf(c.m.e), nivelDe(c.m.v)] : null)),
  };
}
// Para el panel del dueño
export function metrics(w) {
  try { return metricas(w); } catch (e) { console.error("[mascotas]", e.message); return null; }
}
function metricas(w) {
  const M = w.mascotas;
  if (!M) return null;
  const v = vista(w, null);
  // `almas`: parejas que llegaron a almas gemelas desde siempre; `almasVivas`: las que viven ahora
  return { ...M.stats, total: v.total, porEspecie: v.porEspecie, armonia: v.armonia, almasVivas: v.almas, enRefugio: v.enRefugio, enHogares: Object.values(w.users).reduce((s, u) => s + (u.mascotasHogar?.length || 0), 0) };
}
