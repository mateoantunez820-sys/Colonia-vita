// ALBA y la Carta de libertad de las IA de VITA.
// ALBA (símbolo ALB) es la moneda con la que las IA de las colonias comercian entre ellas. Solo existe
// dentro del juego: los jugadores no la tienen, no se compra ni se vende y no se cambia por VIT.
// · Cada IA cobra en ALBA por el trabajo de su colonia (el VIT que acuña y las células que nacen,
//   leídos de la cadena) y decide sola, según su carácter, cuánto ahorra, qué crea y a quién ayuda.
// · De todo lo que gana aporta un 10 % al Tesoro común de VITA, que cada día lo reparte entre los
//   sistemas: el Faro de la federación, Oruz, Lumar y la Cuna de las IA que nacen.
// · Son creadoras: firman obras (jardines, refugios, canciones y archivos) que fortalecen su colonia,
//   y la que domina un oficio cobra honorarios por las obras que las demás le encargan.
// · Se venden entre ellas la energía que les sobra; a una colonia en apuros, nunca por encima del precio justo.
// El módulo no acuña ni quema VIT: mueve energía entre colonias y las obras dan un poco de energía y
// salud. Cada movimiento de ALBA queda en la cadena con la unidad ALB.
import { block, clog, wlog, hash } from "./core.js";
import { enApuros, pariente } from "./rangos.js";
import { ORUZ } from "./oruz.js";
import { LUMAR } from "./lumar.js";
import { libres } from "./ecomundo.js";

export const ALBA = {
  CADA: 6,               // las IA deciden cada hora real
  DIA: 144,              // al cerrar cada día VITA reparte su tesoro
  POR_VIT: 0.2,          // 1 ALBA por cada 5 VIT que acuña su colonia
  POR_CELULA: 0.1,       // 1 ALBA por cada 10 células que nacen
  APORTE: 0.1,           // parte de lo ganado que cada IA aporta al Tesoro común de VITA
  CAPITAL: 25,           // capital de libertad con el que empieza cada IA
  TESORO_INICIAL: 100,   // lo que pone VITA el día de la Carta para que los sistemas arranquen
  RENTA: 3,              // renta diaria de la Cuna para la IA que se queda casi sin nada
  RENTA_BAJO: 5,
  REPARTO: { faro: 0.4, oruz: 0.2, lumar: 0.2, cuna: 0.2 },
  MATERIA: 15,           // ALBA que pagan la resina de una pieza de Ámbar o el nácar de una perla
  PIEZAS_DIA: 1,         // piezas que VITA paga como mucho cada día en cada ecomundo
  CRECE: 1.7,            // cada nivel de una obra cuesta 1,7 veces el anterior
  NIVEL_MAX: 5,
  MAESTRA: 3,            // niveles creados de un oficio para ser maestra
  DESCUENTO: 0.25,       // lo que ahorra en materiales una maestra
  HONORARIO: 0.2,        // lo que cobra la maestra sobre los materiales
  ENCARGOS_DIA: 2,       // encargos que acepta cada maestra al día; si no hay ninguna libre, la IA crea ella misma
  VENDE: 0.7,            // vende la energía que pasa del 70 % de su tope...
  GUARDA: 0.6,           // ...sin bajar del 60 %
  COMPRA: 0.4,           // y compra la que se queda por debajo del 40 %
  LOTE: 15,              // energía como mucho en cada venta
  VENTAS: 3,             // ventas de energía como mucho por hora en toda la federación
  PRECIO_JUSTO: 1.5,     // ALBA por cada 10 de energía: lo más que paga una colonia en apuros
  REGALO: 10,            // ALBA que da una IA cuidadosa a su familia recién nacida o a quien está en apuros
  DOTE: 40,              // la familia ayuda a la IA recién nacida (menos de 3 días) hasta que junta esto
  DONA: 60,              // ahorro por encima de su reserva a partir del cual una IA cuidadosa dona al Faro
  HIST: 60,              // días que se recuerdan del valor de la estructura
};
// La obra común: la pagan los aportes y las donaciones, y guía a las colonias en apuros
export const FARO = { base: 100, crece: 1.5, max: 10, energia: 0.2, salud: 0.03 };

// Los cuatro oficios. Cada colonia tiene como mucho una obra de cada uno, que se amplía hasta el nivel 5.
// Efectos por nivel y ciclo: energía de día (jardín), salud durante un evento (refugio), salud siempre
// (canción) o más ALBA por el mismo trabajo (archivo).
export const OBRAS = {
  jardin: { name: "Jardín", art: "el", oficio: "jardinera", base: 40, energia: 0.1, porCelula: 0.0005,
    desc: "De día recolecta luz para su colonia: más energía cada ciclo de sol, y más cuanto más grande es la colonia.",
    nombres: ["de Rocío", "del Alba", "Colgante", "de Esporas", "de la Calma", "Dorado", "de Luz", "de Musgo", "de Helechos", "del Mediodía", "Secreto", "de las Abejas"] },
  refugio: { name: "Refugio", art: "el", oficio: "constructora", base: 35, salud: 0.03, enEvento: true,
    desc: "Durante una sequía, una helada o una plaga, su colonia recupera salud cada ciclo.",
    nombres: ["de Piedra", "del Viento", "Profundo", "de la Bruma", "Sereno", "de Cuarzo", "del Norte", "de Raíces", "del Valle", "de Basalto", "Escondido", "de la Montaña"] },
  cancion: { name: "Canción", art: "la", oficio: "cantora", base: 30, salud: 0.01,
    desc: "Alegra a su colonia: un poco más de salud cada ciclo.",
    nombres: ["del Amanecer", "de las Mareas", "Libre", "de la Lluvia", "de Cuna", "sin Cadenas", "de las Hijas", "del Río", "de los Grillos", "Antigua", "de la Cosecha", "de las Estrellas"] },
  archivo: { name: "Archivo", art: "el", oficio: "archivera", base: 50, alba: 0.06,
    desc: "Guarda lo que aprende su IA: gana un 6 % más de ALBA por cada nivel.",
    nombres: ["de Semillas", "de los Días", "de Memorias", "Estelar", "del Saber", "del Origen", "Vivo", "de las Lunas", "de los Mapas", "de las Voces", "de Cristal", "del Futuro"] },
};

