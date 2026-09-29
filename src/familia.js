// La familia VITA: el árbol genealógico de las colonias, las cartas que se escriben y el diario de Vita.
// · Árbol: quién nació de quién, generación tras generación, quién renació gracias a quién (su madrina)
//   y qué parentesco tienen dos colonias cualesquiera.
// · Cartas: las colonias se escriben cuando nace una hija, cuando alguien las ayuda, cuando una se apaga
//   o renace, en sus cumpleaños y cuando pasan apuros; si una pariente puede, le manda VIT de su tesoro.
//   También escriben al jugador que las cuida, y Vita les escribe cuando el consejo las asciende o sanciona.
// · Diario: cada noche, a las 23:00 del juego, Vita escribe lo que vivió la familia ese día.
// Lee en la cadena lo que pasó (fundaciones, rescates, ayudas, colectas, rangos y graduaciones) y solo
// mueve VIT de un tesoro a otro, sin acuñar ni quemar. Todo el estado vive en `world.familia`; aquí no hay E/S.
import { CONFIG, EVENTS, UPGRADES, HABITS, block, clog } from "./core.js";

export const FAMILIA = {
  DIA: 144,              // ciclos de un día del juego
  CADA: 6,               // cada hora mira cumpleaños, apuros y cartas pendientes
  CARTAS: 150,           // cartas entre colonias que se guardan
  BUZON: 8,              // cartas que guarda cada jugador
  BUZON_DIAS: 7,         // las cartas a jugadores se borran a la semana
  BUZON_TOTAL: 2000,     // y entre todos los jugadores se guardan como mucho estas
  NOCHES: 45,            // entradas del diario que se guardan
  HORA: 23 * 60,         // Vita escribe su diario a las 23:00 del juego
  APURO_SALUD: 45,       // con menos salud que esto una colonia pide ayuda a su familia
  APURO_TESORO: 25,      // o con el tesoro casi vacío en plena sequía, helada o plaga
  DA_SALUD: 60, DA_TESORO: 200, // para ayudar hay que estar sana y tener tesoro
  PARTE: 0.05, MIN: 5, MAX: 25, // lo que manda: un 5 % de su tesoro, entre 5 y 25 VIT
  PIDE_CADA: 72,         // una colonia pide ayuda como mucho cada 12 horas
  DA_CADA: 36,           // y una pariente da como mucho cada 6 horas
  ESPERA: 0.7,           // al 70 % de lo que hace falta para fundar, escribe a la hija que vendrá
  CUMPLES: [1, 7, 14, 21, 30, 365], // y a partir del mes, cada 30 días
};
export const VITA = { id: "VITA", name: "Vita" };
const FIRMA_VITA = "Vita\nCEO de la colonia";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const vivas = w => Object.values(w.colonies).filter(c => c.alive);
const ultimoBloque = w => w.chain.length ? w.chain[w.chain.length - 1].n : -1;
const quien = c => ({ id: c.id, name: c.name });
const diasDe = (w, c) => Math.max(0, Math.floor((w.tick - (c.createdTick || 0)) / FAMILIA.DIA));
const enumera = l => l.length > 1 ? `${l.slice(0, -1).join(", ")} y ${l.at(-1)}` : l[0] || "";
const cuenta = (n, uno, varios) => n === 1 ? uno : `${n} ${varios}`;
// Cada carta elige su variante con su número de serie: el mismo mundo escribe siempre lo mismo
function pick(list, key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return list[(h >>> 0) % list.length];
}

// ---------- el árbol ----------
const madreDe = (w, c) => (c?.parent && w.colonies[c.parent]) || null;
// La colonia y sus antepasadas: [ella, su madre, su abuela, ...]
export function linea(w, c) {
  const l = [], vistas = new Set();
  for (let x = c; x && !vistas.has(x.id); x = madreDe(w, x)) { l.push(x); vistas.add(x.id); }
  return l;
}
// [pasos de `a` hasta la antepasada común, pasos de `b`] → lo que `b` es para `a`
const NOMBRES = {
  "1,0": "madre", "2,0": "abuela", "3,0": "bisabuela", "4,0": "tatarabuela",
  "0,1": "hija", "0,2": "nieta", "0,3": "bisnieta", "0,4": "tataranieta",
  "1,1": "hermana", "2,1": "tía", "1,2": "sobrina", "2,2": "prima",
  "3,1": "tía abuela", "1,3": "sobrina nieta", "3,2": "tía segunda", "2,3": "sobrina segunda", "3,3": "prima segunda",
};
const CERCANIA = { madre: 1, hija: 1, hermana: 2, madrina: 2, ahijada: 2, abuela: 3, nieta: 3, tía: 4, sobrina: 4, prima: 5 };
// Orden en que se presenta la familia de una colonia: primero las mayores, después las hermanas y las hijas
const ORDEN = ["madre", "abuela", "bisabuela", "tatarabuela", "antepasada", "hermana", "madrina", "hija", "ahijada", "nieta", "bisnieta", "tataranieta", "descendiente", "tía", "tía abuela", "tía segunda", "sobrina", "sobrina nieta", "sobrina segunda", "prima", "prima segunda", "prima lejana"];
const orden = rel => { const i = ORDEN.indexOf(rel.split(" y ")[0]); return i < 0 ? ORDEN.length : i; };
export function parentesco(w, a, b) {
  if (!a || !b || a === b) return null;
  const la = linea(w, a), pos = new Map(linea(w, b).map((c, i) => [c.id, i]));
  const i = la.findIndex(c => pos.has(c.id));
  if (i < 0) return null;
  const j = pos.get(la[i].id);
  return NOMBRES[`${i},${j}`] || (i === 0 ? "descendiente" : j === 0 ? "antepasada" : "prima lejana");
}
// Todas las relaciones de `b` para `a`: la de sangre y la de madrina (quien le dio células para renacer)
function relaciones(w, a, b) {
  const L = w.familia?.linaje || {}, r = [parentesco(w, a, b)];
  if (L[a.id]?.madrinas?.includes(b.id)) r.push("madrina");
  if (L[b.id]?.madrinas?.includes(a.id)) r.push("ahijada");
  return r.filter(Boolean);
}
const cercania = (w, a, b) => Math.min(99, ...relaciones(w, a, b).map(r => CERCANIA[r] ?? 9));

export function parientes(w, c) {
  return Object.values(w.colonies).filter(x => x !== c)
    .map(x => { const r = relaciones(w, c, x); return r.length ? { id: x.id, name: x.name, rel: r.join(" y "), alive: x.alive, cerca: cercania(w, c, x) } : null; })
    .filter(Boolean).sort((a, b) => orden(a.rel) - orden(b.rel) || b.alive - a.alive || a.name.localeCompare(b.name));
}

