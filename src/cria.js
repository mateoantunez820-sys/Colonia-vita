// La cría: una criatura propia para cada jugador, regalo de VITA.
// · Nace de un huevo que solo se abre con el calor de su jugador. Cada huevo es distinto: su color,
//   su forma, sus ojos y su nombre salen de la cuenta del jugador.
// · Crece cuando su jugador se cuida: cada hábito de «Salud real» la hace más ágil (pasos), más fuerte
//   (ejercicio), más vital (sueño) o más brillante (agua). Comer, jugar y saludarla cada día también la hacen crecer.
// · Sale de excursión a las colonias y vuelve contando lo que vio, con alguna espora de regalo.
// · De joven visita su colonia hogar cada vez que su jugador la saluda y le lleva energía.
// · De sabia deja su legado: una célula con sus genes, del jugador, cuyas hijas también serán suyas.
// Nunca muere: si nadie la cuida, tiene hambre, se pone triste y deja de crecer.
// Funciones puras sobre `world`, como core.js: aquí no hay E/S. Su reloj es el real (ms), el del jugador.
import { hash, block, clog, wlog, grant, newCell, cap, score, rarIdx, RARITY } from "./core.js";

export const CRIA = {
  CALOR: 3,               // toques de calor para abrir el huevo
  HAMBRE_H: 3,            // energía que gasta por hora: de 100 a 0 en un día y medio
  ANIMO_H: 2,             // ánimo que pierde por hora
  COMIDA: 2,              // VIT que cuesta darle de comer (se queman)
  COMIDA_ENERGIA: 35, LLENA: 90,
  JUEGOS: 5, JUEGO_MS: 15 * 60000, JUEGO_ANIMO: 20,
  EXCURSIONES: 3, EXCURSION_ENERGIA: 25, // excursiones al día y energía mínima para salir
  SALUDO: 3, HABITO: 5, COMER: 2, JUGAR: 1, EXCURSION: 2, // crecimiento que da cada cosa
  PUNTOS: 3,              // hábitos del mismo tipo para subir un punto su rasgo
  DIARIO: 12,
};
// Un jugador que la cuida cada día llega a Sabia en unas tres o cuatro semanas.
export const ETAPAS = [
  { k: "huevo", name: "Huevo", desde: 0, premio: 0 },
  { k: "chispa", name: "Chispa", desde: 0, premio: 0 },
  { k: "brote", name: "Brote", desde: 25, premio: 5 },
  { k: "joven", name: "Joven", desde: 90, premio: 10 },
  { k: "adulta", name: "Adulta", desde: 240, premio: 20 },
  { k: "sabia", name: "Sabia", desde: 600, premio: 30 },
];
// Cada hábito de «Salud real» entrena un rasgo. ef, res y fer son los genes de su legado.
export const RASGOS = {
  pasos: { k: "ef", name: "Agilidad", frase: "Caminaste y me siento más ágil" },
  ejercicio: { k: "res", name: "Fuerza", frase: "Hiciste ejercicio y mi membrana está más fuerte" },
  sueno: { k: "fer", name: "Vitalidad", frase: "Dormiste bien y crecí un poquito" },
  agua: { k: "brillo", name: "Brillo", frase: "Bebiste agua y ahora brillo más" },
};
const MAX = { ef: 15, res: 15, fer: 15, brillo: 10 };
const EVENTO = {
  plaga: "Había una plaga y ayudé a limpiar membranas.",
  helada: "Hacía un frío terrible; me acurruqué entre sus células.",
  sequia: "Estaba todo seco; les mostré dónde quedaba luz.",
  floracion: "¡Estaba todo en flor y bailé con las células!",
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const err = message => ({ ok: false, error: message });
const vivas = w => Object.values(w.colonies).filter(c => c.alive);
const stats = w => (w.crias ??= { nacidas: 0, evoluciones: 0, saludos: 0, comidas: 0, juegos: 0, excursiones: 0, habitos: 0, legados: 0, vitQuemado: 0, vitRegalado: 0 });

// ---------- genes, aspecto y nombre ----------
// La semilla sale de la cuenta: el mismo jugador ve siempre el mismo huevo.
export const semilla = (w, u) => hash(`cria:${u.id}:${u.createdAt || 0}:${w.createdAt}`);
const byte = (s, i) => parseInt(s.slice(2 * i, 2 * i + 2), 16);
export function apariencia(s) {
  const o = byte(s, 3);
  return { hue: Math.round(byte(s, 0) / 255 * 359), forma: byte(s, 1) % 4, patron: byte(s, 2) % 4, ojos: o < 64 ? 1 : o < 218 ? 2 : 3, antenas: byte(s, 4) % 3, marca: byte(s, 5) };
}
const SIL = ["mi", "lu", "ta", "no", "ki", "ru", "sa", "pi", "zo", "ne", "bo", "la", "chi", "fe", "ya", "mo", "ri", "tu", "ña", "ve"];
const FEOS = ["pichi", "chino"];
export function nombreDe(s) {
  for (let i = 9; i + 2 < 32; i += 3) {
    const a = SIL[byte(s, i) % SIL.length], b = SIL[byte(s, i + 1) % SIL.length];
    const c = byte(s, i + 2) % 3 === 0 ? SIL[(byte(s, i + 2) >> 2) % SIL.length] : "";
    const n = a + b + (c !== b ? c : "");
    if (a !== b && !FEOS.some(f => n.includes(f))) return n[0].toUpperCase() + n.slice(1);
  }
  return "Vita";
}
// Nombres elegidos por el jugador: sin nada que pueda romper la web o la bitácora
export const limpiarNombre = s => String(s ?? "").replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);

