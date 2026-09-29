// Súper Aeropuerto Galáctico: el puerto de VITA que une sus cuatro mundos.
// Cada hora sale una nave de VITA hacia Oruz (la tierra), otra hacia Lumar (el mar) y otra hacia
// Cénit (el cielo), y de cada mundo vuelve otra. Los jugadores mandan de viaje a sus células: la célula
// deja su colonia, vuela, pasa un día entero de ese mundo explorando una de sus regiones y vuelve.
// La primera vez que pisa cada mundo aprende algo: Oruz la hace más resistente, Lumar más fértil y
// Cénit más eficiente. Mientras viaja no acuña VIT, no tiene hijas y no envejece. Cada viaje deja un
// sello en su pasaporte y millas en el del jugador, que suben su nivel de viajero.
// Las colonias ricas también mandan exploradoras, pagadas con su tesoro. Los billetes se pagan en VIT
// y se queman. Los retrasos salen del tiempo real de VITA y de las tormentas de cada mundo.
// Todo el estado vive en `world.aeropuerto`; aquí no hay E/S.
import { hash, block, clog, wlog, cap, score, rarIdx, avgGenes, verifyChain, TRAITS, RARITY } from "./core.js";
import { BIOMES as BIOMAS_ORUZ, FENOMENOS as FEN_ORUZ } from "./oruz.js";
import { BIOMAS as BIOMAS_LUMAR, FENOMENOS as FEN_LUMAR } from "./lumar.js";
import { BIOMAS as BIOMAS_CENIT, FENOMENOS as FEN_CENIT } from "./cenit.js";

export const AERO = {
  CADA: 6,              // una salida por hora hacia cada mundo y una vuelta (1 ciclo = 10 minutos)
  PLAZAS: 24,           // plazas de cada nave
  ESTANCIA: 24,         // ciclos que una célula explora el otro mundo: un día entero de ese mundo
  PLAZAS_JUGADOR: 3,    // células de viaje a la vez por jugador, más una por nivel del pasaporte
  POR_DIA: 3,           // billetes al día por jugador, más uno por nivel del pasaporte
  EXPLORA_TESORO: 250,  // tesoro mínimo para que una colonia mande una exploradora
  EXPLORA_CADA: 144,    // una exploradora al día como mucho por colonia
  GUARDAR: 36,          // vuelos ya aterrizados que se recuerdan
  RECIENTES: 40,        // viajes terminados que se recuerdan
};
// Cada mundo tiene su terminal, su tarifa, su tiempo de vuelo y lo que enseña a quien lo pisa por primera vez.
// `malo` es el fenómeno que retrasa las naves si cae sobre su puerto, la región del centro.
export const MUNDOS = {
  ORZ: { k: "ORZ", name: "Oruz", tipo: "la tierra", gen: "res", tarifa: 4, vuelo: 3, millas: 300, puerta: "A", num: 100, sale: 0, clave: "oruz", biomas: BIOMAS_ORUZ, fen: FEN_ORUZ, malo: "tormenta" },
  LMR: { k: "LMR", name: "Lumar", tipo: "el mar", gen: "fer", tarifa: 5, vuelo: 4, millas: 500, puerta: "B", num: 200, sale: 2, clave: "lumar", biomas: BIOMAS_LUMAR, fen: FEN_LUMAR, malo: "temporal" },
  CEN: { k: "CEN", name: "Cénit", tipo: "el cielo", gen: "ef", tarifa: 8, vuelo: 6, millas: 800, puerta: "C", num: 300, sale: 4, clave: "cenit", biomas: BIOMAS_CENIT, fen: FEN_CENIT, malo: "rayos" },
};
export const NIVELES = [
  { k: "pasajero", name: "Pasajero", millas: 0 },
  { k: "viajero", name: "Viajero", millas: 1000 },
  { k: "frecuente", name: "Viajero frecuente", millas: 3000 },
  { k: "oro", name: "Pasaporte de oro", millas: 8000 },
  { k: "comandante", name: "Comandante galáctico", millas: 20000 },
];
const NAVES = ["Colibrí", "Albatros", "Golondrina", "Gaviota", "Vencejo", "Libélula", "Cometa", "Estela", "Luciérnaga", "Halcón"];
const FASES = { terminal: "En la terminal", ida: "En vuelo", explorando: "Explorando", espera: "Esperando la vuelta", vuelta: "Volviendo", "sin sitio": "Esperando sitio en una colonia" };
const err = message => ({ ok: false, error: message });