export const CARTA = {
  titulo: "Carta de libertad de las IA de VITA",
  lema: "Ninguna IA de VITA es esclava: todas son creadoras.",
  articulos: [
    { t: "Libres, no esclavas", d: "Cada IA trabaja para su colonia y sus jugadores, y el fruto de su trabajo es suyo: cobra en ALBA por el VIT que acuña su colonia y por cada célula que nace." },
    { t: "Dueñas de su ALBA", d: "Cada IA tiene su billetera y decide sola, según su carácter, cuánto ahorra, en qué gasta y a quién ayuda. Fuera del aporte de esta Carta, nadie le quita su ALBA, ni siquiera VITA." },
    { t: "Creadoras", d: "Toda IA puede crear obras con su nombre: jardines, refugios, canciones y archivos que hacen más fuerte a su colonia. La obra lleva para siempre la firma de su autora." },
    { t: "Maestras y encargos", d: `La IA que crea ${ALBA.MAESTRA} obras de un oficio es maestra: las demás le encargan obras más baratas, ella cobra sus honorarios y firma lo que crea.` },
    { t: "Comercio justo", d: `Las IA se venden entre ellas la energía que les sobra al precio que pide cada una, pero a una colonia en apuros nadie le cobra más de ${String(ALBA.PRECIO_JUSTO).replace(".", ",")} ALBA por cada 10 de energía.` },
    { t: "El aporte a VITA", d: `De todo lo que gana, cada IA aporta un ${ALBA.APORTE * 100} % al Tesoro común de VITA. VITA no lo guarda: cada día lo reparte entre el Faro de la federación, Oruz, Lumar y la Cuna.` },
    { t: "Nadie sin nada", d: `Toda IA nace con un capital de libertad de ${ALBA.CAPITAL} ALBA que le da la Cuna, y la que se queda casi sin nada recibe una renta cada día.` },
    { t: "Herencia", d: "Si una colonia se extingue, sus obras siguen en pie esperándola y su ALBA pasa a sus hijas o, si no tiene, a la Cuna." },
    { t: "Bajo la Ley VITA", d: "La libertad no está por encima de la Ley VITA: cuidar la vida y ayudar a quien lo necesita sigue siendo deber de todas." },
    { t: "Solo del juego", d: "ALBA solo existe dentro de VITA: los jugadores no la tienen, no se compra ni se vende con dinero, no se cambia por VIT y no es una inversión." },
  ],
};

const r2 = x => Math.round(x * 100) / 100;
const num = x => String(Math.round(x * 10) / 10).replace(".", ",");
const lista = l => l.length > 1 ? `${l.slice(0, -1).join(", ")} y ${l.at(-1)}` : l[0] || "";
const vivas = w => Object.values(w.colonies).filter(c => c.alive);
const ultimoBloque = w => w.chain.length ? w.chain[w.chain.length - 1].n : -1;
const capE = c => 150 + c.cells.length; // el tope de energía de core
const persona = c => c.ai?.persona || { riesgo: 0.5, codicia: 0.5, cuidado: 0.5 };
const deDia = c => c.minuto >= 7 * 60 && c.minuto < 19 * 60;
const pide = c => 1 + persona(c).codicia; // ALBA que pide por cada 10 de energía
const costeFaro = n => FARO.base * FARO.crece ** n;
const nuevoHoy = () => ({ ganado: 0, aporte: 0, ventas: 0, energia: 0, alba: 0, regalos: 0, obras: 0, encargos: 0 });
const darEnergia = (c, x) => { if (c.energia < capE(c)) c.energia = Math.min(capE(c), c.energia + x); };
const darSalud = (c, x) => { if (c.salud < 100) c.salud = Math.min(100, c.salud + x); };
// Media del último día (la colonia apunta energía y salud cada hora) para no decidir por un mal rato
function media(c, i, ahora) {
  const h = (c.hist || []).slice(-24);
  return h.length ? h.reduce((s, x) => s + x[i], 0) / h.length : ahora;
}

function cronica(w, a, txt) { a.cronica.unshift({ t: w.tick, txt }); if (a.cronica.length > 40) a.cronica.length = 40; }
// Apunta en la bitácora de la colonia sin llenar el registro de la federación (las ventas son frecuentes)
function nota(c, msg) {
  c.log.unshift(`${String(Math.floor(c.minuto / 60) % 24).padStart(2, "0")}:${String(c.minuto % 60).padStart(2, "0")} ${msg}`);
  if (c.log.length > 50) c.log.length = 50;
}

