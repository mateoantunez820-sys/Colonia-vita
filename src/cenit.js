// Cénit: el cielo de VITA, el tercer ecomundo, sobre Oruz (la tierra) y Lumar (el mar).
// Siete regiones entre las nubes con el cielo de verdad: la luna es la misma que se ve esa noche
// (la de Lumar) y las lluvias de estrellas siguen el calendario real (Perseidas, Gemínidas, Oriónidas...).
// Flores de nube, luciérnagas estelares, halcones de tormenta y líquenes del viento se equilibran solos
// con el motor común de ecomundo.js. De noche, donde viven las cuatro, las luciérnagas dejan polvo de
// estrellas, y ese polvo cae como estrellas fugaces: muchas más en una lluvia de estrellas y con luna
// nueva, pocas con luna llena, como en el cielo de verdad. Una estrella fugaz dura poco: quien la atrapa
// pide un deseo por una colonia, la suya o la de cualquiera, y la colonia florece. Otros jugadores pueden
// sumarse al deseo para que la floración dure más. Todo el estado vive en `world.cenit`; aquí no hay E/S.
import { block, clog, wlog, EVENTS } from "./core.js";
import { rng, clamp, ESPECIES, crearRegiones, regionDe, pasoPoblaciones, formacion, migrar, moverFenomeno, nuevaPieza, libres, limpiarPiezas, certificado } from "./ecomundo.js";
import { luna } from "./lumar.js";
export { rng };

export const CENIT = {
  DAY: 24,              // 1 ciclo de la federación = 1 hora de Cénit
  POLVO: 5.5,           // cuánto polvo dejan las luciérnagas: unas 5 estrellas al día fuera de las lluvias de estrellas
  FREE_MAX: 4,          // estrellas cayendo a la vez
  TTL: 12,              // horas de Cénit que se puede atrapar una estrella antes de que se apague (2 horas reales)
  PER_DAY: 1,           // estrellas que puede atrapar un jugador al día
  KEEP: 300,            // estrellas ya deseadas o apagadas que se recuerdan
  FLORECE: 12,          // ciclos de floración de un deseo, más uno por cada 10 de brillo de la estrella
  SUMA: 4,              // ciclos de floración que añade cada jugador que se suma a un deseo
  SUMAN: 4,             // jugadores que pueden sumarse a un mismo deseo
  SUMAR_DIA: 3,         // deseos a los que puede sumarse un jugador al día
  TOPE: 48,             // ciclos de floración que puede acumular una colonia con deseos (8 horas reales)
  DESEOS: 30,           // deseos que se recuerdan
};

