// Lumar: el mar de la luna, el segundo ecomundo de VITA.
// Un mar de siete regiones que se mueve con la luna de verdad: su fase es la misma que se ve esa
// noche en el cielo de cualquier lugar de la Tierra, y la marea sube dos veces por cada día de Lumar,
// más fuerte con luna nueva o llena. Algas de luz, ostras perleras, estrellas de mar y pepinos de mar
// se equilibran solos con el motor común de ecomundo.js, y donde las cuatro viven las ostras forman
// nácar. Del nácar nacen las Perlas de Lumar, muchas más en luna llena. Una perla no se usa: se regala.
// Quien la recoge solo puede dársela a otro jugador, y quien la recibe la infunde en una colonia
// para curarla. Todo el estado vive en `world.lumar`; aquí no hay E/S.
import { block, clog, wlog, EVENTS } from "./core.js";
import { rng, clamp, ESPECIES, crearRegiones, regionDe, pasoPoblaciones, formacion, migrar, moverFenomeno, nuevaPieza, libres, limpiarPiezas, certificado } from "./ecomundo.js";
export { rng };

export const LUMAR = {
  DAY: 24,              // 1 ciclo de la federación = 1 hora de Lumar
  MAREA: 12,            // horas de Lumar de una marea alta a la siguiente: dos por día
  NACAR: 0.45,          // cuánto nácar forman las ostras: unas 1,5 perlas al día en todo el mar
  FREE_MAX: 6,          // perlas sin dueño a la vez
  TTL: 72,              // horas de Lumar que una perla espera en el mar antes de hundirse (12 horas reales)
  PER_DAY: 1,           // perlas que puede recoger un jugador al día
  KEEP: 300,            // perlas infundidas o hundidas que se recuerdan
  ACTIVO_MS: 3 * 86400000, // al regalar "a quien la necesite", solo cuentan los jugadores de los últimos 3 días
};

// ---------- la luna de verdad ----------
export const SINODICO = 29.530588853;                          // días de una luna nueva a la siguiente
export const LUNA_NUEVA_REF = Date.UTC(2000, 0, 6, 18, 14);    // una luna nueva conocida
export const FASES = [
  { k: "nueva", name: "Luna nueva" }, { k: "creciente", name: "Luna creciente" }, { k: "cuarto-creciente", name: "Cuarto creciente" },
  { k: "gibosa-creciente", name: "Gibosa creciente" }, { k: "llena", name: "Luna llena" }, { k: "gibosa-menguante", name: "Gibosa menguante" },
  { k: "cuarto-menguante", name: "Cuarto menguante" }, { k: "menguante", name: "Luna menguante" },
];
// fase: 0 luna nueva, 0,5 llena. El desove del coral llena el agua de alimento las tres noches
// que siguen a la luna llena, y las perlas que nacen entonces salen con más brillo.
export function luna(now) {
  const fase = (((now - LUNA_NUEVA_REF) / 86400000 / SINODICO) % 1 + 1) % 1;
  const ilum = (1 - Math.cos(2 * Math.PI * fase)) / 2, F = FASES[Math.round(fase * 8) % 8];
  return {
    k: F.k, name: F.name, fase: +fase.toFixed(4), ilum: +ilum.toFixed(3), desove: fase >= 0.5 && fase < 0.6,
    mult: +(0.3 + 2.3 * ilum ** 1.7).toFixed(3), // nácar: x0,3 con luna nueva, x1 en los cuartos, x2,6 con luna llena
    llenaEn: +(((1.5 - fase) % 1) * SINODICO).toFixed(1),
  };
}
// Mareas vivas con luna nueva o llena, muertas en los cuartos
export function marea(hora, fase) {
  const fuerza = 0.6 + 0.4 * Math.abs(Math.cos(2 * Math.PI * fase)), a = 2 * Math.PI * (hora % LUMAR.MAREA) / LUMAR.MAREA;
  const nivel = fuerza * Math.sin(a);
  const k = nivel > fuerza / 2 ? "alta" : nivel < -fuerza / 2 ? "baja" : Math.cos(a) > 0 ? "subiendo" : "bajando";
  return { k, nivel: +nivel.toFixed(2), fuerza: +fuerza.toFixed(2), viva: fuerza >= 0.9 };
}

