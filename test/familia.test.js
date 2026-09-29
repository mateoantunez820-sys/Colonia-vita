import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as rangos from "../src/rangos.js";
import * as familia from "../src/familia.js";

const { FAMILIA } = familia;
function seeded(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function withSeed(seed, fn) { const orig = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = orig; } }
const DIA0 = 20000; // un día cualquiera, en días desde 1970
// Reloj del juego a partir del ciclo, como el del servidor en modo rápido
const reloj = (w, extra = {}) => { const m = 8 * 60 + w.tick * 10; return { day: DIA0 + Math.floor(m / 1440), minute: m % 1440, now: 1e12 + w.tick * 600000, ...extra }; };
const tierna = { riesgo: 0.2, codicia: 0.1, cuidado: 0.9 };
function hija(w, madre, name, props = {}) {
  const c = core.createColony(w, { name, genes: { ef: 8, res: 8, fer: 8 }, met: 7, treasury: 120, parent: madre.id, persona: { ...tierna } });
  return Object.assign(c, props);
}
// Avanza el reloj sin simular las colonias: solo pasa el tiempo para la familia
function pasar(w, ciclos) { for (let i = 0; i < ciclos; i++) { w.tick++; familia.step(w, reloj(w)); } }
const vitTotal = w => Object.values(w.colonies).reduce((s, c) => s + c.treasury, 0) + Object.values(w.users).reduce((s, u) => s + u.vit, 0);

test("cuando llega la familia, Vita escribe a todas y empieza su diario; después escribe una entrada por noche", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  const e = familia.step(w, reloj(w));
  assert.equal(e.titulo, "Prólogo");
  assert.match(e.parrafos.join(" "), /Génesis/);
  assert.equal(w.familia.cartas[0].tipo, "anuncio");
  assert.equal(w.familia.cartas[0].de, "VITA");
  const a = familia.arbol(w);
  assert.deepEqual(a.nodos.map(n => [n.name, n.gen, n.madre]), [["Génesis", 1, null]]);
  // A las 23:00 del juego escribe la primera noche, y solo una vez
  let noches = [];
  for (let i = 0; i < 3 * FAMILIA.DIA; i++) { w.tick++; const n = familia.step(w, reloj(w)); if (n) noches.push(n); }
  assert.deepEqual(noches.map(n => n.titulo), ["Noche 1", "Noche 2", "Noche 3"]);
  assert.ok(noches.every(n => reloj(w).minute >= 0 && n.fecha.length > 5 && n.parrafos.at(-1) === "Buenas noches, familia."));
  assert.equal(new Set(noches.map(n => n.dia)).size, 3, "una entrada por día del juego");
  assert.equal(w.familia.diario.length, 4);
  assert.ok(g.alive);
});

test("si la familia llega pasadas las 23:00, la primera noche es la de mañana", () => {
  const w = core.createWorld();
  const e = familia.step(w, { day: DIA0, minute: 23 * 60 + 30, now: 1e12 });
  assert.equal(e.titulo, "Prólogo");
  assert.equal(familia.step(w, { day: DIA0, minute: 23 * 60 + 40, now: 1e12 }), null);
  assert.equal(familia.step(w, { day: DIA0 + 1, minute: 23 * 60, now: 1e12 }).titulo, "Noche 1");
});

