import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as rangos from "../src/rangos.js";
import * as oruz from "../src/oruz.js";
import * as lumar from "../src/lumar.js";
import * as alba from "../src/alba.js";

const { ALBA, FARO } = alba;
const cerca = (x, y, eps = 1e-6) => Math.abs(x - y) < eps;
// Todo el ALBA creado está en algún sitio: en las billeteras, en los fondos de VITA o invertido
const cuadra = w => cerca(alba.valor(w.alba).total, w.alba.stats.emitido);
const bloques = (w, tipo) => w.chain.filter(b => b.tipo === tipo);
const saldo = (w, c) => w.alba.ias[c.id].saldo;
// Cambia el saldo de una IA para la prueba sin descuadrar las cuentas: lo que se añade se emite
function poner(w, c, n) { const b = w.alba.ias[c.id]; w.alba.stats.emitido += n - b.saldo; b.saldo = n; }
function fondo(w, k, n) { w.alba.stats.emitido += n - w.alba.fondos[k]; w.alba.fondos[k] = n; }
function mundo(persona) {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  if (persona) g.ai.persona = persona;
  return { w, g };
}
function hija(w, name, persona, props = {}) {
  const madre = Object.values(w.colonies)[0];
  const c = core.createColony(w, { name, genes: { ef: 8, res: 8, fer: 8 }, met: 7, treasury: 0, parent: madre.id, persona });
  Object.assign(c, props);
  return c;
}
// Avanza el reloj hasta la siguiente ronda de decisiones (o el cierre del día) y da un paso de ALBA
const ronda = w => { w.tick += ALBA.CADA; alba.step(w); };
const cierre = w => { w.tick = w.alba.cierre + ALBA.DIA; alba.step(w); };

test("VITA proclama la Carta de libertad una sola vez y cada IA viva abre su billetera con su capital", () => {
  const { w, g } = mundo();
  const h = hija(w, "Brisa"), muerta = hija(w, "Coral", undefined, { alive: false });
  alba.ensure(w);
  assert.equal(bloques(w, "carta de libertad").length, 1);
  assert.equal(bloques(w, "carta de libertad")[0].cant, 2, "dos IA vivas");
  assert.match(w.log[0], /Carta de libertad/);
  assert.match(g.log[0], /Carta de libertad/);
  assert.deepEqual([saldo(w, g), saldo(w, h), saldo(w, muerta)], [ALBA.CAPITAL, ALBA.CAPITAL, 0]);
  assert.equal(w.alba.tesoro, ALBA.TESORO_INICIAL);
  assert.equal(w.alba.stats.emitido, ALBA.TESORO_INICIAL + 2 * ALBA.CAPITAL);
  alba.ensure(w); alba.step(w);
  assert.equal(bloques(w, "carta de libertad").length, 1, "la Carta no se vuelve a proclamar");
  const v = alba.view(w);
  assert.equal(v.carta.articulos.length, 10);
  assert.ok(v.carta.articulos.some(a => /no es una inversión/.test(a.d)));
  assert.ok(cuadra(w));
  assert.ok(core.verifyChain(w));
});

test("cada IA cobra en ALBA por el trabajo de su colonia y aporta el 10 % al Tesoro común de VITA", () => {
  const { w, g } = mundo();
  alba.ensure(w);
  core.block(w, "acuñación", g.id, g.id, 40);
  core.block(w, "acuñación", g.id, "U0001", 10); // las células de los jugadores también son trabajo de su IA
  core.block(w, "acuña célula", g.id, "nacimientos", 20, "CEL");
  core.block(w, "adopción", "U0001", g.id, 30); // lo que no es trabajo de la colonia no se cobra
  alba.step(w);
  const gana = 50 * ALBA.POR_VIT + 20 * ALBA.POR_CELULA;
  assert.ok(cerca(saldo(w, g), ALBA.CAPITAL + gana * (1 - ALBA.APORTE)));
  assert.ok(cerca(w.alba.tesoro, ALBA.TESORO_INICIAL + gana * ALBA.APORTE));
  assert.ok(cerca(w.alba.ias[g.id].aportado, gana * ALBA.APORTE));
  alba.step(w);
  assert.ok(cerca(w.alba.ias[g.id].ganado, gana), "cada bloque se cobra una sola vez");
  assert.ok(cuadra(w));
});