// ---------- el mar ----------
// luz y frío como en Oruz; agua son las corrientes, que traen alimento; somero: la marea baja lo deja al aire;
// termal: energía que no depende del sol
export const BIOMAS = {
  laguna: { name: "Laguna de la Luna", luz: 1.0, agua: 0.6, frio: 0.05, fert: 1.1, nacar: 1.0, somero: 1, color: "#5FC9D3" },
  arrecife: { name: "Arrecife de Coral", luz: 1.15, agua: 0.55, frio: 0.05, fert: 1.0, nacar: 1.5, somero: 1, color: "#F2917F" },
  kelp: { name: "Bosque de Kelp", luz: 0.85, agua: 0.8, frio: 0.35, fert: 1.35, nacar: 0.9, somero: 0, color: "#4F8F5B" },
  posidonia: { name: "Prado de Posidonia", luz: 1.05, agua: 0.5, frio: 0.1, fert: 1.15, nacar: 1.0, somero: 1, color: "#86B86B" },
  abismo: { name: "Abismo Azul", luz: 0.3, agua: 0.45, frio: 0.5, fert: 0.8, nacar: 0.8, somero: 0, color: "#3D6BB3" },
  fuentes: { name: "Fuentes Termales", luz: 0.2, termal: 0.95, agua: 0.7, frio: 0, fert: 0.9, nacar: 1.6, somero: 0, color: "#C0703A" },
  arena: { name: "Llanura de Arena", luz: 1.2, agua: 0.35, frio: 0.05, fert: 0.55, nacar: 0.6, somero: 1, color: "#E4CD8F" },
};
// Las cuatro especies de Lumar, en los mismos puestos que las de Oruz
export const ESPECIES_MAR = {
  flora: { name: "Algas de luz", rol: "Productora", desc: "Convierten la luz del sol y de la luna en vida." },
  poli: { name: "Ostras perleras", rol: "Filtradora", desc: "Aclaran el agua para las algas y forman el nácar de las perlas." },
  depre: { name: "Estrellas de mar", rol: "Depredadora", desc: "Abren ostras para comer y mantienen el equilibrio." },
  reci: { name: "Pepinos de mar", rol: "Recicladora", desc: "Limpian la arena y devuelven al agua lo que muere." },
};
export const FENOMENOS = {
  corriente: { name: "Corriente cálida", luz: 1.1, agua: 1.3, frio: 0 },
  temporal: { name: "Temporal", luz: 0.6, agua: 1.6, frio: 0.1 },
  calor: { name: "Ola de calor marina", luz: 1.2, agua: 0.7, frio: 0.35 },
};
const TONOS = [[0.35, "blanca"], [0.6, "crema"], [0.8, "rosa"], [0.92, "dorada"], [0.98, "negra"], [1, "azul"]];
const SYL = ["lu", "mi", "ri", "na", "sa", "ta", "ol", "ce", "pe", "la", "va", "me", "li", "on", "ya", "mar", "ur", "an", "el", "is"];
// Nombres de al menos cinco letras (los de cuatro suelen ser palabras que ya existen) y sin sílabas repetidas seguidas
const valido = n => n.length >= 5 && !/(.{2,3})\1/.test(n);
const MALOS = ["sequia", "helada", "plaga"]; // eventos que una perla acorta; la floración no
const err = message => ({ ok: false, error: message });

export function createLumar(seed, tick = 0, now = Date.now()) {
  const r = rng("lumar:" + seed);
  const regions = crearRegiones(r, {
    centro: "laguna", tipos: ["arrecife", "kelp", "posidonia", "abismo", "fuentes", "arena"], silabas: SYL, biomas: BIOMAS, valido,
    inicio: (R, B) => ({ nacar: 0, eq: 0, perlas: 0, clima: { luz: B.luz, agua: B.agua, frio: B.frio } }),
  });
  return {
    v: 1, seed: String(seed), hora: 0, desde: tick, regions, luna: luna(now),
    fenomeno: { k: "corriente", region: "R" + (1 + Math.floor(r() * 6)) },
    perlas: {}, perlaSerial: 0, recogidas: 0, regaladas: 0, infundidas: 0, cronica: [],
  };
}
export function ensure(w, seed, now = Date.now()) {
  if (!w.lumar) {
    w.lumar = createLumar(seed ?? `${w.createdAt}:${Math.random()}`, w.tick, now);
    cronica(w, `Nace Lumar, el mar de la luna, bajo una ${w.lumar.luna.name.toLowerCase()}`);
  }
  return w.lumar;
}
export const regionOf = regionDe;