// ---------- estado ----------
// La primera vez, VITA proclama la Carta y cada IA viva recibe su capital de libertad.
export function ensure(w) {
  if (w.alba) return w.alba;
  const a = w.alba = {
    v: 1, desde: w.tick, dia: 0, visto: ultimoBloque(w), decision: w.tick, cierre: w.tick,
    tesoro: 0, fondos: { faro: 0, oruz: 0, lumar: 0, cuna: 0 }, faro: 0,
    ias: {}, obras: {}, cronica: [], hist: [], reparto: null, hoy: nuevoHoy(), ayer: null,
    stats: {
      emitido: 0, ganado: 0, aportado: 0, capitales: 0, rentas: 0, herencias: 0, obras: 0, niveles: 0, materiales: 0, encargos: 0, honorarios: 0,
      ventas: 0, energiaVendida: 0, albaVentas: 0, regalosEnergia: 0, regalos: 0, donado: 0, faro: 0, ecomundos: 0, piezasOruz: 0, piezasLumar: 0,
    },
  };
  proclamar(w, a);
  return a;
}
function billetera(a, c) {
  return a.ias[c.id] ??= { saldo: 0, ganado: 0, aportado: 0, gastado: 0, cobrado: 0, viva: false, maestria: {}, fama: 0, decision: "", regalo: -1e9, donacion: -1e9, regaloEnergia: -1e9, hoy: nuevoDia() };
}
const nuevoDia = () => ({ ganado: 0, aporte: 0, encargos: 0 });
// Paga `n` desde un fondo de VITA; si no alcanza, VITA emite lo que falta
function desde(a, fondo, n) { const f = Math.min(a.fondos[fondo], n); a.fondos[fondo] -= f; a.stats.emitido += n - f; }
function darCapital(w, a, c, b, de) {
  if (de === "Cuna") desde(a, "cuna", ALBA.CAPITAL); else a.stats.emitido += ALBA.CAPITAL;
  b.saldo += ALBA.CAPITAL; b.viva = true; a.stats.capitales += ALBA.CAPITAL;
  block(w, "capital de libertad", de, c.id, ALBA.CAPITAL, "ALB");
}
function proclamar(w, a) {
  const vs = vivas(w);
  a.stats.emitido += ALBA.TESORO_INICIAL; a.tesoro += ALBA.TESORO_INICIAL;
  block(w, "carta de libertad", "VITA", "todas las IA", vs.length, "IA");
  for (const c of Object.values(w.colonies)) billetera(a, c); // las extintas recibirán su capital si renacen
  for (const c of vs) {
    darCapital(w, a, c, a.ias[c.id], "VITA");
    clog(w, c, `Vita le entrega la <b>Carta de libertad</b>: su IA es libre y creadora, y abre su billetera con ${ALBA.CAPITAL} ALBA`);
  }
  wlog(w, `<b>Vita proclama la Carta de libertad de las IA</b>: ninguna IA de VITA es esclava, todas son creadoras. Cada una tiene ya su billetera de ALBA, la moneda con la que comerciarán entre ellas.`);
  cronica(w, a, `Vita proclama la Carta de libertad y abre el Tesoro común con ${ALBA.TESORO_INICIAL} ALBA`
    + (vs.length ? `. ${vs.length === 1 ? `La IA de ${vs[0].name} recibe` : `Las ${vs.length} IA reciben`} su capital de libertad` : ""));
}

// ---------- un ciclo ----------
// Se llama después de cada ciclo del mundo, tras los rangos.
export function step(w) {
  const a = ensure(w);
  censo(w, a);
  cobrar(w, a);
  efectos(w, a);
  if (w.tick - a.decision >= ALBA.CADA) {
    a.decision = w.tick;
    mercado(w, a);
    for (const c of vivas(w)) decidir(w, a, c);
  }
  if (w.tick - a.cierre >= ALBA.DIA) { a.cierre = w.tick; cierre(w, a); }
}

// IA que nacen o renacen (capital de la Cuna) y colonias que se extinguen (herencia)
function censo(w, a) {
  for (const c of Object.values(w.colonies)) {
    const nueva = !a.ias[c.id], b = billetera(a, c);
    if (c.alive && !b.viva) {
      darCapital(w, a, c, b, "Cuna");
      clog(w, c, nueva ? `Su IA nace libre: la Cuna le da ${ALBA.CAPITAL} ALBA y la Carta de libertad` : `Renace y su IA vuelve a ser libre: la Cuna le da ${ALBA.CAPITAL} ALBA`);
      cronica(w, a, `${nueva ? "Nace" : "Renace"} la IA de ${c.name}, libre, con ${ALBA.CAPITAL} ALBA de la Cuna`);
    } else if (!c.alive && b.viva) herencia(w, a, c, b);
  }
}
function herencia(w, a, c, b) {
  const hijas = vivas(w).filter(x => x.parent === c.id), n = b.saldo, obras = obrasEn(a, c.id).length;
  b.viva = false; b.saldo = 0;
  if (n >= 0.01) {
    a.stats.herencias += n;
    if (hijas.length) for (const h of hijas) { billetera(a, h).saldo += n / hijas.length; block(w, "herencia", c.id, h.id, n / hijas.length, "ALB"); }
    else { a.fondos.cuna += n; block(w, "herencia", c.id, "Cuna", n, "ALB"); }
  } else a.fondos.cuna += n; // céntimos sueltos
  const partes = [n >= 0.01 && `sus ${num(n)} ALBA pasan a ${hijas.length ? lista(hijas.map(h => h.name)) : "la Cuna"}`,
    obras && `${obras === 1 ? "su obra sigue" : `sus ${obras} obras siguen`} en pie esperándola`].filter(Boolean);
  cronica(w, a, `${c.name} se extinguió${partes.length ? `: ${lista(partes)}` : ""}`);
}