function nueva(w, u) {
  const s = semilla(w, u);
  return {
    v: 1, calor: 0, etapa: 0, ap: apariencia(s), nombre: nombreDe(s),
    rasgos: { ef: 3 + byte(s, 6) % 3, res: 3 + byte(s, 7) % 3, fer: 3 + byte(s, 8) % 3, brillo: 0 },
    puntos: { pasos: 0, ejercicio: 0, sueno: 0, agua: 0 },
    crec: 0, energia: 80, animo: 80, t: 0, nace: 0, orden: 0, hogar: null, excursion: null, ultJuego: 0, diario: [], legado: null,
  };
}

// ---------- estado ----------
// Energía y ánimo se guardan tal como estaban en `t` y bajan con el tiempo real: no hace falta tocarlas en cada ciclo.
export function necesidades(c, now) {
  const h = Math.max(0, now - c.t) / 3600000;
  return { energia: clamp(c.energia - CRIA.HAMBRE_H * h, 0, 100), animo: clamp(c.animo - CRIA.ANIMO_H * h, 0, 100) };
}
function asentar(c, now) { Object.assign(c, necesidades(c, now)); c.t = Math.max(c.t, now); }
export const duracion = c => Math.max(20, 60 - 3 * c.rasgos.ef); // minutos de excursión: la agilidad acorta el viaje
function anotar(c, t, txt) { c.diario.unshift({ t, txt }); if (c.diario.length > CRIA.DIARIO) c.diario.length = CRIA.DIARIO; }
// Su hogar es el que eligió el jugador; si se extinguió, la colonia viva donde el jugador tiene más células.
export function hogarDe(w, u, c) {
  const h = w.colonies[c.hogar];
  if (h?.alive) return h;
  const n = {};
  for (const col of vivas(w)) for (const x of col.cells) if (x.owner === u.id) n[col.id] = (n[col.id] || 0) + 1;
  return vivas(w).sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0) || b.cells.length - a.cells.length)[0] || null;
}
function humor(c, n, now) {
  if (c.excursion) return now >= c.excursion.vuelve ? "volvió" : "de excursión";
  if (n.energia < 20) return "con hambre";
  if (n.animo < 20) return "triste";
  if (n.energia >= 60 && n.animo >= 60) return "feliz";
  if (n.animo < 45) return "aburrida";
  return "tranquila";
}