export const calendario = m => ({ dia: Math.floor(m.hora / LUMAR.DAY) + 1, hora: m.hora % LUMAR.DAY });
const stamp = m => { const c = calendario(m); return `Día ${c.dia} · ${String(c.hora).padStart(2, "0")}h · ${m.luna.name}`; };
export function cronica(w, msg, alsoWorld = true) {
  const m = w.lumar;
  m.cronica.unshift(`${stamp(m)} — ${msg}`); if (m.cronica.length > 40) m.cronica.length = 40;
  if (alsoWorld) wlog(w, `[Lumar] ${msg}`);
}

// ---------- el ecosistema ----------
function stepRegion(m, R, h, L, T) {
  const B = BIOMAS[R.bioma], fx = m.fenomeno?.region === R.id ? FENOMENOS[m.fenomeno.k] : null;
  const dia = Math.sin((h - 6) / 12 * Math.PI), sol = clamp(dia, 0, 1) * 0.9 + 0.1;
  // De noche, las algas de luz aprovechan la luna. En las fuentes termales la energía sale del calor de la tierra.
  const luzBase = B.luz * (fx?.luz ?? 1), luz = Math.max(B.termal || 0, (sol + (dia <= 0 ? 0.15 * L.ilum : 0)) * luzBase);
  // La marea alta trae corrientes con alimento; la baja deja al aire los fondos someros
  const agua = clamp(B.agua * (1 + 0.35 * T.nivel) * (fx?.agua ?? 1), 0, 1);
  const frio = clamp(B.frio + (B.somero && T.nivel < 0 ? -T.nivel * 0.25 : 0) + (fx?.frio ?? 0), 0, 1);
  R.clima = { luz: +luzBase.toFixed(2), agua: +agua.toFixed(2), frio: +frio.toFixed(2) };
  pasoPoblaciones(R, { luz, agua, frio, fert: B.fert });
  // Las ostras forman nácar donde las cuatro especies están presentes, mucho más con luna llena
  R.nacar += formacion(R) * L.mult * B.nacar * R.eq * LUMAR.NACAR;
}
export function stepMar(m) {
  const h = m.hora % LUMAR.DAY, T = marea(m.hora, m.luna.fase);
  for (const R of m.regions) stepRegion(m, R, h, m.luna, T);
  migrar(m.regions);
}
const moveFenomeno = (w, m, r) => moverFenomeno(m, r, FENOMENOS, LUMAR.DAY * 2, f => cronica(w, `${FENOMENOS[f.k].name} sobre ${regionOf(m, f.region).name}`, false));

// ---------- las Perlas de Lumar ----------
function mintPerla(w, m, R) {
  const L = m.luna, { id, n, tono } = nuevaPieza(w, m, { prefijo: "PRL-", serial: "perlaSerial", store: "perlas", tonos: TONOS }, R);
  // El brillo sale del equilibrio del mar, de la luna y de la huella de la propia perla
  const brillo = Math.round(clamp(10 + 25 * R.eq + 25 * L.ilum + 30 * parseInt(id.slice(4, 8), 16) / 65536 + (L.desove ? 10 : 0), 1, 100));
  const p = { id, n, region: R.id, regionName: R.name, bioma: R.bioma, color: tono, brillo, luna: L.name, desove: L.desove, dia: calendario(m).dia, hora: m.hora, owner: null, ownerName: "", estado: "libre", t: Date.now() };
  const b = block(w, "perla", "lumar:" + R.name, "libre", 1, "PRL", [id]);
  p.bloque = b.n; p.hash = b.hash;
  m.perlas[id] = p; R.perlas++;
  cronica(w, `Nace la perla ${id} (${tono}, brillo ${brillo}) en ${R.name}${L.desove ? " durante el desove del coral" : ""}`);
  return p;
}
const tidy = (w, m) => limpiarPiezas(m, m.perlas, { ttl: LUMAR.TTL, guardar: LUMAR.KEEP, gastadas: ["disuelta", "infundida"] },
  p => cronica(w, `La perla ${p.id} se hundió sin que nadie la recogiera`, false));