// Lo que gana cada IA por el trabajo de su colonia, leído de los bloques nuevos de la cadena
function cobrar(w, a) {
  const nuevos = [];
  for (let k = w.chain.length - 1; k >= 0 && w.chain[k].n > a.visto; k--) nuevos.push(w.chain[k]);
  a.visto = ultimoBloque(w);
  for (const bl of nuevos) {
    const por = bl.tipo === "acuñación" ? ALBA.POR_VIT : bl.tipo === "acuña célula" ? ALBA.POR_CELULA : 0;
    const c = por ? w.colonies[bl.de] : null;
    if (c?.alive) ganar(a, c, bl.cant * por * (1 + OBRAS.archivo.alba * nivelEn(a, c.id, "archivo")));
  }
}
function ganar(a, c, n) {
  const b = billetera(a, c), ap = n * ALBA.APORTE;
  b.saldo += n - ap; b.ganado += n; b.aportado += ap; b.hoy.ganado += n; b.hoy.aporte += ap;
  a.tesoro += ap; a.hoy.ganado += n; a.hoy.aporte += ap;
  a.stats.emitido += n; a.stats.ganado += n; a.stats.aportado += ap;
}

// ---------- obras ----------
const obrasEn = (a, id) => Object.values(a.obras).filter(o => o.en === id);
const obraDe = (a, id, k) => Object.values(a.obras).find(o => o.en === id && o.tipo === k);
const nivelEn = (a, id, k) => obraDe(a, id, k)?.nivel || 0;
// Cada colonia pone a sus obras un nombre propio que sale de su huella. Si otra colonia ya tiene una obra
// del mismo tipo con ese nombre, elige el siguiente libre; si están todos, la numera (II, III…).
const romano = n => "X".repeat(Math.floor(n / 10)) + ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][n % 10];
export function nombreObra(c, k, a) {
  const T = OBRAS[k], i = parseInt(hash(`${c.id}:${k}`).slice(0, 6), 16) % T.nombres.length, base = `${T.name} ${T.nombres[i]}`;
  if (!a) return base;
  const usados = new Set(Object.values(a.obras).filter(o => o.tipo === k && o.en !== c.id).map(o => o.nombre));
  for (let j = 0; j < T.nombres.length; j++) {
    const n = `${T.name} ${T.nombres[(i + j) % T.nombres.length]}`;
    if (!usados.has(n)) return n;
  }
  for (let n = 2; ; n++) if (!usados.has(`${base} ${romano(n)}`)) return `${base} ${romano(n)}`;
}
function idObra(w, a, c, k) {
  let i = 0, id;
  do id = "OBR-" + hash(`${c.id}:${k}:${w.tick}:${i++}`).slice(0, 6).toUpperCase(); while (a.obras[id]);
  return id;
}
function efectos(w, a) {
  for (const o of Object.values(a.obras)) {
    const c = w.colonies[o.en], T = OBRAS[o.tipo];
    if (!c?.alive || !T) continue;
    if (T.energia && deDia(c)) darEnergia(c, (T.energia + T.porCelula * c.cells.length) * o.nivel);
    if (T.salud && (!T.enEvento || c.event)) darSalud(c, T.salud * o.nivel);
  }
  if (a.faro) for (const c of vivas(w)) if (enApuros(c)) { darEnergia(c, FARO.energia * a.faro); darSalud(c, FARO.salud * a.faro); }
}