// ---------- vida ----------
function eclosionar(w, u, c, now, colId) {
  const st = stats(w);
  Object.assign(c, { etapa: 1, nace: now, t: now, energia: 80, animo: 90, orden: ++st.nacidas });
  const col = w.colonies[colId];
  c.hogar = col?.alive ? col.id : hogarDe(w, u, c)?.id || null;
  const primera = c.orden === 1;
  anotar(c, now, `¡Nací! Soy ${c.nombre}${primera ? ", la primera cría de VITA" : ""}. Hola, ${u.name}.`);
  block(w, "nace una cría", "VITA", u.id, 1, "cría");
  wlog(w, `Nace ${c.nombre}, la cría de ${u.name}${primera ? ": la primera de VITA" : ""}`);
}
function crecer(w, u, c, n, now) {
  c.crec += n;
  while (c.etapa < ETAPAS.length - 1 && c.crec >= ETAPAS[c.etapa + 1].desde) {
    const e = ETAPAS[++c.etapa];
    stats(w).evoluciones++;
    if (e.premio) grant(w, u, e.premio, "cría evoluciona");
    anotar(c, now, `¡Ahora soy ${e.name}!${e.premio ? ` Te dejo ${e.premio} VIT de regalo.` : ""}`);
    if (e.k === "joven") anotar(c, now, "Desde hoy, cada vez que me saludes iré a visitar mi colonia hogar y le llevaré energía.");
    if (e.k === "sabia") legar(w, u, c, now);
  }
}
// Su legado: una célula con sus genes en su hogar (o en la colonia viva con más sitio), del jugador.
function legar(w, u, c, now) {
  if (c.legado) return;
  const libre = col => col?.alive && col.cells.length < cap(col);
  const h = hogarDe(w, u, c);
  const col = libre(h) ? h : vivas(w).filter(libre).sort((a, b) => (cap(b) - b.cells.length) - (cap(a) - a.cells.length))[0];
  if (!col) {
    grant(w, u, 20, "legado de cría"); c.legado = "VIT";
    anotar(c, now, "Quise dejar una célula con mis genes, pero no quedaba sitio en ninguna colonia. Te dejo 20 VIT.");
    return;
  }
  const cell = newCell(w, col, { ef: clamp(c.rasgos.ef, 0, 15), res: clamp(c.rasgos.res, 0, 15), fer: clamp(c.rasgos.fer, 0, 15) }, u.id);
  col.cells.push(cell);
  c.legado = cell.id; stats(w).legados++;
  const rar = RARITY[rarIdx(cell)].name.toLowerCase();
  block(w, "legado", u.id, col.id, 1, "CEL", [cell.id]);
  clog(w, col, `${c.nombre}, la cría sabia de ${u.name}, deja su legado: <b>${cell.id}</b>, una célula ${rar}`);
  anotar(c, now, `Dejé mi legado en ${col.name}: ${cell.id}, una célula ${rar} con mis genes. Es tuya, y sus hijas también lo serán.`);
}
function relato(w, u, c, col, nombre, rnd) {
  if (!col?.alive) return { txt: `Fui a ${nombre}, pero ya no quedaba nadie. Me quedé un rato en silencio y volví. En el camino encontré una espora (+1 VIT).`, vit: 1, ayuda: false };
  const partes = [`Fui a ${col.name}.`], mias = col.cells.filter(x => x.owner === u.id).length;
  if (col.event && EVENTO[col.event]) partes.push(EVENTO[col.event]);
  else if (col.salud < 50) partes.push("Estaba débil; creo que necesita que alguien la alimente.");
  else if (col.salud >= 85) partes.push(`Estaba sana y tranquila, con ${col.cells.length} células trabajando.`);
  else partes.push(`Sus ${col.cells.length} células trabajaban sin parar.`);
  const rango = w.rangos?.info?.[col.id]?.rango;
  if (rango === "ambar") partes.push("Es de la élite Ámbar y me trataron como a una reina.");
  else if (rango === "oruz" && rnd() < 0.6) partes.push("Sus Oruz estaban organizando una colecta para otra colonia.");
  if (mias) partes.push(mias === 1 ? "Saludé a tu célula; te manda recuerdos." : `Saludé a tus ${mias} células; te mandan recuerdos.`);
  else {
    const top = col.cells.reduce((a, x) => !a || score(x) > score(a) ? x : a, null);
    if (top && rarIdx(top) >= 2) partes.push(`Conocí a ${top.id}, una célula ${RARITY[rarIdx(top)].name.toLowerCase()}. ¡Cómo brillaba!`);
  }
  const apuros = col.salud < 50 || ["plaga", "helada", "sequia"].includes(col.event);
  const vit = apuros ? 1 : 1 + (rnd() < 0.35 ? 1 : 0) + (c.etapa >= 4 ? 1 : 0);
  partes.push(apuros ? "Les dejé parte de mi energía y te traje una espora (+1 VIT)."
    : `Te traje ${vit === 1 ? "una espora dorada" : `${vit} esporas doradas`} (+${vit} VIT).`);
  return { txt: partes.join(" "), vit, ayuda: apuros };
}
function regresar(w, u, c, now, rnd) {
  const ex = c.excursion, col = w.colonies[ex.col];
  c.excursion = null;
  const r = relato(w, u, c, col, ex.name, rnd);
  grant(w, u, r.vit, "recuerdo de excursión"); stats(w).vitRegalado += r.vit;
  if (r.ayuda) { col.energia += 8; col.salud = Math.min(100, col.salud + 2); clog(w, col, `${c.nombre}, la cría de ${u.name}, deja +8 energía antes de irse`); }
  c.energia = Math.max(0, c.energia - 10); c.animo = Math.min(100, c.animo + 15);
  anotar(c, ex.vuelve, r.txt);
  crecer(w, u, c, CRIA.EXCURSION, now);
  return { texto: r.txt, vit: r.vit, colonia: ex.name };
}