export function pearlView(p) {
  return {
    id: p.id, color: p.color, brillo: p.brillo, region: p.regionName, regionId: p.region, bioma: BIOMAS[p.bioma]?.name, luna: p.luna, desove: !!p.desove,
    estado: p.estado, recogio: p.recolectorName || null, de: p.deName || null, owner: p.ownerName || null, bloque: p.bloque, hash: p.hash,
  };
}
const cuenta = (u, k) => { (u.perlas ||= { recogidas: 0, regaladas: 0, recibidas: 0, infundidas: 0 })[k]++; };
export const pearlsOf = (w, uid, estado) => Object.values(w.lumar?.perlas || {}).filter(p => p.owner === uid && (estado ? p.estado === estado : p.estado === "guardada" || p.estado === "regalada"));

export function collectPearl(w, u, id) {
  const m = w.lumar, p = m?.perlas[id];
  if (!p || p.estado !== "libre") return err("Esa perla ya no está en el mar");
  const d = u.daily;
  if ((d.perlas || 0) >= LUMAR.PER_DAY) return err("Hoy ya recogiste tu perla; mañana puedes recoger otra");
  d.perlas = (d.perlas || 0) + 1;
  Object.assign(p, { owner: u.id, ownerName: u.name, recolector: u.id, recolectorName: u.name, estado: "guardada" });
  m.recogidas++; cuenta(u, "recogidas");
  block(w, "recolección", "lumar:" + p.regionName, u.id, 1, "PRL", [id]);
  cronica(w, `${u.name} recoge la perla ${id}: ahora tiene que regalarla`);
  return { ok: true, pearl: pearlView(p) };
}

// "A quien la necesite": primero quien tiene células en una colonia con sequía, helada o plaga,
// luego quien menos perlas ha recibido y, entre iguales, quien jugó más recientemente.
function aQuienLaNecesite(w, u, now) {
  const apuro = new Set();
  for (const c of Object.values(w.colonies)) if (c.alive && MALOS.includes(c.event)) for (const x of c.cells) if (x.owner) apuro.add(x.owner);
  return Object.values(w.users)
    .filter(x => x.id !== u.id && (x.ret?.seen || 0) >= now - LUMAR.ACTIVO_MS)
    .sort((a, b) => apuro.has(b.id) - apuro.has(a.id) || (a.perlas?.recibidas || 0) - (b.perlas?.recibidas || 0) || (b.ret?.seen || 0) - (a.ret?.seen || 0) || a.id.localeCompare(b.id))[0] || null;
}
// Regala una perla recogida: a un amigo por su código de invitación, o sin código a quien la necesite
export function givePearl(w, u, id, code, now = Date.now()) {
  const m = w.lumar, p = m?.perlas[id];
  if (!p || p.owner !== u.id || p.estado !== "guardada") return err("Esa perla no es tuya para regalar");
  let to;
  if (code == null) {
    to = aQuienLaNecesite(w, u, now);
    if (!to) return err("Ahora no hay nadie más en el mar; guárdala para un amigo");
  } else {
    const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    to = c ? Object.values(w.users).find(x => x.code === c) : null;
    if (!to) return err("Ese código no es de ningún jugador");
    if (to.id === u.id) return err("Una perla no es para quien la recoge: regálasela a otra persona");
  }
  Object.assign(p, { owner: to.id, ownerName: to.name, de: u.id, deName: u.name, estado: "regalada", regaladaEn: now });
  m.regaladas++; cuenta(u, "regaladas"); cuenta(to, "recibidas");
  block(w, "regalo", u.id, to.id, 1, "PRL", [id]);
  cronica(w, `${u.name} regala la perla ${id} a ${to.name}`);
  return { ok: true, to: to.name, pearl: pearlView(p) };
}