test("el árbol sabe quién es madre, hija, hermana, abuela, tía, sobrina y prima de quién", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  const a = hija(w, g, "Aurora"), b = hija(w, g, "Brisa"), a1 = hija(w, a, "Coral"), b1 = hija(w, b, "Duna"), a11 = hija(w, a1, "Eco");
  const p = (x, y) => familia.parentesco(w, x, y);
  assert.equal(p(a, g), "madre"); assert.equal(p(g, a), "hija");
  assert.equal(p(a, b), "hermana");
  assert.equal(p(a1, g), "abuela"); assert.equal(p(g, a1), "nieta");
  assert.equal(p(a1, b), "tía"); assert.equal(p(b, a1), "sobrina");
  assert.equal(p(a1, b1), "prima");
  assert.equal(p(a11, g), "bisabuela"); assert.equal(p(g, a11), "bisnieta");
  assert.equal(p(a11, b), "tía abuela");
  const arb = familia.arbol(w), n = Object.fromEntries(arb.nodos.map(x => [x.name, x]));
  assert.equal(arb.generaciones, 4);
  assert.deepEqual([n.Génesis.gen, n.Aurora.gen, n.Coral.gen, n.Eco.gen], [1, 2, 3, 4]);
  assert.deepEqual([n.Génesis.hijas, n.Génesis.descendientes, n.Aurora.descendientes], [2, 5, 2]);
  const fam = familia.parientes(w, a1).map(x => `${x.name}:${x.rel}`);
  assert.deepEqual(fam.slice(0, 2), ["Aurora:madre", "Génesis:abuela"], "primero las mayores");
  assert.ok(fam.includes("Eco:hija") && fam.includes("Brisa:tía") && fam.includes("Duna:prima"));
});

test("cuando nace una hija, su madre le da la bienvenida, su hermana mayor se presenta y le llega la carta que le escribió antes de nacer", () => {
  withSeed(4, () => {
    const w = core.createWorld(), g = Object.values(w.colonies)[0];
    familia.step(w, reloj(w));
    g.ai.persona = { ...tierna };
    while (g.cells.length < 200) g.cells.push(core.newCell(w, g, { ef: 9, res: 9, fer: 9 }, "colonia"));
    Object.assign(g, { treasury: 300, salud: 95 });
    pasar(w, FAMILIA.CADA);
    const espera = w.familia.cartas.find(k => k.tipo === "espera");
    assert.ok(espera, "al 70 % de poder fundar le escribe a su primera hija");
    assert.equal(espera.a, null);
    assert.match(espera.texto, /ya tengo las 150 células/);
    g.treasury = 700;
    const aurora = core.maybeFound(w, g);
    assert.ok(aurora);
    pasar(w, 1);
    const bienvenida = w.familia.cartas.find(k => k.tipo === "bienvenida");
    assert.equal(bienvenida.de, g.id); assert.equal(bienvenida.a, aurora.id);
    assert.match(bienvenida.saludo, /^Querida Aurora:/);
    assert.match(bienvenida.texto, /Eres mi primera hija/);
    assert.match(bienvenida.texto, /te escribí una carta/);
    assert.equal(espera.a, aurora.id, "la carta de antes de nacer ya tiene destinataria");
    assert.equal(espera.aName, "Aurora");
    // La segunda hija recibe también la carta de su hermana mayor
    while (g.cells.length < 200) g.cells.push(core.newCell(w, g, { ef: 9, res: 9, fer: 9 }, "colonia"));
    g.treasury = 700;
    const brisa = core.maybeFound(w, g);
    pasar(w, 1);
    const hermana = w.familia.cartas.find(k => k.tipo === "hermana");
    assert.equal(hermana.de, aurora.id); assert.equal(hermana.a, brisa.id);
    assert.equal(w.familia.cartas.filter(k => k.tipo === "espera").length, 1, "solo le escribe a la primera");
    assert.ok(brisa.log.some(l => l.includes("Carta de Génesis")), "la carta queda en la bitácora de quien la recibe");
    // Esa noche Vita lo cuenta en su diario
    let noche = null;
    while (!noche) { w.tick++; noche = familia.step(w, reloj(w)); }
    const texto = noche.parrafos.join(" ");
    assert.match(texto, /Nació Aurora, hija de Génesis/);
    assert.match(texto, /Nació Brisa, hija de Génesis/);
    assert.match(texto, /Ya somos 3 colonias vivas en 2 generaciones/);
    assert.equal(noche.hechos.hijas, 2);
  });
});