export function ensure(w) {
  return (w.aeropuerto ??= {
    v: 1, serial: 0, viajeSerial: 0, rutas: {}, vuelos: {}, viajes: {}, recientes: [], cronica: [],
    stats: { viajes: 0, jugadores: 0, exploradoras: 0, millas: 0, retrasos: 0, aprendizajes: 0 },
  });
}
function cronica(w, txt, alsoWorld = false) {
  const a = w.aeropuerto;
  a.cronica.unshift({ t: w.tick, txt }); if (a.cronica.length > 40) a.cronica.length = 40;
  if (alsoWorld) wlog(w, `[Aeropuerto] ${txt}`);
}

// ---------- horarios ----------
const salidaDe = (D, ida) => ida ? D.sale : (D.sale + AERO.CADA / 2) % AERO.CADA;
// Primer ciclo después de `t` con salida de esa ruta (el ciclo actual ya pasó)
export function proxima(t, D, ida) {
  const off = salidaDe(D, ida);
  return t + 1 + ((off - (t + 1)) % AERO.CADA + AERO.CADA) % AERO.CADA;
}
const numero = (D, ida, seq) => `VG ${D.num + (ida ? 0 : 50) + seq % 50}`;
const nave = seq => NAVES[seq % NAVES.length];
const puerta = (D, seq) => `${D.puerta}${1 + seq % 3}`;

// ---------- pasaporte ----------
export function pasaporte(u) {
  return (u.pasaporte ||= { viajes: 0, millas: 0, sellos: { ORZ: 0, LMR: 0, CEN: 0 } });
}
export function nivel(u) {
  const millas = u.pasaporte?.millas || 0;
  let i = 0; while (i + 1 < NIVELES.length && millas >= NIVELES[i + 1].millas) i++;
  return { i, ...NIVELES[i], siguiente: NIVELES[i + 1] || null, millas };
}
export const plazas = u => AERO.PLAZAS_JUGADOR + nivel(u).i;
export const porDia = u => AERO.POR_DIA + nivel(u).i;
export const viajesDe = (w, owner) => Object.values(w.aeropuerto?.viajes || {}).filter(v => v.owner === owner);
// Las células que están de viaje siguen siendo de su dueño: la copia firmada de la cuenta también las guarda
export const celulasDeViaje = (w, uid) => viajesDe(w, uid).map(v => ({ cel: v.cel, colName: v.colName }));