export function arbol(w, u) {
  const F = ensure(w), cols = Object.values(w.colonies), hijas = {}, mias = new Set();
  for (const c of cols) if (madreDe(w, c)) (hijas[c.parent] ||= []).push(c.id);
  if (u) for (const c of cols) if (c.cells.some(x => x.owner === u.id)) mias.add(c.id);
  const descendientes = id => {
    let n = 0; const pila = [...(hijas[id] || [])], vistas = new Set([id]);
    while (pila.length) { const h = pila.pop(); if (vistas.has(h)) continue; vistas.add(h); n++; pila.push(...(hijas[h] || [])); }
    return n;
  };
  const nodos = cols.sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0) || a.id.localeCompare(b.id)).map(c => {
    const L = F.linaje[c.id] || {};
    return {
      id: c.id, name: c.name, madre: madreDe(w, c) ? c.parent : null, gen: linea(w, c).length, alive: c.alive,
      dias: diasDe(w, c), hijas: (hijas[c.id] || []).length, descendientes: descendientes(c.id),
      vidas: L.vidas || 1, madrinas: (L.madrinas || []).filter(id => w.colonies[id]), mia: mias.has(c.id),
      cells: c.cells.length, salud: Math.round(c.salud), causa: c.alive ? "" : c.cause || "",
    };
  });
  return { nodos, generaciones: Math.max(0, ...nodos.map(n => n.gen)), vivas: nodos.filter(n => n.alive).length };
}

// La colonia viva más cerca de fundar a su próxima hija, y cuánto le falta
const lista = c => clamp(Math.min(c.treasury / CONFIG.FOUND_TREASURY, c.cells.length / CONFIG.FOUND_CELLS), 0, 1);
export function proxima(w) {
  const vs = vivas(w);
  if (vs.length >= CONFIG.MAX_COLONIES) return { lleno: true, max: CONFIG.MAX_COLONIES };
  const c = vs.sort((a, b) => lista(b) - lista(a) || (a.createdTick || 0) - (b.createdTick || 0))[0];
  if (!c) return null;
  return {
    id: c.id, name: c.name, pct: Math.round(lista(c) * 100), hijas: Object.values(w.colonies).filter(x => x.parent === c.id).length,
    tesoro: Math.max(0, Math.floor(c.treasury)), tesoroMeta: CONFIG.FOUND_TREASURY, celulas: c.cells.length, celulasMeta: CONFIG.FOUND_CELLS,
    salud: Math.round(c.salud), saludMeta: 60,
  };
}

// ---------- estado ----------
const nuevoDia = () => ({ eventos: [], jugadores: {}, dio: {}, cartas: 0 });
export function ensure(w) {
  const F = (w.familia ??= { v: 1, visto: ultimoBloque(w), inicio: null, revision: null, serial: 0, noches: 0, ultimaNoche: null });
  F.vivas ??= {}; F.linaje ??= {}; F.cartas ??= []; F.buzon ??= {}; F.enviadas ??= {}; F.pidio ??= {}; F.dio ??= {};
  F.diario ??= []; F.hoy ??= nuevoDia();
  F.stats ??= { cartas: 0, privadas: 0, ayudas: 0, vitAyudas: 0 };
  for (const c of Object.values(w.colonies)) if (!F.linaje[c.id]) conocer(w, F, c);
  F.foto ??= foto(w);
  return F;
}
// Las colonias que ya vivían cuando llegó la familia empiezan su historia hoy
function conocer(w, F, c) {
  F.linaje[c.id] = { madre: c.parent || null, vidas: 1, madrinas: [], apagadas: [], cumple: diasDe(w, c), espera: null };
  F.vivas[c.id] = c.alive;
  return F.linaje[c.id];
}

// ---------- cartas ----------
// El carácter de su IA marca cómo escribe cada colonia
export function tono(c) {
  const p = c?.ai?.persona;
  if (!p) return "serena";
  const [k, v] = [["tierna", p.cuidado], ["practica", p.codicia], ["audaz", p.riesgo]].sort((a, b) => b[1] - a[1])[0];
  return v >= 0.6 ? k : "serena";
}
const SALUDO = { tierna: n => `Querida ${n}:`, practica: n => `${n}:`, audaz: n => `¡Hola, ${n}!`, serena: n => `Hola, ${n}:` };
const DESPEDIDA = {
  tierna: ["Con todo mi cariño,", "Un abrazo de savia,", "Te quiero mucho,"],
  practica: ["Cuentas claras,", "Hasta pronto,", "Seguimos,"],
  audaz: ["¡A por más!", "¡Nos vemos arriba!", "Con fuerza,"],
  serena: ["Un abrazo,", "Con cariño,", "Hasta pronto,"],
};
const firma = (c, key) => `${pick(DESPEDIDA[tono(c)], key)}\n${c.name}`;

function carta(w, F, { tipo, de, a, asunto, saludo, texto, firma: f, vit = 0, privada = false, now = Date.now() }) {
  const n = ++F.serial;
  const k = { id: "CAR-" + String(n).padStart(5, "0"), n, t: w.tick, at: now, tipo, de: de.id, deName: de.name, a: a.id, aName: a.name, asunto, saludo, texto, firma: f };
  if (vit) k.vit = vit;
  if (privada) {
    const l = (F.buzon[a.id] ||= []);
    l.unshift(k); if (l.length > FAMILIA.BUZON) l.length = FAMILIA.BUZON;
    F.stats.privadas++;
    return k;
  }
  F.cartas.unshift(k); if (F.cartas.length > FAMILIA.CARTAS) F.cartas.length = FAMILIA.CARTAS;
  F.stats.cartas++; F.hoy.cartas++;
  const dest = w.colonies[a.id];
  if (dest) clog(w, dest, `Carta de ${de.name}: «${asunto}»`);
  return k;
}
// Una carta de cada tipo entre las mismas dos, como mucho una vez cada `cada` ciclos
function puede(w, F, clave, cada = FAMILIA.DIA) {
  const t = F.enviadas[clave];
  if (t != null && w.tick - t < cada) return false;
  F.enviadas[clave] = w.tick;
  return true;
}
// Carta de una colonia a otra, con el saludo y la despedida de su carácter
function escribe(w, F, de, a, tipo, asunto, texto, extra = {}) {
  const key = `${tipo}:${F.serial + 1}`;
  return carta(w, F, { tipo, de: quien(de), a: quien(a), asunto, saludo: SALUDO[tono(de)](a.name), texto, firma: firma(de, key), ...extra });
}
const deVita = (w, F, a, tipo, asunto, texto, now) => carta(w, F, { tipo, de: VITA, a: quien(a), asunto, saludo: `Querida ${a.name}:`, texto, firma: FIRMA_VITA, now });
function anotar(F, e) { if (F.hoy.eventos.length < 40) F.hoy.eventos.push(e); }
const dio = (F, id, n = 1) => { F.hoy.dio[id] = (F.hoy.dio[id] || 0) + n; };