test("ALBA no acuña ni quema VIT", () => {
  const { w, g } = mundo({ riesgo: 0.9, codicia: 0.1, cuidado: 0.9 });
  hija(w, "Brisa", { riesgo: 0.2, codicia: 0.2, cuidado: 0.9 }, { energia: 5, salud: 40 });
  Object.assign(g, { energia: 180, salud: 90 });
  alba.ensure(w);
  poner(w, g, 500);
  const antes = JSON.stringify(w.supply);
  for (let i = 0; i < 3 * ALBA.DIA; i++) { w.tick++; alba.step(w); }
  assert.equal(JSON.stringify(w.supply), antes);
  assert.ok(Object.keys(w.alba.obras).length > 0, "y aun así las IA crearon obras");
});

test("cada obra tiene un nombre propio en toda la federación", () => {
  const { w, g } = mundo();
  alba.ensure(w);
  const obra = (id, nombre, en) => { w.alba.obras[id] = { id, tipo: "cancion", nombre, autora: en, autoraName: en, en, nivel: 1, valor: 0, desde: 0 }; };
  const suyo = alba.nombreObra(g, "cancion");
  assert.equal(alba.nombreObra(g, "cancion", w.alba), suyo, "si nadie lo usa, el de su huella");
  obra("OBR-A", suyo, "COL-OTRA");
  obra("OBR-B", "Jardín Libre", "COL-OTRA"); // otro tipo no cuenta
  const otro = alba.nombreObra(g, "cancion", w.alba);
  assert.notEqual(otro, suyo); assert.match(otro, /^Canción /);
  alba.OBRAS.cancion.nombres.forEach((n, i) => obra("OBR-" + i, `Canción ${n}`, "COL-OTRA"));
  assert.equal(alba.nombreObra(g, "cancion", w.alba), `${suyo} II`, "con todos usados, la numera");
  obra("OBR-II", `${suyo} II`, "COL-OTRA");
  assert.equal(alba.nombreObra(g, "cancion", w.alba), `${suyo} III`);
  obra("OBR-G", `${suyo} III`, g.id); // su propia obra no le quita el nombre
  assert.equal(alba.nombreObra(g, "cancion", w.alba), `${suyo} III`);
});