// Solo quien la recibió la infunde: cura la colonia y acorta una sequía, una helada o una plaga
export function infusePearl(w, u, id, col) {
  const m = w.lumar, p = m?.perlas[id];
  if (!p || p.owner !== u.id) return err("Esa perla no es tuya");
  if (p.estado === "guardada") return err("Una perla no es para quien la recoge: regálasela a otra persona");
  if (p.estado !== "regalada") return err("Esa perla ya se usó");
  if (!col?.alive) return err("Elige una colonia viva");
  const salud = Math.round(6 + p.brillo * 0.1), menos = Math.round(12 + p.brillo / 10);
  col.salud = Math.min(100, col.salud + salud);
  let acorta = 0, termina = null, alivio = "";
  if (MALOS.includes(col.event)) {
    const ev = EVENTS[col.event].name.toLowerCase();
    // Un evento con 0 ciclos pendientes ya no terminaría solo: se cierra aquí mismo
    if (col.eventLeft <= menos) { termina = ev; col.event = null; col.eventLeft = 0; alivio = ` y termina la ${ev}`; }
    else { acorta = menos; col.eventLeft -= menos; alivio = ` y acorta la ${ev} ${menos} ciclos`; }
  }
  Object.assign(p, { estado: "infundida", en: col.id });
  m.infundidas++; cuenta(u, "infundidas");
  block(w, "infusión", u.id, col.id, 1, "PRL", [id]);
  clog(w, col, `${u.name} infunde la perla <b>${id}</b> (${p.color}) que le regaló ${p.deName || "otro jugador"}: +${salud} salud${alivio}`);
  cronica(w, `${u.name} infunde en ${col.name} la perla que le regaló ${p.deName || "otro jugador"}`);
  return { ok: true, salud, acorta, termina };
}
// Certificado de origen: la perla, su bloque de nacimiento y todos sus movimientos en la cadena
export function certificate(w, id) {
  const p = w.lumar?.perlas[id];
  return p ? certificado(w, p, pearlView) : null;
}

// ---------- un ciclo de Lumar (después de cada ciclo de la federación) ----------
export function step(w, now = Date.now(), rnd = Math.random) {
  const m = w.lumar;
  if (!m) return;
  m.hora++;
  const antes = m.luna;
  m.luna = luna(now);
  if (antes.k !== m.luna.k) cronica(w, `${m.luna.name} sobre Lumar${m.luna.k === "llena" ? ": empieza la marea de perlas" : ""}`, m.luna.k === "llena");
  if (m.luna.desove && !antes.desove) cronica(w, "Empieza el desove del coral: las perlas de estas noches salen con más brillo");
  moveFenomeno(w, m, rnd);
  stepMar(m);
  for (const R of m.regions) if (R.nacar >= 1) { R.nacar -= 1; if (libres(m.perlas).length < LUMAR.FREE_MAX) mintPerla(w, m, R); }
  tidy(w, m);
}

// ---------- vista pública ----------
export function view(w, u) {
  const m = w.lumar;
  if (!m) return null;
  return {
    cal: calendario(m), luna: m.luna, marea: marea(m.hora, m.luna.fase),
    fenomeno: { k: m.fenomeno.k, ...FENOMENOS[m.fenomeno.k], region: m.fenomeno.region },
    regions: m.regions.map(R => ({
      id: R.id, name: R.name, bioma: R.bioma, biomaName: BIOMAS[R.bioma].name, color: BIOMAS[R.bioma].color, q: R.q, r: R.r,
      pops: Object.fromEntries(ESPECIES.map(k => [k, Math.round(R[k])])), suelo: Math.round(R.suelo), nacar: +R.nacar.toFixed(2), eq: R.eq, clima: R.clima, perlas: R.perlas,
    })),
    libres: libres(m.perlas).map(p => ({ ...pearlView(p), expira: LUMAR.TTL - (m.hora - p.hora) })),
    paraRegalar: u ? pearlsOf(w, u.id, "guardada").map(pearlView) : [],
    recibidas: u ? pearlsOf(w, u.id, "regalada").map(pearlView) : [],
    recogidasHoy: u?.daily?.perlas || 0, porDia: LUMAR.PER_DAY, mis: u?.perlas || null,
    especies: ESPECIES_MAR, cronica: m.cronica.slice(0, 12), perlasTotal: m.perlaSerial, regaladasTotal: m.regaladas,
  };
}