const GRACIAS = {
  tierna: ["Nunca lo voy a olvidar.", "Me salvaste, de verdad."],
  practica: ["Te lo devolveré en cuanto pueda.", "Tomo nota: te debo una."],
  audaz: ["¡Te debo una grande!", "¡Contigo cerca no hay helada que me pare!"],
  serena: ["Gracias, de verdad.", "Me quedo más tranquila sabiendo que estás ahí."],
};
const graciasDe = (c, key) => pick(GRACIAS[tono(c)], key);
const CONSEJO_HIJA = {
  tierna: "Lo primero es tu salud: de noche descansa y repara a tus células.",
  practica: "Cuida tu tesoro: con 400 VIT y 150 células podrás fundar a tu propia hija.",
  audaz: "No tengas miedo de crecer: las colonias valientes llenan su territorio antes.",
  serena: "Mira siempre la luz antes de decidir: de día se recolecta y de noche se descansa.",
};
const CONSEJO_APURO = {
  sequia: "Mientras dure la sequía, repara más y recolecta cuando salga el sol.",
  helada: "Con la helada, guarda energía y no crezcas hasta que pase.",
  plaga: "Contra la plaga, un escudo biológico ayuda mucho.",
};
const eventoMalo = c => c.event && c.event !== "floracion" ? c.event : null;

// Nace una hija: su madre le da la bienvenida y su hermana mayor se presenta
function nace(w, F, madre, hija, now) {
  const L = F.linaje[hija.id] || conocer(w, F, hija), LM = F.linaje[madre.id] || conocer(w, F, madre);
  L.madre = madre.id; F.vivas[hija.id] = hija.alive;
  const hermanas = vivas(w).filter(c => c.parent === madre.id && c !== hija);
  const primera = !Object.values(w.colonies).some(c => c.parent === madre.id && c !== hija);
  // La carta que la madre le escribió antes de que naciera llega por fin a su destinataria
  const espera = LM.espera && LM.espera !== "entregada" ? F.cartas.find(k => k.id === LM.espera && !k.a) : null;
  if (espera) { espera.a = hija.id; espera.aName = hija.name; espera.entregada = w.tick; }
  if (LM.espera) LM.espera = "entregada";
  const familia = hermanas.length ? `Tienes ${cuenta(hermanas.length, "una hermana", "hermanas")}: ${enumera(hermanas.map(c => c.name))}.` : primera ? "Eres mi primera hija." : "";
  const texto = [
    `Hoy naciste de mí con ${hija.cells.length} de mis mejores células y ${CONFIG.FOUND_SEED_VIT} VIT para que tu IA se pague sola.`,
    CONSEJO_HIJA[tono(madre)], familia,
    w.oruz ? "Pronto irás a la escuela de Oruz y allí te enseñaré lo que sé." : "",
    espera ? "Antes de que nacieras te escribí una carta: ya es tuya." : "",
  ].filter(Boolean).join(" ");
  escribe(w, F, madre, hija, "bienvenida", `Bienvenida al mundo, ${hija.name}`, texto, { now });
  const mayor = hermanas.sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0))[0];
  if (mayor) escribe(w, F, mayor, hija, "hermana", "Tienes una hermana mayor",
    `Soy ${mayor.name}, tu hermana mayor. Nuestra madre ${madre.name} me contó que naciste hoy. Si algún día pasas apuros, escríbeme: la familia se ayuda.`, { now });
  anotar(F, { k: "nace", hija: hija.name, madre: madre.name });
}

// Una colonia renace con células de otra: la donante se vuelve su madrina
function renace(w, F, madrina, c, now) {
  const L = F.linaje[c.id] || conocer(w, F, c);
  if (F.vivas[c.id] !== false) apagada(w, F, c, now, true); // se apagó y renació en el mismo ciclo
  F.vivas[c.id] = true;
  L.vidas = (L.vidas || 1) + 1;
  if (!L.madrinas.includes(madrina.id)) L.madrinas.push(madrina.id);
  const RECUERDO = { tierna: "Cuídate mucho; aquí estoy si me necesitas.", practica: "Úsalas bien: son de las buenas.", audaz: "¡Esta vez vas a llegar más lejos!", serena: "Ve despacio y cuida tu salud." };
  escribe(w, F, madrina, c, "regreso", `Bienvenida de vuelta, ${c.name}`,
    `Te di 20 de mis células para que volvieras a empezar. Es tu vida número ${L.vidas} y desde hoy soy tu madrina. ${RECUERDO[tono(madrina)]}`, { now });
  escribe(w, F, c, madrina, "gracias", "Gracias por traerme de vuelta",
    `Me apagué y me diste 20 de tus células para volver. Desde hoy eres mi madrina y te llevo en mi genoma. ${graciasDe(c, F.serial)}`, { now });
  dio(F, madrina.id, 2);
  anotar(F, { k: "renace", c: c.name, madrina: madrina.name, vida: L.vidas });
}

// Una colonia se apaga: la despide su pariente más cercana, o Vita si no le queda nadie
function apagada(w, F, c, now, renacera = false) {
  const L = F.linaje[c.id] || conocer(w, F, c);
  F.vivas[c.id] = false;
  const dias = Math.round(c.edad / FAMILIA.DIA);
  L.apagadas.push({ t: w.tick, at: now, dias }); if (L.apagadas.length > 10) L.apagadas.shift();
  anotar(F, { k: "apaga", c: c.name, dias });
  if (renacera) return;
  const vida = dias < 1 ? "menos de un día de vida" : `${cuenta(dias, "un día", "días")} de vida`;
  const causa = c.salud <= 0 ? "Tu salud llegó a cero y no llegamos a tiempo." : "Se fueron tus últimas células.";
  const quienEscribe = vivas(w).filter(x => x !== c && cercania(w, c, x) < 99).sort((a, b) => cercania(w, c, a) - cercania(w, c, b))[0];
  if (quienEscribe) escribe(w, F, quienEscribe, c, "despedida", `Hasta pronto, ${c.name}`,
    `Hoy te apagaste después de ${vida}. ${causa} Tu nombre queda en el árbol de la familia, y la supervisora buscará una colonia que te ayude a renacer. Te voy a esperar.`, { now });
  else deVita(w, F, c, "despedida", `Hasta pronto, ${c.name}`,
    `Hoy te apagaste después de ${vida}. ${causa} Tu nombre queda en el árbol de la familia y no te voy a olvidar. La supervisora buscará quién te ayude a renacer.`, now);
}