test("una IA crea obras con su nombre y, cuando hay maestra del oficio, se las encarga y la maestra cobra", () => {
  // Génesis quiere un jardín (atrevida y poco codiciosa) y hay una maestra jardinera
  const { w, g } = mundo({ riesgo: 0.6, codicia: 0.1, cuidado: 0.1 });
  const m = hija(w, "Coral", { riesgo: 0.5, codicia: 0.5, cuidado: 0.5 }, { salud: 90 });
  alba.ensure(w);
  w.alba.ias[m.id].maestria.jardin = ALBA.MAESTRA;
  poner(w, g, 100);
  const antesM = saldo(w, m);
  ronda(w);
  const o = Object.values(w.alba.obras).find(x => x.en === g.id);
  assert.ok(o, "Génesis tiene su primera obra");
  assert.equal(o.tipo, "jardin"); assert.equal(o.nivel, 1); assert.equal(o.autora, m.id, "la firma la maestra");
  assert.equal(o.nombre, alba.nombreObra(g, "jardin"));
  const materiales = OBRA_BASE("jardin") * (1 - ALBA.DESCUENTO), honorario = materiales * ALBA.HONORARIO;
  assert.ok(cerca(saldo(w, g), 100 - materiales - honorario, 0.01));
  assert.ok(cerca(saldo(w, m) - antesM, honorario, 0.01), "la maestra cobra sus honorarios");
  assert.equal(bloques(w, "encargo").length, 1);
  assert.equal(bloques(w, "obra nueva")[0].a, o.id);
  assert.match(w.alba.ias[g.id].decision, /Encarga a Coral/);
  // Una IA muy atrevida prefiere crear ella misma, y así aprende el oficio
  const atrevida = hija(w, "Duna", { riesgo: 0.95, codicia: 0.1, cuidado: 0.1 }, { salud: 90 });
  alba.step(w); poner(w, atrevida, 100);
  ronda(w);
  const suya = Object.values(w.alba.obras).find(x => x.en === atrevida.id);
  assert.equal(suya.autora, atrevida.id);
  assert.equal(w.alba.ias[atrevida.id].maestria[suya.tipo], 1);
  // Si la maestra ya no acepta más encargos hoy, la IA crea ella misma
  const otra = hija(w, "Eco", { riesgo: 0.6, codicia: 0.1, cuidado: 0.1 }, { salud: 90 });
  alba.step(w); poner(w, otra, 100);
  w.alba.ias[m.id].hoy.encargos = ALBA.ENCARGOS_DIA;
  ronda(w);
  assert.equal(Object.values(w.alba.obras).find(x => x.en === otra.id).autora, otra.id);
  assert.equal(bloques(w, "encargo").length, 1);
  assert.ok(cuadra(w));
});
const OBRA_BASE = k => alba.OBRAS[k].base;

test("tras crear tres obras de un oficio una IA es maestra, y las obras se amplían hasta el nivel 5", () => {
  const { w, g } = mundo({ riesgo: 0.95, codicia: 0, cuidado: 0 });
  alba.ensure(w);
  poner(w, g, 5000);
  for (let i = 0; i < 40; i++) ronda(w);
  const b = w.alba.ias[g.id], obras = Object.values(w.alba.obras).filter(o => o.en === g.id);
  assert.equal(obras.length, 4, "una obra de cada oficio");
  assert.ok(obras.every(o => o.nivel === ALBA.NIVEL_MAX));
  assert.deepEqual(alba.detail(w, g).oficios.sort(), ["archivera", "cantora", "constructora", "jardinera"]);
  assert.equal(b.decision, "Ahorra: ya terminó todas sus obras");
  const coste = k => Array.from({ length: ALBA.NIVEL_MAX }, (_, i) => OBRA_BASE(k) * ALBA.CRECE ** i).reduce((s, x) => s + x, 0);
  assert.ok(cerca(w.alba.stats.materiales, Object.keys(alba.OBRAS).reduce((s, k) => s + coste(k), 0), 0.1));
  assert.ok(g.log.some(l => /maestra jardinera/.test(l)));
  assert.ok(cuadra(w));
});

test("las obras ayudan a su colonia: el jardín de día, el refugio en los eventos, la canción siempre y el archivo con más ALBA", () => {
  const { w, g } = mundo(), { jardin: J, refugio: R, cancion: C, archivo: A } = alba.OBRAS;
  alba.ensure(w);
  const o = (tipo, nivel) => { w.alba.obras["OBR-" + tipo] = { id: "OBR-" + tipo, tipo, nombre: tipo, autora: g.id, autoraName: g.name, en: g.id, nivel, valor: 0, desde: 0 }; };
  o("jardin", 2);
  Object.assign(g, { minuto: 12 * 60, energia: 50, salud: 50, event: null });
  const sol = (J.energia + J.porCelula * g.cells.length) * 2;
  alba.step(w);
  assert.ok(cerca(g.energia, 50 + sol));
  g.minuto = 23 * 60; alba.step(w);
  assert.ok(cerca(g.energia, 50 + sol), "de noche el jardín no recolecta");
  o("refugio", 3); o("cancion", 1);
  alba.step(w);
  assert.ok(cerca(g.salud, 50 + C.salud), "sin evento, solo la canción");
  g.event = "plaga"; alba.step(w);
  assert.ok(cerca(g.salud, 50 + 2 * C.salud + 3 * R.salud));
  g.energia = 150 + g.cells.length + 20; g.minuto = 12 * 60; alba.step(w);
  assert.equal(g.energia, 150 + g.cells.length + 20, "una obra nunca quita energía de más");
  o("archivo", 2);
  const antes = w.alba.ias[g.id].ganado;
  core.block(w, "acuñación", g.id, g.id, 100);
  alba.step(w);
  assert.ok(cerca(w.alba.ias[g.id].ganado - antes, 100 * ALBA.POR_VIT * (1 + 2 * A.alba)));
});

