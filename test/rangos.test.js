import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as rangos from "../src/rangos.js";

const env = () => ({ weather: null, attention: 0, difficulty: 1 });
function seeded(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function withSeed(seed, fn) { const orig = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = orig; } }
// Colonia hija lista para la prueba, con el estado que se le indique
function hija(w, name, props = {}) {
  const madre = Object.values(w.colonies)[0];
  const c = core.createColony(w, { name, genes: { ef: 8, res: 8, fer: 8 }, met: 7, treasury: 0, parent: madre.id, persona: { riesgo: 0.5, codicia: 0.2, cuidado: 0.8 } });
  Object.assign(c, props);
  return c;
}
const siguienteConsejo = w => { w.tick += rangos.RANGOS.CADA; return rangos.step(w); };
const tesoros = w => Object.values(w.colonies).reduce((s, c) => s + c.treasury, 0);

test("VITA juzga a Génesis por su conducta y la asciende a Oruz en el primer consejo, con registro en la cadena", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  assert.equal(rangos.step(w), true, "el primer consejo se reúne en cuanto llega la ley");
  assert.equal(rangos.tag(w, g).k, "oruz");
  assert.ok(w.chain.some(b => b.tipo === "ascenso a Oruz" && b.de === "VITA" && b.a === g.id));
  assert.equal(rangos.step(w), false, "el siguiente consejo es una hora después");
  const d = rangos.detail(w, g);
  assert.equal(d.pares, null, "sola, solo la juzga VITA");
  assert.deepEqual(d.siguiente.rango, "Ámbar");
  assert.ok(d.siguiente.merito > 0, "para la élite le falta mérito");
  assert.ok(core.verifyChain(w));
});

test("la élite Ámbar tiene un asiento por cada cuatro colonias vivas y Oruz, uno por cada dos", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  for (let i = 0; i < 7; i++) hija(w, "Hija" + i);
  for (const c of Object.values(w.colonies)) {
    while (c.cells.length < 300) c.cells.push(core.newCell(w, c, { ef: 8, res: 8, fer: 8 }, "colonia"));
    Object.assign(c, { salud: 100, edad: 7 * 144, treasury: 200 });
  }
  rangos.step(w);
  const v = rangos.view(w), cuenta = k => v.colonias.filter(c => c.k === k).length;
  assert.deepEqual(v.asientos, { ambar: 2, oruz: 4 });
  assert.equal(cuenta("ambar"), 2);
  assert.equal(cuenta("oruz"), 4);
  assert.equal(cuenta("ciudadana"), 2);
  assert.equal(rangos.tag(w, g).k, "ambar", "la madre de todas, con más mérito, entra en la élite");
});

test("una Oruz organiza una colecta: da la generosa, se niega la codiciosa, VITA la sanciona y el VIT solo cambia de tesoro", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  g.ai.persona = { riesgo: 0.5, codicia: 0, cuidado: 1 };
  g.treasury = 400;
  const generosa = hija(w, "Brisa", { treasury: 500 });
  const codiciosa = hija(w, "Duna", { treasury: 900 });
  codiciosa.ai.persona = { riesgo: 0.5, codicia: 1, cuidado: 0.1 };
  const pobre = hija(w, "Eco", { treasury: 200 });
  rangos.step(w);
  assert.notEqual(rangos.tag(w, g).k, "ciudadana", "Génesis ya es gestora");

  pobre.treasury = 20; // recién nacida y sin VIT: pasa apuros
  const antes = tesoros(w), supply = { ...w.supply }, chain = w.chain.length;
  siguienteConsejo(w);
  const c = w.chain.slice(chain).find(b => b.tipo === "colecta");
  assert.ok(c, "hay colecta");
  assert.notEqual(rangos.tag(w, w.colonies[c.de]).k, "ciudadana", "la organiza una gestora de la familia");
  assert.equal(c.a, pobre.id);
  assert.ok(c.ids.includes(generosa.id) && !c.ids.includes(codiciosa.id));
  assert.equal(pobre.treasury, 20 + c.cant);
  assert.ok(Math.abs(tesoros(w) - antes) < 1e-9, "el VIT solo pasa de unos tesoros a otros");
  assert.deepEqual(w.supply, supply, "los rangos no acuñan ni queman");
  const dc = rangos.detail(w, codiciosa);
  assert.equal(dc.negativas, 1);
  assert.equal(dc.sanciones, 1, "negarse con más de 600 VIT se sanciona");
  assert.equal(dc.leyes.acaparar, false);
  const eco = dc.admiran.find(x => x.name === "Eco");
  assert.ok(!eco || eco.v < rangos.RANGOS.FAMILIA, "su hermana ayudada la respeta menos por negarse");
  assert.ok(rangos.detail(w, generosa).admiran.some(x => x.name === "Eco" && x.v > 25), "y respeta más a la que dio");
  assert.ok(w.chain.some(b => b.tipo === "sanción" && b.a === codiciosa.id));
  assert.notEqual(rangos.tag(w, codiciosa).k, "ambar", "nadie está por encima de VITA");
  assert.equal(siguienteConsejo(w) && w.chain.filter(b => b.tipo === "colecta").length, 1, "una colonia recibe una colecta como mucho cada 6 horas");
  assert.ok(core.verifyChain(w));
});