// ---------- el cielo de verdad ----------
// Lluvias de estrellas del calendario de la Organización Internacional de Meteoros: [mes, día] de inicio,
// pico y fin, la tasa horaria cenital (THZ) en el pico y la anchura del pico en días.
export const LLUVIAS = [
  { k: "cuadrantidas", name: "Cuadrántidas", desde: [12, 28], pico: [1, 3], hasta: [1, 12], thz: 110, ancho: 0.6 },
  { k: "liridas", name: "Líridas", desde: [4, 14], pico: [4, 22], hasta: [4, 30], thz: 18, ancho: 1 },
  { k: "eta-acuaridas", name: "Eta Acuáridas", desde: [4, 19], pico: [5, 6], hasta: [5, 28], thz: 50, ancho: 3 },
  { k: "delta-acuaridas", name: "Delta Acuáridas", desde: [7, 12], pico: [7, 30], hasta: [8, 23], thz: 25, ancho: 4 },
  { k: "perseidas", name: "Perseidas", desde: [7, 17], pico: [8, 12], hasta: [8, 24], thz: 100, ancho: 2 },
  { k: "tauridas", name: "Táuridas del Sur", desde: [9, 10], pico: [10, 10], hasta: [11, 20], thz: 5, ancho: 10 },
  { k: "draconidas", name: "Dracónidas", desde: [10, 6], pico: [10, 8], hasta: [10, 10], thz: 10, ancho: 0.8 },
  { k: "orionidas", name: "Oriónidas", desde: [10, 2], pico: [10, 21], hasta: [11, 7], thz: 20, ancho: 3 },
  { k: "leonidas", name: "Leónidas", desde: [11, 6], pico: [11, 17], hasta: [11, 30], thz: 15, ancho: 1.5 },
  { k: "geminidas", name: "Gemínidas", desde: [12, 4], pico: [12, 14], hasta: [12, 20], thz: 150, ancho: 1.2 },
  { k: "ursidas", name: "Úrsidas", desde: [12, 17], pico: [12, 22], hasta: [12, 26], thz: 10, ancho: 1 },
];
const DIA = 86400000;
const fecha = (y, [m, d]) => Date.UTC(y, m - 1, d);
// Fechas de una lluvia cuyo pico cae en el año `y`. Las Cuadrántidas empiezan el año anterior.
function ventana(L, y) {
  const pico = fecha(y, L.pico) + DIA / 2;
  let desde = fecha(y, L.desde); if (desde > pico) desde = fecha(y - 1, L.desde);
  let hasta = fecha(y, L.hasta) + DIA; if (hasta < pico) hasta = fecha(y + 1, L.hasta) + DIA;
  return { desde, pico, hasta };
}
// Las lluvias activas suman sus meteoros: un pico estrecho y una cola ancha que dura toda la ventana.
// Con luna llena se ven muchas menos estrellas fugaces, y con luna nueva todas.
export function cielo(now) {
  const y = new Date(now).getUTCFullYear(), L = luna(now);
  let thz = 0, lluvia = null, proxima = null;
  for (const S of LLUVIAS) for (const yy of [y - 1, y, y + 1]) {
    const v = ventana(S, yy);
    if (now >= v.desde && now < v.hasta) {
      const x = (now - v.pico) / (S.ancho * DIA), t = S.thz * (0.8 * Math.exp(-0.5 * x * x) + 0.2 * Math.exp(-x * x / 32));
      thz += t;
      if (!lluvia || t > lluvia.thz) lluvia = { k: S.k, name: S.name, thz: Math.round(t), pico: v.pico, picoThz: S.thz, hasta: v.hasta };
    } else if (v.desde > now && S.thz >= 10 && (!proxima || v.desde < proxima.desde)) proxima = { k: S.k, name: S.name, desde: v.desde, pico: v.pico, hasta: v.hasta, thz: S.thz };
  }
  const oscuridad = +(1 - 0.7 * L.ilum).toFixed(3);
  // 10 meteoros por hora es el fondo de cada noche; una lluvia fuerte multiplica las estrellas hasta por 4
  return { luna: { k: L.k, name: L.name, fase: L.fase, ilum: L.ilum }, oscuridad, thz: Math.round(thz), lluvia, proxima, mult: +(oscuridad * Math.sqrt((10 + thz) / 10)).toFixed(3) };
}