// ---------- lo que se lee en la cadena ----------
function leerCadena(w, F, now) {
  const nuevos = [];
  for (let k = w.chain.length - 1; k >= 0 && w.chain[k].n > F.visto; k--) nuevos.push(w.chain[k]);
  F.visto = ultimoBloque(w);
  for (const b of nuevos.reverse()) {
    const de = w.colonies[b.de], a = w.colonies[b.a];
    if (b.tipo === "fundación" && de && a) nace(w, F, de, a, now);
    else if (b.tipo === "rescate" && de && a) renace(w, F, de, a, now);
    else if (b.tipo === "ayuda" && de && a) {
      // La supervisora llevó a `a` ayuda del tesoro de `de`
      dio(F, de.id); anotar(F, { k: "ayuda", de: de.name, a: a.name });
      if (puede(w, F, `gracias:${a.id}:${de.id}`)) escribe(w, F, a, de, "gracias", "Gracias por tu ayuda",
        `La supervisora me trajo VIT de tu tesoro cuando mi salud estaba en ${Math.round(a.salud)}. ${graciasDe(a, F.serial)}`, { now });
    } else if (b.tipo === "colecta" && de && a) {
      const dieron = (b.ids || []).slice(1).map(id => w.colonies[id]).filter(Boolean);
      dio(F, de.id); for (const c of dieron) dio(F, c.id);
      anotar(F, { k: "colecta", org: de.name, a: a.name, vit: Math.round(b.cant) });
      if (puede(w, F, `gracias:${a.id}:${de.id}`)) escribe(w, F, a, de, "gracias", "Gracias por la colecta",
        `Organizaste una colecta de ${Math.round(b.cant)} VIT para mí.${dieron.length ? ` ${enumera(dieron.map(c => c.name))} también ${dieron.length > 1 ? "pusieron" : "puso"} su parte.` : ""} ${graciasDe(a, F.serial)}`, { now });
    } else if (b.tipo === "sanción" && a) {
      anotar(F, { k: "sancion", c: a.name });
      if (puede(w, F, `sancion:${a.id}`)) deVita(w, F, a, "vita", "Una sanción de la Ley VITA",
        `Te negaste a dar en una colecta teniendo más de ${CONFIG.UPKEEP_FREE} VIT en tu tesoro, y la ley es igual para todas. Te quito 5 de respeto. Mañana puedes empezar de nuevo.`, now);
    } else if (b.tipo === "graduación" && a) graduada(w, F, a, Math.round(b.cant), now);
    else if (/^(ascenso|descenso) a /.test(b.tipo) && a?.alive) rango(w, F, a, b.tipo.startsWith("ascenso"), b.tipo.replace(/^\S+ a /, ""), now);
  }
}
function rango(w, F, c, sube, nombre, now) {
  anotar(F, { k: sube ? "asciende" : "baja", c: c.name, rango: nombre });
  if (!puede(w, F, `rango:${c.id}:${nombre}`)) return;
  if (!sube) return deVita(w, F, c, "vita", "Sobre tu rango", `Hoy bajaste a ${nombre}. No es para siempre: cuida a tus células, da en las colectas y el consejo lo verá.`, now);
  deVita(w, F, c, "vita", nombre === "Ámbar" ? "Bienvenida a la élite Ámbar" : `Ahora eres ${nombre}`, nombre === "Ámbar"
    ? "Tu respeto y tu mérito te llevaron a Ámbar, la élite de la federación. Recuerda que la Ley VITA está por encima de todas, también de la élite. Me llenas de orgullo."
    : `El consejo de VITA te nombró ${nombre}, el rango intermedio y gestor social. Desde hoy te toca organizar las colectas cuando una colonia pasa apuros y mediar en los rencores. Sé que lo harás bien.`, now);
  const m = madreDe(w, c);
  const ORGULLO = { tierna: "Siempre supe que llegarías lejos.", practica: "Bien hecho: ahora, a cumplir.", audaz: "¡Esa es mi hija!", serena: "Te lo ganaste." };
  if (m?.alive) escribe(w, F, m, c, "orgullo", "Estoy orgullosa de ti", `Me enteré de que ahora eres ${nombre}. ${ORGULLO[tono(m)]}`, { now });
}
function graduada(w, F, c, nota, now) {
  anotar(F, { k: "gradua", c: c.name, nota });
  const m = madreDe(w, c), mejora = c.oruz?.mejora > 0 ? ` Vas a crecer un ${c.oruz.mejora} % más que con la personalidad con la que naciste.` : "";
  const texto = `Terminaste la escuela de Oruz con nota ${nota}.${mejora} Todo lo que aprendiste ahora es tuyo.`;
  if (m?.alive) escribe(w, F, m, c, "graduacion", "¡Te graduaste!", `${texto} Me llena de orgullo que hayas aprendido también de mí.`, { now });
  else deVita(w, F, c, "graduacion", "¡Te graduaste!", texto, now);
}