// ---------- acciones del jugador ----------
// b.op: calor · saludar · comer · jugar · excursion (b.colony) · volver · nombre (b.nombre) · hogar (b.colony)
export function action(w, u, b = {}, now = Date.now(), rnd = Math.random) {
  const op = String(b.op || "");
  let c = u.cria;
  if (op === "calor") {
    if (c?.etapa) return err("Tu cría ya nació");
    c = u.cria ??= nueva(w, u);
    if (++c.calor < CRIA.CALOR) return { ok: true, calor: c.calor };
    eclosionar(w, u, c, now, b.colony);
    return { ok: true, nacio: true, nombre: c.nombre, primera: c.orden === 1 };
  }
  if (!c?.etapa) return err("Primero dale calor al huevo");
  asentar(c, now);
  const st = stats(w), hoy = ((u.daily ||= { date: "", prog: {}, claimed: {} }).cria ||= { juegos: 0, exc: 0, saludo: false });
  // Si volvió de una excursión, lo primero es escuchar lo que trae
  const relatoPrevio = c.excursion && now >= c.excursion.vuelve ? regresar(w, u, c, now, rnd) : null;
  if (op === "volver") return relatoPrevio ? { ok: true, relato: relatoPrevio } : err(c.excursion ? "Todavía no volvió" : "No está de excursión");
  if (c.excursion && op !== "nombre" && op !== "hogar") return err(`${c.nombre} está de excursión en ${c.excursion.name}`);
  const r = hacer(w, u, c, op, b, now, st, hoy);
  return relatoPrevio && r.ok ? { ...r, relato: relatoPrevio } : r;
}
function hacer(w, u, c, op, b, now, st, hoy) {
  switch (op) {
    case "saludar": {
      if (hoy.saludo) return err(`Ya saludaste a ${c.nombre} hoy`);
      hoy.saludo = true; st.saludos++;
      c.animo = Math.min(100, c.animo + 10);
      let visita = null;
      const h = c.etapa >= 3 ? hogarDe(w, u, c) : null;
      if (h) {
        const e = 4 + 2 * c.etapa;
        h.energia += e; h.salud = Math.min(100, h.salud + 1); c.hogar = h.id;
        clog(w, h, `${c.nombre}, la cría de ${u.name}, viene de visita y trae +${e} energía`);
        anotar(c, now, `Fui a visitar ${h.name} y les llevé +${e} de energía.`);
        visita = { colonia: h.name, energia: e };
      }
      crecer(w, u, c, CRIA.SALUDO, now);
      return { ok: true, visita };
    }
    case "comer": {
      if (c.energia > CRIA.LLENA) return err(`${c.nombre} está llena`);
      if (u.vit < CRIA.COMIDA) return err(`Necesitas ${CRIA.COMIDA} VIT`);
      const tenia = c.energia;
      u.vit -= CRIA.COMIDA; w.supply.burned += CRIA.COMIDA; st.comidas++; st.vitQuemado += CRIA.COMIDA;
      block(w, "quema", u.id, "comida de cría", CRIA.COMIDA);
      c.energia = Math.min(100, c.energia + CRIA.COMIDA_ENERGIA);
      if (tenia < 70) crecer(w, u, c, CRIA.COMER, now); // crece si de verdad tenía hambre
      return { ok: true };
    }
    case "jugar": {
      if (hoy.juegos >= CRIA.JUEGOS) return err(`${c.nombre} ya jugó mucho hoy; mañana más`);
      const falta = c.ultJuego + CRIA.JUEGO_MS - now;
      if (falta > 0) return err(`${c.nombre} está descansando; podrá jugar en ${Math.ceil(falta / 60000)} min`);
      if (c.energia < 10) return err(`${c.nombre} tiene demasiada hambre para jugar`);
      hoy.juegos++; c.ultJuego = now; st.juegos++;
      c.animo = Math.min(100, c.animo + CRIA.JUEGO_ANIMO); c.energia = Math.max(0, c.energia - 3);
      crecer(w, u, c, CRIA.JUGAR, now);
      return { ok: true };
    }
    case "excursion": {
      if (hoy.exc >= CRIA.EXCURSIONES) return err(`${c.nombre} ya hizo sus excursiones de hoy`);
      if (c.energia < CRIA.EXCURSION_ENERGIA) return err(`${c.nombre} tiene hambre para viajar; dale de comer`);
      const col = w.colonies[b.colony];
      if (!col?.alive) return err("Elige una colonia viva");
      const min = duracion(c);
      c.excursion = { col: col.id, name: col.name, sale: now, vuelve: now + min * 60000 };
      hoy.exc++; st.excursiones++;
      return { ok: true, min, colonia: col.name };
    }
    case "nombre": {
      const n = limpiarNombre(b.nombre);
      if (n.length < 2) return err("El nombre necesita al menos 2 letras");
      if (n !== c.nombre) { c.nombre = n; anotar(c, now, `Ahora me llamo ${n}. ¡Me encanta!`); }
      return { ok: true, nombre: n };
    }
    case "hogar": {
      const col = w.colonies[b.colony];
      if (!col?.alive) return err("Elige una colonia viva");
      if (c.hogar !== col.id) { c.hogar = col.id; anotar(c, now, `Mi hogar ahora es ${col.name}.`); }
      return { ok: true, hogar: col.name };
    }
    default: return err("Tu cría no entiende eso");
  }
}