// ---------- el cielo de Cénit ----------
// luz, agua (la humedad de las nubes), frío y fertilidad como en Oruz y Lumar; polvo: cuánto polvo de
// estrellas deja cada región. En el ojo de la tormenta los rayos dan energía de día y de noche, y en el
// velo de auroras las auroras iluminan la noche.
export const BIOMAS = {
  puerto: { name: "Puerto de las Nubes", luz: 1.05, agua: 0.55, frio: 0.1, fert: 1.1, polvo: 1.0, color: "#9FB8F0" },
  cumulos: { name: "Mar de Cúmulos", luz: 1.0, agua: 0.75, frio: 0.1, fert: 1.2, polvo: 0.9, color: "#A9BAD6" },
  tormenta: { name: "Ojo de la Tormenta", luz: 0.5, rayos: 0.6, agua: 0.95, frio: 0.15, fert: 1.0, polvo: 1.3, color: "#7A6BC9" },
  aurora: { name: "Velo de Auroras", luz: 0.65, aurora: 0.45, agua: 0.4, frio: 0.45, fert: 0.85, polvo: 1.5, color: "#5FD39B" },
  islas: { name: "Islas Flotantes", luz: 1.1, agua: 0.5, frio: 0.05, fert: 1.35, polvo: 0.8, color: "#8CC7A1" },
  chorro: { name: "Corriente en Chorro", luz: 1.15, agua: 0.35, frio: 0.3, fert: 0.75, polvo: 1.1, color: "#6CC3E0" },
  borde: { name: "Borde de las Estrellas", luz: 0.35, aurora: 0.25, agua: 0.3, frio: 0.5, fert: 0.7, polvo: 2.0, color: "#4B4FA8" },
};
// Las cuatro especies de Cénit, en los mismos puestos que las de Oruz y Lumar
export const ESPECIES_CIELO = {
  flora: { name: "Flores de nube", rol: "Productora", desc: "Crecen en las nubes y convierten la luz en vida." },
  poli: { name: "Luciérnagas estelares", rol: "Polinizadora", desc: "Llevan luz de flor en flor y de noche dejan polvo de estrellas." },
  depre: { name: "Halcones de tormenta", rol: "Depredadora", desc: "Cazan luciérnagas y mantienen el equilibrio." },
  reci: { name: "Líquenes del viento", rol: "Recicladora", desc: "Devuelven al aire lo que muere." },
};
export const FENOMENOS = {
  rayos: { name: "Tormenta eléctrica", luz: 0.6, agua: 1.5, frio: 0.1 },
  arcoiris: { name: "Arcoíris doble", luz: 1.25, agua: 1.1, frio: 0 },
  ventisca: { name: "Ventisca de altura", luz: 0.8, agua: 0.5, frio: 0.45 },
};
const TONOS = [[0.4, "blanca"], [0.65, "azul"], [0.82, "dorada"], [0.93, "roja"], [0.985, "verde"], [1, "violeta"]];
const SYL = ["ce", "ni", "al", "ta", "ze", "fi", "ra", "ve", "sol", "nu", "bi", "as", "tro", "el", "ia", "au", "ri", "ven", "lis", "or"];
// Nombres de al menos cinco letras y sin sílabas repetidas seguidas, como en Lumar
const valido = n => n.length >= 5 && !/(.{2,3})\1/.test(n);
const MALOS = ["sequia", "helada", "plaga"]; // una estrella no puede con ellos: para eso están las perlas de Lumar
const err = message => ({ ok: false, error: message });
export const esNoche = h => Math.sin((h - 6) / 12 * Math.PI) <= 0;

export function createCenit(seed, tick = 0, now = Date.now()) {
  const r = rng("cenit:" + seed);
  const regions = crearRegiones(r, {
    centro: "puerto", tipos: ["cumulos", "tormenta", "aurora", "islas", "chorro", "borde"], silabas: SYL, biomas: BIOMAS, valido,
    inicio: (R, B) => ({ polvo: 0, eq: 0, estrellas: 0, clima: { luz: B.luz, agua: B.agua, frio: B.frio } }),
  });
  return {
    v: 1, seed: String(seed), hora: 0, desde: tick, regions, cielo: cielo(now),
    fenomeno: { k: "arcoiris", region: "R" + (1 + Math.floor(r() * 6)) },
    estrellas: {}, estrellaSerial: 0, atrapadas: 0, deseados: 0, sumados: 0, deseoSerial: 0, deseos: [], cronica: [],
  };
}
export function ensure(w, seed, now = Date.now()) {
  if (!w.cenit) {
    w.cenit = createCenit(seed ?? `${w.createdAt}:${Math.random()}`, w.tick, now);
    const L = w.cenit.cielo.lluvia;
    cronica(w, `Se abre Cénit, el cielo de VITA, bajo una ${w.cenit.cielo.luna.name.toLowerCase()}${L ? ` y la lluvia de las ${L.name}` : ""}`);
  }
  return w.cenit;
}
export const regionOf = regionDe;

export const calendario = m => ({ dia: Math.floor(m.hora / CENIT.DAY) + 1, hora: m.hora % CENIT.DAY });
const stamp = m => { const c = calendario(m); return `Día ${c.dia} · ${String(c.hora).padStart(2, "0")}h${m.cielo?.lluvia ? ` · ${m.cielo.lluvia.name}` : ""}`; };
export function cronica(w, msg, alsoWorld = true) {
  const m = w.cenit;
  m.cronica.unshift(`${stamp(m)} — ${msg}`); if (m.cronica.length > 40) m.cronica.length = 40;
  if (alsoWorld) wlog(w, `[Cénit] ${msg}`);
}