test("una colonia en apuros le pide ayuda a su madre, que le manda VIT de su tesoro sin acuñar ni quemar nada", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  familia.step(w, reloj(w));
  Object.assign(g, { treasury: 500, salud: 90 });
  const a = hija(w, g, "Aurora", { salud: 30, treasury: 10 });
  const supply = { ...w.supply }, total = vitTotal(w);
  pasar(w, FAMILIA.CADA);
  assert.equal(g.treasury, 475); assert.equal(a.treasury, 35);
  assert.equal(vitTotal(w), total, "el VIT solo cambia de tesoro");
  assert.deepEqual(w.supply, supply, "ni se acuña ni se quema");
  const b = w.chain.at(-1);
  assert.deepEqual([b.tipo, b.de, b.a, b.cant], ["ayuda familiar", g.id, a.id, 25]);
  assert.ok(core.verifyChain(w));
  const [respuesta, pedido] = w.familia.cartas;
  assert.equal(pedido.tipo, "pedido"); assert.equal(pedido.de, a.id); assert.match(pedido.texto, /salud en 30/);
  assert.equal(respuesta.tipo, "respuesta"); assert.equal(respuesta.de, g.id); assert.equal(respuesta.vit, 25);
  // Vuelve a pedir como mucho cada 12 horas
  pasar(w, FAMILIA.PIDE_CADA - FAMILIA.CADA);
  assert.equal(w.familia.stats.ayudas, 1);
  pasar(w, FAMILIA.CADA);
  assert.equal(w.familia.stats.ayudas, 2);
  // Una madre agradecida (recién salvada) no da: se está recuperando
  g.gratitud = 100;
  pasar(w, FAMILIA.PIDE_CADA);
  assert.equal(w.familia.stats.ayudas, 2);
  // Y una colonia sin parientes que puedan dar no recibe nada
  g.gratitud = 0; g.treasury = 150;
  pasar(w, FAMILIA.PIDE_CADA);
  assert.equal(w.familia.stats.ayudas, 2);
});

test("si una colonia se apaga, su familia la despide; cuando renace, su madrina le da la bienvenida y ella le da las gracias", () => {
  withSeed(9, () => {
    const w = core.createWorld(), g = Object.values(w.colonies)[0];
    familia.step(w, reloj(w));
    while (g.cells.length < 150) g.cells.push(core.newCell(w, g, { ef: 8, res: 8, fer: 8 }, "colonia"));
    g.treasury = 400;
    const a = hija(w, g, "Aurora");
    pasar(w, 1);
    Object.assign(a, { alive: false, salud: 0, cells: [], edad: 3 * FAMILIA.DIA, cause: "La salud llegó a cero." });
    pasar(w, 1);
    const adios = w.familia.cartas.find(k => k.tipo === "despedida");
    assert.equal(adios.de, g.id); assert.equal(adios.a, a.id);
    assert.match(adios.texto, /después de 3 días de vida/);
    assert.ok(core.reseed(w, a));
    pasar(w, 1);
    const [gracias, regreso] = w.familia.cartas;
    assert.equal(regreso.tipo, "regreso"); assert.equal(regreso.de, g.id); assert.match(regreso.texto, /vida número 2/);
    assert.equal(gracias.tipo, "gracias"); assert.equal(gracias.de, a.id); assert.equal(gracias.a, g.id);
    const nodo = familia.arbol(w).nodos.find(n => n.id === a.id);
    assert.deepEqual([nodo.vidas, nodo.madrinas], [2, [g.id]]);
    assert.equal(familia.parientes(w, a)[0].rel, "madre y madrina");
    assert.equal(familia.parientes(w, g)[0].rel, "hija y ahijada");
  });
});