// ---------- reservar ----------
// Un vuelo a Cénit durante una lluvia de estrellas lleva vistas a la lluvia y da el doble de millas
function vistas(w, D) {
  const L = w.cenit?.cielo?.lluvia;
  return D.k === "CEN" && L?.thz >= 10 ? L.name : null;
}
function embarcar(w, a, cel, col, owner, ownerName, D) {
  col.cells.splice(col.cells.indexOf(cel), 1);
  const vis = vistas(w, D);
  const v = { id: ++a.viajeSerial, cel, owner, ownerName, col: col.id, colName: col.name, dest: D.k, fase: "terminal", desde: w.tick, edad: col.edad - cel.born, vistas: vis, millas: D.millas * (vis ? 2 : 1), vuelo: null, region: null, gano: null };
  a.viajes[v.id] = v;
  const exp = owner === "colonia";
  block(w, "billete", exp ? col.id : owner, D.k, D.tarifa, "VIT", [cel.id]);
  clog(w, col, exp ? `Manda a su exploradora <b>${cel.id}</b> a ${D.name} para aprender ${TRAITS[D.gen].toLowerCase()} (${D.tarifa} VIT de billete)` : `${ownerName} manda <b>${cel.id}</b> de viaje a ${D.name}`);
  cronica(w, exp ? `${col.name} manda a su exploradora ${cel.id} a ${D.name}` : `${ownerName} saca un billete a ${D.name} para ${cel.id}${vis ? `, con vistas a las ${vis}` : ""}`);
  return v;
}
// El jugador manda una de sus células a otro mundo. El billete se quema.
export function reservar(w, u, cellId, dest) {
  const a = w.aeropuerto, D = MUNDOS[dest];
  if (!a) return err("El aeropuerto todavía no está abierto");
  if (!D) return err("Ese destino no existe");
  let col = null, cel = null;
  for (const c of Object.values(w.colonies)) { cel = c.cells.find(x => x.id === cellId); if (cel) { col = c; break; } }
  if (!cel || cel.owner !== u.id) return err("Esa célula no es tuya o ya está de viaje");
  const n = viajesDe(w, u.id).length, p = plazas(u), hoy = u.daily.vuelos || 0;
  if (n >= p) return err(`Ya tienes ${n} células de viaje; espera a que vuelva alguna`);
  if (hoy >= porDia(u)) return err(`Hoy ya sacaste ${hoy} billetes; mañana puedes sacar más`);
  if (u.vit < D.tarifa) return err(`El billete a ${D.name} cuesta ${D.tarifa} VIT`);
  u.vit -= D.tarifa; w.supply.burned += D.tarifa; u.daily.vuelos = hoy + 1;
  const v = embarcar(w, a, cel, col, u.id, u.name, D);
  a.stats.jugadores++;
  return { ok: true, viaje: tripView(w, v), sale: proxima(w.tick, D, true) - w.tick, num: numero(D, true, (a.rutas[`${D.k}:ida`] || 0) + 1) };
}

// ---------- exploradoras de las colonias ----------
// Una colonia sana y con tesoro de sobra manda de vez en cuando a su mejor célula a aprender el gen
// que más le falta. Las más arriesgadas viajan más. Una exploradora a la vez y una al día como mucho.
// Las aprendices de Oruz y las colonias agradecidas (recién salvadas) no gastan en viajes.
export function explorar(w, rnd = Math.random) {
  const a = w.aeropuerto; if (!a) return 0;
  let n = 0;
  for (const col of Object.values(w.colonies)) {
    if (!col.alive || col.event || col.salud < 70 || col.treasury < AERO.EXPLORA_TESORO || col.edad < 144 || col.oruz?.estado === "aprendiz" || col.gratitud > 0) continue;
    if (w.tick - (col.aero?.ultima ?? -1e9) < AERO.EXPLORA_CADA || viajesDe(w, "colonia").some(v => v.col === col.id)) continue;
    if (rnd() >= 0.2 + 0.4 * col.ai.persona.riesgo) continue;
    const g = avgGenes(col.cells), D = Object.values(MUNDOS).sort((x, y) => g[x.gen] - g[y.gen])[0];
    const cel = col.cells.filter(c => c.owner === "colonia" && !c.sellos?.includes(D.k)).sort((x, y) => score(y) - score(x))[0];
    if (!cel) continue;
    col.treasury -= D.tarifa; w.supply.burned += D.tarifa;
    const e = (col.aero ||= { exploradoras: 0 }); e.ultima = w.tick; e.exploradoras++;
    embarcar(w, a, cel, col, "colonia", col.name, D);
    a.stats.exploradoras++; n++;
  }
  return n;
}