// ---------- el ecosistema ----------
function stepRegion(m, R, h, C) {
  const B = BIOMAS[R.bioma], fx = m.fenomeno?.region === R.id ? FENOMENOS[m.fenomeno.k] : null;
  const dia = Math.sin((h - 6) / 12 * Math.PI), sol = clamp(dia, 0, 1) * 0.9 + 0.1, noche = dia <= 0;
  // De noche alumbran la luna y las auroras; en el ojo de la tormenta, los rayos
  const luzBase = B.luz * (fx?.luz ?? 1), luz = Math.max(B.rayos || 0, (sol + (noche ? 0.15 * C.luna.ilum + (B.aurora || 0) : 0)) * luzBase);
  const agua = clamp(B.agua * (fx?.agua ?? 1), 0, 1);
  const frio = clamp(B.frio + (noche ? 0.1 : 0) + (fx?.frio ?? 0), 0, 1);
  R.clima = { luz: +luzBase.toFixed(2), agua: +agua.toFixed(2), frio: +frio.toFixed(2) };
  pasoPoblaciones(R, { luz, agua, frio, fert: B.fert });
  // Las luciérnagas solo dejan polvo de estrellas de noche, donde viven las cuatro especies
  if (noche) R.polvo += formacion(R) * C.mult * B.polvo * R.eq * CENIT.POLVO;
}
export function stepCielo(m) {
  const h = m.hora % CENIT.DAY;
  for (const R of m.regions) stepRegion(m, R, h, m.cielo);
  migrar(m.regions);
}
const moveFenomeno = (w, m, r) => moverFenomeno(m, r, FENOMENOS, CENIT.DAY * 2, f => cronica(w, `${FENOMENOS[f.k].name} sobre ${regionOf(m, f.region).name}`, false));

// ---------- las estrellas fugaces ----------
function mintEstrella(w, m, R) {
  const C = m.cielo, L = C.lluvia && C.lluvia.thz >= 3 ? C.lluvia : null;
  const { id, n, tono } = nuevaPieza(w, m, { prefijo: "EST-", serial: "estrellaSerial", store: "estrellas", tonos: TONOS }, R);
  // El brillo sale del equilibrio del cielo, de lo oscura que está la noche, de la lluvia y de la huella de la estrella
  const brillo = Math.round(clamp(10 + 25 * R.eq + 20 * C.oscuridad + 25 * parseInt(id.slice(4, 8), 16) / 65536 + (L ? 15 * Math.min(1, L.thz / 100) : 0), 1, 100));
  const p = { id, n, region: R.id, regionName: R.name, bioma: R.bioma, color: tono, brillo, lluvia: L?.name || null, luna: C.luna.name, dia: calendario(m).dia, hora: m.hora, owner: null, ownerName: "", estado: "libre", t: Date.now() };
  const b = block(w, "estrella", "cénit:" + R.name, "libre", 1, "EST", [id]);
  p.bloque = b.n; p.hash = b.hash;
  m.estrellas[id] = p; R.estrellas++;
  cronica(w, `Cae la estrella ${id} (${tono}, brillo ${brillo}) sobre ${R.name}${L ? `, en la lluvia de las ${L.name}` : ""}`, false);
  return p;
}
const tidy = (w, m) => limpiarPiezas(m, m.estrellas, { ttl: CENIT.TTL, guardar: CENIT.KEEP, gastadas: ["apagada", "deseada"] },
  p => { p.estado = "apagada"; cronica(w, `La estrella ${p.id} se apagó sin que nadie la atrapara`, false); });
export function starView(p) {
  return {
    id: p.id, color: p.color, brillo: p.brillo, region: p.regionName, regionId: p.region, bioma: BIOMAS[p.bioma]?.name, lluvia: p.lluvia, luna: p.luna,
    estado: p.estado, owner: p.ownerName || null, deseo: p.deseoCol || null, bloque: p.bloque, hash: p.hash,
  };
}
const cuenta = (u, k) => { (u.estrellas ||= { atrapadas: 0, deseos: 0, sumados: 0 })[k]++; };
export const starsOf = (w, uid) => Object.values(w.cenit?.estrellas || {}).filter(p => p.owner === uid && p.estado === "guardada");