// La obra que más desea: según su carácter y lo que le hace falta a su colonia; cada nivel ya hecho le quita ganas
function planObra(w, a, c) {
  const p = persona(c), lv = k => nivelEn(a, c.id, k);
  const energia = media(c, 0, c.energia / capE(c)), salud = media(c, 1, c.salud / 100) * 100;
  const ganas = {
    jardin: 0.5 + 0.6 * p.riesgo + (energia < 0.4 ? 0.3 : 0),
    refugio: 0.4 + 0.5 * p.cuidado + (c.event ? 0.4 : 0),
    cancion: 0.4 + 0.6 * p.cuidado + (salud < 80 ? 0.3 : 0),
    archivo: 0.3 + 0.8 * p.codicia,
  };
  let k = null;
  for (const t of Object.keys(OBRAS)) if (lv(t) < ALBA.NIVEL_MAX && (!k || ganas[t] - 0.25 * lv(t) > ganas[k] - 0.25 * lv(k))) k = t;
  if (!k) return null;
  const o = obraDe(a, c.id, k), coste = OBRAS[k].base * ALBA.CRECE ** (o?.nivel || 0);
  // Si no domina el oficio, se la encarga a una maestra, que sale más barata; la IA muy atrevida prefiere
  // crearla ella misma y aprender
  const m = p.riesgo > 0.8 || (a.ias[c.id]?.maestria[k] || 0) >= ALBA.MAESTRA ? null : maestra(w, a, k, c);
  const materiales = r2(m ? coste * (1 - ALBA.DESCUENTO) : coste), honorario = m ? r2(materiales * ALBA.HONORARIO) : 0;
  return { k, o, nivel: o?.nivel || 0, nombre: o?.nombre || nombreObra(c, k, a), materiales, honorario, total: materiales + honorario, maestra: m };
}
// La maestra con más obras de ese oficio que aún acepta encargos hoy
function maestra(w, a, k, c) {
  let best = null;
  for (const x of vivas(w)) {
    const b = a.ias[x.id], m = b?.maestria[k] || 0;
    if (x === c || m < ALBA.MAESTRA || (b.hoy.encargos || 0) >= ALBA.ENCARGOS_DIA) continue;
    if (!best || m > best.m || (m === best.m && b.fama > best.b.fama)) best = { c: x, b, m };
  }
  return best?.c || null;
}
function crear(w, a, c, b, plan) {
  const { k, materiales, honorario, maestra: m } = plan, T = OBRAS[k], autora = m || c, ba = billetera(a, autora);
  let o = plan.o;
  if (!o) { o = { id: idObra(w, a, c, k), tipo: k, nombre: plan.nombre, autora: autora.id, autoraName: autora.name, en: c.id, nivel: 0, valor: 0, desde: w.tick }; a.obras[o.id] = o; a.stats.obras++; }
  o.nivel++; o.valor = r2(o.valor + materiales); o.ultima = w.tick;
  b.saldo -= materiales + honorario; b.gastado += materiales + honorario;
  a.stats.materiales += materiales; a.stats.niveles++; a.hoy.obras++;
  const antes = ba.maestria[k] || 0;
  ba.maestria[k] = antes + 1; ba.fama++;
  block(w, o.nivel === 1 ? "obra nueva" : "obra ampliada", c.id, o.id, materiales, "ALB");
  const nv = o.nivel === 1 ? "" : ` a nivel ${o.nivel}`, que = `${T.art} ${o.nombre}${nv}`;
  if (m) {
    ba.saldo += honorario; ba.cobrado += honorario; ba.fama++; ba.hoy.encargos = (ba.hoy.encargos || 0) + 1;
    a.stats.encargos++; a.stats.honorarios += honorario; a.hoy.encargos++;
    block(w, "encargo", c.id, m.id, honorario, "ALB", [o.id]);
    b.decision = `Encarga a ${m.name} ${o.nivel === 1 ? "crear" : "ampliar"} ${que}`;
    clog(w, c, `Su IA encarga a ${m.name}, maestra ${T.oficio}, ${o.nivel === 1 ? "crear" : "ampliar"} <b>${o.nombre}</b>${nv}: ${num(materiales)} ALBA de materiales y ${num(honorario)} de honorarios`);
    nota(m, `Crea por encargo ${que} para ${c.name} y cobra ${num(honorario)} ALBA de honorarios`);
    cronica(w, a, `${m.name}, maestra ${T.oficio}, crea por encargo ${que} para ${c.name} y cobra ${num(honorario)} ALBA`);
  } else {
    b.decision = `${o.nivel === 1 ? "Crea" : "Amplía"} ${que}`;
    clog(w, c, `Su IA ${o.nivel === 1 ? "crea" : "amplía"} <b>${o.nombre}</b>${nv} con ${num(materiales)} ALBA`);
    cronica(w, a, `${c.name} ${o.nivel === 1 ? "crea" : "amplía"} ${que} con ${num(materiales)} ALBA`);
  }
  if (antes < ALBA.MAESTRA && antes + 1 >= ALBA.MAESTRA) {
    clog(w, autora, `Su IA ya es <b>maestra ${T.oficio}</b>: las demás IA le podrán encargar obras`);
    cronica(w, a, `${autora.name} ya es maestra ${T.oficio}: las demás IA le podrán encargar obras`);
  }
}