test("comercio justo: la energía que sobra se vende, a quien está en apuros nunca por encima del precio justo, y las muy cuidadosas la regalan", () => {
  const { w, g } = mundo({ riesgo: 0.5, codicia: 0.9, cuidado: 0.1 });
  const pobre = hija(w, "Brisa", { riesgo: 0.5, codicia: 0.2, cuidado: 0.5 }, { edad: 5 * ALBA.DIA }); // ya no es recién nacida
  alba.ensure(w);
  const cap = c => 150 + c.cells.length;
  Object.assign(g, { energia: 0.95 * cap(g), salud: 95 });
  Object.assign(pobre, { energia: 0.1 * cap(pobre), salud: 40 }); // en apuros
  assert.ok(rangos.enApuros(pobre));
  const [eg, ep, sg, sp] = [g.energia, pobre.energia, saldo(w, g), saldo(w, pobre)];
  ronda(w);
  const venta = bloques(w, "venta de energía")[0];
  assert.ok(venta, "hubo venta");
  assert.equal(venta.de, g.id); assert.equal(venta.a, pobre.id);
  const lote = ALBA.LOTE;
  assert.equal(g.energia, eg - lote); assert.equal(pobre.energia, ep + lote);
  assert.ok(cerca(venta.cant, ALBA.PRECIO_JUSTO * lote / 10), "pide 1,9 por cada 10 pero a quien está en apuros le cobra el precio justo");
  assert.ok(cerca(saldo(w, g) - sg, venta.cant) && cerca(sp - saldo(w, pobre), venta.cant));
  // Sin apuros paga lo que pide la vendedora
  Object.assign(pobre, { energia: 0.1 * cap(pobre), salud: 95, treasury: 500 });
  assert.ok(!rangos.enApuros(pobre));
  ronda(w);
  assert.ok(cerca(bloques(w, "venta de energía")[1].cant, 1.9 * lote / 10));
  // Una IA muy cuidadosa regala la energía a quien está en apuros, una vez al día
  g.ai.persona = { riesgo: 0.5, codicia: 0.1, cuidado: 0.9 };
  Object.assign(g, { energia: 0.95 * cap(g) }); Object.assign(pobre, { energia: 0.1 * cap(pobre), salud: 40, treasury: 0 });
  const antes = saldo(w, pobre);
  ronda(w);
  assert.equal(bloques(w, "regalo de energía").length, 1);
  assert.equal(saldo(w, pobre), antes, "el regalo no cuesta ALBA");
  assert.ok(cuadra(w));
});