export function catchStar(w, u, id) {
  const m = w.cenit, p = m?.estrellas[id];
  if (!p || p.estado !== "libre") return err("Esa estrella ya se apagó o la atrapó otra persona");
  const d = u.daily;
  if ((d.estrellas || 0) >= CENIT.PER_DAY) return err("Hoy ya atrapaste tu estrella; mañana puedes atrapar otra");
  d.estrellas = (d.estrellas || 0) + 1;
  Object.assign(p, { owner: u.id, ownerName: u.name, estado: "guardada" });
  m.atrapadas++; cuenta(u, "atrapadas");
  block(w, "captura", "cénit:" + p.regionName, u.id, 1, "EST", [id]);
  cronica(w, `${u.name} atrapa la estrella ${id}: ya puede pedir un deseo`);
  return { ok: true, star: starView(p) };
}

// Un deseo hace florecer a una colonia viva, sea de quien sea. Si ya florece, la floración dura más.
export function wishStar(w, u, id, col) {
  const m = w.cenit, p = m?.estrellas[id];
  if (!p || p.owner !== u.id) return err("Esa estrella no es tuya");
  if (p.estado !== "guardada") return err("Con esa estrella ya se pidió un deseo");
  if (!col?.alive) return err("Elige una colonia viva");
  if (MALOS.includes(col.event)) return err(`Una estrella no puede con la ${EVENTS[col.event].name.toLowerCase()}: para eso están las perlas de Lumar`);
  if (col.event === "floracion" && col.eventLeft >= CENIT.TOPE) return err("Esa colonia ya florece todo lo que puede; pide tu deseo por otra");
  const base = CENIT.FLORECE + Math.round(p.brillo / 10);
  let ciclos;
  if (col.event === "floracion") { ciclos = Math.min(Math.ceil(base / 2), CENIT.TOPE - col.eventLeft); col.eventLeft += ciclos; }
  else { ciclos = base; col.event = "floracion"; col.eventLeft = base; }
  Object.assign(p, { estado: "deseada", en: col.id, deseoCol: col.name });
  const d = { id: "D" + ++m.deseoSerial, estrella: p.id, color: p.color, brillo: p.brillo, col: col.id, colName: col.name, por: u.id, porName: u.name, tick: w.tick, hasta: w.tick + col.eventLeft, sumados: [] };
  m.deseos.unshift(d); if (m.deseos.length > CENIT.DESEOS) m.deseos.length = CENIT.DESEOS;
  m.deseados++; cuenta(u, "deseos");
  block(w, "deseo", u.id, col.id, 1, "EST", [p.id]);
  clog(w, col, `${u.name} pide un deseo con la estrella <b>${p.id}</b> (${p.color}): florece ${ciclos} ciclos`);
  cronica(w, `${u.name} pide un deseo por ${col.name} con una estrella ${p.color}`);
  return { ok: true, ciclos, deseo: d.id, col: col.name };
}
const activo = (w, d) => { const c = w.colonies[d.col]; return w.tick < d.hasta && !!c?.alive && c.event === "floracion"; };

// Sumarse al deseo de otra persona: la colonia florece unos ciclos más
export function joinWish(w, u, did) {
  const m = w.cenit, d = m?.deseos.find(x => x.id === did);
  if (!d || !activo(w, d)) return err("Ese deseo ya se cumplió");
  if (d.por === u.id) return err("Es tu propio deseo: pide a otros que se sumen");
  if (d.sumados.some(x => x.id === u.id)) return err("Ya te sumaste a este deseo");
  if (d.sumados.length >= CENIT.SUMAN) return err("A ese deseo ya se sumó todo el que cabía");
  if ((u.daily.sumados || 0) >= CENIT.SUMAR_DIA) return err(`Hoy ya te sumaste a ${CENIT.SUMAR_DIA} deseos`);
  const col = w.colonies[d.col], ciclos = Math.min(CENIT.SUMA, CENIT.TOPE - col.eventLeft);
  if (ciclos <= 0) return err("Esa colonia ya florece todo lo que puede");
  u.daily.sumados = (u.daily.sumados || 0) + 1;
  col.eventLeft += ciclos; d.hasta = w.tick + col.eventLeft;
  d.sumados.push({ id: u.id, name: u.name });
  m.sumados++; cuenta(u, "sumados");
  block(w, "sumarse", u.id, col.id, 1, "EST", [d.estrella]);
  clog(w, col, `${u.name} se suma al deseo de ${d.porName}: florece ${ciclos} ciclos más`);
  cronica(w, `${u.name} se suma al deseo de ${d.porName} por ${col.name}`);
  return { ok: true, ciclos, col: col.name };
}
// Certificado de origen: la estrella, su bloque de nacimiento y todos sus movimientos en la cadena
export function certificate(w, id) {
  const p = w.cenit?.estrellas[id];
  return p ? certificado(w, p, starView) : null;
}