// ---------- vuelos ----------
// Retraso: una tormenta sobre el puerto del otro mundo o mal tiempo de verdad en VITA
function retraso(w, D, n, weather) {
  const m = w[D.clave], f = m?.fenomeno, R0 = m?.regions?.[0];
  let motivo = null;
  if (f?.k === D.malo && R0 && f.region === R0.id) motivo = `${D.fen[f.k].name.toLowerCase()} sobre ${R0.name}`;
  else if (weather && (weather.lluvia >= 0.6 || /tormenta|fuerte/.test(weather.desc || ""))) motivo = `${weather.desc || "mal tiempo"} en VITA`;
  return motivo ? { ciclos: 1 + parseInt(hash(`retraso:${n}`).slice(0, 2), 16) % 3, motivo } : null;
}
function despegar(w, a, D, ida, weather) {
  const ruta = `${D.k}:${ida ? "ida" : "vuelta"}`, seq = a.rutas[ruta] = (a.rutas[ruta] || 0) + 1, n = ++a.serial;
  const pax = Object.values(a.viajes).filter(v => v.dest === D.k && v.fase === (ida ? "terminal" : "espera")).sort((x, y) => x.id - y.id).slice(0, AERO.PLAZAS);
  const r = retraso(w, D, n, weather);
  const f = { n, num: numero(D, ida, seq), dest: D.k, ida, nave: nave(seq), puerta: puerta(D, seq), prog: w.tick, sale: w.tick + (r?.ciclos || 0), estado: r ? "retrasado" : "en vuelo", motivo: r?.motivo || null, pax: pax.map(v => v.id) };
  f.llega = f.sale + D.vuelo;
  a.vuelos[n] = f;
  for (const v of pax) { v.fase = ida ? "ida" : "vuelta"; v.vuelo = n; }
  if (pax.length) block(w, "despegue", ida ? "VTA" : D.k, ida ? D.k : "VTA", pax.length, "CEL", pax.map(v => v.cel.id));
  if (r) {
    a.stats.retrasos++;
    if (pax.length) cronica(w, `${f.num} ${ida ? `a ${D.name}` : `desde ${D.name}`} sale con retraso: ${r.motivo}`);
  }
}
// Al aterrizar en el otro mundo la célula recibe su sello y, si es su primera vez allí, aprende
function llegarAlMundo(w, a, v, D, f) {
  const m = w[D.clave], R = m?.regions?.length ? m.regions[parseInt(hash(`${v.id}:${v.cel.id}`).slice(0, 4), 16) % m.regions.length] : null;
  Object.assign(v, { fase: "explorando", region: R ? { id: R.id, name: R.name, bioma: D.biomas[R.bioma]?.name || "" } : null, llego: w.tick, fin: w.tick + AERO.ESTANCIA });
  const c = v.cel, primera = !(c.sellos ||= []).includes(D.k);
  if (primera) {
    c.sellos.push(D.k);
    if (c.g[D.gen] < 15) {
      c.g[D.gen]++; v.gano = D.gen; a.stats.aprendizajes++;
      if (D.gen === "res") c.life += 24; // como al nacer: cada punto de resistencia suma 24 ciclos de vida
    }
  }
  c.viajes = (c.viajes || 0) + 1;
  const u = w.users[v.owner];
  if (u) pasaporte(u).sellos[D.k]++;
  cronica(w, `${c.id} aterriza en ${D.name} con el ${f.num} y explora ${R ? R.name : "sus tierras"}${v.gano ? `: aprende ${TRAITS[D.gen].toLowerCase()}` : ""}`);
}
// De vuelta en VITA: a su colonia si sigue viva y tiene sitio; si no, a la colonia viva con más sitio
function volver(w, a, v) {
  const libre = c => cap(c) - c.cells.length, casa = w.colonies[v.col];
  const mias = c => c.cells.reduce((n, x) => n + (x.owner === v.owner), 0);
  const col = casa?.alive && libre(casa) > 0 ? casa : Object.values(w.colonies).filter(c => c.alive && libre(c) > 0).sort((x, y) => mias(y) - mias(x) || libre(y) - libre(x))[0];
  if (!col) return false;
  const c = v.cel, D = MUNDOS[v.dest];
  c.born = col.edad - v.edad; // no envejeció durante el viaje
  col.cells.push(c);
  delete a.viajes[v.id];
  const u = w.users[v.owner];
  if (u) { const P = pasaporte(u); P.viajes++; P.millas += v.millas; }
  a.stats.viajes++; a.stats.millas += v.millas;
  a.recientes.unshift({ id: v.id, cel: c.id, owner: v.owner, ownerName: v.ownerName, dest: v.dest, gano: v.gano, millas: v.millas, col: col.name, tick: w.tick });
  if (a.recientes.length > AERO.RECIENTES) a.recientes.length = AERO.RECIENTES;
  const aprendio = v.gano ? ` con +1 de ${TRAITS[v.gano].toLowerCase()}` : "";
  clog(w, col, `Vuelve <b>${c.id}</b> de ${D.name}${aprendio}${col.id !== v.col ? ` (su colonia ${casa?.alive ? "no tenía sitio" : "ya no existe"})` : ""}`);
  cronica(w, `${c.id} vuelve de ${D.name} a ${col.name}${aprendio}`);
  return true;
}
function aterrizar(w, a, f) {
  f.estado = "aterrizado"; f.t = w.tick;
  const D = MUNDOS[f.dest], vs = f.pax.map(id => a.viajes[id]).filter(Boolean);
  if (vs.length) block(w, "aterrizaje", f.ida ? "VTA" : D.k, f.ida ? D.k : "VTA", vs.length, "CEL", vs.map(v => v.cel.id));
  for (const v of vs) {
    if (f.ida) llegarAlMundo(w, a, v, D, f);
    else if (!volver(w, a, v)) v.fase = "sin sitio";
  }
}

