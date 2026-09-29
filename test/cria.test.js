import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as cria from "../src/cria.js";

const H = 3600000, DIA = 24 * H;
const T0 = Date.UTC(2026, 8, 28, 9);
const dia = n => new Date(T0 + n * DIA);
// Jugador con su huevo ya abierto en Génesis
function conCria(w, name = "Mateo", now = T0) {
  const u = core.createUser(w, name, core.hash(name));
  core.checkDay(w, u, dia(0));
  for (let i = 0; i < cria.CRIA.CALOR; i++) cria.action(w, u, { op: "calor", colony: "COL-001" }, now);
  return u;
}
const ok = r => { assert.equal(r.ok, true, r.error); return r; };
const ko = (r, texto) => { assert.equal(r.ok, false); if (texto) assert.match(r.error, texto); return r; };

test("cada jugador recibe un huevo distinto que se abre con tres toques de calor, y la primera cría de VITA lleva corona", () => {
  const w = core.createWorld(T0);
  const a = core.createUser(w, "Mateo", "a"), b = core.createUser(w, "Ana", "b");
  const va = cria.view(w, a, T0), vb = cria.view(w, b, T0);
  assert.equal(va.etapa, 0); assert.equal(va.calor, 0);
  assert.notDeepEqual(va.ap, vb.ap, "cada huevo sale de su cuenta");
  assert.deepEqual(cria.view(w, a, T0 + DIA).ap, va.ap, "el mismo jugador ve siempre el mismo huevo");
  assert.equal(cria.view(w, null), null);

  ko(cria.action(w, a, { op: "comer" }, T0), /calor al huevo/);
  assert.deepEqual(ok(cria.action(w, a, { op: "calor" }, T0)).calor, 1);
  ok(cria.action(w, a, { op: "calor" }, T0));
  const nace = ok(cria.action(w, a, { op: "calor", colony: "COL-001" }, T0));
  assert.equal(nace.nacio, true); assert.equal(nace.primera, true);
  ko(cria.action(w, a, { op: "calor" }, T0), /ya nació/);

  const v = cria.view(w, a, T0);
  assert.equal(v.etapaName, "Chispa"); assert.equal(v.primera, true); assert.deepEqual(v.ap, va.ap, "nace con el aspecto de su huevo");
  assert.equal(v.hogar.name, "Génesis"); assert.equal(v.humor, "feliz");
  assert.match(v.diario[0].txt, /primera cría de VITA/);
  assert.ok(w.chain.some(x => x.tipo === "nace una cría" && x.a === a.id));
  assert.ok(w.log[0].includes(v.nombre) && w.log[0].includes("Mateo"));

  for (let i = 0; i < 3; i++) cria.action(w, b, { op: "calor" }, T0);
  assert.equal(cria.view(w, b, T0).primera, false, "solo hay una primera");
  assert.equal(cria.view(w, b, T0).orden, 2);
  assert.ok(core.verifyChain(w));
});

test("con el tiempo real tiene hambre y se pone triste, pero nunca muere", () => {
  const w = core.createWorld(T0), u = conCria(w);
  const v12 = cria.view(w, u, T0 + 12 * H);
  assert.equal(v12.energia, 80 - 36); assert.equal(v12.animo, 90 - 24);
  const v = cria.view(w, u, T0 + 30 * DIA);
  assert.equal(v.energia, 0); assert.equal(v.animo, 0);
  assert.equal(v.humor, "con hambre");
  assert.equal(v.etapa, 1, "sigue ahí esperando");
});

test("comer cuesta 2 VIT que se queman, no come si está llena y solo crece si tenía hambre", () => {
  const w = core.createWorld(T0), u = conCria(w);
  const vit = u.vit, quemado = w.supply.burned;
  ok(cria.action(w, u, { op: "comer" }, T0));
  assert.equal(u.vit, vit - 2); assert.equal(w.supply.burned, quemado + 2);
  assert.ok(w.chain.some(b => b.tipo === "quema" && b.a === "comida de cría"));
  assert.equal(cria.view(w, u, T0).crec, 0, "comer sin hambre no hace crecer");
  ko(cria.action(w, u, { op: "comer" }, T0), /llena/);
  const tarde = T0 + 12 * H;
  ok(cria.action(w, u, { op: "comer" }, tarde));
  assert.equal(cria.view(w, u, tarde).crec, cria.CRIA.COMER);
  u.vit = 1;
  ko(cria.action(w, u, { op: "comer" }, tarde + 12 * H), /Necesitas 2 VIT/);
});