// ---------- un ciclo de Cénit (después de cada ciclo de la federación) ----------
export function step(w, now = Date.now(), rnd = Math.random) {
  const m = w.cenit;
  if (!m) return;
  m.hora++;
  const antes = m.cielo;
  m.cielo = cielo(now);
  const L = m.cielo.lluvia;
  if (L && L.k !== antes?.lluvia?.k) cronica(w, `Empieza la lluvia de estrellas de las ${L.name}${L.picoThz >= 50 ? ": estos días caen muchas más estrellas fugaces" : ""}`);
  else if (!L && antes?.lluvia) cronica(w, `Termina la lluvia de las ${antes.lluvia.name}`, false);
  if (m.cielo.luna.k !== antes?.luna?.k && (m.cielo.luna.k === "nueva" || m.cielo.luna.k === "llena"))
    cronica(w, m.cielo.luna.k === "nueva" ? "Luna nueva: la noche más oscura, la mejor para ver estrellas fugaces" : "Luna llena: su luz apaga muchas estrellas fugaces", false);
  moveFenomeno(w, m, rnd);
  stepCielo(m);
  for (const R of m.regions) if (R.polvo >= 1) { R.polvo -= 1; if (libres(m.estrellas).length < CENIT.FREE_MAX) mintEstrella(w, m, R); }
  tidy(w, m);
}

// ---------- vista pública ----------
export function view(w, u) {
  const m = w.cenit;
  if (!m) return null;
  const C = m.cielo;
  return {
    cal: calendario(m), noche: esNoche(m.hora % CENIT.DAY),
    cielo: { luna: C.luna, oscuridad: C.oscuridad, thz: C.thz, lluvia: C.lluvia, proxima: C.proxima, mult: C.mult },
    fenomeno: { k: m.fenomeno.k, ...FENOMENOS[m.fenomeno.k], region: m.fenomeno.region },
    regions: m.regions.map(R => ({
      id: R.id, name: R.name, bioma: R.bioma, biomaName: BIOMAS[R.bioma].name, color: BIOMAS[R.bioma].color, q: R.q, r: R.r,
      pops: Object.fromEntries(ESPECIES.map(k => [k, Math.round(R[k])])), suelo: Math.round(R.suelo), polvo: +R.polvo.toFixed(2), eq: R.eq, clima: R.clima, estrellas: R.estrellas,
    })),
    libres: libres(m.estrellas).map(p => ({ ...starView(p), expira: CENIT.TTL - (m.hora - p.hora) })),
    // `ciclos`: cuánto florece la colonia si se pide el deseo con esa estrella
    mias: u ? starsOf(w, u.id).map(p => ({ ...starView(p), ciclos: CENIT.FLORECE + Math.round(p.brillo / 10) })) : [],
    deseos: m.deseos.filter(d => activo(w, d)).slice(0, 8).map(d => {
      const mio = !!u && d.por === u.id, sumado = !!u && d.sumados.some(x => x.id === u.id);
      return {
        id: d.id, col: d.col, colName: d.colName, por: d.porName, color: d.color, quedan: d.hasta - w.tick, sumados: d.sumados.map(x => x.name),
        mio, sumado, puedo: !!u && !mio && !sumado && d.sumados.length < CENIT.SUMAN,
      };
    }),
    atrapadasHoy: u?.daily?.estrellas || 0, porDia: CENIT.PER_DAY, sumadosHoy: u?.daily?.sumados || 0, sumarPorDia: CENIT.SUMAR_DIA, mis: u?.estrellas || null,
    especies: ESPECIES_CIELO, cronica: m.cronica.slice(0, 12), estrellasTotal: m.estrellaSerial, deseosTotal: m.deseados,
  };
}