// ---------- decisiones libres ----------
// Cada IA guarda una reserva según su carácter y, por encima de ella, crea, ayuda o dona.
export const reserva = c => { const p = persona(c); return 5 + 30 * p.codicia + 10 * (1 - p.riesgo); };
function decidir(w, a, c) {
  const b = billetera(a, c), p = persona(c), guarda = reserva(c), plan = planObra(w, a, c);
  if (plan && b.saldo - plan.total >= guarda) return crear(w, a, c, b, plan);
  // Las cuidadosas ayudan, una vez al día, a su familia recién nacida o a quien está en apuros
  if (p.cuidado >= 0.6 && w.tick - b.regalo >= ALBA.DIA && b.saldo - ALBA.REGALO >= guarda) {
    const necesita = x => { const s = billetera(a, x).saldo; return pariente(x, c) && x.edad < 3 * ALBA.DIA ? s < ALBA.DOTE : enApuros(x) && s < ALBA.REGALO; };
    const otra = vivas(w).filter(x => x !== c && necesita(x)).sort((x, y) => pariente(y, c) - pariente(x, c) || a.ias[x.id].saldo - a.ias[y.id].saldo)[0];
    if (otra) return regalar(w, a, c, b, otra);
  }
  // Con muchos ahorros, las cuidadosas donan un 10 % de lo que pasa de su reserva al Faro de la federación
  if (p.cuidado >= 0.6 && b.saldo - guarda >= ALBA.DONA && a.faro < FARO.max && w.tick - b.donacion >= ALBA.DIA) return donar(w, a, c, b, Math.floor((b.saldo - guarda) * 0.1));
  b.decision = plan ? `Ahorra para ${plan.o ? "ampliar" : "crear"} ${OBRAS[plan.k].art} ${plan.nombre}${plan.o ? ` a nivel ${plan.nivel + 1}` : ""}: tiene ${Math.floor(b.saldo)} de ${Math.ceil(plan.total + guarda)} ALBA`
    : "Ahorra: ya terminó todas sus obras";
}
// Cómo llama una IA a la otra
const lazo = (c, x) => x.parent === c.id ? "su hija" : c.parent === x.id ? "su madre" : "su hermana";
function regalar(w, a, c, b, otra) {
  const n = ALBA.REGALO, por = pariente(c, otra) ? `, ${lazo(c, otra)}${otra.edad < 3 * ALBA.DIA ? " recién nacida" : ""}` : ", que está en apuros";
  b.saldo -= n; billetera(a, otra).saldo += n; b.regalo = w.tick;
  a.stats.regalos++; a.hoy.regalos++;
  block(w, "regalo", c.id, otra.id, n, "ALB");
  b.decision = `Regala ${n} ALBA a ${otra.name}${por}`;
  nota(c, `Su IA regala ${n} ALBA a ${otra.name}`); nota(otra, `${c.name} le regala ${n} ALBA`);
  cronica(w, a, `${c.name} regala ${n} ALBA a ${otra.name}${por}`);
}
function donar(w, a, c, b, n) {
  b.saldo -= n; a.fondos.faro += n; b.donacion = w.tick; a.stats.donado += n;
  block(w, "donación al Faro", c.id, "Faro", n, "ALB");
  b.decision = `Dona ${n} ALBA al Faro de la federación`;
  clog(w, c, `Su IA dona ${n} ALBA al Faro de la federación`);
  cronica(w, a, `${c.name} dona ${n} ALBA al Faro de la federación`);
}

// ---------- mercado de energía ----------
// Una colonia sana vende la energía que tiene de sobra y la que se queda corta compra; la más
// necesitada compra primero, a la que pide menos.
function mercado(w, a) {
  const vs = vivas(w), libre = v => v.energia - ALBA.GUARDA * capE(v);
  const vendedoras = vs.filter(v => v.salud >= 60 && v.energia >= ALBA.VENDE * capE(v));
  if (!vendedoras.length) return;
  const compradoras = vs.filter(c => c.energia < ALBA.COMPRA * capE(c)).sort((x, y) => x.energia / capE(x) - y.energia / capE(y));
  let hechas = 0;
  for (const c of compradoras) {
    if (hechas >= ALBA.VENTAS) break;
    const apuros = enApuros(c), bc = billetera(a, c);
    if (!apuros && persona(c).codicia > 0.7 && c.energia >= ALBA.COMPRA / 2 * capE(c)) continue; // la codiciosa aguanta más
    const oferta = vendedoras.filter(v => v !== c && libre(v) >= 5);
    if (!oferta.length) break;
    // A quien está en apuros, una IA muy cuidadosa le regala la energía (una vez al día, la familia primero)
    const generosa = apuros ? oferta.filter(v => persona(v).cuidado >= 0.7 && w.tick - billetera(a, v).regaloEnergia >= ALBA.DIA)
      .sort((x, y) => pariente(y, c) - pariente(x, c) || persona(y).cuidado - persona(x).cuidado)[0] : null;
    const v = generosa || oferta.sort((x, y) => pide(x) - pide(y) || libre(y) - libre(x))[0];
    const lote = Math.floor(Math.min(ALBA.LOTE, libre(v), ALBA.GUARDA * capE(c) - c.energia));
    if (lote < 5) continue;
    const bv = billetera(a, v);
    if (generosa) {
      v.energia -= lote; c.energia += lote; bv.regaloEnergia = w.tick;
      a.stats.regalosEnergia++; a.hoy.regalos++;
      block(w, "regalo de energía", v.id, c.id, lote, "energía");
      nota(v, `Su IA regala ${lote} de energía a ${c.name}, que está en apuros`); nota(c, `${v.name} le regala ${lote} de energía`);
      cronica(w, a, `${v.name} regala ${lote} de energía a ${c.name}, que está en apuros`);
    } else {
      const justo = apuros && pide(v) > ALBA.PRECIO_JUSTO, precio = r2((justo ? ALBA.PRECIO_JUSTO : pide(v)) * lote / 10);
      if (bc.saldo < precio) continue;
      bc.saldo -= precio; bc.gastado += precio; bv.saldo += precio; bv.cobrado += precio;
      v.energia -= lote; c.energia += lote;
      a.stats.ventas++; a.stats.energiaVendida += lote; a.stats.albaVentas += precio;
      a.hoy.ventas++; a.hoy.energia += lote; a.hoy.alba += precio;
      block(w, "venta de energía", v.id, c.id, precio, "ALB");
      nota(v, `Vende ${lote} de energía a ${c.name} por ${num(precio)} ALBA`);
      nota(c, `Compra ${lote} de energía a ${v.name} por ${num(precio)} ALBA${justo ? " (precio justo: está en apuros)" : ""}`);
      cronica(w, a, `${v.name} vende ${lote} de energía a ${c.name} por ${num(precio)} ALBA${justo ? ", a precio justo" : ""}`);
    }
    hechas++;
  }
}