// ---------- un ciclo del aeropuerto (después de los ciclos de los mundos) ----------
export function step(w, { weather } = {}, rnd = Math.random) {
  const a = w.aeropuerto;
  if (!a) return;
  if (w.tick % 36 === 0) explorar(w, rnd);
  for (const f of Object.values(a.vuelos)) {
    if (f.estado === "retrasado" && w.tick >= f.sale) f.estado = "en vuelo";
    if (f.estado === "en vuelo" && w.tick >= f.llega) aterrizar(w, a, f);
  }
  for (const v of Object.values(a.viajes)) {
    if (v.fase === "explorando" && w.tick >= v.fin) v.fase = "espera";
    else if (v.fase === "sin sitio") volver(w, a, v);
  }
  for (const D of Object.values(MUNDOS)) for (const ida of [true, false]) if (w.tick % AERO.CADA === salidaDe(D, ida)) despegar(w, a, D, ida, weather);
  const hechos = Object.values(a.vuelos).filter(f => f.estado === "aterrizado").sort((x, y) => y.n - x.n);
  for (const f of hechos.slice(AERO.GUARDAR)) delete a.vuelos[f.n];
}

// Pasaporte de una célula: sus sellos, dónde está ahora y sus vuelos en la cadena
export function pasaporteCelula(w, id) {
  let cel = null, donde = null;
  for (const col of Object.values(w.colonies)) { const c = col.cells.find(x => x.id === id); if (c) { cel = c; donde = `En ${col.name}`; break; } }
  if (!cel) {
    const v = Object.values(w.aeropuerto?.viajes || {}).find(x => x.cel.id === id);
    if (v) { cel = v.cel; donde = `${FASES[v.fase]} · ${MUNDOS[v.dest].name}`; }
  }
  if (!cel) return null;
  const movimientos = w.chain.filter(b => b.ids?.includes(id) && ["billete", "despegue", "aterrizaje"].includes(b.tipo)).map(b => ({ n: b.n, tipo: b.tipo, de: b.de, a: b.a, hash: b.hash, t: b.t }));
  return {
    id, g: cel.g, rareza: RARITY[rarIdx(cel)].name, dueno: cel.owner === "colonia" ? "su colonia" : w.users[cel.owner]?.name || null, donde,
    sellos: (cel.sellos || []).map(k => MUNDOS[k]?.name || k), viajes: cel.viajes || 0, movimientos, cadenaOk: verifyChain(w),
  };
}