test("madre, hijas y hermanas se respetan desde que nacen", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  hija(w, "Aurora"); hija(w, "Brisa");
  const nieta = core.createColony(w, { name: "Coral", genes: { ef: 8, res: 8, fer: 8 }, met: 7, treasury: 0, parent: "COL-999" });
  rangos.step(w);
  const d = rangos.detail(w, g);
  assert.deepEqual(d.admiran.map(x => x.name).sort(), ["Aurora", "Brisa"]);
  assert.ok(d.admiran.every(x => x.v === rangos.RANGOS.FAMILIA));
  assert.equal(rangos.detail(w, nieta).admiran.length, 0, "sin parentesco no hay respeto regalado");
});

test("los rangos sobreviven a guardar y cargar, y una colonia extinta pierde su rango", () => {
  const w = core.createWorld(), g = Object.values(w.colonies)[0];
  rangos.step(w);
  const w2 = JSON.parse(JSON.stringify(w));
  const g2 = Object.values(w2.colonies)[0];
  assert.equal(rangos.tag(w2, g2).k, rangos.tag(w, g).k);
  g2.alive = false; g2.cells = [];
  siguienteConsejo(w2);
  assert.equal(rangos.tag(w2, g2).k, "ciudadana");
  assert.ok(w2.chain.some(b => b.tipo === "descenso a Ciudadana" && b.a === g2.id));
  assert.equal(rangos.view(w2).colonias.length, 0);
  assert.ok(core.verifyChain(w2));
});

test("45 días de federación con rangos: colectas de verdad, asientos respetados y ni un VIT creado ni quemado", () => {
  const w = withSeed(11, () => {
    const w = core.createWorld();
    for (let i = 0; i < 144 * 45; i++) {
      core.stepWorld(w, env);
      const m = w.supply.minted, b = w.supply.burned;
      rangos.step(w);
      assert.equal(w.supply.minted, m); assert.equal(w.supply.burned, b);
    }
    return w;
  });
  const v = rangos.view(w), vivas = v.colonias.length;
  assert.ok(vivas >= 4, `colonias vivas: ${vivas}`);
  assert.ok(v.colonias.filter(c => c.k === "ambar").length <= v.asientos.ambar);
  assert.ok(v.colonias.filter(c => c.k === "oruz").length <= v.asientos.oruz);
  assert.ok(v.colonias.every(c => Number.isFinite(c.respeto) && c.respeto >= 0 && c.respeto <= 100 && c.merito >= 0 && c.merito <= 100));
  assert.ok(v.stats.ayudas > 10, `colectas: ${v.stats.ayudas}`);
  assert.ok(v.stats.ascensos >= vivas - 2);
  assert.ok(core.verifyChain(w));
  console.log(v.colonias.map(c => `${c.name}:${c.rango} ${c.respeto}/${c.merito}`).join(" · "), JSON.stringify(v.stats));
});