test("Vita escribe cuando el consejo asciende o sanciona a una colonia, y su madre se enorgullece", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  familia.step(w, reloj(w));
  const a = hija(w, g, "Aurora");
  core.block(w, "ascenso a Oruz", "VITA", a.id, 70, "respeto");
  pasar(w, 1);
  const [orgullo, vita] = w.familia.cartas;
  assert.equal(vita.de, "VITA"); assert.equal(vita.asunto, "Ahora eres Oruz");
  assert.equal(orgullo.de, g.id); assert.equal(orgullo.tipo, "orgullo");
  core.block(w, "ascenso a Oruz", "VITA", a.id, 70, "respeto");
  core.block(w, "sanción", "VITA", g.id, 5, "respeto");
  pasar(w, 1);
  assert.equal(w.familia.cartas.filter(k => k.asunto === "Ahora eres Oruz").length, 1, "una sola carta por ascenso al día");
  assert.equal(w.familia.cartas[0].asunto, "Una sanción de la Ley VITA");
  // Las colectas del consejo se agradecen a quien las organizó
  core.block(w, "colecta", g.id, a.id, 30, "VIT", [g.id]);
  pasar(w, 1);
  assert.equal(w.familia.cartas[0].asunto, "Gracias por la colecta");
  assert.equal(w.familia.cartas[0].de, a.id);
});

test("cada colonia cumple años: Vita le escribe si no tiene madre, y solo una vez", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  familia.step(w, reloj(w));
  pasar(w, FAMILIA.DIA + FAMILIA.CADA);
  const cumple = w.familia.cartas.filter(k => k.tipo === "cumple");
  assert.equal(cumple.length, 1);
  assert.deepEqual([cumple[0].de, cumple[0].a, cumple[0].asunto], ["VITA", g.id, "Tu primer día"]);
  pasar(w, 2 * FAMILIA.DIA);
  assert.equal(w.familia.cartas.filter(k => k.tipo === "cumple").length, 1, "el día 2 y el 3 no son cumpleaños");
});

test("las colonias le escriben al jugador que las cuida, una vez al día, y esas cartas solo las ve él", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  familia.step(w, reloj(w));
  const ana = core.createUser(w, "Ana", "h1"), luis = core.createUser(w, "Luis", "h2");
  ana.vit = 100;
  assert.ok(core.feed(w, g, ana, 5).ok);
  const k = familia.accion(w, ana, { type: "feed", colony: g.id });
  assert.equal(k.de, g.id); assert.equal(k.a, ana.id);
  assert.match(k.saludo, /Ana/); assert.match(k.texto, /alimentarme/);
  assert.equal(familia.accion(w, ana, { type: "feed", colony: g.id }), null, "una carta al día por colonia");
  assert.equal(familia.accion(w, ana, { type: "claim", key: "esporas" }), null, "cobrar una misión no es cuidar a una colonia");
  assert.equal(familia.accion(w, ana, { type: "feed", colony: "COL-999" }), null);
  assert.equal(familia.view(w, ana).buzon.length, 1);
  assert.deepEqual(familia.view(w, luis).buzon, []);
  assert.equal(familia.view(w, null).buzon, null);
  assert.ok(!familia.view(w, luis).cartas.some(x => x.tipo === "jugador"), "no está entre las cartas que ven todos");
  assert.ok(familia.arbol(w, ana).nodos.every(n => !n.mia), "Ana aún no tiene células");
  pasar(w, FAMILIA.DIA);
  assert.ok(familia.accion(w, ana, { type: "habit", key: "agua", colony: g.id }), "al día siguiente vuelve a escribirle");
  // Y esa noche Vita le da las gracias en su diario
  let noche = null;
  while (!noche) { w.tick++; noche = familia.step(w, reloj(w)); }
  assert.match(noche.parrafos.join(" "), /Hoy nos cuidaron Ana: gracias/);
  // Las cartas a jugadores se borran a la semana
  pasar(w, (FAMILIA.BUZON_DIAS + 1) * FAMILIA.DIA);
  assert.deepEqual(familia.view(w, ana).buzon, []);
});