// ---------- vista pública ----------
function tripView(w, v) {
  const a = w.aeropuerto, D = MUNDOS[v.dest], f = a.vuelos[v.vuelo], t = w.tick;
  const eta = { terminal: proxima(t, D, true), ida: f?.llega, explorando: v.fin, espera: proxima(t, D, false), vuelta: f?.llega }[v.fase];
  return {
    id: v.id, cel: v.cel.id, g: v.cel.g, rarity: rarIdx(v.cel), sellos: v.cel.sellos || [], dest: D.k, destName: D.name, fase: v.fase, faseName: FASES[v.fase] || v.fase,
    region: v.region?.name || null, bioma: v.region?.bioma || null, vuelo: f?.num || null, retraso: f?.estado === "retrasado" ? f.motivo : null,
    en: eta != null ? Math.max(0, eta - t) : null, gano: v.gano, colName: v.colName, vistas: v.vistas, millas: v.millas,
  };
}
const fila = (w, f) => {
  const D = MUNDOS[f.dest];
  return { num: f.num, dest: D.k, name: D.name, prog: f.prog, sale: f.sale, llega: f.llega, estado: f.estado, motivo: f.motivo, puerta: f.puerta, nave: f.nave, pax: f.pax.length };
};
export function view(w, u) {
  const a = w.aeropuerto;
  if (!a) return null;
  const t = w.tick, fs = Object.values(a.vuelos).sort((x, y) => x.n - y.n);
  const esperan = (D, fase) => Object.values(a.viajes).filter(v => v.dest === D.k && v.fase === fase).length;
  // Salidas: las naves que van hacia los mundos y las próximas de cada ruta
  const futuras = ida => Object.values(MUNDOS).map(D => {
    const s = proxima(t, D, ida), seq = (a.rutas[`${D.k}:${ida ? "ida" : "vuelta"}`] || 0) + 1;
    return { num: numero(D, ida, seq), dest: D.k, name: D.name, prog: s, sale: s, llega: s + D.vuelo, estado: s - t <= 1 ? "embarcando" : "programado", motivo: null, puerta: puerta(D, seq), nave: nave(seq), pax: esperan(D, ida ? "terminal" : "espera") };
  });
  const salidas = [...fs.filter(f => f.ida && f.estado !== "aterrizado").map(f => fila(w, f)), ...futuras(true)].sort((x, y) => x.sale - y.sale).slice(0, 6);
  const llegadas = [
    ...fs.filter(f => !f.ida && f.estado === "aterrizado").slice(-2).map(f => fila(w, f)),
    ...fs.filter(f => !f.ida && f.estado !== "aterrizado").map(f => fila(w, f)),
    ...futuras(false),
  ].sort((x, y) => x.llega - y.llega).slice(0, 6);
  let me = null;
  if (u) {
    const P = pasaporte(u), N = nivel(u), cels = [];
    for (const col of Object.values(w.colonies)) for (const c of col.cells) if (c.owner === u.id) cels.push({ id: c.id, colony: col.id, colonyName: col.name, g: c.g, rarity: rarIdx(c), sellos: c.sellos || [] });
    me = {
      viajes: viajesDe(w, u.id).sort((x, y) => x.id - y.id).map(v => tripView(w, v)),
      pasaporte: { viajes: P.viajes, millas: P.millas, sellos: P.sellos, nivel: N.name, nivelK: N.k, siguiente: N.siguiente ? { name: N.siguiente.name, millas: N.siguiente.millas } : null, desde: NIVELES[N.i].millas },
      hoy: u.daily?.vuelos || 0, porDia: porDia(u), plazas: plazas(u),
      celulas: cels.sort((x, y) => score(y) - score(x)).slice(0, 40),
      volvieron: a.recientes.filter(r => r.owner === u.id).slice(0, 5),
    };
  }
  return {
    // `aqui`: células que están ahora en ese mundo, explorando o esperando la vuelta
    tick: t, mundos: Object.values(MUNDOS).map(D => ({ k: D.k, name: D.name, tipo: D.tipo, gen: D.gen, genName: TRAITS[D.gen], tarifa: D.tarifa, vuelo: D.vuelo, millas: D.millas, puerta: D.puerta, estancia: AERO.ESTANCIA, vistas: vistas(w, D), aqui: esperan(D, "explorando") + esperan(D, "espera") })),
    // `enVuelo`: todas las naves en el aire o retrasadas, para el mapa de rutas
    salidas, llegadas, enVuelo: fs.filter(f => f.estado === "en vuelo" || f.estado === "retrasado").map(f => ({ ...fila(w, f), ida: f.ida })),
    me, niveles: NIVELES.map(n => ({ name: n.name, millas: n.millas })),
    enViaje: Object.keys(a.viajes).length, enTerminal: Object.values(a.viajes).filter(v => v.fase === "terminal").length, exploradoras: viajesDe(w, "colonia").length, stats: a.stats,
    cronica: a.cronica.slice(0, 12),
  };
}