test("jugar tiene descanso de 15 minutos y un máximo al día que vuelve al día siguiente", () => {
  const w = core.createWorld(T0), u = conCria(w);
  let t = T0;
  ok(cria.action(w, u, { op: "jugar" }, t));
  ko(cria.action(w, u, { op: "jugar" }, t + 5 * 60000), /descansando/);
  for (let i = 1; i < cria.CRIA.JUEGOS; i++) { t += cria.CRIA.JUEGO_MS; ok(cria.action(w, u, { op: "jugar" }, t)); }
  t += cria.CRIA.JUEGO_MS;
  ko(cria.action(w, u, { op: "jugar" }, t), /mañana/);
  core.checkDay(w, u, dia(1));
  ko(cria.action(w, u, { op: "jugar" }, T0 + DIA), /hambre para jugar/);
  ok(cria.action(w, u, { op: "comer" }, T0 + DIA));
  ok(cria.action(w, u, { op: "jugar" }, T0 + DIA));
  assert.equal(cria.view(w, u, T0 + DIA).hoy.juegos, 1);
});

test("los hábitos de Salud real la hacen crecer y entrenan su rasgo: tres paseos, un punto de agilidad", () => {
  const w = core.createWorld(T0), u = conCria(w);
  const ef = cria.view(w, u, T0).rasgos.ef, crec = cria.view(w, u, T0).crec;
  const huevo = core.createUser(w, "Sin abrir", "z");
  assert.equal(cria.habito(w, huevo, "pasos", T0), null, "un huevo sin abrir aún no siente nada");
  for (let d = 0; d < 3; d++) {
    const r = cria.habito(w, u, "pasos", T0 + d * DIA);
    assert.equal(r.rasgo, "Agilidad"); assert.equal(r.sube, d === 2);
  }
  const v = cria.view(w, u, T0 + 2 * DIA);
  assert.equal(v.rasgos.ef, ef + 1); assert.equal(v.puntos.pasos, 3);
  assert.equal(v.crec, crec + 3 * cria.CRIA.HABITO);
  assert.match(v.diario.find(x => x.txt.startsWith("Caminaste")).txt, /agilidad/);
  assert.equal(cria.habito(w, u, "inventado", T0), null);
  // Más ágil, excursiones más cortas
  assert.ok(cria.duracion({ rasgos: { ef: 14 } }) < cria.duracion({ rasgos: { ef: 3 } }));
  assert.equal(cria.duracion({ rasgos: { ef: 15 } }), 20);
});

test("de excursión se va de verdad, vuelve con un relato de la colonia y trae esporas", () => {
  const w = core.createWorld(T0), u = conCria(w), g = w.colonies["COL-001"];
  const vit = u.vit, min = cria.view(w, u, T0).duracion;
  const sale = ok(cria.action(w, u, { op: "excursion", colony: "COL-001" }, T0));
  assert.equal(sale.min, min);
  ko(cria.action(w, u, { op: "jugar" }, T0 + 60000), /de excursión en Génesis/);
  ok(cria.action(w, u, { op: "nombre", nombre: "Lumi" }, T0 + 60000));
  ko(cria.action(w, u, { op: "volver" }, T0 + 60000), /Todavía no volvió/);
  assert.equal(cria.view(w, u, T0 + 60000).humor, "de excursión");
  const t = T0 + min * 60000;
  assert.equal(cria.view(w, u, t).humor, "volvió");
  const r = ok(cria.action(w, u, { op: "volver" }, t, () => 0.9)).relato;
  assert.match(r.texto, /^Fui a Génesis\./);
  assert.ok(r.vit >= 1 && r.vit <= 3);
  assert.equal(u.vit, vit + r.vit);
  assert.ok(w.chain.some(b => b.tipo === "recuerdo de excursión" && b.a === u.id));
  assert.equal(cria.view(w, u, t).diario[0].txt, r.texto);
  ko(cria.action(w, u, { op: "volver" }, t), /No está de excursión/);

  // Una colonia en apuros recibe parte de su energía
  g.event = "plaga"; g.eventLeft = 10;
  const e0 = g.energia;
  ok(cria.action(w, u, { op: "excursion", colony: "COL-001" }, t));
  const t2 = t + min * 60000;
  const r2 = ok(cria.action(w, u, { op: "jugar" }, t2, () => 0.1)).relato;
  assert.match(r2.texto, /plaga/); assert.equal(r2.vit, 1);
  assert.equal(g.energia, e0 + 8);
  assert.ok(g.log.some(l => l.includes("deja +8 energía")));
});