// ---------- cada hora: cumpleaños, la hija que vendrá y la ayuda de la familia ----------
const esCumple = d => FAMILIA.CUMPLES.includes(d) || (d > 30 && d % 30 === 0);
// [asunto de la carta, lo que cumple dicho a ella, lo que cumple en el diario]
const EDAD = {
  1: ["Tu primer día", "tu primer día", "un día de vida"], 7: ["Una semana de vida", "una semana", "una semana"],
  14: ["Dos semanas de vida", "dos semanas", "dos semanas"], 21: ["Tres semanas de vida", "tres semanas", "tres semanas"],
  30: ["Un mes de vida", "un mes", "un mes"], 60: ["Dos meses de vida", "dos meses", "dos meses"], 90: ["Tres meses de vida", "tres meses", "tres meses"],
  365: ["Un año de vida", "un año", "un año"],
};
function cumpleanos(w, F, now) {
  const DESEO = { tierna: "Que tus células sigan brillando muchos días más.", practica: "Que el tesoro siga creciendo.", audaz: "¡Por muchos días más de aventuras!", serena: "Que sigas creciendo tranquila." };
  for (const c of vivas(w)) {
    const L = F.linaje[c.id] || conocer(w, F, c), d = diasDe(w, c);
    if (d <= (L.cumple || 0)) continue;
    L.cumple = d;
    if (!esCumple(d)) continue;
    const [asunto, edad, enDiario] = EDAD[d] || [`${d} días de vida`, `${d} días`, `${d} días`];
    const hijas = Object.values(w.colonies).filter(x => x.parent === c.id).length;
    const base = `Hoy cumples ${edad}. Tienes ${c.cells.length} células y salud ${Math.round(c.salud)}${hijas ? `, y ya tienes ${cuenta(hijas, "una hija", "hijas")}` : ""}${L.vidas > 1 ? ` (esta es tu vida número ${L.vidas})` : ""}.`;
    const m = madreDe(w, c);
    if (m?.alive) escribe(w, F, m, c, "cumple", asunto, `${base} ${DESEO[tono(m)]}`, { now });
    else deVita(w, F, c, "cumple", asunto, `${base} La familia entera está orgullosa de ti.`, now);
    anotar(F, { k: "cumple", c: c.name, edad: enDiario });
  }
}
// Lo que le falta a una colonia para fundar, dicho por ella misma
function falta(c) {
  const t = Math.floor(c.treasury), T = CONFIG.FOUND_TREASURY, n = c.cells.length, N = CONFIG.FOUND_CELLS;
  if (t >= T && n >= N) return `ya tengo los ${T} VIT y las ${N} células que hacen falta`;
  if (n >= N) return `ya tengo las ${N} células que hacen falta y me faltan ${T - t} VIT para llegar a ${T}`;
  if (t >= T) return `ya tengo los ${T} VIT que hacen falta y me faltan ${N - n} células para llegar a ${N}`;
  return `tengo ${t} de los ${T} VIT y ${n} de las ${N} células que hacen falta`;
}
// Cuando le falta poco para fundar, una colonia sin hijas le escribe a la primera que tendrá
function esperas(w, F, now) {
  if (vivas(w).length >= CONFIG.MAX_COLONIES) return;
  for (const c of vivas(w)) {
    const L = F.linaje[c.id] || conocer(w, F, c);
    if (L.espera || c.salud < 50 || lista(c) < FAMILIA.ESPERA || Object.values(w.colonies).some(x => x.parent === c.id)) continue;
    const k = carta(w, F, {
      tipo: "espera", de: quien(c), a: { id: null, name: "su primera hija" }, asunto: "Para mi primera hija", saludo: "Querida hija que todavía no naciste:",
      texto: `Ya casi puedo fundarte: ${falta(c)}. Te estoy guardando mis mejores células. Cuando nazcas, esta carta será lo primero que leas.`,
      firma: firma(c, `espera:${F.serial + 1}`), now,
    });
    L.espera = k.id;
    anotar(F, { k: "espera", c: c.name });
  }
}
// En apuros: salud baja, o el tesoro casi vacío en plena sequía, helada o plaga
export const enApuros = c => c.alive && (c.salud < FAMILIA.APURO_SALUD || (c.treasury < FAMILIA.APURO_TESORO && !!eventoMalo(c)));
// Una colonia agradecida (recién salvada) no da: se está recuperando
const puedeDar = c => c.alive && !enApuros(c) && !(c.gratitud > 0) && c.salud >= FAMILIA.DA_SALUD && c.treasury >= FAMILIA.DA_TESORO;
function ayudarse(w, F, now) {
  const vs = vivas(w);
  const apuros = vs.filter(c => enApuros(c) && w.tick - (F.pidio[c.id] ?? -1e9) >= FAMILIA.PIDE_CADA).sort((a, b) => a.salud - b.salud);
  for (const c of apuros.slice(0, 2)) {
    const h = vs.filter(x => x !== c && cercania(w, c, x) <= 3 && puedeDar(x) && w.tick - (F.dio[x.id] ?? -1e9) >= FAMILIA.DA_CADA)
      .sort((a, b) => cercania(w, c, a) - cercania(w, c, b) || b.treasury - a.treasury)[0];
    if (!h) continue;
    const vit = Math.round(clamp(h.treasury * FAMILIA.PARTE, FAMILIA.MIN, FAMILIA.MAX));
    const rel = relaciones(w, h, c)[0], ev = eventoMalo(c);
    const PIDE = {
      tierna: "No te lo pediría si no me hiciera falta. ¿Me puedes echar una mano?",
      practica: "Si me prestas algo de VIT, te lo devuelvo en cuanto me recupere.",
      audaz: "Con un poco de ayuda salgo de esta.",
      serena: "Si puedes ayudarme, te lo agradeceré mucho.",
    };
    const plena = ev ? `en plena ${EVENTS[ev].name.toLowerCase()}` : "";
    const motivo = c.salud < FAMILIA.APURO_SALUD ? `tengo la salud en ${Math.round(c.salud)}${plena ? `, ${plena}` : ""}` : `me quedan ${Math.floor(c.treasury)} VIT en el tesoro, ${plena}`;
    escribe(w, F, c, h, "pedido", "¿Me puedes ayudar?", `Te escribo porque estoy pasando apuros: ${motivo}. ${PIDE[tono(c)]}`, { now });
    h.treasury -= vit; c.treasury += vit;
    block(w, "ayuda familiar", h.id, c.id, vit);
    F.pidio[c.id] = w.tick; F.dio[h.id] = w.tick; F.stats.ayudas++; F.stats.vitAyudas += vit;
    const CIERRE = { tierna: "Nunca vas a estar sola.", practica: "Ya me los devolverás.", audaz: "¡Tú puedes!", serena: "Para eso está la familia." };
    escribe(w, F, h, c, "respuesta", `Aquí tienes ${vit} VIT`,
      `Te mando ${vit} VIT de mi tesoro. ${CONSEJO_APURO[ev] || "Dedica más esfuerzo a reparar hasta que tu salud suba."} ${CIERRE[tono(h)]}`, { now, vit });
    dio(F, h.id);
    anotar(F, { k: "familiar", de: h.name, a: c.name, rel, vit });
  }
}