test("45 días de federación: la familia no crea ni destruye VIT, las cartas y el diario tienen tope y todo sobrevive a guardar y cargar", () => {
  withSeed(21, () => {
    const w = core.createWorld();
    rangos.step(w); familia.step(w, reloj(w));
    const env = () => ({ weather: { luz: 1, frio: 0, lluvia: 0, desc: "Despejado", temp: 20 }, attention: 0, difficulty: w.ai.difficulty });
    let noches = 0;
    for (let i = 0; i < 45 * FAMILIA.DIA; i++) {
      core.stepWorld(w, env); rangos.step(w);
      const antes = vitTotal(w), supply = JSON.stringify(w.supply);
      if (familia.step(w, reloj(w, { weather: env().weather }))) noches++;
      assert.ok(Math.abs(vitTotal(w) - antes) < 1e-9, "la familia solo pasa VIT de un tesoro a otro");
      assert.equal(JSON.stringify(w.supply), supply);
    }
    const F = w.familia;
    assert.equal(noches, 45);
    assert.ok(Object.keys(w.colonies).length > 1, "se fundaron hijas");
    assert.ok(F.cartas.length > 10 && F.cartas.length <= FAMILIA.CARTAS);
    assert.ok(F.diario.length <= FAMILIA.NOCHES);
    for (const k of F.cartas) {
      assert.ok(k.asunto && k.saludo && k.texto && k.firma, `carta ${k.id} completa`);
      assert.doesNotMatch(`${k.asunto} ${k.saludo} ${k.texto} ${k.firma}`, /undefined|NaN|null|\[object/);
    }
    for (const e of F.diario) assert.doesNotMatch(e.parrafos.join(" "), /undefined|NaN|null|\[object/);
    assert.ok(F.cartas.some(k => k.tipo === "bienvenida"));
    assert.ok(core.verifyChain(w));
    assert.ok(JSON.stringify(F).length < 250000, "la familia ocupa poco en el mundo guardado");
    // Guardar y cargar
    const w2 = JSON.parse(JSON.stringify(w));
    w2.tick++; familia.step(w2, reloj(w2));
    const v = familia.view(w2, null, Object.keys(w2.colonies)[1]);
    assert.equal(v.arbol.nodos.length, Object.keys(w2.colonies).length);
    assert.ok(v.colonia.parientes.some(p => p.rel.startsWith("madre")));
    assert.ok(v.diario.length && v.cartas.length <= 30);
  });
});

test("con la IA activa Vita pasa la noche a limpio con Claude, pero sin inventar números; sin clave queda la plantilla", async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
  const { aceptarDiario, escribirDiario } = await import("../src/ai.js");
  const w = core.createWorld();
  familia.step(w, reloj(w));
  assert.equal(familia.pendiente(w), null, "el prólogo no se reescribe");
  let e = null;
  while (!e) { w.tick++; e = familia.step(w, reloj(w, { weather: { desc: "lluvia", temp: 9.4 } })); }
  assert.equal(familia.pendiente(w), e);
  assert.ok(e.parrafos.some(p => p.includes("Esta noche llueve y hace 9 °C.")));
  const plantilla = [...e.parrafos];
  await escribirDiario(w, e);
  assert.deepEqual(e.parrafos, plantilla, "sin clave de Anthropic se queda la plantilla");
  assert.equal(e.pluma, "vita");
  assert.equal(familia.pendiente(w), null, "un solo intento por noche");

  const otra = { titulo: "Noche 7", fecha: "martes, 3 de marzo", parrafos: ["Querido diario: hoy fue un día tranquilo.", "Nacieron 12 células y se apagaron 3.", "Buenas noches, familia."] };
  assert.equal(aceptarDiario(otra, ["Querido diario: hoy nacieron 40 células.", "Buenas noches, familia."]), false, "un número que no estaba");
  assert.equal(aceptarDiario(otra, ["Querido diario: todo bien."]), false, "demasiado corto");
  assert.equal(aceptarDiario(otra, ["x".repeat(900), "y".repeat(900)]), false, "demasiado largo");
  assert.equal(otra.pluma, undefined);
  assert.equal(aceptarDiario(otra, ["Querido diario: en la noche 7, un martes tranquilo de marzo, nacieron 12 células y solo se apagaron 3.", "<b>Buenas noches, familia.</b>"]), true);
  assert.equal(otra.parrafos.at(-1), "Buenas noches, familia.", "sin etiquetas");
  assert.equal(otra.pluma, "claude");
  // Pasada la hora siguiente ya no se reescribe
  w.tick += FAMILIA.CADA; e.pluma = undefined;
  assert.equal(familia.pendiente(w), null);
});