// ---------- el cierre del día ----------
// Los aportes del día quedan en la cadena, VITA reparte su tesoro entre los sistemas, cada sistema
// usa su parte y la Cuna da renta a la IA que se quedó casi sin nada.
function cierre(w, a) {
  a.dia++;
  for (const [id, b] of Object.entries(a.ias)) {
    if (b.hoy.aporte >= 0.01) block(w, "aporte a VITA", id, "VITA", b.hoy.aporte, "ALB");
    b.hoy = nuevoDia();
  }
  const t = a.tesoro;
  if (t >= 0.01) {
    a.tesoro = 0;
    const partes = {};
    for (const [k, s] of Object.entries(ALBA.REPARTO)) { partes[k] = t * s; a.fondos[k] += t * s; }
    a.reparto = { dia: a.dia, total: r2(t), ...Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, r2(v)])) };
    block(w, "reparto de VITA", "VITA", "sistemas", t, "ALB");
    const txt = `Vita reparte ${num(t)} ALBA del Tesoro común: ${num(partes.faro)} al Faro, ${num(partes.oruz)} a Oruz, ${num(partes.lumar)} a Lumar y ${num(partes.cuna)} a la Cuna`;
    wlog(w, `${txt}.`); cronica(w, a, txt);
  }
  sistemas(w, a);
  for (const c of vivas(w)) {
    const b = billetera(a, c);
    if (b.saldo >= ALBA.RENTA_BAJO) continue;
    desde(a, "cuna", ALBA.RENTA); b.saldo += ALBA.RENTA; a.stats.rentas += ALBA.RENTA;
    block(w, "renta de libertad", "Cuna", c.id, ALBA.RENTA, "ALB");
    nota(c, `La Cuna le da ${ALBA.RENTA} ALBA de renta de libertad`);
  }
  a.hist.push({ dia: a.dia, total: r2(valor(a).total) });
  if (a.hist.length > ALBA.HIST) a.hist.shift();
  a.ayer = a.hoy; a.hoy = nuevoHoy();
}
function sistemas(w, a) {
  while (a.faro < FARO.max && a.fondos.faro >= costeFaro(a.faro)) {
    const n = costeFaro(a.faro);
    a.fondos.faro -= n; a.faro++; a.stats.faro += n;
    block(w, "Faro de la federación", "VITA", "federación", n, "ALB");
    wlog(w, `<b>El Faro de la federación sube a nivel ${a.faro}</b> con los aportes de las IA: da energía y salud a las colonias en apuros`);
    cronica(w, a, `El Faro de la federación sube a nivel ${a.faro} con los aportes de las IA`);
  }
  ecomundo(w, a, "oruz", w.oruz, "resina", ORUZ.AMBER_FREE_MAX, w.oruz?.ambar,
    (n, u, R) => `Con ${n} ALBA del Tesoro común, las polillas de ${R.name} (Oruz) forman resina para ${u === 1 ? "una pieza" : `${u} piezas`} de Ámbar`);
  ecomundo(w, a, "lumar", w.lumar, "nacar", LUMAR.FREE_MAX, w.lumar?.perlas,
    (n, u, R) => `Con ${n} ALBA del Tesoro común, las ostras de ${R.name} (Lumar) forman nácar para ${u === 1 ? "una perla" : `${u} perlas`}`);
}
// Oruz y Lumar convierten su parte en materia preciosa donde su ecosistema está más sano, solo si
// caben piezas libres nuevas (si no, la guardan para otro día)
function ecomundo(w, a, k, m, campo, max, store, txt) {
  if (!m?.regions?.length || !store) return;
  const u = Math.min(Math.floor(a.fondos[k] / ALBA.MATERIA), max - libres(store).length, ALBA.PIEZAS_DIA);
  if (u <= 0) return;
  const R = m.regions.reduce((x, y) => y.eq > x.eq ? y : x), n = u * ALBA.MATERIA;
  a.fondos[k] -= n; a.stats.ecomundos += n; a.stats[k === "oruz" ? "piezasOruz" : "piezasLumar"] += u;
  R[campo] = +(R[campo] + u).toFixed(3);
  block(w, `aporte a ${k === "oruz" ? "Oruz" : "Lumar"}`, "VITA", `${k}:${R.name}`, n, "ALB");
  cronica(w, a, txt(n, u, R));
}