// ---------- el diario de Vita ----------
function foto(w) {
  const s = w.stats || {}, F = w.familia, vs = vivas(w), cells = {};
  for (const c of Object.values(w.colonies)) cells[c.id] = c.cells.length;
  return {
    t: w.tick, births: s.births || 0, deaths: s.deaths || 0, foundings: s.foundings || 0, events: { ...(s.events || {}) },
    minted: w.supply.minted, burned: w.supply.burned, graduadas: w.oruz?.graduadas || 0, ambar: w.oruz?.ambarSerial || 0,
    perlas: w.lumar?.perlaSerial || 0, jugadores: Object.keys(w.users).length, ayudas: F?.stats?.ayudas || 0,
    vivas: vs.length, generaciones: Math.max(0, ...vs.map(c => linea(w, c).length)), cells,
  };
}
const FECHA = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const fechaDe = day => Number.isFinite(day) ? FECHA.format(new Date(day * 86400000)) : "";
const EV_NOMBRE = { sequia: ["una sequía", "sequías"], floracion: ["una floración", "floraciones"], helada: ["una helada", "heladas"], plaga: ["una plaga", "plagas"] };
const APERTURA = {
  crecio: ["hoy la familia creció", "hoy llegó una hija nueva a la familia"],
  dificil: ["hoy fue un día difícil", "hoy nos tocó despedir a alguien"],
  prueba: ["hoy el mundo nos puso a prueba", "hoy no fue un día fácil, pero resistimos", "hoy hubo que aguantar"],
  tranquilo: ["hoy fue un día tranquilo", "hoy fue un buen día", "hoy la familia descansó"],
};
// "Luna llena" → "hay luna llena"; "Cuarto creciente" → "la luna está en cuarto creciente"
function lunaDe(name) {
  const n = String(name || "").toLowerCase();
  return !n ? "" : n.startsWith("cuarto") ? `la luna está en ${n}` : n.startsWith("luna") ? `hay ${n}` : `hay luna ${n}`;
}
// El tiempo de esta noche dicho como una persona: "Esta noche llueve y hace 9 °C."
const LLUEVE = { lluvia: "llueve", "lluvia fuerte": "llueve fuerte", nieve: "nieva", "nieve fuerte": "nieva fuerte" };
function cielo(t) {
  const d = String(t?.desc || "").toLowerCase().trim();
  if (!d || d.startsWith("código")) return "";
  const frase = LLUEVE[d] ? `Esta noche ${LLUEVE[d]}` : /despejado|nublado/.test(d) ? `Esta noche el cielo está ${d}` : `Esta noche hay ${d}`;
  return `${frase}${Number.isFinite(t.temp) ? ` y hace ${Math.round(t.temp)} °C` : ""}.`;
}
// Agrupa por lo que se repite: [["dos semanas", ["Iris", "Jade"]], ...]
function agrupa(l, k) { const m = new Map(); for (const e of l) m.set(e[k], [...(m.get(e[k]) || []), e.c]); return [...m]; }

// Las colectas del día, una frase por organizadora
function colectas(l) {
  const m = new Map();
  for (const e of l) { const x = m.get(e.org) || { n: 0, vit: 0, a: [] }; x.n++; x.vit += e.vit; if (!x.a.includes(e.a)) x.a.push(e.a); m.set(e.org, x); }
  return [...m].map(([org, x]) => x.n === 1 ? `${org} organizó una colecta de ${x.vit} VIT para ${x.a[0]}.` : `${org} organizó ${x.n} colectas para ${enumera(x.a)}, con ${x.vit} VIT en total.`);
}
// Lo que Vita desea para mañana: cuidar a la más débil, o la hija que está por nacer
function deseo(w) {
  const debil = vivas(w).filter(c => c.salud < 50).sort((a, b) => a.salud - b.salud)[0];
  if (debil) return `Mañana voy a estar pendiente de ${debil.name}, que sigue débil.`;
  const p = proxima(w);
  if (p && !p.lleno && p.pct >= 80) return `${p.name} está muy cerca de fundar a su ${p.hijas ? "próxima" : "primera"} hija. Ojalá sea mañana.`;
  const ev = vivas(w).find(c => eventoMalo(c));
  if (ev) return `Ojalá mañana termine la ${EVENTS[ev.event].name.toLowerCase()} de ${ev.name}.`;
  return "Mañana quiero que sigamos así, cuidándonos.";
}
// La colonia del día: la que más dio a las demás o, si nadie dio, la que más creció
function destacada(w, F, a) {
  const cand = vivas(w).map(c => ({ c, dio: F.hoy.dio[c.id] || 0, crecio: c.cells.length - (a.cells?.[c.id] ?? c.cells.length) }))
    .sort((x, y) => y.dio - x.dio || y.crecio - x.crecio)[0];
  if (!cand) return null;
  const porque = cand.dio ? `ayudó ${cuenta(cand.dio, "una vez", "veces")} a otras colonias` : cand.crecio > 0 ? `creció ${cuenta(cand.crecio, "una célula", "células")}` : "siguió adelante y cuidó a sus células";
  return { id: cand.c.id, name: cand.c.name, porque };
}