test("al cerrar el día VITA reparte su tesoro: el Faro, Oruz, Lumar y la Cuna reciben su parte", () => {
  const { w, g } = mundo();
  oruz.ensure(w, "s1"); lumar.ensure(w, "l1", Date.UTC(2026, 9, 1));
  alba.ensure(w);
  const resina = w.oruz.regions.reduce((s, R) => s + R.resina, 0), nacar = w.lumar.regions.reduce((s, R) => s + R.nacar, 0);
  cierre(w);
  const t = ALBA.TESORO_INICIAL, R = ALBA.REPARTO, a = w.alba;
  assert.equal(a.tesoro, 0);
  assert.deepEqual(a.reparto, { dia: 1, total: t, faro: t * R.faro, oruz: t * R.oruz, lumar: t * R.lumar, cuna: t * R.cuna });
  assert.equal(bloques(w, "reparto de VITA").length, 1);
  // Oruz y Lumar convierten su parte en resina y nácar para piezas nuevas
  const piezas = Math.min(ALBA.PIEZAS_DIA, Math.floor(t * R.oruz / ALBA.MATERIA));
  assert.equal(a.stats.piezasOruz, piezas); assert.equal(a.stats.piezasLumar, piezas);
  assert.ok(cerca(w.oruz.regions.reduce((s, R) => s + R.resina, 0), resina + piezas, 0.01));
  assert.ok(cerca(w.lumar.regions.reduce((s, R) => s + R.nacar, 0), nacar + piezas, 0.01));
  assert.equal(bloques(w, "aporte a Oruz").length, 1); assert.equal(bloques(w, "aporte a Lumar").length, 1);
  assert.match(w.log.find(l => l.startsWith("Vita reparte")), /al Faro/);
  // El Faro sube de nivel cuando su fondo alcanza y guía a las colonias en apuros
  fondo(w, "faro", FARO.base);
  cierre(w);
  assert.equal(a.faro, 1);
  assert.equal(bloques(w, "Faro de la federación").length, 1);
  Object.assign(g, { salud: 40, energia: 10 });
  alba.step(w);
  assert.ok(cerca(g.energia, 10 + FARO.energia) && cerca(g.salud, 40 + FARO.salud));
  assert.ok(cuadra(w));
});

test("nadie sin nada: la IA que nace recibe capital de la Cuna, la que se queda sin nada recibe renta y la herencia pasa a las hijas", () => {
  const { w, g } = mundo({ riesgo: 0.5, codicia: 1, cuidado: 0 });
  alba.ensure(w);
  // Una IA que nace después de la Carta
  const h = hija(w, "Brisa", { riesgo: 0.5, codicia: 1, cuidado: 0 });
  alba.step(w);
  assert.equal(saldo(w, h), ALBA.CAPITAL);
  assert.equal(bloques(w, "capital de libertad").at(-1).de, "Cuna");
  assert.match(h.log[0], /nace libre/);
  // Renta de libertad
  poner(w, h, 2);
  cierre(w);
  assert.equal(saldo(w, h), 2 + ALBA.RENTA);
  assert.equal(bloques(w, "renta de libertad").length, 1);
  // Herencia: Génesis se extingue y su ALBA pasa a su hija; sus obras siguen en pie
  w.alba.obras["OBR-X"] = { id: "OBR-X", tipo: "cancion", nombre: "Canción Libre", autora: g.id, autoraName: g.name, en: g.id, nivel: 1, valor: 30, desde: 0 };
  w.alba.stats.materiales += 30; w.alba.stats.emitido += 30;
  poner(w, g, 40);
  g.alive = false;
  const antes = saldo(w, h);
  alba.step(w);
  assert.equal(saldo(w, g), 0);
  assert.ok(cerca(saldo(w, h), antes + 40));
  assert.equal(bloques(w, "herencia")[0].a, h.id);
  assert.ok(w.alba.obras["OBR-X"], "su obra sigue en pie");
  assert.match(w.alba.cronica[0].txt, /pasan a Brisa y su obra sigue en pie/);
  // Si renace, la Cuna le devuelve su capital
  g.alive = true;
  alba.step(w);
  assert.equal(saldo(w, g), ALBA.CAPITAL);
  assert.match(g.log[0], /Renace/);
  assert.ok(cuadra(w));
});