test("las excursiones piden energía, se limitan a tres al día y a colonias vivas", () => {
  const w = core.createWorld(T0), u = conCria(w);
  ko(cria.action(w, u, { op: "excursion", colony: "COL-999" }, T0), /colonia viva/);
  let t = T0;
  for (let i = 0; i < cria.CRIA.EXCURSIONES; i++) {
    cria.action(w, u, { op: "comer" }, t); // si está llena no come, y da igual
    ok(cria.action(w, u, { op: "excursion", colony: "COL-001" }, t));
    t += cria.view(w, u, t).duracion * 60000;
    ok(cria.action(w, u, { op: "volver" }, t));
  }
  ko(cria.action(w, u, { op: "excursion", colony: "COL-001" }, t), /excursiones de hoy/);
  core.checkDay(w, u, dia(1));
  ko(cria.action(w, u, { op: "excursion", colony: "COL-001" }, t + 30 * H), /hambre para viajar/);
});

test("de joven visita su hogar al saludarla y le lleva energía, una vez al día", () => {
  const w = core.createWorld(T0), u = conCria(w), g = w.colonies["COL-001"];
  const s = ok(cria.action(w, u, { op: "saludar" }, T0));
  assert.equal(s.visita, null, "una chispa todavía no viaja sola");
  ko(cria.action(w, u, { op: "saludar" }, T0 + H), /Ya saludaste/);
  u.cria.crec = cria.ETAPAS[3].desde; u.cria.etapa = 3;
  core.checkDay(w, u, dia(1));
  const e0 = g.energia;
  const v = ok(cria.action(w, u, { op: "saludar" }, T0 + DIA)).visita;
  assert.deepEqual(v, { colonia: "Génesis", energia: 10 });
  assert.equal(g.energia, e0 + 10);
  assert.ok(g.log[0].includes("viene de visita"));
});

test("si su hogar se extingue, su hogar pasa a la colonia viva donde el jugador tiene más células", () => {
  const w = core.createWorld(T0), u = conCria(w), g = w.colonies["COL-001"];
  const hija = core.createColony(w, { name: "Coral", genes: { ef: 8, res: 8, fer: 8 }, met: 7, treasury: 0, parent: g.id });
  hija.cells[0].owner = u.id;
  g.alive = false;
  assert.equal(cria.view(w, u, T0).hogar.name, "Coral");
  ok(cria.action(w, u, { op: "hogar", colony: hija.id }, T0));
  ko(cria.action(w, u, { op: "hogar", colony: g.id }, T0), /colonia viva/);
});

test("crece por etapas con regalos de VIT y, de sabia, deja su legado: una célula con sus genes que es del jugador", () => {
  const w = core.createWorld(T0), u = conCria(w), g = w.colonies["COL-001"];
  Object.assign(u.cria.rasgos, { ef: 12, res: 11, fer: 13 });
  const vit = u.vit, celulas = g.cells.length, premios = cria.ETAPAS.reduce((s, e) => s + e.premio, 0);
  let d = 0, visto = ["Chispa"];
  while (cria.view(w, u, T0 + d * DIA).etapa < 5 && d < 60) {
    d++;
    for (const k of Object.keys(core.HABITS)) cria.habito(w, u, k, T0 + d * DIA);
    const e = cria.view(w, u, T0 + d * DIA).etapaName;
    if (!visto.includes(e)) visto.push(e);
  }
  assert.deepEqual(visto, ["Chispa", "Brote", "Joven", "Adulta", "Sabia"]);
  assert.ok(d >= 20, `con los cuatro hábitos cada día tarda semanas (${d} días)`);
  assert.equal(u.vit, vit + premios);
  const v = cria.view(w, u, T0 + d * DIA);
  assert.match(v.legado, /^CEL-/);
  const cel = g.cells.find(c => c.id === v.legado);
  assert.equal(cel.owner, u.id);
  assert.ok(cel.g.ef >= 12 && cel.g.res >= 11 && cel.g.fer >= 13, "lleva los genes que entrenó su jugador");
  assert.equal(g.cells.length, celulas + 1);
  assert.ok(w.chain.some(b => b.tipo === "legado" && b.ids.includes(cel.id)));
  assert.ok(g.log.some(l => l.includes("deja su legado")));
  assert.equal(v.siguiente, null);
  // El legado es uno solo
  cria.habito(w, u, "pasos", T0 + (d + 1) * DIA);
  assert.equal(g.cells.filter(c => c.owner === u.id).length, 1);
  assert.equal(cria.metrics(w).porEtapa.sabia, 1);
  assert.equal(cria.metrics(w).legados, 1);
  assert.ok(core.verifyChain(w));
});