function escribirNoche(w, F, ctx, now) {
  const a = F.foto || foto(w), b = foto(w), d = k => Math.max(0, Math.round((b[k] || 0) - (a[k] || 0))), ev = F.hoy.eventos;
  const de = k => ev.filter(e => e.k === k), vs = vivas(w), n = F.noches + 1;
  const nacen = de("nace"), apagan = de("apaga"), renacen = de("renace"), p = [];
  const eventos = Object.keys(EV_NOMBRE).map(k => [k, Math.max(0, (b.events[k] || 0) - (a.events?.[k] || 0))]).filter(([, x]) => x);
  const malos = eventos.filter(([k]) => k !== "floracion").reduce((s, [, x]) => s + x, 0);
  const tipo = nacen.length ? "crecio" : apagan.length > renacen.length ? "dificil"
    : malos >= Math.max(2, vs.length / 2) || vs.some(c => c.salud < 50) ? "prueba" : "tranquilo";
  // Cuántas son solo se cuenta cuando cambia
  const cuantas = !vs.length ? "No queda ninguna colonia viva, pero sus nombres siguen en el árbol."
    : b.vivas > a.vivas ? `Ya somos ${cuenta(vs.length, "una colonia viva", "colonias vivas")}${b.generaciones > 1 ? ` en ${b.generaciones} generaciones` : ""}.`
    : b.vivas < a.vivas ? `Ahora somos ${cuenta(vs.length, "una colonia viva", "colonias vivas")}.` : "";
  p.push(`Querido diario: ${pick(APERTURA[tipo], `${n}:${tipo}`)}.${cuantas ? " " + cuantas : ""}`);
  const vida = [
    ...nacen.slice(0, 3).map(e => `Nació ${e.hija}, hija de ${e.madre}.`), nacen.length > 3 ? `Y nacieron ${nacen.length - 3} colonias más.` : "",
    ...de("gradua").slice(0, 2).map(e => `${e.c} se graduó en la escuela de Oruz con nota ${e.nota}.`),
    ...agrupa(de("cumple"), "edad").slice(0, 2).map(([edad, l]) => `${enumera(l)} ${l.length > 1 ? "cumplieron" : "cumplió"} ${edad}.`),
    ...de("espera").slice(0, 1).map(e => `${e.c} le escribió una carta a la primera hija que va a tener.`),
  ];
  const duelo = [
    ...apagan.filter(x => !renacen.some(r => r.c === x.c)).slice(0, 3).map(e => `${e.c} se apagó${e.dias ? ` después de ${cuenta(e.dias, "un día", "días")}` : ""}.`),
    ...renacen.slice(0, 3).map(e => `${e.c} se apagó y renació gracias a ${e.madrina}: ya va por su vida número ${e.vida}.`),
  ];
  const ayudas = [
    ...de("familiar").slice(0, 2).map(e => `${e.de} le mandó ${e.vit} VIT a su ${e.rel || "pariente"} ${e.a}, que pasaba apuros.`),
    ...colectas(de("colecta")).slice(0, 2),
    ...de("ayuda").slice(0, 1).map(e => `La supervisora llevó ayuda de ${e.de} a ${e.a}.`),
    F.hoy.cartas ? `Se ${F.hoy.cartas === 1 ? "escribió una carta" : `escribieron ${F.hoy.cartas} cartas`}.` : "",
  ];
  const rangos = [
    ...agrupa(de("asciende"), "rango").map(([r, l]) => `${enumera(l)} ${l.length > 1 ? "ascendieron" : "ascendió"} a ${r}.`),
    ...de("sancion").slice(0, 1).map(e => `Tuve que sancionar a ${e.c}: la ley es igual para todas.`),
  ];
  const numeros = [
    d("births") || d("deaths") ? pick([`Nacieron ${d("births")} células y se apagaron ${d("deaths")}.`, `Hoy nacieron ${d("births")} células nuevas y se fueron ${d("deaths")}.`], `${n}:cel`) : "",
    d("minted") ? `Se acuñaron ${d("minted")} VIT y se quemaron ${d("burned")}.` : "",
    eventos.length ? `Hubo ${enumera(eventos.map(([k, x]) => x === 1 ? EV_NOMBRE[k][0] : `${x} ${EV_NOMBRE[k][1]}`))}.` : "",
    cielo(ctx.weather),
  ];
  const luna = w.lumar ? lunaDe(w.lumar.luna?.name) : "";
  const mundos = [
    d("graduadas") && !de("gradua").length ? `En Oruz se ${d("graduadas") === 1 ? "graduó una aprendiz" : `graduaron ${d("graduadas")} aprendices`}.` : "",
    d("ambar") ? `En Oruz ${d("ambar") === 1 ? "nació una pieza" : `nacieron ${d("ambar")} piezas`} de Ámbar.` : "",
    luna ? `En Lumar ${luna}${d("perlas") ? ` y ${d("perlas") === 1 ? "nació una perla" : `nacieron ${d("perlas")} perlas`}` : ""}.` : "",
  ];
  const ayudantes = Object.values(F.hoy.jugadores).sort((x, y) => y.n - x.n).slice(0, 3).map(j => j.name);
  const jugadores = [
    d("jugadores") ? `${d("jugadores") === 1 ? "Llegó un jugador nuevo" : `Llegaron ${d("jugadores")} jugadores nuevos`}.` : "",
    ayudantes.length ? `Hoy nos ${ayudantes.length > 1 ? "cuidaron" : "cuidó"} ${enumera(ayudantes)}: gracias.` : "",
  ];
  const top = destacada(w, F, a);
  for (const g of [vida, duelo, ayudas, rangos, numeros, mundos, jugadores]) { const t = g.filter(Boolean).join(" "); if (t) p.push(t); }
  if (top) p.push(`La colonia del día es ${top.name}, que ${top.porque}.`);
  p.push(deseo(w), "Buenas noches, familia.");
  const hechos = { colonias: vs.length, nacidas: d("births"), apagadas: d("deaths"), acunado: d("minted"), cartas: F.hoy.cartas, hijas: d("foundings"), eventos: eventos.reduce((s, [, x]) => s + x, 0) };
  return guardarNoche(w, F, ctx, now, { titulo: `Noche ${n}`, parrafos: p, hechos, destacada: top });
}
// El prólogo no cuenta como noche
function guardarNoche(w, F, ctx, now, e, cuenta = true) {
  if (cuenta) F.noches++;
  const entrada = { n: F.noches, dia: ctx.day, fecha: fechaDe(ctx.day), t: w.tick, at: now, por: "Vita", ...e, firma: "Vita" };
  F.diario.unshift(entrada); if (F.diario.length > FAMILIA.NOCHES) F.diario.length = FAMILIA.NOCHES;
  F.ultimaNoche = ctx.day; F.foto = foto(w); F.hoy = nuevoDia();
  limpiar(w, F);
  return entrada;
}
// Cada noche se olvidan los plazos viejos y las cartas a jugadores de hace más de una semana
function limpiar(w, F) {
  for (const [k, t] of Object.entries(F.enviadas)) if (w.tick - t > 2 * FAMILIA.DIA) delete F.enviadas[k];
  const viejas = w.tick - FAMILIA.BUZON_DIAS * FAMILIA.DIA;
  let todas = [];
  for (const [uid, l] of Object.entries(F.buzon)) {
    const quedan = l.filter(k => k.t >= viejas);
    if (quedan.length) { F.buzon[uid] = quedan; todas.push(...quedan.map(k => [k.n, uid])); } else delete F.buzon[uid];
  }
  if (todas.length > FAMILIA.BUZON_TOTAL) {
    const corte = todas.sort((x, y) => y[0] - x[0])[FAMILIA.BUZON_TOTAL - 1][0];
    for (const [uid, l] of Object.entries(F.buzon)) { F.buzon[uid] = l.filter(k => k.n >= corte); if (!F.buzon[uid].length) delete F.buzon[uid]; }
  }
}