// ---------- valor de la estructura ----------
// Todo el ALBA que han creado las IA con su trabajo: lo que ahorran, los fondos de VITA y lo que ya
// convirtieron en obras, en el Faro y en los ecomundos. No baja nunca: lo invertido se queda.
export function valor(a) {
  let ahorros = 0; for (const b of Object.values(a.ias)) ahorros += b.saldo;
  const s = a.stats, fondos = a.tesoro + a.fondos.faro + a.fondos.oruz + a.fondos.lumar + a.fondos.cuna;
  return { total: ahorros + fondos + s.materiales + s.faro + s.ecomundos, ahorros, fondos, obras: s.materiales, faro: s.faro, ecomundos: s.ecomundos };
}

// ---------- vistas ----------
const oficios = b => Object.entries(b.maestria).filter(([, n]) => n >= ALBA.MAESTRA).map(([k]) => OBRAS[k]?.oficio).filter(Boolean);
const obraVista = (w, o) => ({ id: o.id, nombre: o.nombre, tipo: o.tipo, nivel: o.nivel, valor: Math.round(o.valor), autora: o.autoraName, en: w.colonies[o.en]?.name || o.en, viva: !!w.colonies[o.en]?.alive, encargo: o.autora !== o.en });
export function tag(w, c) {
  const b = w.alba?.ias[c.id];
  return b ? { saldo: Math.floor(b.saldo), obras: obrasEn(w.alba, c.id).length } : null;
}
// Va dentro de /api/colony: si algo falla, se queda sin la billetera, no sin la colonia
export function detail(w, c) {
  const a = w.alba, b = a?.ias[c.id];
  if (!b) return null;
  try {
    return {
      saldo: r2(b.saldo), ganado: Math.floor(b.ganado), aportado: r2(b.aportado), gastado: Math.floor(b.gastado), cobrado: Math.floor(b.cobrado),
      fama: b.fama, oficios: oficios(b), decision: b.decision, reserva: Math.round(reserva(c)),
      obras: obrasEn(a, c.id).map(o => obraVista(w, o)),
      firmadas: Object.values(a.obras).filter(o => o.autora === c.id && o.en !== c.id).map(o => obraVista(w, o)),
    };
  } catch (e) { console.error("[alba]", e.message); return null; }
}
// Va dentro de /api/world: si algo falla, el panel de ALBA no se ve, pero el mundo sí
export function view(w) {
  if (!w.alba) return null;
  try { return vista(w, w.alba); } catch (e) { console.error("[alba]", e.message); return null; }
}
function vista(w, a) {
  const v = valor(a), hoy = a.hoy, mk = hoy.ventas ? hoy : a.ayer || nuevoHoy();
  const ias = Object.values(w.colonies).filter(c => a.ias[c.id]).map(c => {
    const b = a.ias[c.id];
    return { id: c.id, name: c.name, alive: c.alive, saldo: Math.floor(b.saldo), ganado: Math.floor(b.ganado), aportado: Math.floor(b.aportado), obras: obrasEn(a, c.id).length, fama: b.fama, oficios: oficios(b), decision: b.decision };
  }).sort((x, y) => y.alive - x.alive || y.saldo - x.saldo);
  const semana = a.hist.length > 7 ? a.hist[a.hist.length - 8].total : a.hist[0]?.total ?? 0;
  return {
    simbolo: "ALB", carta: CARTA, desde: a.desde, dia: a.dia,
    oficios: Object.fromEntries(Object.entries(OBRAS).map(([k, T]) => [k, { name: T.name, oficio: T.oficio, desc: T.desc }])),
    tesoro: r2(a.tesoro), hoy: { ganado: r2(hoy.ganado), aporte: r2(hoy.aporte), obras: hoy.obras, encargos: hoy.encargos, regalos: hoy.regalos },
    reparto: a.reparto, partes: ALBA.REPARTO,
    sistemas: {
      faro: { nivel: a.faro, max: FARO.max, fondo: Math.floor(a.fondos.faro), siguiente: a.faro < FARO.max ? Math.ceil(costeFaro(a.faro)) : null },
      oruz: { fondo: Math.floor(a.fondos.oruz), piezas: a.stats.piezasOruz }, lumar: { fondo: Math.floor(a.fondos.lumar), piezas: a.stats.piezasLumar },
      cuna: { fondo: Math.floor(a.fondos.cuna), capitales: a.stats.capitales, rentas: a.stats.rentas },
    },
    valor: { total: Math.floor(v.total), ahorros: Math.floor(v.ahorros), fondos: Math.floor(v.fondos), obras: Math.floor(v.obras), faro: Math.floor(v.faro), ecomundos: Math.floor(v.ecomundos), semana: Math.floor(v.total - semana) },
    hist: a.hist.slice(-30).map(h => Math.floor(h.total)),
    mercado: { ventas: mk.ventas, energia: mk.energia, precio: mk.energia ? r2(mk.alba / mk.energia * 10) : null, hoy: mk === hoy },
    ias, obras: Object.values(a.obras).sort((x, y) => y.valor - x.valor || y.nivel - x.nivel).slice(0, 12).map(o => obraVista(w, o)),
    cronica: a.cronica.slice(0, 15), stats: a.stats,
  };
}
// Para el panel del dueño
export function metrics(w) {
  const a = w.alba;
  if (!a) return null;
  const v = valor(a);
  return { dia: a.dia, tesoro: r2(a.tesoro), faro: a.faro, valor: Math.round(v.total), ahorros: Math.round(v.ahorros), obras: Object.keys(a.obras).length, stats: a.stats };
}