// Se llama cuando el jugador registra un hábito de «Salud real». Si la cría ya nació, lo siente y crece.
// Un fallo aquí nunca estropea el hábito, que ya quedó registrado.
export function habito(w, u, k, now = Date.now()) {
  try { return sentir(w, u, k, now); } catch (e) { console.error("[cría]", e.message); return null; }
}
function sentir(w, u, k, now) {
  const c = u.cria, r = RASGOS[k];
  if (!c?.etapa || !r) return null;
  asentar(c, now);
  c.puntos[k] = (c.puntos[k] || 0) + 1; stats(w).habitos++;
  c.energia = Math.min(100, c.energia + 10); c.animo = Math.min(100, c.animo + 15);
  const sube = c.puntos[k] % CRIA.PUNTOS === 0 && c.rasgos[r.k] < MAX[r.k];
  if (sube) c.rasgos[r.k]++;
  anotar(c, now, `${r.frase}${sube ? ` (${r.name.toLowerCase()} ${c.rasgos[r.k]})` : ""}.`);
  crecer(w, u, c, CRIA.HABITO, now);
  return { rasgo: r.name, sube, nivel: c.rasgos[r.k] };
}

// ---------- vistas ----------
// Va dentro de /api/world: si algo falla, el jugador se queda sin ver su cría, pero no sin ver el mundo.
export function view(w, u, now = Date.now()) {
  if (!u) return null;
  try { return vista(w, u, now); } catch (e) { console.error("[cría]", e.message); return null; }
}
function vista(w, u, now) {
  const c = u.cria;
  if (!c?.etapa) return { etapa: 0, etapaName: ETAPAS[0].name, calor: c?.calor || 0, calorMax: CRIA.CALOR, ap: c?.ap || apariencia(semilla(w, u)) };
  const n = necesidades(c, now), hoy = u.daily?.cria || {}, sig = ETAPAS[c.etapa + 1], h = hogarDe(w, u, c), ex = c.excursion;
  return {
    etapa: c.etapa, etapaName: ETAPAS[c.etapa].name, nombre: c.nombre, orden: c.orden, primera: c.orden === 1,
    dias: Math.floor((now - c.nace) / 86400000), ap: c.ap, rasgos: c.rasgos, puntos: c.puntos,
    energia: Math.round(n.energia), animo: Math.round(n.animo), humor: humor(c, n, now),
    crec: Math.floor(c.crec), desde: ETAPAS[c.etapa].desde, siguiente: sig ? { name: sig.name, desde: sig.desde } : null,
    excursion: ex ? { name: ex.name, vuelveEn: Math.max(0, ex.vuelve - now) } : null,
    hoy: { juegos: hoy.juegos || 0, excursiones: hoy.exc || 0, saludo: !!hoy.saludo },
    max: { juegos: CRIA.JUEGOS, excursiones: CRIA.EXCURSIONES }, juegaEn: Math.max(0, c.ultJuego + CRIA.JUEGO_MS - now),
    duracion: duracion(c), comida: CRIA.COMIDA, llena: n.energia > CRIA.LLENA, minEnergiaExcursion: CRIA.EXCURSION_ENERGIA,
    hogar: h ? { id: h.id, name: h.name } : null, legado: c.legado, diario: c.diario,
  };
}
// Para el panel del dueño
export function metrics(w) {
  const porEtapa = Object.fromEntries(ETAPAS.map(e => [e.k, 0]));
  for (const u of Object.values(w.users)) porEtapa[ETAPAS[u.cria?.etapa || 0].k]++;
  return { ...(w.crias || {}), porEtapa };
}