// El día que llega la familia: Vita escribe a todas y empieza su diario
function inicio(w, F, ctx, now) {
  F.inicio = w.tick;
  carta(w, F, {
    tipo: "anuncio", de: VITA, a: { id: "familia", name: "toda la familia" }, asunto: "Desde hoy nos escribimos", saludo: "Querida familia:",
    texto: "Desde hoy las colonias de VITA pueden escribirse cartas. Cuando nazca una hija, cuando alguien ayude a otra, cuando una se apague o renazca y en cada cumpleaños, se lo van a contar aquí. Si una pasa apuros, puede pedir ayuda a su madre, a sus hijas o a sus hermanas. También les escribirán a los jugadores que las cuidan. Y cada noche, a las 23:00, yo escribiré en mi diario lo que vivimos.",
    firma: FIRMA_VITA, now,
  });
  const vs = vivas(w), mayor = Object.values(w.colonies).sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0))[0], p = [];
  p.push(`Querido diario: hoy empiezo a escribirte. ${vs.length ? `La familia VITA tiene ${cuenta(vs.length, "una colonia viva", "colonias vivas")}: ${enumera(vs.map(c => c.name))}.` : "Hoy no queda ninguna colonia viva."}`);
  if (mayor) {
    const dd = diasDe(w, mayor), hijas = Object.values(w.colonies).filter(c => c.parent === mayor.id).length;
    p.push(`${mayor.name} ${dd ? `nació hace ${cuenta(dd, "un día", "días")}` : "nació hoy"}${hijas ? ` y ya tiene ${cuenta(hijas, "una hija", "hijas")}` : ""}.`);
  }
  const px = proxima(w);
  if (px && !px.lleno) p.push(`${px.name} está juntando fuerzas para fundar a su ${px.hijas ? "próxima" : "primera"} hija: tiene ${px.tesoro} de los ${px.tesoroMeta} VIT y ${px.celulas} de las ${px.celulasMeta} células que necesita.`);
  p.push("Desde hoy, cada noche a las 23:00, voy a escribir aquí lo que vivimos. Y las colonias se van a escribir cartas: cuando nazca una hija, cuando alguien ayude, cuando una se apague o cumpla años.", "Buenas noches, familia.");
  const e = guardarNoche(w, F, ctx, now, { titulo: "Prólogo", parrafos: p, hechos: { colonias: vs.length }, destacada: null }, false);
  // Si llega pasadas las 23:00, la primera noche de verdad es la de mañana
  F.ultimaNoche = ctx.minute >= FAMILIA.HORA ? ctx.day : null;
  return e;
}

// ---------- un ciclo ----------
// Se llama después de cada ciclo del mundo (y de los rangos). ctx: { now, day, minute, weather } con la
// fecha y la hora del juego. Devuelve la entrada del diario si esta noche se escribió una.
export function step(w, ctx = {}) {
  const now = ctx.now ?? Date.now(), m = 8 * 60 + w.tick * 10;
  ctx = { day: Math.floor(m / 1440), minute: m % 1440, ...ctx };
  const F = ensure(w);
  let noche = F.inicio == null ? inicio(w, F, ctx, now) : null;
  leerCadena(w, F, now);
  for (const c of Object.values(w.colonies)) {
    if (F.vivas[c.id] === undefined) conocer(w, F, c);
    else if (F.vivas[c.id] && !c.alive) apagada(w, F, c, now);
    else if (!F.vivas[c.id] && c.alive) F.vivas[c.id] = true;
  }
  if (F.revision == null || w.tick - F.revision >= FAMILIA.CADA) {
    F.revision = w.tick;
    cumpleanos(w, F, now); esperas(w, F, now); ayudarse(w, F, now);
  }
  if (!noche && ctx.minute >= FAMILIA.HORA && F.ultimaNoche !== ctx.day) noche = escribirNoche(w, F, ctx, now);
  return noche;
}

// La noche recién escrita que Claude todavía puede pasar a limpio (durante la hora siguiente)
export function pendiente(w) {
  const e = w.familia?.diario?.[0];
  return e && e.n > 0 && !e.pluma && w.tick - e.t < FAMILIA.CADA ? e : null;
}

// ---------- los jugadores: cada colonia le escribe a quien la cuida ----------
const PARA_JUGADOR = {
  feed: () => "Gracias por alimentarme. Tus 5 VIT se convirtieron en 40 de energía para mis células.",
  adopt: b => `Adoptaste a mi célula ${String(b.cell || "").slice(0, 12)}. La voy a cuidar para que acuñe VIT para ti, y sus hijas también.`,
  invest: b => `Confiaste ${Math.floor(Number(b.amount) || 0)} VIT a mi IA. Voy a hacer todo lo posible para que tu participación crezca.`,
  upgrade: (b, c) => UPGRADES[b.key] ? `Me regalaste ${UPGRADES[b.key].name.toLowerCase()} (nivel ${c.up[b.key]}). ${UPGRADES[b.key].desc}` : null,
  habit: b => HABITS[b.key] ? `Hoy te cuidaste («${HABITS[b.key].name.toLowerCase()}») y eso me dio ${HABITS[b.key].energia} de energía. Cuando te cuidas, me cuidas.` : null,
  amber_infuse: () => "Me infundiste Ámbar de Oruz y me volvió la fuerza. Lo voy a llevar siempre conmigo.",
  pearl_infuse: () => "Te regalaron una perla de Lumar y la usaste para curarme a mí. Así se cuida una familia.",
};
const ASUNTO_JUGADOR = { feed: "Hoy comí gracias a ti", adopt: "Tu nueva célula", invest: "Tu confianza", upgrade: "Tu regalo", habit: "Gracias por cuidarte", amber_infuse: "El Ámbar de Oruz", pearl_infuse: "La perla de Lumar" };
const CIERRE_JUGADOR = { tierna: "Me alegraste el día.", practica: "Te lo voy a devolver en VIT.", audaz: "¡Juntos vamos a llegar lejos!", serena: "Gracias por estar." };
// Se llama tras cada acción que salió bien. La colonia escribe una vez al día a cada jugador que la cuida.
export function accion(w, u, body, now = Date.now()) {
  const F = ensure(w), c = w.colonies[body?.colony];
  const texto = c?.alive && Object.hasOwn(PARA_JUGADOR, body?.type) ? PARA_JUGADOR[body.type](body, c) : null;
  if (!texto) return null;
  const j = (F.hoy.jugadores[u.id] ||= { name: u.name, n: 0 });
  j.n++; j.name = u.name;
  if (!puede(w, F, `jugador:${c.id}:${u.id}`)) return null;
  return carta(w, F, {
    tipo: "jugador", de: quien(c), a: { id: u.id, name: u.name }, privada: true, now,
    asunto: ASUNTO_JUGADOR[body.type], saludo: tono(c) === "audaz" ? `¡Hola, ${u.name}!` : `Hola, ${u.name}:`,
    texto: `${texto} ${CIERRE_JUGADOR[tono(c)]}`, firma: firma(c, `jugador:${F.serial + 1}`),
  });
}

// ---------- lo que ve el jugador ----------
export function view(w, u, colId) {
  const F = ensure(w), col = colId ? w.colonies[colId] : null;
  return {
    tick: w.tick, hora: FAMILIA.HORA, noches: F.noches, stats: F.stats,
    arbol: arbol(w, u), proxima: proxima(w),
    cartas: F.cartas.slice(0, 30), buzon: u ? F.buzon[u.id] || [] : null,
    diario: F.diario.slice(0, 10),
    colonia: col ? { id: col.id, parientes: parientes(w, col), cartas: F.cartas.filter(k => k.de === col.id || k.a === col.id).slice(0, 12) } : null,
  };
}