test("un mes de cuidados al máximo acuña poco VIT: la cría no rompe la economía", () => {
  const w = core.createWorld(T0), u = conCria(w);
  for (let d = 0; d < 30; d++) {
    const t0 = T0 + d * DIA;
    core.checkDay(w, u, dia(d));
    u.vit += 100; // que nunca le falte comida
    cria.action(w, u, { op: "saludar" }, t0);
    for (const k of Object.keys(core.HABITS)) cria.habito(w, u, k, t0);
    let t = t0;
    for (let i = 0; i < 6; i++) {
      cria.action(w, u, { op: "comer" }, t); cria.action(w, u, { op: "jugar" }, t);
      cria.action(w, u, { op: "excursion", colony: "COL-001" }, t); t += H; cria.action(w, u, { op: "volver" }, t);
    }
  }
  const TIPOS = ["cría evoluciona", "recuerdo de excursión", "legado de cría"];
  const regalado = w.chain.filter(b => TIPOS.includes(b.tipo)).reduce((s, b) => s + b.cant, 0);
  const tope = cria.ETAPAS.reduce((s, e) => s + e.premio, 0) + 30 * cria.CRIA.EXCURSIONES * 3;
  assert.ok(regalado <= tope, `regaló ${regalado} VIT y el tope es ${tope}`);
  assert.equal(cria.view(w, u, T0 + 30 * DIA).etapaName, "Sabia", "con todos los cuidados llega a sabia en un mes");
  const quemado = w.chain.filter(b => b.tipo === "quema" && b.a === "comida de cría").reduce((s, b) => s + b.cant, 0);
  assert.ok(quemado > 0 && quemado === w.crias.vitQuemado);
  assert.ok(core.verifyChain(w));
});

test("el nombre se puede cambiar sin colar nada en la web", () => {
  const w = core.createWorld(T0), u = conCria(w);
  assert.equal(ok(cria.action(w, u, { op: "nombre", nombre: " <img src=x onerror=alert(1)> Tito " }, T0)).nombre, "img src=x onerro");
  ko(cria.action(w, u, { op: "nombre", nombre: "<>" }, T0), /2 letras/);
  assert.equal(cria.limpiarNombre("  Luna\n  de   Oruz  "), "Luna de Oruz");
  assert.equal(cria.limpiarNombre(`a"b'c&d\`e\\f`), "abcdef");
  ko(cria.action(w, u, { op: "volar" }, T0), /no entiende/);
});

test("los nombres salen de sílabas suaves, sin repetir sílaba seguida", () => {
  const nombres = new Set();
  for (let i = 0; i < 400; i++) {
    const n = cria.nombreDe(core.hash("prueba" + i));
    assert.match(n, /^[A-ZÑ][a-zñ]{3,7}$/);
    assert.ok(!["pichi", "chino"].some(f => n.toLowerCase().includes(f)));
    nombres.add(n);
  }
  assert.ok(nombres.size > 250, `${nombres.size} nombres distintos`);
});

test("el mundo con crías se guarda en JSON y sigue igual al cargarlo", () => {
  const w = core.createWorld(T0), u = conCria(w);
  cria.action(w, u, { op: "excursion", colony: "COL-001" }, T0);
  const w2 = JSON.parse(JSON.stringify(w)), u2 = w2.users[u.id];
  assert.deepEqual(cria.view(w2, u2, T0 + H), cria.view(w, u, T0 + H));
  ok(cria.action(w2, u2, { op: "volver" }, T0 + H));
});