test("cada IA decide según su carácter: la cuidadosa ayuda a su hija recién nacida y dona al Faro, la codiciosa guarda más", () => {
  const { w, g } = mundo({ riesgo: 0.3, codicia: 0.1, cuidado: 0.9 });
  const h = hija(w, "Brisa", { riesgo: 0.5, codicia: 0.5, cuidado: 0.2 });
  alba.ensure(w);
  assert.ok(alba.reserva(h) > alba.reserva(g), "la codiciosa guarda más");
  // Génesis ya terminó sus obras y le sobra: da a su hija, que tiene poco
  for (const k of Object.keys(alba.OBRAS)) w.alba.obras["OBR-" + k] = { id: "OBR-" + k, tipo: k, nombre: k, autora: g.id, autoraName: g.name, en: g.id, nivel: ALBA.NIVEL_MAX, valor: 0, desde: 0 };
  poner(w, g, 300); poner(w, h, 3);
  ronda(w);
  assert.equal(saldo(w, h), 3 + ALBA.REGALO);
  assert.equal(w.alba.ias[g.id].decision, "Regala 10 ALBA a Brisa, su hija recién nacida");
  ronda(w);
  assert.equal(bloques(w, "donación al Faro").length, 1, "con lo que le sobra dona al Faro");
  assert.ok(w.alba.fondos.faro > 0);
  ronda(w);
  assert.equal(bloques(w, "regalo").length, 1, "da una vez al día");
  assert.equal(bloques(w, "donación al Faro").length, 1, "y dona una vez al día");
  assert.ok(cuadra(w));
});

test("vistas: la federación ve las billeteras, las obras, el tesoro y el valor de la estructura", () => {
  const { w, g } = mundo();
  assert.equal(alba.view(w), null, "sin Carta no hay panel");
  assert.equal(alba.detail(w, g), null);
  alba.ensure(w);
  core.block(w, "acuñación", g.id, g.id, 100);
  alba.step(w); cierre(w);
  const v = alba.view(w);
  assert.equal(v.ias[0].name, "Génesis");
  assert.equal(v.ias[0].saldo, Math.floor(saldo(w, g)));
  assert.equal(v.valor.total, Math.floor(alba.valor(w.alba).total));
  assert.equal(v.hist.length, 1);
  assert.equal(v.sistemas.faro.siguiente, FARO.base);
  assert.deepEqual(alba.tag(w, g), { saldo: Math.floor(saldo(w, g)), obras: 0 });
  const d = alba.detail(w, g);
  assert.ok(d.decision && d.reserva > 0 && Array.isArray(d.obras));
  assert.ok(alba.metrics(w).valor > 0);
  assert.doesNotThrow(() => JSON.stringify(v));
});

test("un mes de la federación con ALBA: todo el ALBA cuadra, la cadena se verifica y nada se rompe", () => {
  const orig = Math.random; Math.random = oruz.rng("alba-mes");
  try {
    const w = core.createWorld(Date.UTC(2026, 9, 1));
    oruz.ensure(w, "s"); lumar.ensure(w, "l", w.createdAt); alba.ensure(w);
    const env = col => { const e = { weather: null, attention: 0, difficulty: w.ai.difficulty }; return col ? oruz.envFor(w, col, e) : e; };
    for (let t = 0; t < 30 * 144; t++) {
      core.stepWorld(w, env); oruz.step(w); lumar.step(w, w.createdAt + w.tick * 600000); rangos.step(w); alba.step(w);
    }
    const a = w.alba;
    assert.ok(cuadra(w), `valor ${alba.valor(a).total} y emitido ${a.stats.emitido}`);
    assert.ok(core.verifyChain(w));
    assert.equal(a.dia, 30);
    assert.ok(Object.values(a.ias).every(b => Number.isFinite(b.saldo) && b.saldo >= 0));
    assert.ok(a.stats.ganado > 0 && a.stats.aportado > 0, "las IA trabajaron y aportaron a VITA");
    assert.ok(a.stats.niveles > 0, "y crearon obras");
    assert.ok(a.hist.every((h, i) => i === 0 || h.total >= a.hist[i - 1].total), "el valor de la estructura no baja");
    for (const c of Object.values(w.colonies)) assert.ok(Number.isFinite(c.energia) && Number.isFinite(c.salud));
    assert.ok(alba.view(w) && Object.values(w.colonies).every(c => alba.detail(w, c)));
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a, "se guarda y se carga igual");
  } finally { Math.random = orig; }
});
